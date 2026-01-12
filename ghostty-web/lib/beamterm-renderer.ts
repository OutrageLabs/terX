/**
 * Beamterm Renderer Adapter
 *
 * Adapter between ghostty-web and @kofany/beamterm-terx.
 * Converts GhosttyCell -> beamterm batch API.
 */

import {
  main as initBeamterm,
  style,
  cell,
  BeamtermRenderer,
  SelectionMode,
  ModifierKeys,
  type Batch,
  type CellStyle,
} from '@kofany/beamterm-terx';

import type { ITheme } from './interfaces';
import type { GhosttyCell } from './types';
import { CellFlags } from './types';
import type { IRenderer, IRenderable, FontMetrics, IScrollbackProvider } from './interfaces';
import type { GraphicsManager } from './graphics';

// ============================================================================
// Beamterm Renderer Adapter
// ============================================================================

export interface BeamtermRendererOptions {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
  theme?: ITheme;
}

// Track initialization state
let beamtermInitialized = false;

/**
 * Initialize beamterm WASM (call once at app startup)
 */
export async function initBeamtermWasm(): Promise<void> {
  if (beamtermInitialized) return;
  await initBeamterm();
  beamtermInitialized = true;
  console.log('[BeamtermRenderer] WASM initialized');
}

// Unique ID counter for canvas elements
let canvasIdCounter = 0;

/**
 * Adapter between ghostty-web and @kofany/beamterm-terx
 */
export class BeamtermRendererAdapter implements IRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: BeamtermRenderer;
  private _charWidth: number;
  private _charHeight: number;
  private fontSize: number;
  private fontFamily: string;
  private theme: Required<ITheme>;
  private currentBuffer: IRenderable | null = null;

  // Cursor state
  private cursorStyle: 'block' | 'underline' | 'bar' = 'block';
  private cursorBlink: boolean = false;
  private cursorVisible: boolean = true;
  private cursorBlinkInterval?: number;

  // Link hover state
  private hoveredHyperlinkId: number = 0;
  private hoveredLinkRange: { startX: number; startY: number; endX: number; endY: number } | null = null;

  // Selection mode: true = require Shift+Click, false = direct selection
  private selectionRequireShift: boolean = true;

  // Dirty tracking state for render optimization
  private lastCursorX: number = -1;
  private lastCursorY: number = -1;
  private lastCursorVisible: boolean = false;
  private lastCursorBlinkVisible: boolean = true;
  private skippedFrames: number = 0;

  // PERFORMANCE: Reusable CellStyle objects to avoid allocations per frame
  // We cache the last style to reuse when fg/bg/styleBits match
  private cachedStyle: CellStyle | null = null;
  private cachedStyleFg: number = -1;
  private cachedStyleBg: number = -1;
  private cachedStyleBits: number = -1;

  // Default theme (Catppuccin Mocha inspired)
  private static readonly DEFAULT_THEME: Required<ITheme> = {
    foreground: '#cdd6f4',
    background: '#1e1e2e',
    cursor: '#f5e0dc',
    cursorAccent: '#1e1e2e',
    selectionBackground: '#89b4fa',
    selectionForeground: '#1e1e2e',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#cba6f7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#cba6f7',
    brightCyan: '#94e2d5',
    brightWhite: '#cdd6f4',
  };

  constructor(canvas: HTMLCanvasElement, options: BeamtermRendererOptions = {}) {
    this.canvas = canvas;
    this.fontSize = options.fontSize ?? 15;
    this.theme = { ...BeamtermRendererAdapter.DEFAULT_THEME, ...options.theme };
    this.cursorStyle = options.cursorStyle ?? 'block';
    this.cursorBlink = options.cursorBlink ?? false;

    // Ensure canvas has an ID for beamterm selector
    if (!canvas.id) {
      canvas.id = `beamterm-canvas-${++canvasIdCounter}`;
    }
    const canvasSelector = `#${canvas.id}`;

    // Font family fallback chain
    // Parse CSS font-family string into individual font names
    this.fontFamily = options.fontFamily ?? 'JetBrains Mono';

    // Split by comma if it's a CSS font-family string, or use as-is if single font
    const parsedFonts = this.fontFamily
      .split(',')
      .map(f => f.replace(/['"]/g, '').trim())
      .filter(f => f.length > 0 && f !== 'monospace'); // Remove empty and generic monospace

    // Build fallback chain with beamterm-compatible fonts
    const fontFamilies = [
      ...parsedFonts,
      'JetBrains Mono',
      'Fira Code',
      'monospace'
    ];

    // Deduplicate while preserving order
    const cleanFamilies = [...new Set(fontFamilies)];

    console.log('[BeamtermRenderer] Creating with:', {
      fontSize: this.fontSize,
      fontFamilies: cleanFamilies,
      canvasSelector,
    });

    // Create beamterm renderer with dynamic atlas (for NerdFonts, emoji support)
    this.renderer = BeamtermRenderer.withDynamicAtlas(
      canvasSelector,
      cleanFamilies,
      this.fontSize
    );

    // Get cell size from beamterm
    const cellSize = this.renderer.cellSize();
    this._charWidth = cellSize.width;
    this._charHeight = cellSize.height;

    console.log('[BeamtermRenderer] Cell size:', this._charWidth, 'x', this._charHeight);

    // Verify renderer is working with a test render
    const testBatch = this.renderer.batch();
    testBatch.clear(this.hexToColor(this.theme.background));
    testBatch.text(0, 0, "Test 🚀", style().fg(0xffffff).bg(0x1e1e2e));
    testBatch.flush();
    this.renderer.render();
    console.log('[BeamtermRenderer] Test render completed');

    // Enable beamterm native selection (Block mode, auto-copy to clipboard)
    // Default: require Shift+Click to select (avoids conflicts with terminal apps like MC)
    this.enableSelectionMode();
    console.log('[BeamtermRenderer] Native selection enabled (Block mode, Shift+Click, auto-copy)');

    // Start cursor blinking if enabled
    if (this.cursorBlink) {
      this.startCursorBlink();
    }
  }

  // ============================================================================
  // IRenderer Interface Implementation
  // ============================================================================

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getMetrics(): FontMetrics {
    // CRITICAL: Return CSS pixels (not physical pixels) because:
    // 1. FitAddon uses clientWidth/clientHeight which are CSS pixels
    // 2. SelectionManager uses offsetX/offsetY which are CSS pixels
    // On Windows with high DPI (125%, 150%), DPR > 1 and we need to scale
    const dpr = window.devicePixelRatio || 1;
    return {
      width: this._charWidth / dpr,
      height: this._charHeight / dpr,
      baseline: (this._charHeight * 0.8) / dpr,
    };
  }

  get charWidth(): number {
    // Return CSS pixels for external use (mouse coordinates, layout calculations)
    // Internal methods use this._charWidth for physical pixels
    const dpr = window.devicePixelRatio || 1;
    return this._charWidth / dpr;
  }

  get charHeight(): number {
    // Return CSS pixels for external use (mouse coordinates, layout calculations)
    // Internal methods use this._charHeight for physical pixels
    const dpr = window.devicePixelRatio || 1;
    return this._charHeight / dpr;
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  /**
   * Render terminal buffer using beamterm
   */
  render(
    buffer: IRenderable,
    forceAll: boolean = false,
    viewportY: number = 0,
    scrollbackProvider?: IScrollbackProvider,
    _scrollbarOpacity: number = 1,
    _graphicsManager?: GraphicsManager
  ): void {
    this.currentBuffer = buffer;
    const cursor = buffer.getCursor();

    // ========================================================================
    // DIRTY CHECKING OPTIMIZATION
    // Skip rendering if nothing has changed to save CPU
    // ========================================================================
    const cursorMoved = cursor.x !== this.lastCursorX || cursor.y !== this.lastCursorY;
    const cursorVisibilityChanged = cursor.visible !== this.lastCursorVisible;
    const cursorBlinkChanged = this.cursorVisible !== this.lastCursorBlinkVisible;

    // Check buffer dirty state using ghostty-wasm native tracking
    // Use type assertion since isDirty() is not in IRenderable interface
    const bufferWithDirty = buffer as IRenderable & { isDirty?: () => boolean; needsFullRedraw?: () => boolean };
    const bufferIsDirty = bufferWithDirty.isDirty?.() ?? true; // Default to dirty if method not available
    const needsFullRedraw = forceAll || (bufferWithDirty.needsFullRedraw?.() ?? false);

    // Skip render if nothing changed
    if (!needsFullRedraw && !bufferIsDirty && !cursorMoved && !cursorVisibilityChanged && !cursorBlinkChanged) {
      this.skippedFrames++;
      this.renderStats.skippedFrames++;
      this.renderStats._skippedThisSecond++;

      // Update skipped per second counter
      const now = Date.now();
      if (now - this.renderStats._lastSecond >= 1000) {
        this.renderStats.skippedPerSecond = this.renderStats._skippedThisSecond;
        this.renderStats.rendersPerSecond = this.renderStats._rendersThisSecond;
        this.renderStats._skippedThisSecond = 0;
        this.renderStats._rendersThisSecond = 0;
        this.renderStats._lastSecond = now;
      }

      // Still need to clear dirty to prevent ghostty-wasm from accumulating dirty state
      buffer.clearDirty();
      return;
    }

    // Update cursor tracking state
    this.lastCursorX = cursor.x;
    this.lastCursorY = cursor.y;
    this.lastCursorVisible = cursor.visible;
    this.lastCursorBlinkVisible = this.cursorVisible;

    const renderStart = performance.now();
    try {
      const dims = buffer.getDimensions();
      const scrollbackLength = scrollbackProvider?.getScrollbackLength() ?? 0;

      // Create batch for efficient updates
      const batch = this.renderer.batch();

      // Clear with background color
      batch.clear(this.hexToColor(this.theme.background));

      // Render all lines (with scrollback support)
      const floorViewportY = Math.floor(viewportY);

      // PERFORMANCE: Use getViewport() to get all cells in ONE call (zero allocation)
      const bufferWithViewport = buffer as IRenderable & { getViewport?: () => GhosttyCell[] };
      const viewport = bufferWithViewport.getViewport?.();
      const useViewport = viewport && floorViewportY === 0;

      // PERFORMANCE: Use batch.text() for runs of same-styled text
      // This avoids serde serialization overhead of batch.cells()
      // Reusable run state object (single allocation per frame)
      const run = { text: '', startX: 0, y: 0, fg: -1, bg: -1, styleBits: 0 };
      let textRunCount = 0;

      // Helper to flush current run using batch.text()
      const flushRun = () => {
        if (run.text.length > 0) {
          const runStyle = this.getOrCreateStyle(run.fg, run.bg, run.styleBits);
          batch.text(run.startX, run.y, run.text, runStyle);
          textRunCount++;
        }
        run.text = '';
      };

      for (let y = 0; y < dims.rows; y++) {
        // Always flush at row boundary
        flushRun();

        if (useViewport) {
          // FAST PATH: Use viewport array directly
          const rowStart = y * dims.cols;
          for (let x = 0; x < dims.cols; x++) {
            const ghosttyCell = viewport[rowStart + x];
            if (!ghosttyCell || ghosttyCell.width === 0) continue;
            this.processCell(ghosttyCell, x, y, buffer, run, flushRun);
          }
        } else {
          // SLOW PATH: When scrolled up, need per-line access
          let line: GhosttyCell[] | null = null;

          if (floorViewportY > 0 && scrollbackProvider) {
            if (y < floorViewportY) {
              const scrollbackOffset = scrollbackLength - floorViewportY + y;
              line = scrollbackProvider.getScrollbackLine(scrollbackOffset);
            } else {
              const screenRow = y - floorViewportY;
              line = buffer.getLine(screenRow);
            }
          } else {
            line = buffer.getLine(y);
          }

          if (!line) continue;

          for (let x = 0; x < line.length; x++) {
            const ghosttyCell = line[x];
            if (!ghosttyCell || ghosttyCell.width === 0) continue;
            this.processCell(ghosttyCell, x, y, buffer, run, flushRun);
          }
        }
      }

      // Final flush for last run
      flushRun();

      // Track text runs for performance monitoring
      this.renderStats.textRunsPerFrame = textRunCount;

      // Render cursor (only if visible and blinking state allows)
      if (cursor.visible && this.cursorVisible) {
        this.renderCursor(batch, cursor.x, cursor.y);
      }

      // Render (flush is automatic since beamterm 0.4.0)
      this.renderer.render();

      // Clear dirty flags
      buffer.clearDirty();

      // Track render performance
      const renderEnd = performance.now();
      const renderTime = renderEnd - renderStart;
      this.renderStats.lastRenderTime = renderTime;
      this.renderStats.renderCount++;
      this.renderStats._rendersThisSecond++;

      // Ring buffer for O(1) average calculation (no allocation, no shift)
      const idx = this.renderStats._renderTimesIndex;
      const oldValue = this.renderStats._renderTimes[idx];
      this.renderStats._renderTimes[idx] = renderTime;
      this.renderStats._renderTimesIndex = (idx + 1) % 60;

      // Update running sum
      if (this.renderStats._renderTimesCount < 60) {
        this.renderStats._renderTimesSum += renderTime;
        this.renderStats._renderTimesCount++;
      } else {
        this.renderStats._renderTimesSum += renderTime - oldValue;
      }
      this.renderStats.avgRenderTime = this.renderStats._renderTimesSum / this.renderStats._renderTimesCount;

      // Calculate renders per second and skipped per second
      const currentTime = Date.now();
      if (currentTime - this.renderStats._lastSecond >= 1000) {
        this.renderStats.rendersPerSecond = this.renderStats._rendersThisSecond;
        this.renderStats.skippedPerSecond = this.renderStats._skippedThisSecond;
        this.renderStats._rendersThisSecond = 0;
        this.renderStats._skippedThisSecond = 0;
        this.renderStats._lastSecond = currentTime;
      }
    } catch (err) {
      console.error('[BeamtermRenderer] Render error:', err);
    }
  }

  // Performance tracking (public for debug access)
  // Uses ring buffer instead of push/shift to avoid O(n) operations
  public renderStats = {
    lastRenderTime: 0,
    avgRenderTime: 0,
    renderCount: 0,
    rendersPerSecond: 0,
    skippedFrames: 0,      // Frames skipped due to dirty checking
    skippedPerSecond: 0,   // Skip rate for monitoring
    textRunsPerFrame: 0,   // NEW: Number of batch.text() calls per frame
    _renderTimes: new Float32Array(60), // Ring buffer (fixed size, no allocation)
    _renderTimesIndex: 0,
    _renderTimesCount: 0,
    _renderTimesSum: 0,    // Running sum for O(1) average
    _lastSecond: Date.now(),
    _rendersThisSecond: 0,
    _skippedThisSecond: 0,
  };

  /**
   * Build text string from a line of cells
   */
  private buildLineText(
    line: GhosttyCell[],
    buffer: IRenderable,
    y: number
  ): { text: string; nonEmpty: number } {
    let text = '';
    let nonEmpty = 0;

    for (let x = 0; x < line.length; x++) {
      const ghosttyCell = line[x];
      if (!ghosttyCell) {
        text += ' ';
        continue;
      }

      // Skip spacer cells (width 0) - they're part of wide characters
      if (ghosttyCell.width === 0) {
        continue;
      }

      // Get character from codepoint
      let char = ghosttyCell.codepoint > 0 ? String.fromCodePoint(ghosttyCell.codepoint) : ' ';

      // Handle grapheme clusters (emoji, combining characters)
      if (ghosttyCell.grapheme_len > 0 && buffer.getGraphemeString) {
        const grapheme = buffer.getGraphemeString(y, x);
        if (grapheme) {
          char = grapheme;
        }
      }

      text += char;
      if (ghosttyCell.codepoint > 32) nonEmpty++;
    }

    return { text, nonEmpty };
  }

  /**
   * Check if a cell is within the selection
   */
  private isCellSelected(
    x: number,
    y: number,
    start?: { x: number; y: number },
    end?: { x: number; y: number }
  ): boolean {
    if (!start || !end) return false;

    // Normalize selection (start should be before end)
    let startY = start.y;
    let endY = end.y;
    let startX = start.x;
    let endX = end.x;

    if (startY > endY || (startY === endY && startX > endX)) {
      [startY, endY] = [endY, startY];
      [startX, endX] = [endX, startX];
    }

    // Check if cell is in selection range
    if (y < startY || y > endY) return false;
    if (y === startY && y === endY) return x >= startX && x <= endX;
    if (y === startY) return x >= startX;
    if (y === endY) return x <= endX;
    return true;
  }

  /**
   * PERFORMANCE: Get or create a cached CellStyle to avoid allocations
   */
  private getOrCreateStyle(fg: number, bg: number, styleBits: number = 0): CellStyle {
    // Reuse cached style if colors and style bits match
    if (this.cachedStyle !== null &&
        this.cachedStyleFg === fg &&
        this.cachedStyleBg === bg &&
        this.cachedStyleBits === styleBits) {
      return this.cachedStyle;
    }

    // Create new style with colors
    let cellStyle = style().fg(fg).bg(bg);

    // Apply text styles based on flags
    if (styleBits & CellFlags.BOLD) {
      cellStyle = cellStyle.bold();
    }
    if (styleBits & CellFlags.ITALIC) {
      cellStyle = cellStyle.italic();
    }
    if (styleBits & CellFlags.UNDERLINE) {
      cellStyle = cellStyle.underline();
    }
    if (styleBits & CellFlags.STRIKETHROUGH) {
      cellStyle = cellStyle.strikethrough();
    }

    // Cache it
    this.cachedStyle = cellStyle;
    this.cachedStyleFg = fg;
    this.cachedStyleBg = bg;
    this.cachedStyleBits = styleBits;
    return this.cachedStyle;
  }

  /**
   * Process a cell and add to current text run or flush and start new run
   * PERFORMANCE: Uses batch.text() which avoids serde serialization
   */
  private processCell(
    ghosttyCell: GhosttyCell,
    x: number,
    y: number,
    buffer: IRenderable,
    run: { text: string; startX: number; y: number; fg: number; bg: number; styleBits: number },
    flushRun: () => void
  ): void {
    // Get character from codepoint
    const char = ghosttyCell.codepoint > 0 ? String.fromCodePoint(ghosttyCell.codepoint) : ' ';

    // Handle grapheme clusters (emoji, combining characters)
    let symbol = char;
    if (ghosttyCell.grapheme_len > 0 && buffer.getGraphemeString) {
      const grapheme = buffer.getGraphemeString(y, x);
      if (grapheme) {
        symbol = grapheme;
      }
    }

    // Convert colors
    let fg = this.rgbToColor(ghosttyCell.fg_r, ghosttyCell.fg_g, ghosttyCell.fg_b);
    let bg = this.rgbToColor(ghosttyCell.bg_r, ghosttyCell.bg_g, ghosttyCell.bg_b);

    // Handle inverse
    if (ghosttyCell.flags & CellFlags.INVERSE) {
      [fg, bg] = [bg, fg];
    }

    // Extract style bits (bold, italic, underline, strikethrough)
    // Mask out INVERSE since we handle it separately above
    const styleBits = ghosttyCell.flags & (CellFlags.BOLD | CellFlags.ITALIC | CellFlags.UNDERLINE | CellFlags.STRIKETHROUGH);

    // Check if this cell continues the current run (same colors, same style, same row, consecutive x)
    const canContinueRun = run.text.length > 0 &&
                          run.y === y &&
                          run.fg === fg &&
                          run.bg === bg &&
                          run.styleBits === styleBits &&
                          (run.startX + run.text.length === x);

    if (canContinueRun) {
      // Extend current run
      run.text += symbol;
    } else {
      // Flush previous run and start new one
      flushRun();
      run.text = symbol;
      run.startX = x;
      run.y = y;
      run.fg = fg;
      run.bg = bg;
      run.styleBits = styleBits;
    }
  }

  /**
   * Render cursor
   */
  private renderCursor(batch: Batch, x: number, y: number): void {
    const cursorColor = this.hexToColor(this.theme.cursor);
    const cursorAccent = this.hexToColor(this.theme.cursorAccent);

    // Get the character under cursor for proper rendering
    let symbol = '█';
    if (this.cursorStyle === 'underline') {
      symbol = '▁';
    } else if (this.cursorStyle === 'bar') {
      symbol = '▏';
    }

    const cursorCellStyle = style().fg(cursorColor).bg(cursorAccent);
    batch.cell(x, y, cell(symbol, cursorCellStyle));
  }

  // ============================================================================
  // Cursor Blinking
  // ============================================================================

  private startCursorBlink(): void {
    if (this.cursorBlinkInterval) return;

    this.cursorBlinkInterval = window.setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      // Render will be called by the render loop
    }, 530);
  }

  private stopCursorBlink(): void {
    if (this.cursorBlinkInterval) {
      window.clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = undefined;
    }
    this.cursorVisible = true;
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  setCursorStyle(cursorStyle: 'block' | 'underline' | 'bar'): void {
    this.cursorStyle = cursorStyle;
  }

  setCursorBlink(enabled: boolean): void {
    this.cursorBlink = enabled;
    if (enabled) {
      this.startCursorBlink();
    } else {
      this.stopCursorBlink();
    }
  }

  setFontSize(size: number): void {
    if (this.fontSize === size) return;
    this.fontSize = size;
    this.recreateRenderer();
  }

  setFontFamily(family: string): void {
    if (this.fontFamily === family) return;
    this.fontFamily = family;
    this.recreateRenderer();
  }

  /**
   * Replace font atlas with new settings.
   * Uses beamterm's replaceWithDynamicAtlas() for efficient font changes
   * without destroying the WebGL context.
   */
  private recreateRenderer(): void {
    console.log('[BeamtermRenderer] Replacing font atlas with fontSize:', this.fontSize);

    // Parse font family
    const parsedFonts = this.fontFamily
      .split(',')
      .map(f => f.replace(/['"]/g, '').trim())
      .filter(f => f.length > 0 && f !== 'monospace');

    const fontFamilies = [...new Set([
      ...parsedFonts,
      'JetBrains Mono',
      'Fira Code',
      'monospace'
    ])];

    // Replace atlas in-place (no need to free/recreate renderer)
    this.renderer.replaceWithDynamicAtlas(fontFamilies, this.fontSize);

    // Update cell size
    const cellSize = this.renderer.cellSize();
    this._charWidth = cellSize.width;
    this._charHeight = cellSize.height;

    // Re-enable selection after atlas replacement
    this.enableSelectionMode();

    console.log('[BeamtermRenderer] Font atlas replaced, cell size:', this._charWidth, 'x', this._charHeight);
  }

  setTheme(theme: ITheme): void {
    this.theme = { ...BeamtermRendererAdapter.DEFAULT_THEME, ...theme };
  }

  setHoveredHyperlinkId(hyperlinkId: number): void {
    this.hoveredHyperlinkId = hyperlinkId;
  }

  setHoveredLinkRange(range: { startX: number; startY: number; endX: number; endY: number } | null): void {
    this.hoveredLinkRange = range;
  }

  // ============================================================================
  // Selection Mode
  // ============================================================================

  /**
   * Enable selection with current mode settings
   */
  private enableSelectionMode(): void {
    if (this.selectionRequireShift) {
      // Require Shift+Click to select - avoids conflicts with terminal apps (MC, vim, htop)
      this.renderer.enableSelectionWithOptions(SelectionMode.Block, true, ModifierKeys.SHIFT);
    } else {
      // Direct selection - any click starts selection
      this.renderer.enableSelectionWithOptions(SelectionMode.Block, true, ModifierKeys.NONE);
    }
  }

  /**
   * Set whether selection requires Shift+Click
   * @param requireShift true = Shift+Click to select (default), false = direct selection
   */
  setSelectionRequireShift(requireShift: boolean): void {
    if (this.selectionRequireShift === requireShift) return;
    this.selectionRequireShift = requireShift;
    this.enableSelectionMode();
    console.log(`[BeamtermRenderer] Selection mode: ${requireShift ? 'Shift+Click' : 'Direct'}`);
  }

  /**
   * Get current selection mode
   */
  getSelectionRequireShift(): boolean {
    return this.selectionRequireShift;
  }

  // ============================================================================
  // Resize
  // ============================================================================

  /**
   * Resize renderer - accepts cols and rows, converts to pixels
   * Handles DPR (device pixel ratio) for proper Windows high-DPI support
   */
  resize(cols: number, rows: number): void {
    const dpr = window.devicePixelRatio || 1;

    // Physical pixels for canvas buffer
    const physicalWidth = Math.floor(cols * this._charWidth);
    const physicalHeight = Math.floor(rows * this._charHeight);

    // CSS pixels for layout (what the user sees)
    const cssWidth = physicalWidth / dpr;
    const cssHeight = physicalHeight / dpr;

    // Set canvas buffer size (physical pixels)
    this.canvas.width = physicalWidth;
    this.canvas.height = physicalHeight;

    // Set CSS size (for proper layout and mouse coordinates)
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    // Tell beamterm about the new size
    this.renderer.resize(physicalWidth, physicalHeight);

    // Update cell size (may change slightly)
    const cellSize = this.renderer.cellSize();
    this._charWidth = cellSize.width;
    this._charHeight = cellSize.height;

    // Re-enable selection after resize (required by beamterm)
    this.enableSelectionMode();

    console.log(`[BeamtermRenderer] resize: ${cols}x${rows} cells, ${physicalWidth}x${physicalHeight}px physical, ${cssWidth.toFixed(1)}x${cssHeight.toFixed(1)}px CSS, DPR=${dpr}`);
  }

  /**
   * Get terminal size in cells
   */
  getTerminalSize(): { cols: number; rows: number } {
    const size = this.renderer.terminalSize();
    return { cols: size.width, rows: size.height };
  }

  // ============================================================================
  // Selection and Clipboard
  // ============================================================================

  /**
   * Check if there is an active selection
   */
  hasSelection(): boolean {
    return this.renderer.hasSelection();
  }

  /**
   * Clear the current selection
   */
  clearSelection(): void {
    this.renderer.clearSelection();
  }

  /**
   * Copy current selection to clipboard
   * @returns true if something was copied, false if no selection
   */
  copySelection(): boolean {
    if (!this.renderer.hasSelection()) {
      return false;
    }

    // Beamterm's enableSelection with trimWhitespace=true already handles
    // auto-copy to clipboard on mouse selection. For explicit Cmd+C,
    // we need to get the selected text and copy it.
    // Note: The beamterm renderer doesn't expose a direct "getSelectedText"
    // but enableSelection(mode, true) auto-copies on selection.
    // If we need manual copy, we would need to track selection ourselves.

    // Since beamterm auto-copies on selection release, Cmd+C just confirms selection exists
    console.log('[BeamtermRenderer] Selection exists, was auto-copied on selection');
    return true;
  }

  /**
   * Copy text to clipboard
   */
  copyToClipboard(text: string): void {
    this.renderer.copyToClipboard(text);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  clear(): void {
    const batch = this.renderer.batch();
    batch.clear(this.hexToColor(this.theme.background));
    batch.flush();
    this.renderer.render();
  }

  dispose(): void {
    this.stopCursorBlink();

    // Free beamterm WASM renderer (releases WebGL context)
    if (this.renderer) {
      try {
        this.renderer.free();
      } catch (e) {
        console.warn('[BeamtermRenderer] Dispose error:', e);
      }
    }
  }

  // ============================================================================
  // Color Utilities
  // ============================================================================

  /**
   * Convert RGB components to 0xRRGGBB
   */
  private rgbToColor(r: number, g: number, b: number): number {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }

  /**
   * Convert hex string to 0xRRGGBB
   */
  private hexToColor(hex: string): number {
    const clean = hex.replace('#', '');
    return parseInt(clean, 16);
  }
}

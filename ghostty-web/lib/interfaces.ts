/**
 * xterm.js-compatible interfaces
 */

import type { Ghostty } from './ghostty';
import type { GraphicsOptions } from './graphics';
import type { GhosttyCell } from './types';

// ============================================================================
// Renderer Interfaces
// ============================================================================

/**
 * Interface for objects that can be rendered
 */
export interface IRenderable {
  getLine(y: number): GhosttyCell[] | null;
  getCursor(): { x: number; y: number; visible: boolean };
  getDimensions(): { cols: number; rows: number };
  isRowDirty(y: number): boolean;
  /** Returns true if a full redraw is needed (e.g., screen change) */
  needsFullRedraw?(): boolean;
  clearDirty(): void;
  /**
   * Get the full grapheme string for a cell at (row, col).
   * For cells with grapheme_len > 0, this returns all codepoints combined.
   * For simple cells, returns the single character.
   */
  getGraphemeString?(row: number, col: number): string;
  /**
   * Get ALL viewport cells in ONE call - avoids per-line allocations.
   * Returns a flat array of cells (cols * rows).
   * PERFORMANCE: Use this instead of getLine() in render loops!
   */
  getViewport?(): GhosttyCell[];
}

/**
 * Provider for scrollback buffer lines
 */
export interface IScrollbackProvider {
  getScrollbackLine(offset: number): GhosttyCell[] | null;
  getScrollbackLength(): number;
}

/**
 * Renderer configuration options
 */
export interface RendererOptions {
  fontSize?: number; // Default: 15
  fontFamily?: string; // Default: 'monospace'
  lineHeight?: number; // Line height multiplier, default: 1.0 (use 1.2 for Nerd Fonts)
  cursorStyle?: 'block' | 'underline'; // Default: 'block'
  cursorBlink?: boolean; // Default: false
  theme?: ITheme;
  devicePixelRatio?: number; // Default: window.devicePixelRatio
}

/**
 * Font metrics for cell sizing
 */
export interface FontMetrics {
  width: number; // Character cell width in CSS pixels
  height: number; // Character cell height in CSS pixels
  baseline: number; // Distance from top to text baseline
}

/**
 * Common interface for terminal renderers
 */
export interface IRenderer {
  getCanvas(): HTMLCanvasElement;
  getMetrics(): FontMetrics;
  readonly charWidth: number;
  readonly charHeight: number;
}

// ============================================================================
// Terminal Interfaces
// ============================================================================

export interface ITerminalOptions {
  cols?: number; // Default: 80
  rows?: number; // Default: 24
  cursorBlink?: boolean; // Default: false
  cursorStyle?: 'block' | 'underline';
  theme?: ITheme;
  scrollback?: number; // Default: 1000
  fontSize?: number; // Default: 15
  fontFamily?: string; // Default: 'monospace'
  lineHeight?: number; // Line height multiplier (default: 1.0, use 1.2 for Nerd Fonts)
  allowTransparency?: boolean;
  
  // Renderer selection: 'canvas' (default), 'webgl', 'harfbuzz', or 'beamterm'
  renderer?: 'canvas' | 'webgl' | 'harfbuzz' | 'beamterm';

  // Phase 1 additions
  convertEol?: boolean; // Convert \n to \r\n (default: false)
  disableStdin?: boolean; // Disable keyboard input (default: false)

  // Scrolling options
  smoothScrollDuration?: number; // Duration in ms for smooth scroll animation (default: 100, 0 = instant)

  // Graphics options (Kitty Graphics Protocol)
  graphics?: GraphicsOptions;

  // Internal: Ghostty WASM instance (optional, for test isolation)
  // If not provided, uses the module-level instance from init()
  ghostty?: Ghostty;
}

export interface ITheme {
  foreground?: string;
  background?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;

  // ANSI colors (0-15)
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface IDisposable {
  dispose(): void;
}

export type IEvent<T> = (listener: (arg: T) => void) => IDisposable;

export interface ITerminalAddon {
  activate(terminal: ITerminalCore): void;
  dispose(): void;
}

export interface ITerminalCore {
  cols: number;
  rows: number;
  element?: HTMLElement;
  textarea?: HTMLTextAreaElement;
}

/**
 * Buffer range for selection coordinates
 */
export interface IBufferRange {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Keyboard event with key and DOM event
 */
export interface IKeyEvent {
  key: string;
  domEvent: KeyboardEvent;
}

/**
 * Unicode version provider (xterm.js compatibility)
 */
export interface IUnicodeVersionProvider {
  readonly activeVersion: string;
}

// ============================================================================
// Buffer API Interfaces (xterm.js compatibility)
// ============================================================================

/**
 * Top-level buffer API namespace
 * Provides access to active, normal, and alternate screen buffers
 */
export interface IBufferNamespace {
  /** The currently active buffer (normal or alternate) */
  readonly active: IBuffer;
  /** The normal buffer (primary screen) */
  readonly normal: IBuffer;
  /** The alternate buffer (used by full-screen apps like vim) */
  readonly alternate: IBuffer;

  /** Event fired when buffer changes (normal ↔ alternate) */
  readonly onBufferChange: IEvent<IBuffer>;
}

/**
 * A terminal buffer (normal or alternate screen)
 */
export interface IBuffer {
  /** Buffer type: 'normal' or 'alternate' */
  readonly type: 'normal' | 'alternate';
  /** Cursor X position (0-indexed) */
  readonly cursorX: number;
  /** Cursor Y position (0-indexed, relative to viewport) */
  readonly cursorY: number;
  /** Viewport Y position (scroll offset, 0 = bottom of scrollback) */
  readonly viewportY: number;
  /** Base Y position (always 0 for normal buffer, may vary for alternate) */
  readonly baseY: number;
  /** Total buffer length (rows + scrollback for normal, just rows for alternate) */
  readonly length: number;

  /**
   * Get a line from the buffer
   * @param y Line index (0 = top of scrollback for normal buffer)
   * @returns Line object or undefined if out of bounds
   */
  getLine(y: number): IBufferLine | undefined;

  /**
   * Get the null cell (used for empty/uninitialized cells)
   */
  getNullCell(): IBufferCell;
}

/**
 * A single line in the buffer
 */
export interface IBufferLine {
  /** Length of the line (in columns) */
  readonly length: number;
  /** Whether this line wraps to the next line */
  readonly isWrapped: boolean;

  /**
   * Get a cell from this line
   * @param x Column index (0-indexed)
   * @returns Cell object or undefined if out of bounds
   */
  getCell(x: number): IBufferCell | undefined;

  /**
   * Translate the line to a string
   * @param trimRight Whether to trim trailing whitespace (default: false)
   * @param startColumn Start column (default: 0)
   * @param endColumn End column (default: length)
   * @returns String representation of the line
   */
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
}

/**
 * A single cell in the buffer
 */
export interface IBufferCell {
  /** Character(s) in this cell (may be empty, single char, or emoji) */
  getChars(): string;
  /** Unicode codepoint (0 for null cell) */
  getCode(): number;
  /** Character width (1 = normal, 2 = wide/emoji, 0 = combining) */
  getWidth(): number;

  /** Foreground color index (for palette colors) or -1 for RGB */
  getFgColorMode(): number;
  /** Background color index (for palette colors) or -1 for RGB */
  getBgColorMode(): number;
  /** Foreground RGB color (or 0 for default) */
  getFgColor(): number;
  /** Background RGB color (or 0 for default) */
  getBgColor(): number;

  /** Whether cell has bold style */
  isBold(): number;
  /** Whether cell has italic style */
  isItalic(): number;
  /** Whether cell has underline style */
  isUnderline(): number;
  /** Whether cell has strikethrough style */
  isStrikethrough(): number;
  /** Whether cell has blink style */
  isBlink(): number;
  /** Whether cell has inverse video style */
  isInverse(): number;
  /** Whether cell has invisible style */
  isInvisible(): number;
  /** Whether cell has faint/dim style */
  isFaint(): number;

  // Link detection support
  /** Get hyperlink ID for this cell (0 = no link) */
  getHyperlinkId(): number;
  /** Get the Unicode codepoint for this cell */
  getCodepoint(): number;
  /** Whether cell has dim/faint attribute (boolean version) */
  isDim(): boolean;
}

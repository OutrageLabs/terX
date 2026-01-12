/**
 * FitAddon - Auto-resize terminal to fit container
 *
 * Provides automatic terminal resizing to fit its container element.
 * Compatible with xterm.js FitAddon API.
 *
 * Usage:
 * ```typescript
 * const fitAddon = new FitAddon();
 * term.loadAddon(fitAddon);
 * fitAddon.fit();              // Manual fit
 * fitAddon.observeResize();    // Auto-fit on resize
 * ```
 */

import type { ITerminalAddon, ITerminalCore } from '../interfaces';

// ============================================================================
// Constants
// ============================================================================

const MINIMUM_COLS = 2;
const MINIMUM_ROWS = 1;
const DEFAULT_SCROLLBAR_WIDTH = 15; // Reserve space for future scrollback scrollbar
const RESIZE_DEBOUNCE_MS = 100; // Debounce time for ResizeObserver

// ============================================================================
// Types
// ============================================================================

export interface ITerminalDimensions {
  cols: number;
  rows: number;
}

// ============================================================================
// FitAddon Class
// ============================================================================

export class FitAddon implements ITerminalAddon {
  private _terminal?: ITerminalCore;
  private _resizeObserver?: ResizeObserver;
  private _resizeDebounceTimer?: ReturnType<typeof setTimeout>;
  private _lastCols?: number;
  private _lastRows?: number;
  private _isResizing: boolean = false;

  /**
   * Activate the addon (called by Terminal.loadAddon)
   */
  public activate(terminal: ITerminalCore): void {
    this._terminal = terminal;
  }

  /**
   * Dispose the addon and clean up resources
   */
  public dispose(): void {
    // Disconnect ResizeObserver
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }

    // Clear pending debounce timer
    if (this._resizeDebounceTimer) {
      clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = undefined;
    }

    // Clear stored dimensions
    this._lastCols = undefined;
    this._lastRows = undefined;

    this._terminal = undefined;
  }

  /**
   * Fit the terminal to its container
   *
   * Calculates optimal dimensions and resizes the terminal.
   * Does nothing if dimensions cannot be calculated or haven't changed.
   */
  public fit(): void {
    // Prevent re-entrant calls during resize
    if (this._isResizing) {
      console.log('[FitAddon] fit() blocked by _isResizing');
      return;
    }

    const dims = this.proposeDimensions();
    if (!dims || !this._terminal) {
      console.log('[FitAddon] fit() - no dims or terminal');
      return;
    }

    // Access terminal to check current dimensions
    const terminal = this._terminal as any;
    const currentCols = terminal.cols;
    const currentRows = terminal.rows;

    // DEBUG: Log all dimensions
    const el = this._terminal.element;
    console.log('[FitAddon] fit() check:', {
      proposed: dims,
      current: { cols: currentCols, rows: currentRows },
      last: { cols: this._lastCols, rows: this._lastRows },
      container: el ? { clientW: el.clientWidth, clientH: el.clientHeight } : null,
    });

    // Check if dimensions actually changed (prevent feedback loops)
    // Compare against BOTH proposed dimensions AND current terminal dimensions
    if (
      (dims.cols === this._lastCols && dims.rows === this._lastRows) ||
      (dims.cols === currentCols && dims.rows === currentRows)
    ) {
      console.log('[FitAddon] fit() - dimensions unchanged, skipping');
      return;
    }

    // Set flag to prevent re-entrant calls
    this._isResizing = true;

    try {
      // Resize terminal
      if (terminal.resize && typeof terminal.resize === 'function') {
        terminal.resize(dims.cols, dims.rows);
        // Store dimensions AFTER successful resize
        this._lastCols = dims.cols;
        this._lastRows = dims.rows;
        console.log('[FitAddon] fit() - resized to', dims.cols, 'x', dims.rows);
      }
    } catch (err) {
      console.error('[FitAddon] fit() - resize failed:', err);
    } finally {
      // Clear flag after a short delay to allow DOM to settle
      // Then check if another fit() is needed (in case events were missed during _isResizing)
      setTimeout(() => {
        this._isResizing = false;
        // Re-check dimensions in case container changed while we were blocked
        const newDims = this.proposeDimensions();
        if (newDims && (newDims.cols !== this._lastCols || newDims.rows !== this._lastRows)) {
          console.log('[FitAddon] fit() - detected pending resize after unlock, scheduling');
          this.fit();
        }
      }, 50);
    }
  }

  /**
   * Propose dimensions to fit the terminal to its container
   *
   * Calculates cols and rows based on:
   * - Terminal container element dimensions (clientWidth/Height)
   * - Terminal element padding
   * - Font metrics (character cell size)
   * - Scrollbar width reservation
   *
   * @returns Proposed dimensions or undefined if cannot calculate
   */
  public proposeDimensions(): ITerminalDimensions | undefined {
    // Need terminal and its DOM element
    if (!this._terminal?.element) {
      return undefined;
    }

    // Access terminal internals to get renderer
    const terminal = this._terminal as any;
    const renderer = terminal.renderer;

    if (!renderer || typeof renderer.getMetrics !== 'function') {
      return undefined;
    }

    // Get font metrics from renderer
    const metrics = renderer.getMetrics();
    if (!metrics || metrics.width === 0 || metrics.height === 0) {
      return undefined;
    }

    // Get terminal element (container) dimensions
    // Use clientWidth/clientHeight to get the INSIDE dimensions (excluding padding)
    const terminalElement = this._terminal.element;

    // Check if we have clientWidth/clientHeight (DOM element required)
    if (typeof terminalElement.clientWidth === 'undefined') {
      return undefined;
    }

    const elementStyle = window.getComputedStyle(terminalElement);

    // Get the actual content area (inside padding)
    const paddingTop = Number.parseInt(elementStyle.getPropertyValue('padding-top')) || 0;
    const paddingBottom = Number.parseInt(elementStyle.getPropertyValue('padding-bottom')) || 0;
    const paddingLeft = Number.parseInt(elementStyle.getPropertyValue('padding-left')) || 0;
    const paddingRight = Number.parseInt(elementStyle.getPropertyValue('padding-right')) || 0;

    // Use clientWidth/clientHeight which gives us the inside dimensions
    // This is stable and doesn't grow with content
    const containerWidth = terminalElement.clientWidth;
    const containerHeight = terminalElement.clientHeight;

    // Check for invalid dimensions
    if (containerWidth === 0 || containerHeight === 0) {
      return undefined;
    }

    // Calculate available space (subtract padding since clientWidth includes padding)
    const availableWidth = containerWidth - paddingLeft - paddingRight - DEFAULT_SCROLLBAR_WIDTH;
    const availableHeight = containerHeight - paddingTop - paddingBottom;

    // Calculate dimensions (enforce minimums)
    const cols = Math.max(MINIMUM_COLS, Math.floor(availableWidth / metrics.width));
    const rows = Math.max(MINIMUM_ROWS, Math.floor(availableHeight / metrics.height));

    return { cols, rows };
  }

  /**
   * Observe the terminal's container for resize events
   *
   * Sets up a ResizeObserver to automatically call fit() when the
   * container size changes. Resize events are debounced to avoid
   * excessive calls during window drag operations.
   *
   * Call dispose() to stop observing.
   */
  public observeResize(): void {
    if (!this._terminal?.element) {
      return;
    }

    // Already observing
    if (this._resizeObserver) {
      return;
    }

    // Create ResizeObserver that watches for external size changes
    this._resizeObserver = new ResizeObserver((entries) => {
      // Ignore resize events while we're actively resizing
      if (this._isResizing) {
        console.log('[FitAddon] ResizeObserver - blocked by _isResizing');
        return;
      }

      // Only trigger if the observed element's content rect changed
      const entry = entries[0];
      if (!entry) return;

      console.log('[FitAddon] ResizeObserver triggered:', {
        contentRect: { w: entry.contentRect.width, h: entry.contentRect.height },
      });

      // Debounce resize events
      if (this._resizeDebounceTimer) {
        clearTimeout(this._resizeDebounceTimer);
      }

      this._resizeDebounceTimer = setTimeout(() => {
        this.fit();
      }, RESIZE_DEBOUNCE_MS);
    });

    // Observe the terminal element itself (the container we want to fit into)
    // This gives us stable resize events when the CONTAINER changes, not when our canvas changes
    this._resizeObserver.observe(this._terminal.element);
  }
}

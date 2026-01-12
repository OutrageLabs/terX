/**
 * Graphics Manager - Main Orchestrator for Kitty Graphics Protocol
 *
 * Coordinates parsing, decoding, storage, and rendering of terminal graphics.
 * This is the main entry point for the graphics subsystem.
 */

import { GraphicsRenderer } from "./graphics-renderer";
import { GraphicsStorage } from "./graphics-storage";
import { ImageDecoder } from "./image-decoder";
import { type ExtractResult, KittyParser } from "./kitty-parser";
import type {
  DEFAULT_GRAPHICS_OPTIONS,
  GraphicsOptions,
  GraphicsRenderContext,
  ImagePlacement,
  KittyCommand,
  KittyResponse,
  buildKittyResponse,
} from "./types";

/**
 * Callback for sending responses back to the application
 */
export type ResponseCallback = (response: string) => void;

/**
 * Callback for getting current cursor position
 */
export type CursorPositionCallback = () => { row: number; col: number };

/**
 * Callback for writing text to WASM terminal (to update cursor position)
 */
export type WriteToWasmCallback = (data: string) => void;

/**
 * Callback for getting cell dimensions in pixels
 */
export type CellMetricsCallback = () => { width: number; height: number };

/**
 * Callback for displaying an image (popup mode)
 */
export type ImageDisplayCallback = (bitmap: ImageBitmap, imageId: number) => void;

/**
 * GraphicsManager - Main orchestrator for terminal graphics
 */
export class GraphicsManager {
  private parser: KittyParser;
  private decoder: ImageDecoder;
  private storage: GraphicsStorage;
  private renderer: GraphicsRenderer;

  private enabled: boolean;
  private debug: boolean;

  /** Callback for sending protocol responses */
  private responseCallback?: ResponseCallback;

  /** Callback for getting cursor position */
  private cursorCallback?: CursorPositionCallback;

  /** Callback for writing to WASM (to sync cursor position) */
  private writeToWasmCallback?: WriteToWasmCallback;

  /** Callback for getting cell dimensions */
  private cellMetricsCallback?: CellMetricsCallback;

  /** Callback for displaying image in popup */
  private imageDisplayCallback?: ImageDisplayCallback;

  /** Next auto-generated image ID */
  private nextImageId = 1;

  /** Track if we need a re-render */
  private needsRender = false;

  /** Track pending chunked transfer (for continuation chunks without explicit imageId) */
  private pendingChunkImageId: number | null = null;

  constructor(options: GraphicsOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.debug = options.debug ?? false;

    this.parser = new KittyParser(this.debug);
    this.decoder = new ImageDecoder(this.debug);
    this.storage = new GraphicsStorage(options);
    this.renderer = new GraphicsRenderer(this.storage);
  }

  /**
   * Set callback for sending responses to the application
   */
  setResponseCallback(callback: ResponseCallback): void {
    this.responseCallback = callback;
  }

  /**
   * Set callback for getting cursor position
   */
  setCursorCallback(callback: CursorPositionCallback): void {
    this.cursorCallback = callback;
  }

  /**
   * Set callback for writing text to WASM terminal
   * This is used to sync cursor position between graphics commands
   */
  setWriteToWasmCallback(callback: WriteToWasmCallback): void {
    this.writeToWasmCallback = callback;
  }

  /**
   * Set callback for getting cell dimensions
   * This is used to calculate proper display size for images
   */
  setCellMetricsCallback(callback: CellMetricsCallback): void {
    this.cellMetricsCallback = callback;
  }

  /**
   * Set callback for displaying images (popup mode)
   * When set, images are shown in a popup instead of inline in terminal
   */
  setImageDisplayCallback(callback: ImageDisplayCallback): void {
    this.imageDisplayCallback = callback;
  }

  /**
   * Process terminal data, extracting and handling graphics commands
   *
   * IMPORTANT: This method processes data SEQUENTIALLY to maintain correct
   * cursor positions. Text segments are sent to WASM before processing
   * subsequent graphics commands, ensuring cursor position is accurate.
   *
   * @param data - Raw terminal output
   * @returns Data with graphics sequences removed (to send to WASM)
   */
  async processData(data: string): Promise<string> {
    if (!this.enabled) {
      return data;
    }

    // Always strip echoed graphics responses first.
    // When responses are sent through the PTY, the terminal driver may strip
    // the APC escape sequences but echo the content (e.g., "Gi=1;OK").
    data = KittyParser.stripEchoedResponses(data);

    // Strip Kitty Unicode placeholders (used by tmux for image positioning).
    // These appear as garbage characters since we display images in a popup.
    data = KittyParser.stripUnicodePlaceholders(data);

    // Quick check - avoid full parsing if no graphics AND no pending data
    if (!KittyParser.hasGraphicsSequence(data) && !this.parser.hasPendingData()) {
      return data;
    }

    // Extract graphics sequences with their positions
    // Note: extract() returns positions relative to fullData (pendingData + data)
    const result = this.parser.extract(data);

    if (!result.hasGraphics) {
      return data;
    }

    // If we have a WASM write callback, process sequentially
    // This ensures cursor position is correct for each graphics command
    if (this.writeToWasmCallback && result.commands.length > 0) {
      return this.processDataSequentially(result);
    }

    // Fallback: process all commands with current cursor position
    for (const parsed of result.commands) {
      await this.handleCommand(parsed.command);
    }

    return result.cleanedData;
  }

  /**
   * Process data sequentially, syncing cursor position between graphics commands
   *
   * For each graphics command:
   * 1. Send text BEFORE the command to WASM (updates cursor position)
   * 2. Process the graphics command (uses current cursor position)
   * 3. Continue with next command
   * 4. Return remaining text after last command (excluding incomplete sequences)
   */
  private async processDataSequentially(
    result: ExtractResult
  ): Promise<string> {
    const { fullData, commands } = result;
    let lastEnd = 0;

    for (const parsed of commands) {
      // Send text BEFORE this graphics sequence to WASM
      // This updates the cursor position correctly
      const textBefore = fullData.substring(lastEnd, parsed.startIndex);
      if (textBefore && this.writeToWasmCallback) {
        this.writeToWasmCallback(textBefore);
      }

      // Now process the graphics command (cursor is in correct position)
      await this.handleCommand(parsed.command);

      lastEnd = parsed.endIndex;
    }

    // Get remaining text after last graphics sequence
    let remaining = fullData.substring(lastEnd);

    // IMPORTANT: If parser has pending data, it means fullData ends with
    // an incomplete graphics sequence. We must NOT return that incomplete
    // sequence to terminal, or it will be written to WASM as garbage text.
    if (this.parser.hasPendingData()) {
      const apcStart = remaining.indexOf("\x1b_G");
      if (apcStart !== -1) {
        remaining = remaining.substring(0, apcStart);
      }
    }

    return remaining;
  }

  /**
   * Handle a parsed Kitty graphics command
   */
  private async handleCommand(cmd: KittyCommand): Promise<void> {
    if (this.debug) {
      console.log("[GraphicsManager] Handling command:", cmd.action, cmd);
    }

    switch (cmd.action) {
      case "t": // Transmit (store without display)
        await this.handleTransmit(cmd, false);
        break;

      case "T": // Transmit and display
        await this.handleTransmit(cmd, true);
        break;

      case "p": // Put (display stored image)
        this.handlePut(cmd);
        break;

      case "d": // Delete
        this.handleDelete(cmd);
        break;

      case "q": // Query capabilities
        this.handleQuery(cmd);
        break;

      case "f": // Animation frame (not implemented)
      case "a": // Animation control (not implemented)
      case "c": // Compose (not implemented)
        if (this.debug) {
          console.log("[GraphicsManager] Unimplemented action:", cmd.action);
        }
        break;
    }
  }

  /**
   * Handle image transmission (a=t or a=T)
   */
  private async handleTransmit(
    cmd: KittyCommand,
    display: boolean
  ): Promise<void> {
    // Always log for debugging tmux issues
    console.log("[GraphicsManager] handleTransmit:", {
      imageId: cmd.imageId,
      format: cmd.format,
      width: cmd.width,
      height: cmd.height,
      more: cmd.more,
      payloadLen: cmd.payload?.length,
      pendingChunkImageId: this.pendingChunkImageId,
      debug: this.debug,
    });

    // Determine image ID - use explicit, pending, or generate new
    let imageId: number;
    if (cmd.imageId !== undefined) {
      imageId = cmd.imageId;
    } else if (this.pendingChunkImageId !== null) {
      // Continuation chunk without explicit ID - use pending
      imageId = this.pendingChunkImageId;
    } else {
      imageId = this.nextImageId++;
    }

    // Handle chunked transfer
    if (cmd.more) {
      // More chunks coming - buffer this one and track the imageId
      this.pendingChunkImageId = imageId;
      console.log("[GraphicsManager] Buffering chunk:", {
        imageId,
        payloadLen: cmd.payload?.length || 0,
        format: cmd.format,
        hasExistingBuffer: this.storage.hasChunkBuffer(imageId),
      });
      this.storage.addChunk(
        imageId,
        cmd.payload || "",
        cmd.format || 32,
        cmd.width,
        cmd.height,
        cmd.compression,
        true
      );
      return;
    }

    // Final or only chunk - clear pending tracker
    this.pendingChunkImageId = null;

    // Final or only chunk
    let payload = cmd.payload || "";
    let format = cmd.format || 32;
    let width = cmd.width;
    let height = cmd.height;
    let compression = cmd.compression;

    // Check for buffered chunks
    let rawBytes: Uint8Array | null = null;
    console.log("[GraphicsManager] Checking chunk buffer:", {
      imageId,
      hasBuffer: this.storage.hasChunkBuffer(imageId),
    });
    if (this.storage.hasChunkBuffer(imageId)) {
      const buffer = this.storage.getAndClearChunks(imageId);
      if (buffer) {
        buffer.chunks.push(payload);
        console.log("[GraphicsManager] Combining chunks:", {
          imageId,
          numChunks: buffer.chunks.length,
          chunkLengths: buffer.chunks.map(c => c.length),
          totalBase64Len: buffer.chunks.reduce((sum, c) => sum + c.length, 0),
        });
        // Decode all chunks to bytes and combine
        rawBytes = ImageDecoder.combineChunksToBytes(buffer.chunks);
        // Check if it looks like valid PNG (starts with 0x89 0x50 0x4E 0x47)
        const header = rawBytes.slice(0, 8);
        const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
        console.log("[GraphicsManager] Combined bytes:", {
          rawBytesLen: rawBytes.length,
          header: Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' '),
          looksLikePng: isPng,
        });
        format = buffer.format;
        width = width ?? buffer.width;
        height = height ?? buffer.height;
        compression = compression ?? buffer.compression;
      }
    }

    if (!rawBytes && !payload) {
      this.sendResponse({ imageId, ok: false, message: "no data" });
      return;
    }

    // Send success response IMMEDIATELY (before async decode) if not quiet
    // This matches Kitty's behavior - response comes right after receiving data
    if (cmd.quiet !== 2) {
      this.sendResponse({ imageId, ok: true });
    }

    try {
      // Debug: log decode parameters
      if (this.debug) {
        console.log("[GraphicsManager] About to decode:", {
          imageId,
          format,
          width,
          height,
          compression,
          hasRawBytes: !!rawBytes,
          rawBytesLen: rawBytes?.length,
          payloadLen: payload.length,
          payloadFirst50: payload.substring(0, 50),
        });
      }

      // Decode the image - use raw bytes if we have them (chunked), otherwise decode from base64
      const decoded = rawBytes
        ? await this.decoder.decodeFromBytes(rawBytes, format, width, height, compression)
        : await this.decoder.decode(payload, format, width, height, compression);

      // Store the image
      const image = this.storage.storeImage(
        imageId,
        format,
        decoded.width,
        decoded.height,
        decoded.data,
        decoded.bitmap
      );

      // Display if requested
      if (display && decoded.bitmap) {
        // Use popup mode if callback is set, otherwise use inline placement
        if (this.imageDisplayCallback) {
          this.imageDisplayCallback(decoded.bitmap, imageId);
        } else {
          this.createPlacement(cmd, image.id);
        }
      }
    } catch (e) {
      console.error("[GraphicsManager] Failed to decode image:", e, {
        imageId,
        format,
        width,
        height,
        compression,
        hasRawBytes: !!rawBytes,
        rawBytesLen: rawBytes?.length,
        payloadLen: payload.length,
        payloadFirst100: payload.substring(0, 100),
      });
    }
  }

  /**
   * Handle put command (a=p) - display stored image
   */
  private handlePut(cmd: KittyCommand): void {
    const imageId = cmd.imageId;
    if (imageId === undefined) {
      this.sendResponse({ ok: false, message: "no image id" });
      return;
    }

    if (!this.storage.hasImage(imageId)) {
      this.sendResponse({ imageId, ok: false, message: "image not found" });
      return;
    }

    this.createPlacement(cmd, imageId);

    if (cmd.quiet !== 2) {
      this.sendResponse({ imageId, placementId: cmd.placementId, ok: true });
    }
  }

  /**
   * Create a placement for an image
   */
  private createPlacement(cmd: KittyCommand, imageId: number): void {
    const image = this.storage.getImage(imageId);
    if (!image) return;

    // Get cursor position
    const cursor = this.cursorCallback?.() ?? { row: 0, col: 0 };

    // Determine position
    const bufferRow = cmd.cellY ?? cursor.row;
    const bufferCol = cmd.cellX ?? cursor.col;

    // Get cell metrics for proper sizing
    const cellMetrics = this.cellMetricsCallback?.() ?? { width: 8, height: 16 };

    // Determine display size (in cells)
    // Use actual cell dimensions for accurate placement
    const displayWidth = cmd.displayWidth ?? Math.ceil(image.width / cellMetrics.width);
    const displayHeight = cmd.displayHeight ?? Math.ceil(image.height / cellMetrics.height);

    if (this.debug) {
      console.log("[GraphicsManager] createPlacement:", {
        imageId,
        imageSize: `${image.width}x${image.height}`,
        cursor: `row=${cursor.row}, col=${cursor.col}`,
        bufferPos: `row=${bufferRow}, col=${bufferCol}`,
        cellMetrics: `${cellMetrics.width}x${cellMetrics.height}`,
        displaySize: `${displayWidth}x${displayHeight} cells`,
      });
    }

    // Generate placement ID if not provided
    const placementId = cmd.placementId ?? Date.now() & 0xffffff;

    const placement: ImagePlacement = {
      id: `${imageId}:${placementId}`,
      imageId,
      placementId,
      bufferRow,
      bufferCol,
      offsetX: cmd.offsetX ?? 0,
      offsetY: cmd.offsetY ?? 0,
      displayWidth,
      displayHeight,
      srcX: cmd.srcX ?? 0,
      srcY: cmd.srcY ?? 0,
      srcWidth: cmd.srcWidth ?? image.width,
      srcHeight: cmd.srcHeight ?? image.height,
      zIndex: cmd.zIndex ?? 0,
      image,
    };

    this.storage.setPlacement(placement);
    this.needsRender = true;

  }

  /**
   * Handle delete command (a=d)
   */
  private handleDelete(cmd: KittyCommand): void {
    const target = cmd.deleteTarget || "a";

    switch (target) {
      case "a": // All visible
      case "A": // All including off-screen
        this.storage.deleteAll(target === "A");
        break;

      case "i": // By image ID (visible)
      case "I": // By image ID (all)
        if (cmd.imageId !== undefined) {
          this.storage.removeImage(cmd.imageId);
        }
        break;

      case "p": // By placement ID
      case "P":
        if (cmd.imageId !== undefined && cmd.placementId !== undefined) {
          const key = `${cmd.imageId}:${cmd.placementId}`;
          this.storage.removePlacement(key);
        }
        break;

      case "c": // At cursor position
        const cursor = this.cursorCallback?.() ?? { row: 0, col: 0 };
        this.storage.deleteAtCursor(cursor.row, cursor.col);
        break;

      case "r": // At cursor row
        const cursorRow = this.cursorCallback?.()?.row ?? 0;
        this.storage.deleteRow(cursorRow);
        break;

      case "C": // At cursor column
        const cursorCol = this.cursorCallback?.()?.col ?? 0;
        this.storage.deleteColumn(cursorCol);
        break;

      case "z": // By z-index
        if (cmd.zIndex !== undefined) {
          this.storage.deleteByZIndex(cmd.zIndex);
        }
        break;
    }

    this.needsRender = true;
  }

  /**
   * Handle query command (a=q)
   */
  private handleQuery(cmd: KittyCommand): void {
    // Respond that we support Kitty graphics
    this.sendResponse({
      imageId: cmd.imageId,
      ok: true,
      message: "OK",
    });
  }

  /**
   * Send a response back to the application
   */
  private sendResponse(_response: {
    imageId?: number;
    placementId?: number;
    ok: boolean;
    message?: string;
  }): void {
    // Disabled: We display graphics in a popup overlay, so we don't need to send
    // Kitty protocol responses back to the application. Sending responses causes
    // PTY echo issues (the response gets echoed back and displayed as garbage).
    return;
  }

  // ===========================================================================
  // Rendering Interface
  // ===========================================================================

  /**
   * Render graphics below text (Pass 0)
   */
  renderBelowText(ctx: GraphicsRenderContext): void {
    if (!this.enabled) return;
    this.renderer.renderBelowText(ctx);
  }

  /**
   * Render graphics above text (Pass 3)
   */
  renderAboveText(ctx: GraphicsRenderContext): void {
    if (!this.enabled) return;
    this.renderer.renderAboveText(ctx);
  }

  /**
   * Check if there are graphics to render
   */
  hasGraphics(): boolean {
    return this.enabled && this.renderer.hasGraphics();
  }

  /**
   * Check if a re-render is needed
   */
  checkNeedsRender(): boolean {
    const needed = this.needsRender;
    this.needsRender = false;
    return needed;
  }

  // ===========================================================================
  // Public Control Methods
  // ===========================================================================

  /**
   * Enable or disable graphics processing
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if graphics are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Clear all graphics
   */
  clear(): void {
    this.storage.deleteAll(true);
    this.needsRender = true;
  }

  /**
   * Get storage statistics
   */
  getStats(): ReturnType<GraphicsStorage["getStats"]> {
    return this.storage.getStats();
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.storage.dispose();
  }
}

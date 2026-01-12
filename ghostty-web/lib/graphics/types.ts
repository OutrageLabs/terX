/**
 * Kitty Graphics Protocol Types
 *
 * Implementation based on:
 * https://sw.kovidgoyal.net/kitty/graphics-protocol/
 *
 * The Kitty graphics protocol allows terminals to display images using
 * escape sequences. Images are transmitted as base64-encoded data and
 * can be positioned, scaled, and layered with z-index control.
 */

// =============================================================================
// Kitty Graphics Protocol Constants
// =============================================================================

/**
 * Kitty graphics escape sequence format:
 * ESC _ G <control-data> ; <payload> ESC \
 *
 * Control data is key=value pairs separated by commas.
 * Payload is base64-encoded image data.
 */
export const KITTY_GRAPHICS_START = "\x1b_G";
export const KITTY_GRAPHICS_END = "\x1b\\";

/**
 * Action types for Kitty graphics commands
 */
export type KittyAction =
  | "t" // Transmit image data (store without display)
  | "T" // Transmit and display
  | "p" // Put (display previously transmitted image)
  | "d" // Delete image(s)
  | "q" // Query terminal capabilities
  | "f" // Frame (animation)
  | "a" // Animation control
  | "c"; // Compose (combine images)

/**
 * Image format types
 */
export type KittyFormat =
  | 24 // RGB (3 bytes per pixel)
  | 32 // RGBA (4 bytes per pixel)
  | 100; // PNG

/**
 * Transmission medium
 */
export type KittyTransmission =
  | "d" // Direct (payload in escape sequence)
  | "f" // File (payload is file path)
  | "t" // Temporary file (deleted after read)
  | "s"; // Shared memory

/**
 * Compression type
 */
export type KittyCompression =
  | undefined // No compression
  | "z"; // zlib compression

/**
 * Delete target specifier
 */
export type KittyDeleteTarget =
  | "a" // All images
  | "A" // All images including those not on visible screen
  | "i" // By image ID
  | "I" // By image ID, including those not on visible screen
  | "n" // By image number
  | "N" // By image number, including those not on visible screen
  | "p" // By placement ID
  | "P" // By placement ID, including those not on visible screen
  | "c" // At cursor position
  | "C" // At cursor column
  | "r" // At cursor row
  | "x" // In cell range (x1, y1, x2, y2)
  | "y" // In cell range on current row
  | "z"; // By z-index

// =============================================================================
// Parsed Command Structure
// =============================================================================

/**
 * Parsed Kitty graphics command with all possible parameters
 */
export interface KittyCommand {
  // Action
  action: KittyAction;

  // Image identification
  imageId?: number; // i - Image ID (1-4294967295)
  imageNumber?: number; // I - Image number for animation
  placementId?: number; // p - Placement ID

  // Format and transmission
  format?: KittyFormat; // f - Image format
  transmission?: KittyTransmission; // t - Transmission medium
  compression?: KittyCompression; // o - Compression
  more?: boolean; // m - More data chunks coming

  // Image dimensions (source)
  width?: number; // s - Source width in pixels
  height?: number; // v - Source height in pixels

  // Display dimensions
  displayWidth?: number; // w - Display width in cells
  displayHeight?: number; // h - Display height in cells

  // Source rectangle (for cropping)
  srcX?: number; // x - Source X offset
  srcY?: number; // y - Source Y offset
  srcWidth?: number; // w (when used with src)
  srcHeight?: number; // h (when used with src)

  // Position
  cellX?: number; // X - Absolute cell X position
  cellY?: number; // Y - Absolute cell Y position
  offsetX?: number; // x - Pixel offset within cell (0-cell width)
  offsetY?: number; // y - Pixel offset within cell (0-cell height)

  // Z-index layering
  zIndex?: number; // z - Z-index (-2147483647 to 2147483647)

  // Display behavior
  cursorMovement?: 0 | 1; // C - 0=move cursor, 1=don't move
  quiet?: 0 | 1 | 2; // q - Response suppression level

  // Delete options
  deleteTarget?: KittyDeleteTarget; // d - What to delete

  // Payload (base64-encoded data)
  payload?: string;
}

/**
 * Result of parsing a Kitty graphics sequence
 */
export interface KittyParseResult {
  command: KittyCommand;
  startIndex: number;
  endIndex: number;
}

// =============================================================================
// Image Storage Types
// =============================================================================

/**
 * Stored image data before decoding
 */
export interface StoredImage {
  id: number;
  format: KittyFormat;
  width: number;
  height: number;
  data: Uint8Array; // Raw pixel data or PNG bytes
  bitmap?: ImageBitmap; // Decoded bitmap (lazy-loaded)
  byteSize: number; // For memory tracking
  lastAccessed: number; // For LRU eviction
}

/**
 * Image placement on screen
 */
export interface ImagePlacement {
  id: string; // Unique placement ID (imageId:placementId)
  imageId: number;
  placementId: number;

  // Position in buffer coordinates
  bufferRow: number; // Row in terminal buffer (for scrolling)
  bufferCol: number; // Column in terminal buffer

  // Pixel offsets within cell
  offsetX: number;
  offsetY: number;

  // Display size in cells
  displayWidth: number;
  displayHeight: number;

  // Source rectangle (cropping)
  srcX: number;
  srcY: number;
  srcWidth: number;
  srcHeight: number;

  // Layering
  zIndex: number;

  // Reference to stored image
  image: StoredImage;
}

// =============================================================================
// Graphics Manager Options
// =============================================================================

/**
 * Configuration options for the graphics system
 */
export interface GraphicsOptions {
  /**
   * Enable Kitty graphics protocol support
   * @default true
   */
  enabled?: boolean;

  /**
   * Maximum memory for image cache in bytes
   * @default 104_857_600 (100MB)
   */
  maxCacheMemory?: number;

  /**
   * Maximum number of stored images
   * @default 1000
   */
  maxImages?: number;

  /**
   * Maximum number of active placements
   * @default 10000
   */
  maxPlacements?: number;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Default graphics options
 */
export const DEFAULT_GRAPHICS_OPTIONS: Required<GraphicsOptions> = {
  enabled: true,
  maxCacheMemory: 100 * 1024 * 1024, // 100MB
  maxImages: 1000,
  maxPlacements: 10000,
  debug: false,
};

// =============================================================================
// Response Types
// =============================================================================

/**
 * Response from terminal to application about graphics command
 */
export interface KittyResponse {
  imageId?: number;
  placementId?: number;
  message?: string;
  ok: boolean;
}

/**
 * Build a Kitty graphics response string
 */
export function buildKittyResponse(response: KittyResponse): string {
  let data = "";
  if (response.imageId !== undefined) {
    data += `i=${response.imageId}`;
  }
  if (response.placementId !== undefined) {
    if (data) data += ",";
    data += `p=${response.placementId}`;
  }
  const status = response.ok ? "OK" : `ENOENT:${response.message || "error"}`;
  return `${KITTY_GRAPHICS_START}${data};${status}${KITTY_GRAPHICS_END}`;
}

// =============================================================================
// Chunk Buffer for Multi-part Transfers
// =============================================================================

/**
 * Buffer for accumulating chunked image data
 */
export interface ChunkBuffer {
  imageId: number;
  format: KittyFormat;
  width?: number;
  height?: number;
  chunks: string[]; // Base64 chunks
  transmission?: KittyTransmission;
  compression?: KittyCompression;
}

// =============================================================================
// Renderer Types
// =============================================================================

/**
 * Rendering context passed to graphics renderer
 */
export interface GraphicsRenderContext {
  ctx: CanvasRenderingContext2D;
  cellWidth: number;
  cellHeight: number;
  scrollTop: number; // Current scroll position in buffer rows
  viewportRows: number; // Number of visible rows
  viewportCols: number; // Number of visible columns
  devicePixelRatio: number;
}

/**
 * Z-index ranges for layered rendering
 */
export const Z_INDEX = {
  /** Images rendered below text (negative z-index) */
  BELOW_TEXT: -1,
  /** Images rendered above text (zero or positive z-index) */
  ABOVE_TEXT: 0,
} as const;

/**
 * Kitty Graphics Protocol Support for ghostty-web
 *
 * This module provides terminal graphics support via the Kitty graphics protocol,
 * allowing applications like chafa, timg, and other graphics-capable CLI tools
 * to display images in the terminal.
 *
 * Usage:
 *
 * ```typescript
 * import { Terminal } from 'ghostty-web';
 *
 * const term = new Terminal({
 *   graphics: {
 *     enabled: true,
 *     maxCacheMemory: 100_000_000, // 100MB
 *   }
 * });
 * ```
 *
 * @module graphics
 */

// Main manager class
export { GraphicsManager } from "./graphics-manager";
export type {
  ResponseCallback,
  CursorPositionCallback,
  WriteToWasmCallback,
  CellMetricsCallback,
  ImageDisplayCallback,
} from "./graphics-manager";

// Image popup for displaying graphics
export { ImagePopup } from "./image-popup";
export type { PopupOptions } from "./image-popup";

// Parser
export { KittyParser } from "./kitty-parser";
export type { ExtractResult } from "./kitty-parser";

// Decoder
export { ImageDecoder } from "./image-decoder";
export type { DecodeResult } from "./image-decoder";

// Storage
export { GraphicsStorage } from "./graphics-storage";

// Renderer
export { GraphicsRenderer } from "./graphics-renderer";

// Types
export type {
  // Protocol constants
  KittyAction,
  KittyFormat,
  KittyTransmission,
  KittyCompression,
  KittyDeleteTarget,
  // Command types
  KittyCommand,
  KittyParseResult,
  KittyResponse,
  // Storage types
  StoredImage,
  ImagePlacement,
  ChunkBuffer,
  // Configuration
  GraphicsOptions,
  // Rendering
  GraphicsRenderContext,
} from "./types";

export {
  // Constants
  KITTY_GRAPHICS_START,
  KITTY_GRAPHICS_END,
  DEFAULT_GRAPHICS_OPTIONS,
  Z_INDEX,
  // Functions
  buildKittyResponse,
} from "./types";

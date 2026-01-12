/**
 * Graphics Storage with LRU Cache
 *
 * Manages storage of images and their placements with:
 * - Memory-bounded LRU eviction for images
 * - Efficient lookup by image ID and placement ID
 * - Proper ImageBitmap disposal for memory management
 */

import type {
  ChunkBuffer,
  DEFAULT_GRAPHICS_OPTIONS,
  GraphicsOptions,
  ImagePlacement,
  KittyCompression,
  KittyFormat,
  StoredImage,
} from "./types";

/**
 * GraphicsStorage - LRU cache for terminal graphics
 */
export class GraphicsStorage {
  /** Stored images by ID */
  private images: Map<number, StoredImage> = new Map();

  /** Image access order for LRU eviction (most recent at end) */
  private accessOrder: number[] = [];

  /** Active placements by unique key (imageId:placementId) */
  private placements: Map<string, ImagePlacement> = new Map();

  /** Placements indexed by buffer row for efficient scrolling queries */
  private placementsByRow: Map<number, Set<string>> = new Map();

  /** Chunk buffers for multi-part image transfers */
  private chunkBuffers: Map<number, ChunkBuffer> = new Map();

  /** Current total memory usage in bytes */
  private memoryUsage = 0;

  /** Configuration options */
  private maxMemory: number;
  private maxImages: number;
  private maxPlacements: number;
  private debug: boolean;

  constructor(options: GraphicsOptions = {}) {
    this.maxMemory = options.maxCacheMemory ?? 100 * 1024 * 1024;
    this.maxImages = options.maxImages ?? 1000;
    this.maxPlacements = options.maxPlacements ?? 10000;
    this.debug = options.debug ?? false;
  }

  // ===========================================================================
  // Image Storage
  // ===========================================================================

  /**
   * Store an image in the cache
   */
  storeImage(
    id: number,
    format: KittyFormat,
    width: number,
    height: number,
    data: Uint8Array,
    bitmap?: ImageBitmap
  ): StoredImage {
    // Check if we need to evict images first
    this.evictIfNeeded(data.length);

    // Remove existing image with same ID if present
    if (this.images.has(id)) {
      this.removeImage(id);
    }

    const image: StoredImage = {
      id,
      format,
      width,
      height,
      data,
      bitmap,
      byteSize: data.length + (bitmap ? width * height * 4 : 0),
      lastAccessed: Date.now(),
    };

    this.images.set(id, image);
    this.accessOrder.push(id);
    this.memoryUsage += image.byteSize;

    if (this.debug) {
      console.log("[GraphicsStorage] Stored image:", {
        id,
        size: `${width}x${height}`,
        bytes: image.byteSize,
        totalMemory: this.memoryUsage,
      });
    }

    return image;
  }

  /**
   * Get an image by ID, updating access time for LRU
   */
  getImage(id: number): StoredImage | undefined {
    const image = this.images.get(id);
    if (image) {
      image.lastAccessed = Date.now();
      // Move to end of access order
      const idx = this.accessOrder.indexOf(id);
      if (idx !== -1) {
        this.accessOrder.splice(idx, 1);
        this.accessOrder.push(id);
      }
    }
    return image;
  }

  /**
   * Remove an image and all its placements
   */
  removeImage(id: number): boolean {
    const image = this.images.get(id);
    if (!image) return false;

    // Dispose ImageBitmap if present
    if (image.bitmap) {
      image.bitmap.close();
    }

    // Remove all placements using this image
    for (const [key, placement] of this.placements) {
      if (placement.imageId === id) {
        this.removePlacement(key);
      }
    }

    // Update memory and order tracking
    this.memoryUsage -= image.byteSize;
    const idx = this.accessOrder.indexOf(id);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }

    this.images.delete(id);

    if (this.debug) {
      console.log("[GraphicsStorage] Removed image:", id);
    }

    return true;
  }

  /**
   * Check if an image exists
   */
  hasImage(id: number): boolean {
    return this.images.has(id);
  }

  // ===========================================================================
  // Placement Management
  // ===========================================================================

  /**
   * Add or update an image placement
   */
  setPlacement(placement: ImagePlacement): void {
    const key = placement.id;

    // Remove existing placement if updating
    if (this.placements.has(key)) {
      this.removePlacement(key);
    }

    // Check placement limit
    if (this.placements.size >= this.maxPlacements) {
      // Remove oldest placement
      const oldest = this.placements.keys().next().value;
      if (oldest) {
        this.removePlacement(oldest);
      }
    }

    this.placements.set(key, placement);

    // Index by row
    const row = placement.bufferRow;
    let rowSet = this.placementsByRow.get(row);
    if (!rowSet) {
      rowSet = new Set();
      this.placementsByRow.set(row, rowSet);
    }
    rowSet.add(key);

    if (this.debug) {
      console.log("[GraphicsStorage] Set placement:", {
        key,
        row,
        col: placement.bufferCol,
        zIndex: placement.zIndex,
      });
    }
  }

  /**
   * Get a placement by key
   */
  getPlacement(key: string): ImagePlacement | undefined {
    return this.placements.get(key);
  }

  /**
   * Remove a placement
   */
  removePlacement(key: string): boolean {
    const placement = this.placements.get(key);
    if (!placement) return false;

    // Remove from row index
    const rowSet = this.placementsByRow.get(placement.bufferRow);
    if (rowSet) {
      rowSet.delete(key);
      if (rowSet.size === 0) {
        this.placementsByRow.delete(placement.bufferRow);
      }
    }

    this.placements.delete(key);
    return true;
  }

  /**
   * Get all placements visible in a row range
   *
   * Note: A placement starting at bufferRow with displayHeight cells is visible
   * in rows [bufferRow, bufferRow + displayHeight - 1]. We need to check all
   * placements that could overlap with the requested range.
   */
  getPlacementsInRange(startRow: number, endRow: number): ImagePlacement[] {
    const result: ImagePlacement[] = [];
    const seen = new Set<string>();

    // We need to find all placements that overlap with [startRow, endRow]
    // A placement at row R with height H is visible in [R, R+H-1]
    // So we need placements where: R <= endRow AND R+H-1 >= startRow
    // That means: R <= endRow AND R >= startRow - H + 1
    // Since we don't know H ahead of time, we check all placements

    for (const [key, placement] of this.placements) {
      // Calculate the range of rows this placement occupies
      const placementStart = placement.bufferRow;
      const placementEnd = placement.bufferRow + placement.displayHeight - 1;

      // Check if placement overlaps with requested range
      if (placementEnd >= startRow && placementStart <= endRow) {
        if (!seen.has(key)) {
          seen.add(key);
          result.push(placement);
        }
      }
    }

    return result;
  }

  /**
   * Get all placements
   */
  getAllPlacements(): ImagePlacement[] {
    return Array.from(this.placements.values());
  }

  // ===========================================================================
  // Chunk Buffer Management (for multi-part transfers)
  // ===========================================================================

  /**
   * Start or continue a chunked image transfer
   */
  addChunk(
    imageId: number,
    chunk: string,
    format: KittyFormat,
    width?: number,
    height?: number,
    compression?: KittyCompression,
    isMore?: boolean
  ): ChunkBuffer {
    let buffer = this.chunkBuffers.get(imageId);

    if (!buffer) {
      buffer = {
        imageId,
        format,
        width,
        height,
        compression,
        chunks: [],
      };
      this.chunkBuffers.set(imageId, buffer);
    }

    buffer.chunks.push(chunk);

    // Update dimensions if provided
    if (width !== undefined) buffer.width = width;
    if (height !== undefined) buffer.height = height;
    if (compression !== undefined) buffer.compression = compression;

    if (this.debug) {
      console.log("[GraphicsStorage] Added chunk:", {
        imageId,
        chunkNum: buffer.chunks.length,
        isMore,
      });
    }

    return buffer;
  }

  /**
   * Get and clear a chunk buffer (when transfer is complete)
   */
  getAndClearChunks(imageId: number): ChunkBuffer | undefined {
    const buffer = this.chunkBuffers.get(imageId);
    if (buffer) {
      this.chunkBuffers.delete(imageId);
    }
    return buffer;
  }

  /**
   * Check if there's a pending chunk transfer for an image
   */
  hasChunkBuffer(imageId: number): boolean {
    return this.chunkBuffers.has(imageId);
  }

  // ===========================================================================
  // Delete Operations (Kitty protocol d=... commands)
  // ===========================================================================

  /**
   * Delete all images and placements
   */
  deleteAll(includeOffScreen = false): void {
    // Dispose all bitmaps
    for (const image of this.images.values()) {
      if (image.bitmap) {
        image.bitmap.close();
      }
    }

    this.images.clear();
    this.placements.clear();
    this.placementsByRow.clear();
    this.accessOrder = [];
    this.memoryUsage = 0;
    this.chunkBuffers.clear();

    if (this.debug) {
      console.log("[GraphicsStorage] Deleted all images");
    }
  }

  /**
   * Delete placements at a specific cursor position
   */
  deleteAtCursor(row: number, col: number): void {
    const rowSet = this.placementsByRow.get(row);
    if (!rowSet) return;

    for (const key of [...rowSet]) {
      const placement = this.placements.get(key);
      if (placement && placement.bufferCol === col) {
        this.removePlacement(key);
      }
    }
  }

  /**
   * Delete all placements in a row
   */
  deleteRow(row: number): void {
    const rowSet = this.placementsByRow.get(row);
    if (!rowSet) return;

    for (const key of [...rowSet]) {
      this.removePlacement(key);
    }
  }

  /**
   * Delete all placements in a column
   */
  deleteColumn(col: number): void {
    for (const [key, placement] of [...this.placements]) {
      if (placement.bufferCol === col) {
        this.removePlacement(key);
      }
    }
  }

  /**
   * Delete placements by z-index
   */
  deleteByZIndex(zIndex: number): void {
    for (const [key, placement] of [...this.placements]) {
      if (placement.zIndex === zIndex) {
        this.removePlacement(key);
      }
    }
  }

  // ===========================================================================
  // Memory Management
  // ===========================================================================

  /**
   * Evict least recently used images if needed
   */
  private evictIfNeeded(additionalBytes: number): void {
    // Check image count limit
    while (this.images.size >= this.maxImages && this.accessOrder.length > 0) {
      const lruId = this.accessOrder[0];
      this.removeImage(lruId);
    }

    // Check memory limit
    while (
      this.memoryUsage + additionalBytes > this.maxMemory &&
      this.accessOrder.length > 0
    ) {
      const lruId = this.accessOrder[0];
      this.removeImage(lruId);
    }
  }

  /**
   * Get current memory usage statistics
   */
  getStats(): {
    imageCount: number;
    placementCount: number;
    memoryUsage: number;
    maxMemory: number;
    chunkBuffers: number;
  } {
    return {
      imageCount: this.images.size,
      placementCount: this.placements.size,
      memoryUsage: this.memoryUsage,
      maxMemory: this.maxMemory,
      chunkBuffers: this.chunkBuffers.size,
    };
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.deleteAll(true);
  }
}

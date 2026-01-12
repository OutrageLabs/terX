/**
 * Graphics Renderer for Kitty Protocol
 *
 * Renders image placements to the terminal canvas.
 * Supports z-index layering (below and above text).
 */

import type { GraphicsStorage } from "./graphics-storage";
import type { GraphicsRenderContext, ImagePlacement, Z_INDEX } from "./types";

/**
 * GraphicsRenderer - Renders graphics placements to canvas
 */
export class GraphicsRenderer {
  private storage: GraphicsStorage;

  constructor(storage: GraphicsStorage) {
    this.storage = storage;
  }

  /**
   * Render graphics below text (negative z-index)
   */
  renderBelowText(ctx: GraphicsRenderContext): void {
    this.renderPlacements(ctx, (p) => p.zIndex < 0);
  }

  /**
   * Render graphics above text (zero or positive z-index)
   */
  renderAboveText(ctx: GraphicsRenderContext): void {
    this.renderPlacements(ctx, (p) => p.zIndex >= 0);
  }

  /**
   * Render all placements matching the filter
   */
  private renderPlacements(
    renderCtx: GraphicsRenderContext,
    filter: (p: ImagePlacement) => boolean
  ): void {
    const { ctx, cellWidth, cellHeight, scrollTop, viewportRows, devicePixelRatio } =
      renderCtx;

    // Calculate visible row range
    const startRow = scrollTop;
    const endRow = scrollTop + viewportRows;

    // Get placements in visible range
    const placements = this.storage.getPlacementsInRange(startRow, endRow);

    // Filter by z-index and sort for proper layering
    const filtered = placements.filter(filter).sort((a, b) => a.zIndex - b.zIndex);

    if (filtered.length === 0) return;

    for (const placement of filtered) {
      this.renderPlacement(renderCtx, placement);
    }
  }

  /**
   * Render a single image placement
   */
  private renderPlacement(
    renderCtx: GraphicsRenderContext,
    placement: ImagePlacement
  ): void {
    const { ctx, cellWidth, cellHeight, scrollTop, devicePixelRatio } = renderCtx;
    const { image } = placement;

    // Ensure we have a bitmap to render
    if (!image.bitmap) {
      return;
    }

    // Calculate screen position (accounting for scroll)
    const screenRow = placement.bufferRow - scrollTop;
    const screenCol = placement.bufferCol;

    // Base position in canvas coordinates
    const baseX = screenCol * cellWidth;
    const baseY = screenRow * cellHeight;

    // Add pixel offsets
    const x = baseX + placement.offsetX;
    const y = baseY + placement.offsetY;

    // Calculate destination size
    const destWidth = placement.displayWidth * cellWidth;
    const destHeight = placement.displayHeight * cellHeight;

    // Source rectangle (for cropping/partial display)
    const srcX = placement.srcX;
    const srcY = placement.srcY;
    const srcWidth = placement.srcWidth || image.width;
    const srcHeight = placement.srcHeight || image.height;

    try {
      // Draw the image
      ctx.drawImage(
        image.bitmap,
        srcX,
        srcY,
        srcWidth,
        srcHeight,
        x * devicePixelRatio,
        y * devicePixelRatio,
        destWidth * devicePixelRatio,
        destHeight * devicePixelRatio
      );

    } catch (e) {
      console.error("[GraphicsRenderer] Failed to draw image:", e);
    }
  }

  /**
   * Check if there are any graphics to render
   */
  hasGraphics(): boolean {
    return this.storage.getAllPlacements().length > 0;
  }

  /**
   * Get count of visible placements in the current viewport
   */
  getVisibleCount(scrollTop: number, viewportRows: number): number {
    const endRow = scrollTop + viewportRows;
    return this.storage.getPlacementsInRange(scrollTop, endRow).length;
  }
}

/**
 * Image Popup - Simple overlay for displaying terminal graphics
 *
 * Instead of complex inline rendering, displays images in a
 * dismissible popup overlay. Much simpler and more reliable.
 */

export interface PopupOptions {
  /** Container element for the popup */
  container: HTMLElement;
  /** Callback when popup is closed */
  onClose?: () => void;
}

/**
 * ImagePopup - Displays images in an overlay
 */
export class ImagePopup {
  private container: HTMLElement;
  private overlay: HTMLDivElement | null = null;
  private onClose?: () => void;

  constructor(options: PopupOptions) {
    this.container = options.container;
    this.onClose = options.onClose;
  }

  /**
   * Show an image in the popup
   */
  show(bitmap: ImageBitmap, imageId?: number): void {
    // Remove existing popup if any
    this.close();

    // Create overlay
    this.overlay = document.createElement("div");
    this.overlay.className = "ghostty-image-popup-overlay";
    this.overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      cursor: pointer;
    `;

    // Create image container
    const imageContainer = document.createElement("div");
    imageContainer.style.cssText = `
      position: relative;
      max-width: 90%;
      max-height: 90%;
      display: flex;
      flex-direction: column;
      align-items: center;
    `;

    // Create canvas to display the bitmap
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.style.cssText = `
      max-width: 100%;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 4px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    // Draw bitmap to canvas
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
    }

    // Create info text
    const info = document.createElement("div");
    info.style.cssText = `
      color: #888;
      font-size: 12px;
      margin-top: 12px;
      font-family: monospace;
    `;
    info.textContent = `${bitmap.width}×${bitmap.height}${imageId ? ` (ID: ${imageId})` : ""} — Click or press ESC to close`;

    // Create close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "×";
    closeBtn.style.cssText = `
      position: absolute;
      top: -40px;
      right: -40px;
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-size: 24px;
      cursor: pointer;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    `;
    closeBtn.onmouseover = () => {
      closeBtn.style.background = "rgba(255, 255, 255, 0.2)";
    };
    closeBtn.onmouseout = () => {
      closeBtn.style.background = "rgba(255, 255, 255, 0.1)";
    };
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.close();
    };

    // Assemble popup
    imageContainer.appendChild(canvas);
    imageContainer.appendChild(info);
    imageContainer.appendChild(closeBtn);
    this.overlay.appendChild(imageContainer);

    // Click on overlay to close
    this.overlay.onclick = () => this.close();

    // Prevent clicks on image from closing
    imageContainer.onclick = (e) => e.stopPropagation();

    // ESC key to close
    this.handleKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener("keydown", this.handleKeyDown);

    // Add to container
    this.container.style.position = "relative";
    this.container.appendChild(this.overlay);
  }

  /**
   * Close the popup
   */
  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      document.removeEventListener("keydown", this.handleKeyDown);
      this.onClose?.();
    }
  }

  /**
   * Handle keyboard events
   */
  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.close();
    }
  }

  /**
   * Check if popup is currently visible
   */
  isVisible(): boolean {
    return this.overlay !== null;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.close();
  }
}

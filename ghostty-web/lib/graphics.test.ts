/**
 * Unit tests for Kitty Graphics Protocol implementation
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { KittyParser } from "./graphics/kitty-parser";
import { GraphicsStorage } from "./graphics/graphics-storage";
import type { KittyFormat, StoredImage, ImagePlacement } from "./graphics/types";

describe("KittyParser", () => {
  let parser: KittyParser;

  beforeEach(() => {
    parser = new KittyParser();
  });

  test("hasGraphicsSequence detects Kitty sequences", () => {
    expect(KittyParser.hasGraphicsSequence("hello world")).toBe(false);
    expect(KittyParser.hasGraphicsSequence("hello\x1b_Gworld")).toBe(true);
    expect(KittyParser.hasGraphicsSequence("\x1b_G")).toBe(true);
  });

  test("extract returns unchanged data when no graphics", () => {
    const result = parser.extract("hello world");
    expect(result.cleanedData).toBe("hello world");
    expect(result.hasGraphics).toBe(false);
    expect(result.commands).toHaveLength(0);
  });

  test("extract parses simple transmit command", () => {
    // ESC_G a=T,f=100;base64data ESC\
    const data = "\x1b_Ga=T,f=100;dGVzdA==\x1b\\";
    const result = parser.extract(data);

    expect(result.cleanedData).toBe("");
    expect(result.hasGraphics).toBe(true);
    expect(result.commands).toHaveLength(1);

    const cmd = result.commands[0].command;
    expect(cmd.action).toBe("T");
    expect(cmd.format).toBe(100);
    expect(cmd.payload).toBe("dGVzdA==");
  });

  test("extract parses command with image ID", () => {
    const data = "\x1b_Ga=t,i=123,f=32,s=10,v=10;AAAA\x1b\\";
    const result = parser.extract(data);

    expect(result.hasGraphics).toBe(true);
    const cmd = result.commands[0].command;
    expect(cmd.action).toBe("t");
    expect(cmd.imageId).toBe(123);
    expect(cmd.format).toBe(32);
    expect(cmd.width).toBe(10);
    expect(cmd.height).toBe(10);
  });

  test("extract handles chunked transfer flag", () => {
    const data = "\x1b_Ga=t,i=1,m=1;chunk1\x1b\\\x1b_Ga=t,i=1,m=0;chunk2\x1b\\";
    const result = parser.extract(data);

    expect(result.commands).toHaveLength(2);
    expect(result.commands[0].command.more).toBe(true);
    expect(result.commands[1].command.more).toBe(false);
  });

  test("extract preserves text around graphics", () => {
    const data = "before\x1b_Ga=T;data\x1b\\after";
    const result = parser.extract(data);

    expect(result.cleanedData).toBe("beforeafter");
    expect(result.hasGraphics).toBe(true);
  });

  test("extract parses delete command", () => {
    const data = "\x1b_Ga=d,d=a;\x1b\\";
    const result = parser.extract(data);

    expect(result.hasGraphics).toBe(true);
    const cmd = result.commands[0].command;
    expect(cmd.action).toBe("d");
    expect(cmd.deleteTarget).toBe("a");
  });

  test("extract parses z-index", () => {
    const data = "\x1b_Ga=T,z=-10;data\x1b\\";
    const result = parser.extract(data);

    const cmd = result.commands[0].command;
    expect(cmd.zIndex).toBe(-10);
  });

  test("extract parses display dimensions", () => {
    const data = "\x1b_Ga=T,c=5,r=3;data\x1b\\";
    const result = parser.extract(data);

    const cmd = result.commands[0].command;
    expect(cmd.displayWidth).toBe(5);
    expect(cmd.displayHeight).toBe(3);
  });
});

describe("GraphicsStorage", () => {
  let storage: GraphicsStorage;

  beforeEach(() => {
    storage = new GraphicsStorage({
      maxImages: 10,
      maxCacheMemory: 1024 * 1024, // 1MB
      maxPlacements: 100,
    });
  });

  test("stores and retrieves images", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const image = storage.storeImage(1, 100, 10, 10, data);

    expect(image.id).toBe(1);
    expect(image.width).toBe(10);
    expect(image.height).toBe(10);

    const retrieved = storage.getImage(1);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(1);
  });

  test("removes images", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    storage.storeImage(1, 100, 10, 10, data);

    expect(storage.hasImage(1)).toBe(true);
    storage.removeImage(1);
    expect(storage.hasImage(1)).toBe(false);
  });

  test("evicts LRU images when limit reached", () => {
    // Store 10 images (at limit)
    for (let i = 1; i <= 10; i++) {
      storage.storeImage(i, 100, 1, 1, new Uint8Array([i]));
    }

    // All 10 should exist
    expect(storage.getStats().imageCount).toBe(10);

    // Store 11th image - should evict oldest
    storage.storeImage(11, 100, 1, 1, new Uint8Array([11]));

    expect(storage.getStats().imageCount).toBe(10);
    expect(storage.hasImage(1)).toBe(false); // First one evicted
    expect(storage.hasImage(11)).toBe(true);
  });

  test("manages placements", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const image = storage.storeImage(1, 100, 10, 10, data);

    const placement: ImagePlacement = {
      id: "1:1",
      imageId: 1,
      placementId: 1,
      bufferRow: 5,
      bufferCol: 10,
      offsetX: 0,
      offsetY: 0,
      displayWidth: 2,
      displayHeight: 2,
      srcX: 0,
      srcY: 0,
      srcWidth: 10,
      srcHeight: 10,
      zIndex: 0,
      image,
    };

    storage.setPlacement(placement);

    const retrieved = storage.getPlacement("1:1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.bufferRow).toBe(5);
  });

  test("gets placements in row range", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const image = storage.storeImage(1, 100, 10, 10, data);

    // Create placements at different rows
    for (let row = 0; row < 10; row++) {
      storage.setPlacement({
        id: `1:${row}`,
        imageId: 1,
        placementId: row,
        bufferRow: row,
        bufferCol: 0,
        offsetX: 0,
        offsetY: 0,
        displayWidth: 1,
        displayHeight: 1,
        srcX: 0,
        srcY: 0,
        srcWidth: 10,
        srcHeight: 10,
        zIndex: 0,
        image,
      });
    }

    const visible = storage.getPlacementsInRange(3, 6);
    expect(visible).toHaveLength(4); // Rows 3, 4, 5, 6
  });

  test("handles chunk buffers", () => {
    const buffer = storage.addChunk(1, "chunk1", 100, 10, 10, true);
    expect(buffer.chunks).toHaveLength(1);

    storage.addChunk(1, "chunk2", 100, undefined, undefined, true);
    expect(storage.hasChunkBuffer(1)).toBe(true);

    const completed = storage.getAndClearChunks(1);
    expect(completed?.chunks).toHaveLength(2);
    expect(storage.hasChunkBuffer(1)).toBe(false);
  });

  test("deleteAll clears everything", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const image = storage.storeImage(1, 100, 10, 10, data);
    storage.setPlacement({
      id: "1:1",
      imageId: 1,
      placementId: 1,
      bufferRow: 0,
      bufferCol: 0,
      offsetX: 0,
      offsetY: 0,
      displayWidth: 1,
      displayHeight: 1,
      srcX: 0,
      srcY: 0,
      srcWidth: 10,
      srcHeight: 10,
      zIndex: 0,
      image,
    });

    storage.deleteAll();

    const stats = storage.getStats();
    expect(stats.imageCount).toBe(0);
    expect(stats.placementCount).toBe(0);
  });

  test("deleteAtCursor removes specific placement", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const image = storage.storeImage(1, 100, 10, 10, data);

    storage.setPlacement({
      id: "1:1",
      imageId: 1,
      placementId: 1,
      bufferRow: 5,
      bufferCol: 10,
      offsetX: 0,
      offsetY: 0,
      displayWidth: 1,
      displayHeight: 1,
      srcX: 0,
      srcY: 0,
      srcWidth: 10,
      srcHeight: 10,
      zIndex: 0,
      image,
    });

    storage.deleteAtCursor(5, 10);
    expect(storage.getPlacement("1:1")).toBeUndefined();
  });

  test("getStats returns correct values", () => {
    const data = new Uint8Array(100);
    storage.storeImage(1, 100, 10, 10, data);
    storage.addChunk(2, "test", 100, 5, 5, true);

    const stats = storage.getStats();
    expect(stats.imageCount).toBe(1);
    expect(stats.memoryUsage).toBeGreaterThan(0);
    expect(stats.chunkBuffers).toBe(1);
  });
});

describe("GraphicsManager Integration", () => {
  // These tests require browser APIs (ImageData, createImageBitmap)
  // They will work in browser but skip in Node/Bun test environment
  const hasBrowserAPIs =
    typeof globalThis.ImageData !== "undefined" &&
    typeof globalThis.createImageBitmap !== "undefined";

  test("extracts and cleans graphics sequences", async () => {
    const { GraphicsManager } = await import("./graphics/graphics-manager");

    const manager = new GraphicsManager({ enabled: true, debug: false });
    manager.setCursorCallback(() => ({ row: 0, col: 0 }));

    // Create a minimal RGBA payload
    const redPixels = new Uint8Array([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    ]);
    const base64Payload = btoa(String.fromCharCode(...redPixels));
    const kittySequence = `\x1b_Ga=T,f=32,s=2,v=2,c=1,r=1;${base64Payload}\x1b\\`;

    // Process the graphics data
    const cleanedData = await manager.processData(kittySequence);

    // Cleaned data should be empty (graphics removed)
    expect(cleanedData).toBe("");

    manager.dispose();
  });

  test("preserves text around graphics sequences", async () => {
    const { GraphicsManager } = await import("./graphics/graphics-manager");

    const manager = new GraphicsManager({ enabled: true });
    manager.setCursorCallback(() => ({ row: 0, col: 0 }));

    // Mix of text and graphics (small payload that will fail to decode in test env but sequence is still removed)
    const mixedData = "Hello \x1b_Ga=T,f=32,s=1,v=1;/w==\x1b\\ World!";
    const cleanedData = await manager.processData(mixedData);

    // Should preserve text, remove graphics sequence
    expect(cleanedData).toBe("Hello  World!");

    manager.dispose();
  });

  test.skipIf(!hasBrowserAPIs)(
    "decodes and stores images (browser only)",
    async () => {
      const { GraphicsManager } = await import("./graphics/graphics-manager");

      const manager = new GraphicsManager({ enabled: true, debug: false });
      manager.setCursorCallback(() => ({ row: 0, col: 0 }));

      const redPixels = new Uint8Array([
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
      ]);
      const base64Payload = btoa(String.fromCharCode(...redPixels));
      const kittySequence = `\x1b_Ga=T,f=32,s=2,v=2,c=1,r=1;${base64Payload}\x1b\\`;

      await manager.processData(kittySequence);

      const stats = manager.getStats();
      expect(stats.imageCount).toBe(1);
      expect(stats.placementCount).toBe(1);

      manager.dispose();
    }
  );

  test.skipIf(!hasBrowserAPIs)(
    "handles chunked transfer (browser only)",
    async () => {
      const { GraphicsManager } = await import("./graphics/graphics-manager");

      const manager = new GraphicsManager({ enabled: true });
      manager.setCursorCallback(() => ({ row: 5, col: 10 }));

      const chunk1 = "\x1b_Ga=T,i=42,f=32,s=2,v=2,c=1,r=1,m=1;AAAA\x1b\\";
      const redPixels = new Uint8Array([
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
      ]);
      const base64Payload = btoa(String.fromCharCode(...redPixels));
      const chunk2 = `\x1b_Gm=0;${base64Payload}\x1b\\`;

      await manager.processData(chunk1);
      expect(manager.getStats().imageCount).toBe(0);

      await manager.processData(chunk2);

      const stats = manager.getStats();
      expect(stats.imageCount).toBe(1);
      expect(stats.placementCount).toBe(1);

      manager.dispose();
    }
  );
});

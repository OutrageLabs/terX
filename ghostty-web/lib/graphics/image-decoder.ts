/**
 * Image Decoder for Kitty Graphics Protocol
 *
 * Handles decoding of image data from various formats:
 * - PNG (format 100)
 * - RGB raw pixels (format 24)
 * - RGBA raw pixels (format 32)
 *
 * Outputs ImageBitmap for efficient GPU-accelerated rendering.
 */

import type { KittyCompression, KittyFormat } from "./types";

// Base64 character lookup table
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;
}

/**
 * Decode base64 string to Uint8Array
 * Custom implementation that's more robust than atob()
 */
function base64ToBytes(base64: string): Uint8Array {
  // Handle URL-safe base64 variants and remove any whitespace/invalid chars
  let len = base64.length;

  // Count valid base64 characters and padding
  let validLen = 0;
  let padding = 0;
  for (let i = 0; i < len; i++) {
    const c = base64.charCodeAt(i);
    if (
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      (c >= 48 && c <= 57) || // 0-9
      c === 43 || // +
      c === 47 || // /
      c === 45 || // - (URL-safe)
      c === 95 // _ (URL-safe)
    ) {
      validLen++;
    } else if (c === 61) {
      // =
      padding++;
    }
    // Skip whitespace and other chars
  }

  // Calculate output size
  const outputLen = Math.floor(((validLen + padding) * 3) / 4) - padding;
  const output = new Uint8Array(outputLen);

  let outIdx = 0;
  let bits = 0;
  let collected = 0;

  for (let i = 0; i < len && outIdx < outputLen; i++) {
    let c = base64.charCodeAt(i);

    // Convert URL-safe to standard
    if (c === 45) c = 43; // - -> +
    if (c === 95) c = 47; // _ -> /

    // Skip non-base64 chars
    if (
      !((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47)
    ) {
      continue;
    }

    bits = (bits << 6) | BASE64_LOOKUP[c];
    collected += 6;

    if (collected >= 8) {
      collected -= 8;
      output[outIdx++] = (bits >> collected) & 0xff;
    }
  }

  return output;
}

/**
 * Encode bytes to base64 string
 */
function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    result += BASE64_CHARS[b1 >> 2];
    result += BASE64_CHARS[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += i + 1 < len ? BASE64_CHARS[((b2 & 0x0f) << 2) | (b3 >> 6)] : "=";
    result += i + 2 < len ? BASE64_CHARS[b3 & 0x3f] : "=";
  }

  return result;
}

/**
 * Decompress zlib-compressed data
 * Uses the browser's DecompressionStream API
 */
async function decompressZlib(data: Uint8Array): Promise<Uint8Array> {
  // DecompressionStream is available in modern browsers
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream not available - zlib not supported");
  }

  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  // Write compressed data (copy to new ArrayBuffer for type safety)
  const dataCopy = new Uint8Array(data.length);
  dataCopy.set(data);
  writer.write(dataCopy as unknown as BufferSource);
  writer.close();

  // Read decompressed chunks
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  // Combine chunks
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Convert RGB data to RGBA (adding alpha channel)
 */
function rgbToRgba(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const pixelCount = width * height;
  const rgba = new Uint8Array(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    rgba[i * 4] = rgb[i * 3]; // R
    rgba[i * 4 + 1] = rgb[i * 3 + 1]; // G
    rgba[i * 4 + 2] = rgb[i * 3 + 2]; // B
    rgba[i * 4 + 3] = 255; // A (fully opaque)
  }

  return rgba;
}

/**
 * Create ImageBitmap from raw RGBA pixel data
 */
async function rawRgbaToImageBitmap(
  rgba: Uint8Array,
  width: number,
  height: number
): Promise<ImageBitmap> {
  const expectedLen = width * height * 4;

  // Keep declared dimensions - pad or truncate data as needed

  // Create buffer with proper size (padded with zeros if data is short)
  const rgbaCopy = new Uint8ClampedArray(expectedLen);
  // Copy available data (truncates if too long, pads with zeros if too short)
  rgbaCopy.set(rgba.subarray(0, Math.min(rgba.length, expectedLen)));

  // Create ImageData from raw RGBA bytes
  const imageData = new ImageData(rgbaCopy, width, height);

  // Convert to ImageBitmap for efficient rendering
  return createImageBitmap(imageData);
}

/**
 * Create ImageBitmap from PNG data
 */
async function pngToImageBitmap(pngData: Uint8Array): Promise<ImageBitmap> {
  // Copy to ensure we have a proper ArrayBuffer
  const pngCopy = new Uint8Array(pngData.length);
  pngCopy.set(pngData);

  // Create a Blob from the PNG data
  const blob = new Blob([pngCopy], { type: "image/png" });

  // Use createImageBitmap for efficient decoding
  return createImageBitmap(blob);
}

/**
 * Decode result containing both raw bytes and bitmap
 */
export interface DecodeResult {
  /** Decoded ImageBitmap for rendering */
  bitmap: ImageBitmap;
  /** Original/processed byte data */
  data: Uint8Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Byte size for memory tracking */
  byteSize: number;
}

/**
 * ImageDecoder - Decodes Kitty graphics image data to ImageBitmap
 */
export class ImageDecoder {
  private debug: boolean;

  constructor(debug = false) {
    this.debug = debug;
  }

  /**
   * Decode image data from a Kitty graphics payload
   *
   * @param payload - Base64-encoded image data
   * @param format - Image format (24=RGB, 32=RGBA, 100=PNG)
   * @param width - Image width in pixels (required for RGB/RGBA)
   * @param height - Image height in pixels (required for RGB/RGBA)
   * @param compression - Optional compression type ('z' for zlib)
   * @returns Decoded image result
   */
  async decode(
    payload: string,
    format: KittyFormat,
    width?: number,
    height?: number,
    compression?: KittyCompression
  ): Promise<DecodeResult> {
    if (this.debug) {
      console.log("[ImageDecoder] Decoding:", {
        format,
        width,
        height,
        compression,
        payloadLength: payload.length,
      });
    }

    // Decode base64 to bytes (custom decoder skips invalid chars)
    let bytes = base64ToBytes(payload);

    // Decompress if needed
    if (compression === "z") {
      bytes = await decompressZlib(bytes);
      if (this.debug) {
        console.log("[ImageDecoder] Decompressed to", bytes.length, "bytes");
      }
    }

    // Handle different formats
    let bitmap: ImageBitmap;
    let finalWidth: number;
    let finalHeight: number;

    if (format === 100) {
      // PNG format
      bitmap = await pngToImageBitmap(bytes);
      finalWidth = bitmap.width;
      finalHeight = bitmap.height;
    } else if (format === 32 || format === 24) {
      // Raw pixel formats
      if (width === undefined || height === undefined) {
        throw new Error("Width and height required for raw pixel formats");
      }

      finalWidth = width;
      finalHeight = height;

      let rgba: Uint8Array;
      if (format === 24) {
        // RGB -> RGBA
        rgba = rgbToRgba(bytes, width, height);
      } else {
        // Already RGBA
        rgba = bytes;
      }

      bitmap = await rawRgbaToImageBitmap(rgba, width, height);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    if (this.debug) {
      console.log("[ImageDecoder] Decoded:", {
        width: finalWidth,
        height: finalHeight,
        bitmapSize: `${bitmap.width}x${bitmap.height}`,
      });
    }

    return {
      bitmap,
      data: bytes,
      width: finalWidth,
      height: finalHeight,
      byteSize: bytes.length,
    };
  }

  /**
   * Combine multiple base64 chunks by decoding each and concatenating bytes
   * Returns raw bytes (not base64)
   */
  static combineChunksToBytes(chunks: string[]): Uint8Array {
    if (chunks.length === 0) return new Uint8Array(0);
    if (chunks.length === 1) return base64ToBytes(chunks[0]);

    // First pass: decode all chunks and calculate total size
    const decoded: Uint8Array[] = [];
    let totalLen = 0;
    for (const chunk of chunks) {
      if (!chunk) continue;
      const bytes = base64ToBytes(chunk);
      decoded.push(bytes);
      totalLen += bytes.length;
    }

    // Second pass: copy into single buffer
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const bytes of decoded) {
      result.set(bytes, offset);
      offset += bytes.length;
    }
    return result;
  }

  /**
   * Decode image from raw bytes (already decoded from base64)
   */
  async decodeFromBytes(
    bytes: Uint8Array,
    format: KittyFormat,
    width?: number,
    height?: number,
    compression?: KittyCompression
  ): Promise<DecodeResult> {
    if (this.debug) {
      console.log("[ImageDecoder] Decoding from bytes:", {
        format,
        width,
        height,
        compression,
        bytesLength: bytes.length,
      });
    }

    // Decompress if needed
    if (compression === "z") {
      bytes = await decompressZlib(bytes);
      if (this.debug) {
        console.log("[ImageDecoder] Decompressed to", bytes.length, "bytes");
      }
    }

    // Handle different formats
    let bitmap: ImageBitmap;
    let finalWidth: number;
    let finalHeight: number;

    if (format === 100) {
      // PNG format
      bitmap = await pngToImageBitmap(bytes);
      finalWidth = bitmap.width;
      finalHeight = bitmap.height;
    } else if (format === 32 || format === 24) {
      // Raw pixel formats
      if (width === undefined || height === undefined) {
        throw new Error("Width and height required for raw pixel formats");
      }

      finalWidth = width;
      finalHeight = height;

      let rgba: Uint8Array;
      if (format === 24) {
        // RGB -> RGBA
        rgba = rgbToRgba(bytes, width, height);
      } else {
        // Already RGBA
        rgba = bytes;
      }

      bitmap = await rawRgbaToImageBitmap(rgba, finalWidth, finalHeight);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    return {
      bitmap,
      width: finalWidth,
      height: finalHeight,
      data: bytes,
      byteSize: bytes.length,
    };
  }

  /**
   * Estimate the memory size of an image
   * (Used for cache management before decoding)
   */
  static estimateSize(
    payload: string,
    format: KittyFormat,
    width?: number,
    height?: number
  ): number {
    // Base64 overhead is ~33%
    const rawSize = Math.ceil((payload.length * 3) / 4);

    if (format === 100) {
      // PNG: compressed, but decompressed RGBA will be larger
      // Estimate based on typical compression ratios (2-10x)
      return rawSize * 4;
    } else if (format === 32) {
      // RGBA: 4 bytes per pixel
      return width && height ? width * height * 4 : rawSize;
    } else if (format === 24) {
      // RGB: 3 bytes per pixel, but we convert to RGBA
      return width && height ? width * height * 4 : rawSize * (4 / 3);
    }

    return rawSize;
  }
}

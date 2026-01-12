/**
 * Kitty Graphics Protocol Parser
 *
 * Parses Kitty graphics escape sequences from terminal output.
 * Format: ESC _ G <control-data> ; <payload> ESC \
 *
 * Control data consists of key=value pairs separated by commas.
 * Payload is base64-encoded image data (optional for some commands).
 */

import type {
  KittyAction,
  KittyCommand,
  KittyCompression,
  KittyDeleteTarget,
  KittyFormat,
  KittyParseResult,
  KittyTransmission,
} from "./types";

// Escape sequence markers
const ESC = "\x1b";
const APC_START = ESC + "_G"; // Application Program Command for Kitty graphics
const ST = ESC + "\\"; // String Terminator

// tmux DCS passthrough markers
const TMUX_PASSTHROUGH_START = ESC + "Ptmux;" + ESC;
const TMUX_PASSTHROUGH_END = ESC + "\\";

/**
 * Unwrap tmux DCS passthrough sequences.
 *
 * When running in tmux, graphics commands are wrapped in DCS passthrough:
 *   \x1bPtmux;\x1b<inner content>\x1b\\
 *
 * The inner content has all ESC characters doubled (\x1b becomes \x1b\x1b).
 * This function extracts the inner content and unescapes doubled escapes.
 */
function unwrapTmuxPassthrough(data: string): string {
  let result = "";
  let pos = 0;

  while (pos < data.length) {
    // Look for tmux passthrough start
    const startIdx = data.indexOf(TMUX_PASSTHROUGH_START, pos);

    if (startIdx === -1) {
      // No more passthrough, append rest
      result += data.substring(pos);
      break;
    }

    // Append text before passthrough
    result += data.substring(pos, startIdx);

    // Find passthrough end (ST = ESC \)
    // Note: We need to find the OUTER ST, not doubled ones inside
    const innerStart = startIdx + TMUX_PASSTHROUGH_START.length;
    let endIdx = -1;

    // Look for ESC\ that is NOT preceded by another ESC (i.e., not doubled)
    for (let i = innerStart; i < data.length - 1; i++) {
      if (data[i] === ESC && data[i + 1] === "\\") {
        // Check if this ESC is doubled (preceded by ESC)
        if (i > 0 && data[i - 1] === ESC) {
          // This is a doubled ESC, skip it
          continue;
        }
        endIdx = i;
        break;
      }
    }

    if (endIdx === -1) {
      // Incomplete passthrough, keep as-is
      result += data.substring(startIdx);
      break;
    }

    // Extract inner content and unescape doubled ESCs
    const inner = data.substring(innerStart, endIdx);
    const unescaped = inner.replace(/\x1b\x1b/g, ESC);
    result += unescaped;

    pos = endIdx + 2; // Skip past ESC\
  }

  return result;
}

/**
 * Parse a Kitty graphics control data string into key-value pairs
 */
function parseControlData(controlStr: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!controlStr) return params;

  // Split by comma, handling potential edge cases
  const pairs = controlStr.split(",");
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex > 0) {
      const key = pair.substring(0, eqIndex);
      const value = pair.substring(eqIndex + 1);
      params.set(key, value);
    }
  }
  return params;
}

/**
 * Convert parsed parameters to a KittyCommand object
 */
function paramsToCommand(
  params: Map<string, string>,
  payload: string,
  debug = false
): KittyCommand {
  // Always log raw params to debug tmux issues
  const paramsObj: Record<string, string> = {};
  params.forEach((v, k) => paramsObj[k] = v);
  console.log("[KittyParser] Raw params:", paramsObj, "payload length:", payload.length);

  const getNum = (key: string): number | undefined => {
    const v = params.get(key);
    return v !== undefined ? Number.parseInt(v, 10) : undefined;
  };

  const action = (params.get("a") as KittyAction) || "T"; // Default to transmit+display

  const command: KittyCommand = {
    action,
    payload: payload || undefined,
  };

  // Image identification
  const imageId = getNum("i");
  if (imageId !== undefined) command.imageId = imageId;

  const imageNumber = getNum("I");
  if (imageNumber !== undefined) command.imageNumber = imageNumber;

  const placementId = getNum("p");
  if (placementId !== undefined) command.placementId = placementId;

  // Format and transmission
  const format = getNum("f") as KittyFormat | undefined;
  if (format !== undefined) command.format = format;

  const transmission = params.get("t") as KittyTransmission | undefined;
  if (transmission) command.transmission = transmission;

  const compression = params.get("o") as KittyCompression | undefined;
  if (compression) command.compression = compression;

  const more = params.get("m");
  if (more !== undefined) command.more = more === "1";

  // Image dimensions (source)
  const width = getNum("s");
  if (width !== undefined) command.width = width;

  const height = getNum("v");
  if (height !== undefined) command.height = height;

  // Display dimensions (in cells)
  const displayWidth = getNum("c");
  if (displayWidth !== undefined) command.displayWidth = displayWidth;

  const displayHeight = getNum("r");
  if (displayHeight !== undefined) command.displayHeight = displayHeight;

  // Position
  const cellX = getNum("X");
  if (cellX !== undefined) command.cellX = cellX;

  const cellY = getNum("Y");
  if (cellY !== undefined) command.cellY = cellY;

  const offsetX = getNum("x");
  if (offsetX !== undefined) command.offsetX = offsetX;

  const offsetY = getNum("y");
  if (offsetY !== undefined) command.offsetY = offsetY;

  // Z-index
  const zIndex = getNum("z");
  if (zIndex !== undefined) command.zIndex = zIndex;

  // Cursor movement
  const cursorMovement = getNum("C") as 0 | 1 | undefined;
  if (cursorMovement !== undefined) command.cursorMovement = cursorMovement;

  // Quiet mode
  const quiet = getNum("q") as 0 | 1 | 2 | undefined;
  if (quiet !== undefined) command.quiet = quiet;

  // Delete target
  const deleteTarget = params.get("d") as KittyDeleteTarget | undefined;
  if (deleteTarget) command.deleteTarget = deleteTarget;

  return command;
}

/**
 * Result of extracting graphics from terminal data
 */
export interface ExtractResult {
  /** Data with graphics sequences removed (to send to WASM) */
  cleanedData: string;
  /** Parsed graphics commands */
  commands: KittyParseResult[];
  /** Whether any graphics sequences were found */
  hasGraphics: boolean;
  /** Full data used for parsing (pendingData + new data) - use for offset calculations */
  fullData: string;
}

/**
 * KittyParser - Parses and extracts Kitty graphics sequences from terminal data
 */
export class KittyParser {
  private debug: boolean;
  /** Buffer for incomplete sequences spanning multiple chunks */
  private pendingData: string = "";

  constructor(debug = false) {
    this.debug = debug;
  }

  /**
   * Extract all Kitty graphics sequences from terminal data
   *
   * @param data - Raw terminal output data
   * @returns Object containing cleaned data and parsed commands
   */
  extract(data: string): ExtractResult {
    const commands: KittyParseResult[] = [];
    let cleanedData = "";

    // Prepend any pending data from previous incomplete sequence
    let fullData = this.pendingData + data;
    this.pendingData = "";

    // Debug: log incoming data characteristics
    if (this.debug) {
      const hasTmuxPass = fullData.includes(TMUX_PASSTHROUGH_START);
      const hasApc = fullData.includes(APC_START);
      const hasDoubledEsc = fullData.includes("\x1b\x1b");
      console.log("[KittyParser] extract() called:", {
        dataLen: data.length,
        fullDataLen: fullData.length,
        hasTmuxPassthrough: hasTmuxPass,
        hasApcStart: hasApc,
        hasDoubledEsc: hasDoubledEsc,
        first100chars: JSON.stringify(fullData.substring(0, 100)),
      });
    }

    // Unwrap tmux DCS passthrough sequences before parsing.
    // When running in tmux, graphics commands are wrapped in passthrough
    // with doubled escape characters.
    if (fullData.includes(TMUX_PASSTHROUGH_START)) {
      if (this.debug) {
        console.log("[KittyParser] Unwrapping tmux passthrough");
      }
      const beforeLen = fullData.length;
      fullData = unwrapTmuxPassthrough(fullData);
      if (this.debug) {
        console.log("[KittyParser] After unwrap:", {
          beforeLen,
          afterLen: fullData.length,
          hasApcNow: fullData.includes(APC_START),
        });
      }
    }

    let pos = 0;

    while (pos < fullData.length) {
      // Look for APC start sequence
      const startIdx = fullData.indexOf(APC_START, pos);

      if (startIdx === -1) {
        // No more graphics sequences, append rest of data
        cleanedData += fullData.substring(pos);
        break;
      }

      // Append text before the graphics sequence
      cleanedData += fullData.substring(pos, startIdx);

      // Find the end of the sequence (ST = ESC \)
      const endIdx = fullData.indexOf(ST, startIdx);

      if (endIdx === -1) {
        // Incomplete sequence at end of data - buffer for next chunk
        this.pendingData = fullData.substring(startIdx);
        if (this.debug) {
          console.log("[KittyParser] Buffering incomplete sequence, length:", this.pendingData.length);
        }
        break;
      }

      // Extract the content between ESC_G and ESC\
      const content = fullData.substring(startIdx + APC_START.length, endIdx);

      // Parse the command
      const parsed = this.parseSequence(content, startIdx, endIdx + ST.length);
      if (parsed) {
        commands.push(parsed);
      }

      // Move past the end of this sequence
      pos = endIdx + ST.length;
    }

    return {
      cleanedData,
      commands,
      hasGraphics: commands.length > 0,
      fullData,
    };
  }

  /**
   * Parse a single Kitty graphics sequence content
   *
   * @param content - Content between ESC_G and ESC\ (control;payload)
   * @param startIndex - Start position in original data
   * @param endIndex - End position in original data
   */
  private parseSequence(
    content: string,
    startIndex: number,
    endIndex: number
  ): KittyParseResult | null {
    // Split into control data and payload at the semicolon
    const semicolonIdx = content.indexOf(";");

    let controlStr: string;
    let payload: string;

    if (semicolonIdx === -1) {
      // No payload, just control data
      controlStr = content;
      payload = "";
    } else {
      controlStr = content.substring(0, semicolonIdx);
      payload = content.substring(semicolonIdx + 1);
    }

    try {
      const params = parseControlData(controlStr);
      const command = paramsToCommand(params, payload, this.debug);

      if (this.debug) {
        console.log("[KittyParser] Parsed command:", {
          action: command.action,
          imageId: command.imageId,
          format: command.format,
          compression: command.compression,
          more: command.more,
          payloadLength: payload.length,
        });
      }

      return {
        command,
        startIndex,
        endIndex,
      };
    } catch (e) {
      if (this.debug) {
        console.error("[KittyParser] Failed to parse sequence:", e);
      }
      return null;
    }
  }

  /**
   * Check if data might contain Kitty graphics sequences
   * (Quick check before full parsing)
   */
  static hasGraphicsSequence(data: string): boolean {
    // Check for direct Kitty graphics or tmux passthrough containing graphics
    return data.includes(APC_START) || data.includes(TMUX_PASSTHROUGH_START);
  }

  /**
   * Check if there's pending data that needs to be processed
   */
  hasPendingData(): boolean {
    return this.pendingData.length > 0;
  }

  /**
   * Generate a unique image ID based on current time
   */
  static generateImageId(): number {
    // Use lower 32 bits of timestamp + random for uniqueness
    return ((Date.now() & 0xffffff) << 8) | (Math.random() * 256);
  }

  /**
   * Strip echoed graphics responses from terminal data.
   *
   * When graphics responses are sent through the PTY, the terminal driver
   * may strip the APC escape sequences but echo the content. This results
   * in patterns like "Gi=1;OK" appearing in the terminal output.
   *
   * This method detects and removes these echoed responses.
   */
  static stripEchoedResponses(data: string): string {
    // Pattern matches echoed graphics responses in ALL possible forms:
    // PTY may echo the full APC sequence, partial, or just content.
    //
    // Full APC:     \x1b_Gi=4;OK\x1b\\
    // Partial APC:  _Gi=4;OK\x1b\\  (ESC stripped)
    // Content only: Gi=4;OK
    // Bare response: i=4;OK  (G stripped by PTY - happens with SSH)
    //
    // Pattern 1: With G prefix (original Kitty format)
    // Pattern 2: Just i=N;OK (PTY stripped the G prefix)
    // Pattern 3: With cursor positioning (erssi wraps response in cursor move + erase)
    //            Example: \x1b[39;20Hi=2;OK\x1b[K
    const withG = /(?:\x1b_|_)?G(?:i=\d+)?(?:,p=\d+)?;(?:OK|ENOENT:[^\s]*)(?:\x1b\\|\\)?/g;
    const bareResponse = /i=\d+(?:,p=\d+)?;(?:OK|ENOENT:[^\s]*)(?:\x1b\\|\\)?/g;

    // Also strip cursor positioning that frames the response, but KEEP the erase command
    // Pattern: CSI row;colH + response + CSI K (erase to EOL)
    // We replace with just CSI K to preserve line clearing behavior
    const framedResponse = /\x1b\[\d+;\d+H(i=\d+(?:,p=\d+)?;(?:OK|ENOENT:[^\s]*))(\x1b\[K)/g;

    return data
      .replace(withG, "")
      .replace(framedResponse, "$2")  // Keep the \x1b[K erase command
      .replace(bareResponse, "");
  }

  /**
   * Strip Kitty Unicode placeholder characters from terminal data.
   *
   * When tmux passes through Kitty graphics, it uses Unicode placeholders
   * (U+10EEEE + combining marks) to represent image positions. These appear
   * as garbage characters if not rendered by a Kitty-compatible terminal.
   *
   * Since we display images in a popup overlay, these placeholders are not needed.
   *
   * @see https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders
   */
  static stripUnicodePlaceholders(data: string): string {
    // U+10EEEE is the Kitty graphics placeholder base character
    // In UTF-16 it's encoded as surrogate pair: \uDBFB\uDEEE
    // It's followed by combining marks (diacritics) that encode row/column:
    //   - U+0305 = diacritic 0, U+030D = diacritic 1, etc.
    //   - Range U+0300-U+036F covers combining diacritical marks
    //
    // Pattern: base char + any number of combining diacritical marks
    const placeholderPattern = /\uDBFB\uDEEE[\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]*/g;

    return data.replace(placeholderPattern, "");
  }
}

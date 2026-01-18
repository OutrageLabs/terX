/**
 * Debug Logger - sends logs to debug window if open
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

export type DebugLogLevel = 'info' | 'warn' | 'error';

/**
 * Send log message to debug window (only if open)
 */
export async function sendDebugLog(message: string, level: DebugLogLevel = 'info'): Promise<void> {
  try {
    const dw = await WebviewWindow.getByLabel('debug');
    if (dw) {
      dw.emit('debug-log', { message, level });
    }
  } catch {
    // Ignore errors - debug window might not be available
  }
}

/**
 * Log info message
 */
export function debugInfo(message: string): void {
  sendDebugLog(message, 'info');
}

/**
 * Log warning message
 */
export function debugWarn(message: string): void {
  sendDebugLog(message, 'warn');
}

/**
 * Log error message
 */
export function debugError(message: string): void {
  sendDebugLog(message, 'error');
}

/**
 * Format escape sequences for readable display
 * Converts control characters to visible representations
 */
export function formatEscapeSequences(data: string): string {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    const code = char.charCodeAt(0);

    if (code === 0x1b) {
      // ESC character - start of escape sequence
      result += '\\e';
    } else if (code === 0x07) {
      result += '\\a'; // BEL
    } else if (code === 0x08) {
      result += '\\b'; // Backspace
    } else if (code === 0x09) {
      result += '\\t'; // Tab
    } else if (code === 0x0a) {
      result += '\\n'; // LF
    } else if (code === 0x0d) {
      result += '\\r'; // CR
    } else if (code < 0x20) {
      // Other control characters
      result += `\\x${code.toString(16).padStart(2, '0')}`;
    } else if (code >= 0x7f && code < 0xa0) {
      // C1 control characters
      result += `\\x${code.toString(16).padStart(2, '0')}`;
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Log raw SSH data with escape sequences formatted
 */
let escapeDebugEnabled = false;

export function setEscapeDebugEnabled(enabled: boolean): void {
  escapeDebugEnabled = enabled;
}

export function isEscapeDebugEnabled(): boolean {
  return escapeDebugEnabled;
}

export function debugEscapeSequences(data: string): void {
  if (!escapeDebugEnabled) return;

  // Only log if data contains escape sequences
  if (data.includes('\x1b')) {
    const formatted = formatEscapeSequences(data);
    sendDebugLog(`[ESC] ${formatted}`, 'info');
  }
}

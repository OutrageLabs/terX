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

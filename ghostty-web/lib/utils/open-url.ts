/**
 * Cross-platform URL opener
 *
 * Works in:
 * - Tauri (uses @tauri-apps/plugin-opener)
 * - Browser (uses window.open)
 */

// Cached opener function
let openerFn: ((url: string) => Promise<void>) | null = null;

/**
 * Check if running in Tauri environment
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Initialize the opener (called once, lazily)
 */
async function initOpener(): Promise<(url: string) => Promise<void>> {
  if (openerFn) return openerFn;

  if (isTauri()) {
    try {
      // Dynamic import to avoid bundling Tauri in browser builds
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      openerFn = async (url: string) => {
        await openUrl(url);
      };
    } catch (e) {
      console.warn('[open-url] Failed to load Tauri opener, falling back to window.open:', e);
      openerFn = async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      };
    }
  } else {
    // Browser fallback
    openerFn = async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    };
  }

  return openerFn;
}

/**
 * Open a URL in the default browser/application
 */
export async function openUrl(url: string): Promise<void> {
  const opener = await initOpener();
  await opener(url);
}

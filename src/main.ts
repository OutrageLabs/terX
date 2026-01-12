/**
 * terX - Terminal Application (SSH Mode) - Multi-Tab Support
 *
 * Uses ghostty-web Terminal with WebGL renderer + SSH connections
 * Supports multiple simultaneous terminal sessions in tabs
 */

import { init, Terminal, FitAddon, initBeamtermWasm } from '../ghostty-web/lib';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { handleOAuthCallback } from './lib/supabase';

// Session Manager
import {
  sessionManager,
  type TerminalSession,
  type SessionStatus,
} from './lib/session-manager';

// UI Components
import {
  runAuthFlow,
  createSidebar,
  toggleSidebar as uiToggleSidebar,
  showSidebar,
  hideSidebar,
  setConnectedHost,
  refreshSidebar,
  toggleSettings,
  showHostEditDialog,
  initTabBar,
} from './ui';
import * as storage from './lib/storage';
import type { HostWithRelations } from './lib/storage';
import * as themes from './lib/themes';
import type { TerminalFontFamily } from './lib/themes';

// Global type declarations
declare global {
  interface Window {
    terxDebug?: any;
  }
}

// =============================================================================
// Welcome Screen (ASCII Art)
// =============================================================================

const TERX_ASCII_LINES = [
  '',
  '\x1b[38;5;75m   ████████╗███████╗██████╗ ██╗  ██╗',
  '   ╚══██╔══╝██╔════╝██╔══██╗╚██╗██╔╝',
  '      ██║   █████╗  ██████╔╝ ╚███╔╝ ',
  '      ██║   ██╔══╝  ██╔══██╗ ██╔██╗ ',
  '      ██║   ███████╗██║  ██║██╔╝ ██╗',
  '      ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝\x1b[0m',
  '',
  '\x1b[38;5;244m            Cross-Platform SSH Client\x1b[0m',
  '',
];

// =============================================================================
// Main Application
// =============================================================================

async function main(): Promise<void> {
  const statusDot = document.getElementById('status-dot')!;
  const statusText = document.getElementById('status-text')!;
  const terminalContainer = document.getElementById('terminal-container')!;
  const rendererTypeEl = document.getElementById('renderer-type')!;
  const fontSizeEl = document.getElementById('font-size')!;

  // Global state
  let isConnecting = false;
  let currentTheme: themes.Theme;
  let terminalFontFamily: string;
  let terminalFontSize: number;
  let selectionRequireShift = true; // Default: Shift+Click for selection

  // ============================================================================
  // Deep Link Handler - OAuth/Email Callback from browser
  // ============================================================================
  const handleDeepLink = async (url: string) => {
    console.log('[terX] Deep link received:', url);

    if (url.startsWith('terx://auth/callback') || url.startsWith('terx://auth/confirmed')) {
      const type = url.startsWith('terx://auth/confirmed') ? 'email confirmation' : 'OAuth';
      console.log(`[terX] ${type} callback detected, processing...`);

      const success = await handleOAuthCallback(url);

      if (success) {
        console.log(`[terX] ${type} login successful, reloading app...`);
        window.location.reload();
      } else {
        console.log('[terX] Email confirmed but no tokens - user should login manually');
      }
    }
  };

  // Listen for deep links via plugin (macOS - direct)
  try {
    await onOpenUrl((urls: string[]) => {
      for (const url of urls) {
        handleDeepLink(url);
      }
    });
    console.log('[terX] Deep link listener registered');
  } catch (e) {
    console.warn('[terX] Deep link plugin not available:', e);
  }

  // Listen for deep links via event (Windows/Linux - single instance)
  listen<string>('deep-link-received', (event) => {
    handleDeepLink(event.payload);
  });

  // ============================================================================
  // Status and UI helpers
  // ============================================================================
  const updateStatus = (text: string, connected: boolean = false) => {
    statusText.textContent = text;
    if (connected) {
      statusDot.classList.remove('bg-overlay-0');
      statusDot.classList.add('bg-green');
      statusText.classList.add('text-green');
    } else {
      statusDot.classList.remove('bg-green');
      statusDot.classList.add('bg-overlay-0');
      statusText.classList.remove('text-green');
    }
  };

  const updateIndicator = (renderer: string, fontSize: number) => {
    rendererTypeEl.textContent = renderer.toUpperCase();
    rendererTypeEl.classList.toggle('webgl', renderer === 'webgl' || renderer === 'harfbuzz' || renderer === 'beamterm');
    fontSizeEl.textContent = `${fontSize}px`;
  };

  const showWelcomeScreen = () => {
    const welcomeEl = document.getElementById('welcome-screen');
    if (welcomeEl) {
      welcomeEl.classList.remove('hidden');
    }
  };

  const hideWelcomeScreen = () => {
    const welcomeEl = document.getElementById('welcome-screen');
    if (welcomeEl) {
      welcomeEl.classList.add('hidden');
    }
  };

  // ============================================================================
  // Auth Flow - storage selection, auth, master password
  // ============================================================================
  try {
    updateStatus('Running auth flow...', false);
    const authResult = await runAuthFlow();

    if (!authResult.success) {
      console.error('[terX] Auth flow failed or cancelled');
      updateStatus('Auth failed', false);
      return;
    }

    console.log('[terX] Auth flow completed:', authResult.mode);
  } catch (error) {
    console.error('[terX] Auth flow error:', error);
    updateStatus('Auth error', false);
    return;
  }

  // ============================================================================
  // Initialize WASM modules and config
  // ============================================================================
  try {
    updateStatus('Initializing terminal...', false);
    console.log('[terX] Initializing ghostty-web...');

    // Initialize ghostty WASM
    await init();
    console.log('[terX] Ghostty WASM loaded');

    // Initialize beamterm WASM for rendering
    await initBeamtermWasm();
    console.log('[terX] Beamterm WASM loaded');

    // Load config for theme and font settings
    const config = storage.getConfig();
    currentTheme = themes.getThemeById(config.theme) || themes.BUNDLED_THEMES[0];
    terminalFontFamily = themes.getTerminalFontFamily(
      (config.terminalFontFamily as TerminalFontFamily) || 'fira-code'
    );
    terminalFontSize = config.terminalFontSize || 15;

    // Apply UI theme and font size immediately
    themes.applyUITheme(currentTheme);
    themes.applyUIFontSize(config.uiFontSize || 14);

    console.log(`[terX] Using theme: ${currentTheme.name}, font: ${config.terminalFontFamily}, size: ${terminalFontSize}px`);

    // Wait for fonts to load
    const fontsToLoad = ['FiraCode Nerd Font Mono', 'Hack Nerd Font Mono', 'Fira Code'];
    console.log('[terX] Waiting for fonts to load...');
    try {
      const fontLoadPromise = Promise.all(
        fontsToLoad.map(font =>
          document.fonts.load(`${terminalFontSize}px "${font}"`).catch(() => null)
        )
      ).then(() => document.fonts.ready);

      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));
      await Promise.race([fontLoadPromise, timeoutPromise]);
      console.log('[terX] Fonts loaded (or timeout)');
    } catch (err) {
      console.warn('[terX] Font loading warning:', err);
    }

  } catch (error) {
    const err = error as Error;
    updateStatus(`Error: ${err.message}`, false);
    console.error('[terX] Init failed:', error);
    return;
  }

  // ============================================================================
  // Create Welcome Screen Element
  // ============================================================================
  const welcomeScreen = document.createElement('div');
  welcomeScreen.id = 'welcome-screen';
  welcomeScreen.innerHTML = `
    <pre style="color: var(--color-blue); font-size: 0.75rem; line-height: 1.2;">${TERX_ASCII_LINES.join('\n').replace(/\x1b\[[^m]*m/g, '')}</pre>
    <p style="margin-top: 1.5rem; color: var(--color-subtext-0);">Press <span style="color: var(--color-green); font-weight: 600;">Ctrl+H</span> or click <span style="color: var(--color-green); font-weight: 600;">≡</span> to open hosts</p>
    <p style="color: var(--color-overlay-1);">Select a host from the sidebar to connect</p>
  `;
  terminalContainer.appendChild(welcomeScreen);

  // ============================================================================
  // Build Terminal Theme Config
  // ============================================================================
  const buildTerminalTheme = (theme: themes.Theme) => ({
    background: theme.terminal.background,
    foreground: theme.terminal.foreground,
    cursor: theme.terminal.cursor,
    cursorAccent: theme.terminal.cursorAccent,
    selectionBackground: theme.terminal.selectionBackground,
    selectionForeground: theme.terminal.selectionForeground,
    black: theme.terminal.black,
    red: theme.terminal.red,
    green: theme.terminal.green,
    yellow: theme.terminal.yellow,
    blue: theme.terminal.blue,
    magenta: theme.terminal.magenta,
    cyan: theme.terminal.cyan,
    white: theme.terminal.white,
    brightBlack: theme.terminal.brightBlack,
    brightRed: theme.terminal.brightRed,
    brightGreen: theme.terminal.brightGreen,
    brightYellow: theme.terminal.brightYellow,
    brightBlue: theme.terminal.brightBlue,
    brightMagenta: theme.terminal.brightMagenta,
    brightCyan: theme.terminal.brightCyan,
    brightWhite: theme.terminal.brightWhite,
  });

  // ============================================================================
  // Create Terminal Session
  // ============================================================================
  async function createTerminalSession(
    host: HostWithRelations,
    sshSessionId: string
  ): Promise<TerminalSession> {
    // Create container for this terminal
    const container = document.createElement('div');
    container.className = 'terminal-pane';
    container.dataset.sessionId = sshSessionId;
    terminalContainer.appendChild(container);

    // Create terminal
    const terminal = new Terminal({
      fontSize: terminalFontSize,
      fontFamily: terminalFontFamily,
      lineHeight: 1.0,
      cursorStyle: 'bar',
      cursorBlink: true,
      theme: buildTerminalTheme(currentTheme),
      scrollback: 10000,
      renderer: 'beamterm',
      graphics: { enabled: true },
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in container
    terminal.open(container);
    fitAddon.fit();
    fitAddon.observeResize();

    // Apply current selection mode setting
    terminal.setSelectionRequireShift(selectionRequireShift);

    // Setup SSH data listener
    const unlistenData = await listen<number[]>(`ssh-data-${sshSessionId}`, (event) => {
      const bytes = new Uint8Array(event.payload);
      const decoder = new TextDecoder();
      terminal.write(decoder.decode(bytes));
    });

    // Setup SSH close listener - auto-close tab after connection ends
    const unlistenClosed = await listen(`ssh-closed-${sshSessionId}`, async () => {
      console.log(`[terX] SSH session ${sshSessionId} closed`);

      // Show brief message, then auto-close the tab
      terminal.write('\r\n\x1b[33mConnection closed.\x1b[0m\r\n');

      // Auto-close tab after short delay (let user see the message)
      setTimeout(() => {
        // Check if session still exists (user might have closed it manually)
        if (sessionManager.getSession(sshSessionId)) {
          closeSession(sshSessionId);
        }
      }, 500);
    });

    // Handle terminal input -> SSH
    terminal.onData(async (data: string) => {
      try {
        const encoder = new TextEncoder();
        const bytes = Array.from(encoder.encode(data));
        await invoke('ssh_write', { sessionId: sshSessionId, data: bytes });
      } catch (error) {
        console.error('[terX] SSH write error:', error);
      }
    });

    // Handle terminal resize -> SSH
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    terminal.onResize(({ cols, rows }) => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Only send resize if this is the active session
        if (sessionManager.activeSessionId === sshSessionId) {
          invoke('ssh_resize', { sessionId: sshSessionId, cols, rows }).catch((err) => {
            console.error('[terX] SSH resize error:', err);
          });
        }
      }, 50);
    });

    const session: TerminalSession = {
      id: sshSessionId,
      hostId: host.id,
      hostName: host.name,
      hostInfo: host,
      terminal,
      fitAddon,
      container,
      unlistenData,
      unlistenClosed,
      status: 'connected',
      createdAt: new Date(),
    };

    return session;
  }

  // ============================================================================
  // Connect to Host (Multi-Session)
  // ============================================================================
  async function connectToHost(host: HostWithRelations): Promise<void> {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
      console.log('[terX] Connection already in progress, ignoring click');
      return;
    }

    // Check if already connected to this host
    const existingSession = sessionManager.getSessionByHostId(host.id);
    if (existingSession) {
      console.log('[terX] Already connected to this host, switching tab');
      sessionManager.switchSession(existingSession.id);
      hideSidebar();
      updateStatus(`Connected to ${host.name}`, true);
      return;
    }

    isConnecting = true;
    hideSidebar();
    hideWelcomeScreen();

    updateStatus(`Connecting to ${host.name}...`, false);

    try {
      // Get password or key for connection
      let password: string | undefined;
      let keyPath: string | undefined;

      if (host.auth_type === 'password' && host.password_id) {
        const passwords = await storage.getPasswords();
        const pwd = passwords.find(p => p.id === host.password_id);
        password = pwd?.password;
      } else if (host.auth_type === 'key' && host.key_id) {
        // TODO: SSH key auth
      }

      // Get terminal size from a temporary measurement
      const tempTerminal = new Terminal({
        fontSize: terminalFontSize,
        fontFamily: terminalFontFamily,
      });
      const tempContainer = document.createElement('div');
      tempContainer.style.cssText = 'position:absolute;visibility:hidden;';
      terminalContainer.appendChild(tempContainer);
      tempTerminal.open(tempContainer);
      const tempFitAddon = new FitAddon();
      tempTerminal.loadAddon(tempFitAddon);
      tempFitAddon.fit();
      const { cols, rows } = { cols: tempTerminal.cols, rows: tempTerminal.rows };
      tempTerminal.dispose();
      tempContainer.remove();

      // Establish SSH connection
      const sshSessionId = await invoke<string>('ssh_connect', {
        host: host.ip,
        port: parseInt(host.port) || 22,
        username: host.login,
        password,
        keyPath,
        terminalType: 'xterm-ghostty',
        cols,
        rows,
      });

      console.log(`[terX] SSH connected to ${host.name}, session: ${sshSessionId}`);

      // Create terminal session
      const session = await createTerminalSession(host, sshSessionId);

      // Add to session manager
      sessionManager.addSession(session);

      // Make this session active
      sessionManager.switchSession(sshSessionId);

      // Update UI
      setConnectedHost(host.id);
      updateStatus(`Connected to ${host.name}`, true);

    } catch (error) {
      const err = error as Error;
      updateStatus(`SSH Error`, false);
      console.error('[terX] SSH connection failed:', error);

      // Show error in a temporary terminal or alert
      // For now just log it
      if (sessionManager.sessionCount === 0) {
        showWelcomeScreen();
      }
    } finally {
      isConnecting = false;
    }
  }

  // ============================================================================
  // Close Tab / Session
  // ============================================================================
  async function closeSession(sessionId: string): Promise<void> {
    const session = sessionManager.getSession(sessionId);
    if (!session) return;

    // Disconnect SSH
    try {
      await invoke('ssh_disconnect', { sessionId });
    } catch (e) {
      console.warn('[terX] Disconnect warning:', e);
    }

    // Remove from session manager (handles cleanup)
    sessionManager.removeSession(sessionId);

    // Update UI
    if (sessionManager.sessionCount === 0) {
      setConnectedHost(null);
      updateStatus('Ready - Press Ctrl+H', false);
      showWelcomeScreen();
    } else {
      const activeSession = sessionManager.getActiveSession();
      if (activeSession) {
        setConnectedHost(activeSession.hostId);
        updateStatus(`Connected to ${activeSession.hostName}`, true);
      }
    }
  }

  // ============================================================================
  // Tab Bar Setup
  // ============================================================================
  initTabBar({
    onTabClick: (sessionId) => {
      sessionManager.switchSession(sessionId);
      const session = sessionManager.getSession(sessionId);
      if (session) {
        if (session.status === 'connected') {
          updateStatus(`Connected to ${session.hostName}`, true);
        } else {
          updateStatus(`Disconnected from ${session.hostName}`, false);
        }
        setConnectedHost(session.hostId);
      }
    },
    onTabClose: (sessionId) => {
      closeSession(sessionId);
    },
  });

  // Listen for session events to update status
  sessionManager.onSessionEvent((event, data) => {
    if (event === 'all-sessions-closed') {
      showWelcomeScreen();
      setConnectedHost(null);
      updateStatus('Ready - Press Ctrl+H', false);
    }
  });

  // ============================================================================
  // Sidebar Setup
  // ============================================================================
  createSidebar({
    onHostSelect: connectToHost,
    onSettingsClick: async () => {
      await toggleSettings();
    },
    onAddHost: async () => {
      const passwords = await storage.getPasswords();
      const keys = await storage.getKeys();
      const tags = await storage.getTags();
      const result = await showHostEditDialog(undefined, passwords, keys, tags);
      if (result.saved) {
        refreshSidebar();
      }
    },
  });

  // Sidebar toggle button
  const sidebarToggleBtn = document.getElementById('sidebar-toggle');
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', uiToggleSidebar);
  }

  // Settings toggle button
  const settingsToggleBtn = document.getElementById('settings-toggle');
  if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener('click', () => toggleSettings());
  }

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================
  window.addEventListener('keydown', (e) => {
    // Ctrl+H to toggle sidebar
    if (e.ctrlKey && e.key === 'h') {
      e.preventDefault();
      uiToggleSidebar();
    }
    // Ctrl+, to toggle settings
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      toggleSettings();
    }
    // Ctrl+Tab to switch to next tab
    if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const nextId = sessionManager.getNextSessionId();
      if (nextId) {
        sessionManager.switchSession(nextId);
        const session = sessionManager.getSession(nextId);
        if (session) {
          updateStatus(`Connected to ${session.hostName}`, session.status === 'connected');
          setConnectedHost(session.hostId);
        }
      }
    }
    // Ctrl+Shift+Tab to switch to previous tab
    if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const prevId = sessionManager.getPreviousSessionId();
      if (prevId) {
        sessionManager.switchSession(prevId);
        const session = sessionManager.getSession(prevId);
        if (session) {
          updateStatus(`Connected to ${session.hostName}`, session.status === 'connected');
          setConnectedHost(session.hostId);
        }
      }
    }
    // Ctrl+W to close current tab
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      const activeId = sessionManager.activeSessionId;
      if (activeId) {
        closeSession(activeId);
      }
    }
  });

  // ============================================================================
  // Theme & Font Change Listeners
  // ============================================================================

  // Theme change event - apply to ALL terminals
  window.addEventListener('terx-theme-change', ((e: CustomEvent) => {
    const theme = e.detail as themes.Theme;
    currentTheme = theme;

    // Apply to all terminals
    for (const session of sessionManager.getAllSessions()) {
      themes.applyTerminalTheme(session.terminal, theme);
    }

    console.log(`[terX] Theme changed to: ${theme.name}`);

    // Update theme switcher display
    const themeNameEl = document.getElementById('theme-name');
    if (themeNameEl) {
      themeNameEl.textContent = theme.name;
    }
  }) as EventListener);

  // Terminal font family change - apply to ALL terminals
  window.addEventListener('terx-terminal-font-change', ((e: CustomEvent) => {
    const { family } = e.detail as { family: TerminalFontFamily };
    terminalFontFamily = themes.getTerminalFontFamily(family);

    for (const session of sessionManager.getAllSessions()) {
      session.terminal.options.fontFamily = terminalFontFamily;
      session.fitAddon.fit();
    }

    console.log(`[terX] Terminal font changed to: ${family}`);
  }) as EventListener);

  // Terminal font size change - apply to ALL terminals
  window.addEventListener('terx-terminal-font-size-change', ((e: CustomEvent) => {
    const size = e.detail as number;
    terminalFontSize = size;

    for (const session of sessionManager.getAllSessions()) {
      session.terminal.options.fontSize = size;
      session.fitAddon.fit();
    }

    updateIndicator('beamterm', size);
    console.log(`[terX] Terminal font size changed to: ${size}px`);
  }) as EventListener);

  // ============================================================================
  // Theme Switcher in Statusbar
  // ============================================================================
  const allThemes = themes.getAllThemes();
  const themeNameEl = document.getElementById('theme-name');
  const themePrevBtn = document.getElementById('theme-prev');
  const themeNextBtn = document.getElementById('theme-next');

  if (themeNameEl) {
    themeNameEl.textContent = currentTheme.name;
  }

  const switchTheme = async (direction: 'prev' | 'next') => {
    const currentConfig = storage.getConfig();
    const currentIndex = allThemes.findIndex(t => t.id === currentConfig.theme);
    let newIndex: number;

    if (direction === 'next') {
      newIndex = (currentIndex + 1) % allThemes.length;
    } else {
      newIndex = currentIndex <= 0 ? allThemes.length - 1 : currentIndex - 1;
    }

    const newTheme = allThemes[newIndex];
    await storage.saveConfig({ theme: newTheme.id });

    themes.applyUITheme(newTheme);
    window.dispatchEvent(new CustomEvent('terx-theme-change', { detail: newTheme }));
  };

  themePrevBtn?.addEventListener('click', () => switchTheme('prev'));
  themeNextBtn?.addEventListener('click', () => switchTheme('next'));

  // ============================================================================
  // Font Resize with Cmd+/Cmd-
  // ============================================================================
  const MIN_FONT_SIZE = 8;
  const MAX_FONT_SIZE = 32;
  const FONT_STEP = 1;

  window.addEventListener('keydown', (e) => {
    const activeSession = sessionManager.getActiveSession();
    if (!activeSession) return;

    if (e.metaKey || e.ctrlKey) {
      let newSize: number | null = null;

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        e.stopPropagation();
        newSize = Math.min(terminalFontSize + FONT_STEP, MAX_FONT_SIZE);
      } else if (e.key === '-') {
        e.preventDefault();
        e.stopPropagation();
        newSize = Math.max(terminalFontSize - FONT_STEP, MIN_FONT_SIZE);
      } else if (e.key === '0') {
        e.preventDefault();
        e.stopPropagation();
        newSize = 14;
      }

      if (newSize !== null && newSize !== terminalFontSize) {
        terminalFontSize = newSize;
        // Apply to all terminals
        for (const session of sessionManager.getAllSessions()) {
          session.terminal.options.fontSize = newSize;
          session.fitAddon.fit();
        }
        updateIndicator('beamterm', newSize);

        // Sync settings panel if open
        const fontSizeInput = document.querySelector('[data-action="change-terminal-font-size"]') as HTMLInputElement;
        const fontSizeDisplay = document.querySelector('[data-terminal-font-size-display]');
        if (fontSizeInput) fontSizeInput.value = String(newSize);
        if (fontSizeDisplay) fontSizeDisplay.textContent = `${newSize}px`;

        console.log(`[terX] Font size: ${newSize}px`);
      }
    }
  }, true);

  // ============================================================================
  // Page Up/Down scrolling for active terminal (with Shift modifier)
  // Without Shift, PageUp/PageDown are sent to PTY for apps like mc, less, irssi
  // ============================================================================
  window.addEventListener('keydown', (e) => {
    const activeSession = sessionManager.getActiveSession();
    if (!activeSession) return;

    const container = activeSession.container;
    if (container.contains(document.activeElement) || document.activeElement === container) {
      // Shift+PageUp/PageDown - scroll terminal history (like PuTTY)
      // Without Shift - let input handler send to PTY
      if (e.key === 'PageUp' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        activeSession.terminal.scrollPages(-1);
      } else if (e.key === 'PageDown' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        activeSession.terminal.scrollPages(1);
      } else if (e.key === 'Home' && (e.ctrlKey || e.metaKey)) {
        // Ctrl/Cmd+Home - scroll to top of terminal history
        e.preventDefault();
        e.stopPropagation();
        activeSession.terminal.scrollToTop();
      } else if (e.key === 'End' && (e.ctrlKey || e.metaKey)) {
        // Ctrl/Cmd+End - scroll to bottom of terminal history
        e.preventDefault();
        e.stopPropagation();
        activeSession.terminal.scrollToBottom();
      }
    }
  }, true);

  // ============================================================================
  // Debug Window (F3)
  // ============================================================================
  let debugMetricsInterval: ReturnType<typeof setInterval> | null = null;
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let fpsFrameCount = 0;
  let currentFps = 0;
  let renderTimes: number[] = [];

  let lastFrameTime = performance.now();
  function trackFrame() {
    const now = performance.now();
    const delta = now - lastFrameTime;
    lastFrameTime = now;
    frameCount++;
    fpsFrameCount++;

    renderTimes.push(delta);
    if (renderTimes.length > 60) renderTimes.shift();

    if (now - lastFpsTime >= 1000) {
      currentFps = fpsFrameCount * 1000 / (now - lastFpsTime);
      fpsFrameCount = 0;
      lastFpsTime = now;
    }

    requestAnimationFrame(trackFrame);
  }
  requestAnimationFrame(trackFrame);

  function getDebugMetrics() {
    const activeSession = sessionManager.getActiveSession();
    const terminal = activeSession?.terminal;
    const container = activeSession?.container;
    const canvas = container?.querySelector('canvas');

    let glRenderer = '-';
    let glVendor = '-';
    let glVersion = '-';
    let glMaxTexture = '-';

    if (canvas) {
      const gl = canvas.getContext('webgl2');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          glRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '-';
          glVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '-';
        }
        glVersion = gl.getParameter(gl.VERSION) || '-';
        glMaxTexture = String(gl.getParameter(gl.MAX_TEXTURE_SIZE));
      }
    }

    const avgRenderTime = renderTimes.length > 0
      ? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length
      : 0;

    const dpr = window.devicePixelRatio || 1;
    const metrics = terminal?.renderer?.getMetrics?.() || { width: 0, height: 0 };
    const renderer = terminal?.renderer as any;
    const renderStats = renderer?.renderStats || {};

    return {
      platform: navigator.platform,
      dpr,
      windowSize: `${window.innerWidth} x ${window.innerHeight}`,
      canvasCss: canvas ? `${canvas.clientWidth} x ${canvas.clientHeight}` : '-',
      canvasPhysical: canvas ? `${canvas.width} x ${canvas.height}` : '-',
      glRenderer,
      glVendor,
      glVersion,
      glMaxTexture,
      fps: currentFps,
      renderTime: avgRenderTime,
      frameCount,
      textRunsPerFrame: renderStats.textRunsPerFrame || 0,
      termSize: terminal ? `${terminal.cols} x ${terminal.rows}` : '-',
      cellSize: `${metrics.width?.toFixed(1)} x ${metrics.height?.toFixed(1)}`,
      fontInfo: `${terminalFontSize}px`,
      scrollback: String(terminal?.options.scrollback || 0),
      termRenderTime: renderStats.lastRenderTime?.toFixed(2) || '0',
      termRenderAvg: renderStats.avgRenderTime?.toFixed(2) || '0',
      termRenderCount: renderStats.renderCount || 0,
      termRendersPerSec: renderStats.rendersPerSecond || 0,
      termSkippedPerSec: renderStats.skippedPerSecond || 0,
      termSkippedCount: renderStats.skippedFrames || 0,
      // Multi-session info
      sessionCount: sessionManager.sessionCount,
      activeSessionId: sessionManager.activeSessionId || '-',
    };
  }

  async function openDebugWindow() {
    const existing = await WebviewWindow.getByLabel('debug');
    if (existing) {
      await existing.setFocus();
      return;
    }

    console.log('[terX] Opening debug window...');

    const debugWebview = new WebviewWindow('debug', {
      url: '/debug.html',
      title: 'terX Debug',
      width: 420,
      height: 720,
      resizable: true,
      center: false,
      x: 50,
      y: 50,
    });

    debugWebview.once('tauri://created', () => {
      console.log('[terX] Debug window created');

      if (debugMetricsInterval) clearInterval(debugMetricsInterval);
      debugMetricsInterval = setInterval(async () => {
        const dw = await WebviewWindow.getByLabel('debug');
        if (dw) {
          dw.emit('debug-metrics', getDebugMetrics());
        } else {
          if (debugMetricsInterval) {
            clearInterval(debugMetricsInterval);
            debugMetricsInterval = null;
          }
        }
      }, 100);
    });

    debugWebview.once('tauri://error', (e) => {
      console.error('[terX] Debug window error:', e);
    });

    debugWebview.once('tauri://destroyed', () => {
      console.log('[terX] Debug window closed');
      if (debugMetricsInterval) {
        clearInterval(debugMetricsInterval);
        debugMetricsInterval = null;
      }
    });
  }

  // F3 or Alt+D to toggle debug window
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3' || (e.altKey && (e.key === 'd' || e.key === 'D'))) {
      e.preventDefault();
      openDebugWindow();
    }
  });

  // Debug button click handler
  const debugBtn = document.getElementById('debug-btn');
  if (debugBtn) {
    debugBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openDebugWindow();
    });
  }

  // Selection mode toggle button
  const selectionModeBtn = document.getElementById('selection-mode-btn');
  const selectionModeLabel = document.getElementById('selection-mode-label');

  function updateSelectionModeUI() {
    if (selectionModeBtn && selectionModeLabel) {
      if (selectionRequireShift) {
        selectionModeLabel.textContent = '⇧';
        selectionModeBtn.classList.remove('direct-mode');
        selectionModeBtn.title = t('selection.shiftClick') || 'Selection: Shift+Click (click to toggle)';
      } else {
        selectionModeLabel.textContent = '✓';
        selectionModeBtn.classList.add('direct-mode');
        selectionModeBtn.title = t('selection.direct') || 'Selection: Direct (click to toggle)';
      }
    }
  }

  if (selectionModeBtn) {
    selectionModeBtn.addEventListener('click', () => {
      selectionRequireShift = !selectionRequireShift;
      // Apply to all sessions
      for (const session of sessionManager.getAllSessions()) {
        session.terminal.setSelectionRequireShift(selectionRequireShift);
      }
      updateSelectionModeUI();
      console.log(`[terX] Selection mode: ${selectionRequireShift ? 'Shift+Click' : 'Direct'}`);
    });
  }

  console.log('[terX] Press F3, Alt+D or click DEBUG button to open debug window');

  // ============================================================================
  // Debug interface
  // ============================================================================
  window.terxDebug = {
    sessionManager,
    openDebugWindow,
    getMetrics: getDebugMetrics,
    setFontSize: (size: number) => {
      const newSize = Math.max(MIN_FONT_SIZE, Math.min(size, MAX_FONT_SIZE));
      terminalFontSize = newSize;
      for (const session of sessionManager.getAllSessions()) {
        session.terminal.options.fontSize = newSize;
        session.fitAddon.fit();
      }
      updateIndicator('beamterm', newSize);
      // Sync settings panel if open
      const fontSizeInput = document.querySelector('[data-action="change-terminal-font-size"]') as HTMLInputElement;
      const fontSizeDisplay = document.querySelector('[data-terminal-font-size-display]');
      if (fontSizeInput) fontSizeInput.value = String(newSize);
      if (fontSizeDisplay) fontSizeDisplay.textContent = `${newSize}px`;
    },
    disconnectAll: async () => {
      for (const session of sessionManager.getAllSessions()) {
        await invoke('ssh_disconnect', { sessionId: session.id });
      }
      sessionManager.closeAllSessions();
    },
    toggleSidebar: uiToggleSidebar,
  };

  // ============================================================================
  // Ready
  // ============================================================================
  updateStatus('Ready - Press Ctrl+H', false);
  updateIndicator('beamterm', terminalFontSize);

  console.log('[terX] Terminal ready!');

  // Auto-open sidebar on start
  showSidebar();
}

// Start application
main();

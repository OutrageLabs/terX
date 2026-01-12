#!/usr/bin/env node

/**
 * @ghostty-web/demo - Cross-platform demo server
 *
 * Starts a local HTTP server with WebSocket PTY support.
 * Run with: npx @ghostty-web/demo
 */

import fs from 'fs';
import http from 'http';
import { homedir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Node-pty for cross-platform PTY support
import pty from '@lydell/node-pty';
// WebSocket server
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEV_MODE = process.argv.includes('--dev');
const HTTP_PORT = process.env.PORT || (DEV_MODE ? 8000 : 8080);

// ============================================================================
// Locate ghostty-web assets
// ============================================================================

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function findGhosttyWeb() {
  // In dev mode, we use Vite - no need to find built assets
  if (DEV_MODE) {
    const repoRoot = path.join(__dirname, '..', '..');
    const wasmPath = path.join(repoRoot, 'ghostty-vt.wasm');
    if (!fs.existsSync(wasmPath)) {
      console.error('Error: ghostty-vt.wasm not found.');
      console.error('Run: bun run build:wasm');
      process.exit(1);
    }
    return { distPath: null, wasmPath, repoRoot };
  }

  // First, check for local development (repo root dist/)
  const localDist = path.join(__dirname, '..', '..', 'dist');
  const localJs = path.join(localDist, 'ghostty-web.js');
  const localWasm = path.join(__dirname, '..', '..', 'ghostty-vt.wasm');

  if (fs.existsSync(localJs) && fs.existsSync(localWasm)) {
    return { distPath: localDist, wasmPath: localWasm, repoRoot: path.join(__dirname, '..', '..') };
  }

  // Use require.resolve to find the installed ghostty-web package
  try {
    const ghosttyWebMain = require.resolve('ghostty-web');
    // Strip dist/... from path to get package root (regex already gives us the root)
    const ghosttyWebRoot = ghosttyWebMain.replace(/[/\\]dist[/\\].*$/, '');
    const distPath = path.join(ghosttyWebRoot, 'dist');
    const wasmPath = path.join(ghosttyWebRoot, 'ghostty-vt.wasm');

    if (fs.existsSync(path.join(distPath, 'ghostty-web.js')) && fs.existsSync(wasmPath)) {
      return { distPath, wasmPath, repoRoot: null };
    }
  } catch (e) {
    // require.resolve failed, package not found
  }

  console.error('Error: Could not find ghostty-web package.');
  console.error('');
  console.error('If developing locally, run: bun run build');
  console.error('If using npx, the package should install automatically.');
  process.exit(1);
}

const { distPath, wasmPath, repoRoot } = findGhosttyWeb();

// ============================================================================
// HTML Template
// ============================================================================

const HTML_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ghostty-web</title>
    <style>
      /* Load Nerd Font from server */
      @font-face {
        font-family: 'FiraCode Nerd Font Mono';
        src: url('/fonts/FiraCodeNerdFontMono-Regular.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: block;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      html, body {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0f172a;
        display: flex;
        margin: 0;
        padding: 0;
      }

      .terminal-window {
        width: 100%;
        height: 100%;
        background: #1e1e1e;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .title-bar {
        background: #2d2d2d;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid #1a1a1a;
      }

      .traffic-lights {
        display: flex;
        gap: 8px;
      }

      .light {
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }

      .light.red { background: #ff5f56; }
      .light.yellow { background: #ffbd2e; }
      .light.green { background: #27c93f; }

      .title {
        color: #e5e5e5;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0.3px;
      }

      .connection-status {
        margin-left: auto;
        font-size: 11px;
        color: #888;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #888;
      }

      .status-dot.connected { background: #27c93f; }
      .status-dot.disconnected { background: #ff5f56; }
      .status-dot.connecting { background: #ffbd2e; animation: pulse 1s infinite; }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .terminal-content {
        flex: 1;
        background: #1e1e1e;
        position: relative;
        overflow: hidden;
      }

      /* Ensure terminal canvas can handle scrolling */
      .terminal-content canvas {
        display: block;
      }

    </style>
  </head>
  <body>
    <div class="terminal-window">
      <div class="title-bar">
        <div class="traffic-lights">
          <div class="light red"></div>
          <div class="light yellow"></div>
          <div class="light green"></div>
        </div>
        <span class="title">ghostty-web</span>
        <span id="font-test" style="font-family: 'FiraCode Nerd Font Mono', monospace; margin-left: 10px; color: #888;"></span>
        <div class="connection-status">
          <div class="status-dot connecting" id="status-dot"></div>
          <span id="status-text">Connecting...</span>
        </div>
      </div>
      <div class="terminal-content" id="terminal"></div>
    </div>

    <script type="module">
      import { init, Terminal, FitAddon } from '/dist/ghostty-web.js';

      // Wait for fonts to be ready before initializing terminal
      // This ensures Nerd Font glyphs render correctly on first draw
      await document.fonts.ready;

      // Also try to load the specific font we need
      const fontName = 'FiraCode Nerd Font Mono';
      try {
        await document.fonts.load('14px "' + fontName + '"');
        const loaded = document.fonts.check('14px "' + fontName + '"');
        console.log('[Font]', fontName, 'loaded:', loaded);

        // List all available fonts for debugging
        const fonts = [];
        document.fonts.forEach(f => fonts.push(f.family));
        console.log('[Font] Available fonts:', [...new Set(fonts)].join(', '));

        // Show font test icons in title bar
        const fontTest = document.getElementById('font-test');
        // These are common Nerd Font icons: folder, git-branch, node.js, python, prompt
        fontTest.textContent = [0xf07b, 0xe0a0, 0xe718, 0xe73c, 0x276f].map(cp => String.fromCodePoint(cp)).join(' ');
      } catch (e) {
        console.warn('Could not preload FiraCode Nerd Font Mono:', e);
      }

      await init();
      const term = new Terminal({
        cols: 80,
        rows: 24,
        fontFamily: 'FiraCode Nerd Font Mono, Menlo, Monaco, monospace',
        fontSize: 13,
        lineHeight: 1.15,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
        },
        graphics: {
          enabled: true,
          debug: true,
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      const container = document.getElementById('terminal');
      await term.open(container);

      // Initial fit
      fitAddon.fit();
      console.log('[Demo] Initial fit:', term.cols, 'x', term.rows);

      // Observe container resize
      fitAddon.observeResize();

      // Status elements
      const statusDot = document.getElementById('status-dot');
      const statusText = document.getElementById('status-text');

      function setStatus(status, text) {
        statusDot.className = 'status-dot ' + status;
        statusText.textContent = text;
      }

      // Connect to WebSocket PTY server (use same origin as HTTP server)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/ws?cols=' + term.cols + '&rows=' + term.rows;
      let ws;

      function connect() {
        setStatus('connecting', 'Connecting...');
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setStatus('connected', 'Connected');
        };

        ws.onmessage = (event) => {
          term.write(event.data);
        };

        ws.onclose = () => {
          setStatus('disconnected', 'Disconnected');
          term.write('\\r\\n\\x1b[31mConnection closed. Reconnecting in 2s...\\x1b[0m\\r\\n');
          setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          setStatus('disconnected', 'Error');
        };
      }

      connect();

      // Send terminal input to server
      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Handle resize - notify PTY when terminal dimensions change
      term.onResize(({ cols, rows }) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });

      // Handle window resize with debouncing
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          console.log('[Demo] Window resize, container size:', container.clientWidth, 'x', container.clientHeight);
          fitAddon.fit();
          console.log('[Demo] After fit:', term.cols, 'x', term.rows);
        }, 100);
      });

    </script>
  </body>
</html>`;

// ============================================================================
// MIME Types
// ============================================================================

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ============================================================================
// HTTP Server
// ============================================================================

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Serve index page
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML_TEMPLATE);
    return;
  }

  // Serve dist files
  if (pathname.startsWith('/dist/')) {
    const filePath = path.join(distPath, pathname.slice(6));
    serveFile(filePath, res);
    return;
  }

  // Serve WASM file
  if (pathname === '/ghostty-vt.wasm') {
    serveFile(wasmPath, res);
    return;
  }

  // Serve fonts
  if (pathname.startsWith('/fonts/')) {
    const fontsDir = path.join(__dirname, '..', 'fonts');
    const filePath = path.join(fontsDir, pathname.slice(7));
    serveFile(filePath, res);
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not Found');
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ============================================================================
// WebSocket Server (using ws package)
// ============================================================================

const sessions = new Map();

function getShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function createPtySession(cols, rows) {
  const shell = getShell();
  const shellArgs = process.platform === 'win32' ? [] : [];

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: cols,
    rows: rows,
    cwd: homedir(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });

  return ptyProcess;
}

// WebSocket server attached to HTTP server (same port)
const wss = new WebSocketServer({ noServer: true });

// Handle HTTP upgrade for WebSocket connections
httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/ws') {
    // In production, consider validating req.headers.origin to prevent CSRF
    // For development/demo purposes, we allow all origins
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cols = Number.parseInt(url.searchParams.get('cols') || '80');
  const rows = Number.parseInt(url.searchParams.get('rows') || '24');

  // Create PTY
  const ptyProcess = createPtySession(cols, rows);

  // Buffer for PTY data - collect chunks and send together (like tmux does)
  // This prevents race conditions when graphics sequences are split across chunks
  let ptyBuffer = '';
  let bufferTimeout = null;

  const flushBuffer = () => {
    if (ptyBuffer && ws.readyState === ws.OPEN) {
      let data = ptyBuffer;

      // Filter out unsupported DECSET/DECRST modes that cause warnings
      // Mode 7727 is mintty's "Application escape key mode" - not needed
      data = data.replace(/\x1b\[\?7727[hl]/g, '');

      // Note: Kitty Unicode placeholders are now handled in graphics-manager.ts
      // which removes entire lines containing placeholders (not just the chars)

      if (data) {
        ws.send(data);
      }
      ptyBuffer = '';
    }
    bufferTimeout = null;
  };

  sessions.set(ws, { pty: ptyProcess, flushBuffer });

  // PTY -> WebSocket (buffered)
  ptyProcess.onData((data) => {
    ptyBuffer += data;

    // Debounce: send after 16ms of no new data (one frame)
    if (bufferTimeout) {
      clearTimeout(bufferTimeout);
    }
    bufferTimeout = setTimeout(flushBuffer, 16);
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n\x1b[33mShell exited (code: ${exitCode})\x1b[0m\r\n`);
      ws.close();
    }
  });

  // WebSocket -> PTY
  ws.on('message', (data) => {
    const message = data.toString('utf8');

    // Check for resize message
    if (message.startsWith('{')) {
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'resize') {
          ptyProcess.resize(msg.cols, msg.rows);
          return;
        }
      } catch (e) {
        // Not JSON, treat as input
      }
    }

    // Filter out Kitty graphics responses before writing to PTY.
    // These are acknowledgments from the terminal (e.g., "\x1b_Gi=1;OK\x1b\\")
    // that shouldn't be echoed back. The PTY would echo them, causing garbage
    // like "Gi=1;OK" to appear in terminal output.
    if (message.includes('\x1b_G') && message.includes(';OK')) {
      // Skip graphics responses entirely - don't write to PTY
      return;
    }

    // Send to PTY
    ptyProcess.write(message);
  });

  ws.on('close', () => {
    const session = sessions.get(ws);
    if (session) {
      session.pty.kill();
      sessions.delete(ws);
    }
  });

  ws.on('error', () => {
    // Ignore socket errors (connection reset, etc.)
  });

  // Send welcome message
  const C = '\x1b[1;36m'; // Cyan
  const G = '\x1b[1;32m'; // Green
  const Y = '\x1b[1;33m'; // Yellow
  const R = '\x1b[0m'; // Reset
  ws.send(`${C}╔══════════════════════════════════════════════════════════════╗${R}\r\n`);
  ws.send(
    `${C}║${R}  ${G}Welcome to ghostty-web!${R}                                     ${C}║${R}\r\n`
  );
  ws.send(`${C}║${R}                                                              ${C}║${R}\r\n`);
  ws.send(`${C}║${R}  You have a real shell session with full PTY support.        ${C}║${R}\r\n`);
  ws.send(
    `${C}║${R}  Try: ${Y}ls${R}, ${Y}cd${R}, ${Y}top${R}, ${Y}vim${R}, or any command!                      ${C}║${R}\r\n`
  );
  ws.send(`${C}╚══════════════════════════════════════════════════════════════╝${R}\r\n\r\n`);
});

// ============================================================================
// Startup
// ============================================================================

function printBanner(url) {
  console.log('\n' + '═'.repeat(60));
  console.log('  🚀 ghostty-web demo server' + (DEV_MODE ? ' (dev mode)' : ''));
  console.log('═'.repeat(60));
  console.log(`\n  📺 Open: ${url}`);
  console.log(`  📡 WebSocket PTY: same endpoint /ws`);
  console.log(`  🐚 Shell: ${getShell()}`);
  console.log(`  📁 Home: ${homedir()}`);
  if (DEV_MODE) {
    console.log(`  🔥 Hot reload enabled via Vite`);
  } else if (repoRoot) {
    console.log(`  📦 Using local build: ${distPath}`);
  }
  console.log('\n  ⚠️  This server provides shell access.');
  console.log('     Only use for local development.\n');
  console.log('═'.repeat(60));
  console.log('  Press Ctrl+C to stop.\n');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  for (const [ws, session] of sessions.entries()) {
    session.pty.kill();
    ws.close();
  }
  wss.close();
  process.exit(0);
});

// Start HTTP/Vite server
if (DEV_MODE) {
  // Dev mode: use Vite for hot reload
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: repoRoot,
    server: {
      port: HTTP_PORT,
      strictPort: true,
    },
  });

  await vite.listen();

  // Attach WebSocket handler AFTER Vite has fully initialized
  // Use prependListener (not prependOnceListener) so it runs for every request
  // This ensures our handler runs BEFORE Vite's handlers
  if (vite.httpServer) {
    vite.httpServer.prependListener('upgrade', (req, socket, head) => {
      const pathname = req.url?.split('?')[0] || req.url || '';

      // ONLY handle /ws - everything else passes through unchanged to Vite
      if (pathname === '/ws') {
        if (!socket.destroyed && !socket.readableEnded) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
        // Stop here - we handled it, socket is consumed
        // Don't call other listeners
        return;
      }

      // For non-/ws paths, explicitly do nothing and let the event propagate
      // The key is: don't return, don't touch the socket, just let it pass through
      // Vite's handlers (which were added before ours via prependListener) will process it
    });
  }

  printBanner(`http://localhost:${HTTP_PORT}/demo/`);
} else {
  // Production mode: static file server
  httpServer.listen(HTTP_PORT, () => {
    printBanner(`http://localhost:${HTTP_PORT}`);
  });
}

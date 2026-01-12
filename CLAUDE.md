# terX - Cross-Platform SSH Client

## Project Overview

terX is a cross-platform SSH terminal application built with:
- **Tauri 2.0** - Rust backend, web frontend
- **ghostty-web** - VT100 parser (ghostty-vt.wasm) + xterm.js-compatible Terminal API
- **@beamterm/renderer** - WebGL2 GPU-accelerated rendering with **native selection**

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           terX Application                              │
├─────────────────────────────────────────────────────────────────────────┤
│  src/main.ts (Entry Point)                                              │
│  ├─ Initializes ghostty WASM (init())                                  │
│  ├─ Initializes beamterm WASM (initBeamtermWasm())                     │
│  ├─ Creates Terminal with renderer: 'beamterm'                         │
│  ├─ Runs auth flow (storage selector → login → master password)        │
│  ├─ Sets up SSH connection via Tauri invoke()                          │
│  └─ Creates UI (sidebar, settings, dialogs)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  ghostty-web/lib/                                                       │
│  ├─ terminal.ts      → Terminal class (xterm.js-compatible API)        │
│  ├─ ghostty.ts       → WASM bindings for ghostty-vt.wasm               │
│  ├─ beamterm-renderer.ts → Adapter: GhosttyCell → beamterm batch API   │
│  ├─ input-handler.ts → Keyboard/mouse input → terminal sequences       │
│  └─ buffer.ts        → Buffer API for scrollback                       │
├─────────────────────────────────────────────────────────────────────────┤
│  beamterm-renderer/ (@beamterm/renderer by junkdog)                     │
│  ├─ Rust → WASM WebGL2 renderer                                        │
│  ├─ Native text selection (SelectionMode.Block)                        │
│  ├─ Dynamic font atlas (NerdFonts, emoji support)                      │
│  └─ Sub-millisecond render times                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  src-tauri/ (Rust Backend)                                              │
│  ├─ ssh.rs          → SSH client (russh crate)                         │
│  ├─ credentials.rs  → Keychain integration (keyring crate)             │
│  └─ lib.rs          → Tauri commands (ssh_connect, ssh_write, etc.)    │
└─────────────────────────────────────────────────────────────────────────┘
           │
           │ SSH Protocol
           ▼
┌─────────────────────────┐
│   Remote Server (PTY)   │
└─────────────────────────┘
```

## Data Flow

### Terminal Rendering Flow
```
1. SSH data arrives (ssh-data-{sessionId} event)
2. terminal.write(data) → ghostty-vt.wasm parses VT100 sequences
3. GhosttyTerminal updates internal cell buffer
4. BeamtermRendererAdapter.render() converts GhosttyCell[] → beamterm batch
5. BeamtermRenderer (WASM/WebGL2) renders to canvas
```

### User Input Flow
```
1. User types → InputHandler captures keyboard event
2. InputHandler encodes key → escape sequence (using ghostty KeyEncoder)
3. terminal.onData fires → main.ts receives data
4. invoke('ssh_write', data) → Rust sends to SSH channel
5. Remote shell processes input, sends response back
```

### Selection Flow (BEAMTERM NATIVE - NOT JavaScript)
```
1. Mouse events handled by BeamtermRenderer (Rust/WASM)
2. renderer.enableSelection(SelectionMode.Block, true, 200) enables native selection
3. Selection coordinates in PHYSICAL PIXELS (not CSS pixels)
4. Auto-copy to clipboard on mouse release
5. NO JavaScript SelectionManager - beamterm handles everything natively
```

## Project Structure

```
terx/
├── src/                        # Frontend (TypeScript)
│   ├── main.ts                # App entry point, SSH, terminal setup
│   ├── lib/                   # Core libraries
│   │   ├── storage.ts         # Unified storage API (local/cloud)
│   │   ├── supabase.ts        # Supabase client for terX Cloud
│   │   ├── local-storage.ts   # Encrypted local file storage
│   │   ├── crypto.ts          # AES-GCM encryption
│   │   ├── themes.ts          # Theme definitions
│   │   └── database.types.ts  # TypeScript types for data
│   ├── ui/                    # UI components
│   │   ├── sidebar.ts         # Host list sidebar
│   │   ├── settings.ts        # Settings panel
│   │   ├── auth.ts            # Login/signup dialogs
│   │   ├── auth-flow.ts       # Auth orchestration
│   │   ├── master-password.ts # Master password dialog
│   │   ├── host-dialog.ts     # Host add/edit dialog
│   │   └── ...                # Other dialogs
│   ├── i18n/                  # Translations
│   │   ├── en-US.json
│   │   └── pl-PL.json
│   └── styles.css             # Tailwind CSS styles
├── ghostty-web/               # Terminal library (fork)
│   └── lib/
│       ├── terminal.ts        # Main Terminal class (xterm.js API)
│       ├── ghostty.ts         # WASM bindings for VT parser
│       ├── beamterm-renderer.ts  # *** ADAPTER: ghostty → beamterm ***
│       ├── input-handler.ts   # Keyboard/mouse → sequences
│       ├── buffer.ts          # Scrollback buffer API
│       ├── types.ts           # GhosttyCell, CellFlags, etc.
│       ├── index.ts           # Public exports
│       └── addons/fit.ts      # FitAddon for auto-sizing
├── beamterm-renderer/         # @beamterm/renderer (local copy)
│   ├── dist/                  # Pre-built WASM + JS (committed to repo)
│   │   └── bundler/           # Main entry point
│   └── package.json           # Package definition
├── src-tauri/                 # Rust backend
│   └── src/
│       ├── lib.rs             # Tauri commands, app setup
│       ├── ssh.rs             # SSH client (russh)
│       ├── credentials.rs     # System keychain
│       └── main.rs            # Entry point
├── public/                    # Static assets (fonts, icons)
└── package.json               # Dependencies
```

## Key Files Reference

### Frontend Core
| File | Purpose |
|------|---------|
| `src/main.ts` | App entry, SSH connection, terminal init, UI setup |
| `src/lib/storage.ts` | Unified storage API (local/cloud/own-supabase) |
| `src/lib/themes.ts` | Theme definitions and runtime application |

### Terminal Library (ghostty-web)
| File | Purpose |
|------|---------|
| `ghostty-web/lib/terminal.ts` | Terminal class with xterm.js-compatible API |
| `ghostty-web/lib/ghostty.ts` | WASM bindings: Ghostty, GhosttyTerminal, KeyEncoder |
| `ghostty-web/lib/beamterm-renderer.ts` | **CRITICAL**: Bridges GhosttyCell[] → beamterm |
| `ghostty-web/lib/input-handler.ts` | KeyboardEvent → terminal escape sequences |

### Renderer (@kofany/beamterm-terx)
- **npm package**: `@kofany/beamterm-terx` (fork of @beamterm/renderer)
- **Source**: https://github.com/kofany/beamterm branch `fix/selection-idle-state`
- **Key fix**: `mouse.rs` - HiDPI coordinate conversion (DPR multiplication)

### Rust Backend
| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Tauri commands: ssh_connect, ssh_write, ssh_resize |
| `src-tauri/src/ssh.rs` | SSH implementation using russh crate |
| `src-tauri/src/credentials.rs` | System keychain via keyring crate |

## Build Commands

```bash
# Development
bun install
bun run tauri dev

# Production build
bun run tauri build

# Output:
# - macOS app: src-tauri/target/release/bundle/macos/terX.app
# - DMG:       src-tauri/target/release/bundle/dmg/terX_0.1.0_aarch64.dmg
```

## Aktualizacja beamterm

```bash
# Aktualizacja do najnowszej wersji z npm
bun update @kofany/beamterm-terx

# Lub konkretna wersja
bun add @kofany/beamterm-terx@0.12.2
```

Publikacja nowej wersji - patrz `/Users/k/dev/beamterm/CLAUDE.md`

## CRITICAL: DPR (Device Pixel Ratio) Handling

The application must correctly handle high-DPI displays (Windows 125%/150%, macOS Retina).

### BeamtermRendererAdapter (ghostty-web/lib/beamterm-renderer.ts)

**Internal state:**
- `_charWidth` / `_charHeight` - **PHYSICAL pixels** (from beamterm.cellSize())

**Public getters (for external code):**
- `charWidth` / `charHeight` - returns **CSS pixels** (divided by DPR)
- `getMetrics()` - returns CSS pixels for FitAddon calculations

**resize() method:**
```typescript
resize(cols: number, rows: number): void {
  const dpr = window.devicePixelRatio || 1;

  // Physical pixels for canvas buffer
  const physicalWidth = cols * this._charWidth;
  const physicalHeight = rows * this._charHeight;

  // CSS pixels for layout
  const cssWidth = physicalWidth / dpr;
  const cssHeight = physicalHeight / dpr;

  // Set BOTH canvas dimensions AND CSS style
  this.canvas.width = physicalWidth;
  this.canvas.height = physicalHeight;
  this.canvas.style.width = `${cssWidth}px`;
  this.canvas.style.height = `${cssHeight}px`;

  this.renderer.resize(physicalWidth, physicalHeight);
}
```

### Selection Coordinates (HiDPI/DPR)
- **Mouse events** (`offset_x`/`offset_y`) return CSS pixels
- **Cell dimensions** from font atlas are in PHYSICAL pixels
- **Fix location**: `beamterm-renderer/src/mouse.rs` multiplies mouse coords by `window.devicePixelRatio`
- Selection handled entirely by beamterm WASM - no JS SelectionManager
- Terminal clicks (for apps like MC) use JavaScript `input-handler.ts` which handles DPR separately

## Troubleshooting

### "Selection is off by X lines"
1. Problem is in beamterm's `mouse.rs`, NOT in TypeScript
2. Check that `mouse.rs` multiplies `offset_x`/`offset_y` by `window.device_pixel_ratio()`
3. Rebuild beamterm with `--features js-api` and copy to terX
4. **DO NOT** touch renderer, resize(), or TypeScript - click works fine, only selection uses beamterm's mouse handling

### "Fonts not rendering / diamonds"
1. Wait for `document.fonts.ready` before creating terminal
2. Check font family fallback chain in BeamtermRendererAdapter constructor
3. Ensure NerdFont files are in `/public/fonts/`

### "SSH connection fails"
1. Check Rust logs in terminal console
2. Verify credentials decrypted correctly (master password)
3. Check network/firewall

### "OAuth doesn't work"
1. Deep link: `terx://auth/callback` must be registered
2. Uses `tauri-plugin-opener` for external browser (not WebView)
3. Check `handleOAuthCallback()` in `src/lib/supabase.ts`

## Storage Modes

1. **Local** - Encrypted JSON in app data directory
2. **terX Cloud** - Supabase with E2E encryption
3. **Own Supabase** - User's own instance (placeholder)

Master password encrypts all sensitive data using AES-256-GCM with PBKDF2.

## Dependencies

### Frontend (package.json)
- `@beamterm/renderer` - WebGL2 renderer (local: `file:./beamterm-renderer`)
- `harfbuzzjs` - Font shaping WASM
- `@tauri-apps/api` - Tauri IPC
- `@supabase/supabase-js` - Cloud storage

### Backend (Cargo.toml)
- `tauri` - App framework
- `russh` - SSH client
- `keyring` - System keychain
- `tauri-plugin-deep-link` - OAuth callbacks
- `tauri-plugin-opener` - Open URLs in browser

## Language

Use Polish for comments and communication (user preference).

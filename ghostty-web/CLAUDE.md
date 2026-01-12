# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ghostty-web is a web-based terminal emulator that wraps Ghostty's WASM-compiled VT100 parser with an xterm.js-compatible API. It provides a proper VT100 implementation in the browser using the same battle-tested code from the native Ghostty terminal app (~400KB WASM bundle, zero runtime dependencies).

## Key Architecture

### WASM Bridge Architecture

The project bridges native Ghostty code to JavaScript through a WASM compilation:

1. **Ghostty Submodule** (`ghostty/`): Native Ghostty terminal emulator as a git submodule
2. **WASM Patch** (`patches/ghostty-wasm-api.patch`): Minimal patch to expose C API for web usage
3. **WASM Build** (`scripts/build-wasm.sh`): Compiles Ghostty's VT parser to `ghostty-vt.wasm` using Zig
4. **TypeScript Wrapper** (`lib/ghostty.ts`): High-level wrapper around low-level WASM exports
5. **Terminal Class** (`lib/terminal.ts`): Main xterm.js-compatible Terminal implementation

### Core Components

- **`lib/terminal.ts`**: Main Terminal class providing xterm.js-compatible API
- **`lib/ghostty.ts`**: TypeScript wrapper for WASM exports (Ghostty, GhosttyTerminal, KeyEncoder classes)
- **`lib/types.ts`**: Complete type definitions for WASM C ABI (SGR attributes, key encoding, etc.)
- **`lib/renderer.ts`**: CanvasRenderer that draws terminal cells to HTML canvas
- **`lib/input-handler.ts`**: Handles keyboard/mouse input and converts to terminal sequences
- **`lib/selection-manager.ts`**: Text selection and clipboard integration
- **`lib/buffer.ts`**: BufferNamespace implementing xterm.js buffer API
- **`lib/link-detector.ts`**: URL detection and link hover/click handling
- **`lib/providers/`**: Link detection providers (OSC8, URL regex)
- **`lib/addons/`**: Terminal addons (currently FitAddon for auto-sizing)

### WASM Interaction Pattern

The WASM module exports low-level C functions. TypeScript wrappers manage memory and provide ergonomic APIs:

```
User Code → Terminal (lib/terminal.ts)
          → GhosttyTerminal (lib/ghostty.ts)
          → WASM exports (ghostty-vt.wasm)
          → Native Ghostty parser
```

## Development Commands

### Setup & Building

```bash
# Install dependencies
bun install

# Build WASM + library (requires Zig 0.15.2+ and Bun)
bun run build

# Build steps breakdown:
bun run build:wasm     # Compile ghostty-vt.wasm from Ghostty source
bun run build:lib      # Build TypeScript library with Vite
bun run build:wasm-copy # Copy WASM to dist/

# Clean build artifacts
bun run clean
```

### Development

```bash
# Run dev server with demo (http://localhost:8000)
bun run dev

# Run live demo server with real shell
bun run demo        # Production build
bun run demo:dev    # Development mode (uses local build)
```

### Testing & Quality

```bash
# Run tests (Bun test runner)
bun test

# Type checking
bun run typecheck

# Linting and formatting
bun run lint        # Check with Biome
bun run lint:fix    # Auto-fix with Biome
bun run fmt         # Check formatting with Prettier
bun run fmt:fix     # Auto-format with Prettier
```

## WASM Build Process

The WASM build (`scripts/build-wasm.sh`) does:

1. Initializes/updates `ghostty` git submodule
2. Applies `patches/ghostty-wasm-api.patch` to expose terminal APIs
3. Runs `zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall`
4. Copies resulting `ghostty-vt.wasm` to project root
5. Reverts patch to keep submodule clean

**Important**: The patch is temporary during build only. Never commit changes to the `ghostty/` submodule.

## Testing Practices

- Tests use Bun's built-in test runner
- Test files: `*.test.ts` (co-located with source files)
- `lib/test-helpers.ts` provides terminal test utilities
- `happydom.ts` configures DOM environment for headless testing
- Tests create isolated Ghostty instances (not shared singleton)

## xterm.js API Compatibility

The Terminal class aims for API compatibility with xterm.js to enable migration by changing imports from `@xterm/xterm` → `ghostty-web`. Key compatible APIs:

- `Terminal` class with `open()`, `write()`, `resize()`, `dispose()`
- Event emitters: `onData`, `onResize`, `onBell`, `onTitleChange`, etc.
- Buffer API: `term.buffer.active` and `term.buffer.normal`
- Options: `fontSize`, `theme`, `cursorBlink`, etc.
- Addons: `FitAddon` (xterm-addon-fit compatible)

## Important Constraints

- **Requires Zig 0.15.2+** for WASM compilation
- **Requires Bun** for package management and scripts
- **WASM path resolution**: `Ghostty.load()` tries multiple paths (node, browser, CDN)
- **Font metrics**: Renderer measures font metrics from canvas context
- **Memory management**: WASM memory may grow; always use `getBuffer()` for current buffer
- **No RTL support yet**: Right-to-left text rendering not implemented

## Module Structure

```
lib/
├── index.ts              # Public API entry point, init() function
├── terminal.ts           # Main Terminal class
├── ghostty.ts            # WASM wrapper (Ghostty, GhosttyTerminal, KeyEncoder)
├── types.ts              # Complete TypeScript type definitions for WASM
├── renderer.ts           # Canvas rendering
├── input-handler.ts      # Keyboard/mouse input
├── selection-manager.ts  # Text selection
├── buffer.ts             # Buffer API
├── link-detector.ts      # Link detection system
├── event-emitter.ts      # Event system
├── addons/
│   └── fit.ts           # FitAddon for auto-sizing
└── providers/
    ├── osc8-link-provider.ts  # OSC 8 hyperlinks
    └── url-regex-provider.ts  # URL regex detection
```

## Build Output

- `dist/ghostty-web.js` - ES module
- `dist/ghostty-web.umd.cjs` - UMD bundle
- `dist/index.d.ts` - TypeScript declarations (rolled up)
- `dist/ghostty-vt.wasm` - WASM binary (copied from root)

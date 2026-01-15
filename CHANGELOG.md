# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.1.6] - 2026-01-15
### :memo: Documentation Changes
- [`a6c3b86`](https://github.com/OutrageLabs/terX/commit/a6c3b8649b056e879bf056abd61bf7f8f4b4e659) - update CHANGELOG.md for v0.1.5 *(commit by [@kofany](https://github.com/kofany))*


## [v0.1.5] - 2026-01-15
### :bug: Bug Fixes
- [`4f0edc6`](https://github.com/OutrageLabs/terX/commit/4f0edc6312434c0f8cc2b76516aa2e881a2799cb) - SSH freeze with russh 0.56 + update all dependencies *(commit by [@kofany](https://github.com/kofany))*

### :memo: Documentation Changes
- [`a836a7b`](https://github.com/OutrageLabs/terX/commit/a836a7b57591a0bcc2631e06dbce067382f33fee) - update CHANGELOG.md for v0.1.4 *(commit by [@kofany](https://github.com/kofany))*


## [v0.1.4] - 2026-01-15
### :sparkles: New Features
- [`ccad311`](https://github.com/OutrageLabs/terX/commit/ccad311bba38e11f78f39c6543df31abb38a8cd3) - dual-pane file manager + SSH key auth fixes *(commit by [@kofany](https://github.com/kofany))*

### :memo: Documentation Changes
- [`3258d4d`](https://github.com/OutrageLabs/terX/commit/3258d4d55d2b4cdd8ce5c678b274b7fa04e47e10) - update CHANGELOG.md for v0.1.3 *(commit by [@kofany](https://github.com/kofany))*

### :wrench: Chores
- [`b0aad5b`](https://github.com/OutrageLabs/terX/commit/b0aad5bc4bd1272c705b75e75b19dff506af1460) - bump version to 0.1.4 *(commit by [@kofany](https://github.com/kofany))*

### :flying_saucer: Other Changes
- [`2d4437f`](https://github.com/OutrageLabs/terX/commit/2d4437fec9d0c858b6773ae063550c8032b0d926) - Fix Unicode artifacts in WASM terminal by ensuring memory zeroing

Root cause: PageList.zig only zeroes memory when std.debug.runtime_safety
is enabled, but WASM is built with ReleaseSmall which has safety OFF.
WASM allocators don't guarantee zeroed memory like OS page allocators do,
resulting in garbage codepoints appearing as random Unicode symbols.

Changes:
- PageList.zig: Add WASM target check to memset conditions
- ghostty.ts: Use actual cell count instead of total buffer size

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com> *(commit by [@kofany](https://github.com/kofany))*
- [`7cafadf`](https://github.com/OutrageLabs/terX/commit/7cafadfce5d528ddb0b67c3a88981c464b0739e7) - Update README for v0.1.4 - new screenshots and File Manager feature *(commit by [@kofany](https://github.com/kofany))*
- [`0c60a3e`](https://github.com/OutrageLabs/terX/commit/0c60a3e7f5c3b6c876c911efe543e6ffee6d930d) - Merge feature/file-manager: SFTP File Manager + Unicode fixes

## New Features

### Dual-Pane SFTP File Manager (Ctrl+F5)
- Norton Commander-style dual-pane interface
- Left panel: local filesystem, Right panel: remote SFTP
- File operations: Copy (F5), Move (F6), Rename (F2), Delete (F8), Mkdir (F7)
- Multi-file selection with Space, Insert, Ctrl+Click, Shift+Click, Ctrl+A
- Recursive directory copy/move support
- Visual checkboxes for selection state
- Transfer progress with cancel support

### SSH Key Authentication Improvements
- Fixed private key loading from storage
- Support for password-protected keys with passphrase prompt
- Key format auto-detection (PEM, OpenSSH, PKCS8)

### Unicode Rendering Fix
- Fixed Unicode artifacts (random characters appearing)
- Added WASM-specific memory zeroing in PageList.zig
- Maintains small WASM size (~420KB vs 2.4MB with ReleaseSafe)

## Files Changed
- src/ui/file-manager.ts: New dual-pane file manager UI (1600+ lines)
- src/lib/file-manager-state.ts: State management for file manager
- src-tauri/src/sftp.rs: New SFTP module with recursive operations
- src-tauri/src/lib.rs: SFTP Tauri commands
- src-tauri/src/ssh.rs: SSH key auth improvements
- ghostty-web/patches/ghostty-wasm-api.patch: Unicode fix
- public/ghostty-vt.wasm: Rebuilt with fix
- README.md: Updated to v0.1.4, new screenshots, File Manager feature *(commit by [@kofany](https://github.com/kofany))*


## [v0.1.3] - 2026-01-13
### :sparkles: New Features
- [`bcac523`](https://github.com/OutrageLabs/terX/commit/bcac523b68323e11fa53136e78f271f31e7405b8) - add emoji picker and shortcuts help (v0.1.3) *(commit by [@kofany](https://github.com/kofany))*


## [0.1.3] - 2026-01-13

### Added
- Emoji picker with cross-platform support (emoji-picker-element)
- Emoji button in status bar (centered)
- Keyboard shortcut Ctrl+Shift+E to open emoji picker
- Help popup with keyboard shortcuts (F1 or ? button)
- Status bar UI hints in help popup

## [0.1.2] - 2026-01-13

### Fixed
- Fixed characters disappearing at larger font sizes (25px+) - characters like `~`, `-`, `<`, `>` were being clipped due to canvas overflow during glyph rasterization

### Changed
- Updated @kofany/beamterm-terx to 0.12.12 with the glyph clipping fix

## [0.1.1] - 2026-01-12

### Added
- Initial release
- Cross-platform SSH client with GPU-accelerated rendering
- WebGL2 terminal renderer via beamterm
- Ghostty VT100 parser integration
- Native text selection support
- Theme support with multiple built-in themes
- Local encrypted storage for credentials
- terX Cloud storage option with E2E encryption
[v0.1.3]: https://github.com/OutrageLabs/terX/compare/v0.1.2...v0.1.3
[v0.1.4]: https://github.com/OutrageLabs/terX/compare/v0.1.3...v0.1.4
[v0.1.5]: https://github.com/OutrageLabs/terX/compare/v0.1.4...v0.1.5
[v0.1.6]: https://github.com/OutrageLabs/terX/compare/v0.1.5...v0.1.6

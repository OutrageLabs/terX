# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.2.14] - 2026-01-31

### :sparkles: New Features

- Searchable theme picker with live preview - dropdown overlay replaces old arrow-based switcher

### :bug: Bug Fixes

- Fix shell injection vulnerability in changelog workflow

### :construction_worker: CI/CD

- Move release workflow to public repo for free GitHub Actions minutes
- Switch to git-cliff for changelog generation

## [v0.2.13] - 2026-01-31

### :wrench: Chores

- Update dependencies to latest stable versions
- Remove unused harfbuzzjs package

## [v0.2.12] - 2026-01-31

### :sparkles: New Features

- Disconnect dialog with reconnect functionality - when SSH connection drops, shows dialog with Reconnect/Close options

### :wrench: Chores

- Update russh to 0.57.0

## [v0.2.11] - 2026-01-31

### :sparkles: New Features

- Display SSH authentication banner (RFC 4252) - shows server's pre-auth message if present

### :construction_worker: CI/CD

- Add macOS Intel (x64) build to release workflow

## [v0.2.10] - 2026-01-30

### :lock: Security

- Remove legacy credentials.rs with insecure key derivation

## [v0.2.9] - 2026-01-29

### :sparkles: New Features

- Remove 'Own Supabase' option from storage selector
- Add auto-update system with GitHub Releases integration

## [v0.2.8] - 2026-01-29

### :bug: Bug Fixes

- Password dialog loses focus to terminal
- AUR uses native .pkg.tar.zst instead of .deb

### :construction_worker: CI/CD

- Add AUR package auto-publishing
- Add native Arch Linux build

## [v0.2.7] - 2026-01-29

### :sparkles: New Features

- Manual password entry option
- COLORTERM auto-injection for truecolor support

### :bug: Bug Fixes

- Correct SGR mouse motion encoding for no-button events
- Remove F3/Alt+D shortcut for debug window (conflicts with mc)

## [v0.2.6] - 2026-01-29

### :bug: Bug Fixes

- File manager tab shows host name in transfer-only mode
- Remove F5 shortcut for file manager (conflicts with mc, vim)
- Verify and correct keyboard shortcuts in help panel
- Escape key no longer closes dialogs when typing in text input
- Add missing .msi/.rpm to release

### :construction_worker: CI/CD

- Cross-repo release workflow to publish on OutrageLabs/terX

## [v0.2.4] - 2026-01-28

### :bug: Bug Fixes

- Restore PageList.zig memory zeroing for WASM

## [v0.2.3] - 2026-01-28

### :sparkles: New Features

- Focus management system with terx-focus-terminal custom event
- Auto-focus terminal on window focus (Alt+Tab back)
- Dead key handling (disableDeadKeys option) for Windows US International keyboard
- In-memory cache for storage with mutation invalidation
- Update ghostty-vt WASM to latest upstream

### :bug: Bug Fixes

- Streaming TextDecoder for SSH data to handle UTF-8 sequences split across chunks
- Fix Ctrl+H double-firing on Windows

## [v0.2.2] - 2026-01-27

### :bug: Bug Fixes

- Fix tmux DCS passthrough unwrap causing base64 leakage
- Selection behavior in apps with mouse tracking (irssi, vim, MC)

### :wrench: Chores

- Bump @kofany/beamterm-terx to 0.12.13

## [v0.2.1] - 2026-01-17

### :bug: Bug Fixes

- Add SSH keepalive to prevent connection timeouts

## [v0.2.0] - 2026-01-17

### :sparkles: New Features

- Multiple connections per host + Cmd/Ctrl+T shortcut
- macOS-style toggle switches + persist all settings
- Alt key toggles block selection mode

## [v0.1.9] - 2026-01-17

### :sparkles: New Features

- Configurable clipboard shortcuts (Ctrl+Shift+C/V, Shift+Insert)

### :bug: Bug Fixes

- Terminal scrollback history not rendering when scrolled

## [v0.1.8] - 2026-01-16

### :sparkles: New Features

- Smooth selection rendering during mouse drag
- Cursor transparency and configuration improvements

## [v0.1.7] - 2026-01-16

### :sparkles: New Features

- SSH host key verification system

## [v0.1.6] - 2026-01-15

### :sparkles: New Features

- Auto-install terminfo on remote hosts
- Help Panel redesign with tabs

### :bug: Bug Fixes

- Complete i18n for Help Panel and error messages
- Use rsa-sha2-256/512 instead of deprecated ssh-rsa

## [v0.1.5] - 2026-01-15

### :bug: Bug Fixes

- SSH freeze with russh 0.56

### :sparkles: New Features

- Enhanced debug panel
- Error dialogs improvements

## [v0.1.4] - 2026-01-15

### :sparkles: New Features

- Dual-pane SFTP file manager (Norton Commander style)
- SSH key authentication improvements

### :bug: Bug Fixes

- Fix Unicode artifacts in WASM terminal by ensuring memory zeroing

## [v0.1.3] - 2026-01-13

### :sparkles: New Features

- Emoji picker with cross-platform support
- Keyboard shortcuts help panel (F1)

## [v0.1.2] - 2026-01-13

### :bug: Bug Fixes

- Characters disappearing at larger font sizes (25px+)

## [v0.1.1] - 2026-01-12

- Initial release
- Cross-platform SSH client with GPU-accelerated rendering
- WebGL2 terminal renderer via beamterm
- Ghostty VT100 parser integration
- Native text selection support
- Theme support with multiple built-in themes
- Local encrypted storage for credentials
- terX Cloud storage option with E2E encryption

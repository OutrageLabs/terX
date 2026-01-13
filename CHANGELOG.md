# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

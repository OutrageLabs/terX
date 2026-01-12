#!/bin/bash
# Cross-compile terX for Linux x86_64 using Docker
# Usage: ./scripts/build-linux.sh

set -e

echo "🐧 Building terX for Linux x86_64..."

docker run --rm \
  -v "$(pwd):/app" \
  -w /app \
  rust:bookworm \
  bash -c "
    set -e
    echo '📦 Installing dependencies...'
    apt-get update -qq
    apt-get install -y -qq \
      libwebkit2gtk-4.1-dev \
      libgtk-3-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      patchelf \
      curl \
      unzip \
      > /dev/null

    echo '🍞 Installing Bun...'
    curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1
    export PATH=~/.bun/bin:\$PATH

    echo '🦀 Installing Tauri CLI...'
    cargo install tauri-cli --locked -q

    echo '📥 Installing frontend dependencies...'
    bun install --frozen-lockfile

    echo '🔨 Building...'
    cargo tauri build

    echo '✅ Done! Output in src-tauri/target/release/bundle/'
  "

echo ""
echo "📦 Linux builds:"
ls -la src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null || true
ls -la src-tauri/target/release/bundle/deb/*.deb 2>/dev/null || true

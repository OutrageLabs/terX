# Installation Guide

## macOS

### Download
1. Download the latest `.dmg` file from [Releases](https://github.com/OutrageLabs/terX/releases/latest)
2. Open the `.dmg` file
3. Drag **terX** to your Applications folder

### First Launch
On first launch, macOS may show a security warning because terX is not signed with an Apple Developer certificate.

**To open terX:**
1. Right-click (or Ctrl+click) on terX in Applications
2. Select "Open" from the context menu
3. Click "Open" in the dialog that appears

You only need to do this once. Future launches will work normally.

### System Requirements
- macOS 11 (Big Sur) or later
- Apple Silicon (M1/M2/M3/M4) recommended

---

## Windows

### Download
1. Download the latest `.exe` installer from [Releases](https://github.com/OutrageLabs/terX/releases/latest)
2. Run the installer
3. Follow the installation wizard

### Windows Defender SmartScreen
On first run, Windows may show a SmartScreen warning. Click "More info" and then "Run anyway".

### System Requirements
- Windows 10 or later
- x64 architecture

---

## Linux

### AppImage (Recommended)

```bash
# Download the AppImage
wget https://github.com/OutrageLabs/terX/releases/latest/download/terx_0.2.4_amd64.AppImage

# Make it executable
chmod +x terx_*.AppImage

# Run
./terx_*.AppImage
```

### Debian/Ubuntu (.deb)

```bash
# Download the .deb package
wget https://github.com/OutrageLabs/terX/releases/latest/download/terx_0.2.4_amd64.deb

# Install
sudo dpkg -i terx_*.deb

# Fix dependencies if needed
sudo apt-get install -f
```

### System Requirements
- Ubuntu 20.04 or equivalent
- x64 architecture
- WebKit2GTK 4.1

---

## Troubleshooting

### "App is damaged" on macOS
Run this command in Terminal:
```bash
xattr -cr /Applications/terX.app
```

### Missing libraries on Linux
Install required dependencies:
```bash
sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0
```

### Graphics issues
terX requires WebGL2 support. Update your graphics drivers if you experience rendering issues.

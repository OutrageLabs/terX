# Frequently Asked Questions

## General

### Is terX free?
Yes, terX is free to download and use. There are no ads or subscriptions.

### Is my data secure?
Yes. All credentials are encrypted with AES-256-GCM using PBKDF2 key derivation. Your master password is never stored - it's used only to derive encryption keys. Even with terX Cloud sync, data is encrypted client-side before being sent to servers.

### What platforms are supported?
- macOS (Apple Silicon)
- Windows (x64)
- Linux (x64)

### Can I build from source?
The source code is not publicly available. terX is distributed as binary releases only.

---

## Connection Issues

### "Host key verification failed"
This can happen if:
1. **First connection**: terX doesn't have the host key stored yet. Verify the fingerprint and accept it.
2. **Key changed**: The server's host key changed (possible MITM attack or server reinstall). Verify with your server admin.

### "Connection refused"
Check that:
- The hostname/IP is correct
- SSH server is running on the target machine
- Port 22 (or your custom port) is open
- No firewall blocking the connection

### "Authentication failed"
- Verify username and password
- For SSH keys, ensure the key format is supported (OpenSSH, PEM, PKCS8)
- Check if the key requires a passphrase

### Connection keeps dropping
terX includes SSH keepalive by default. If connections still drop:
- Check your network stability
- Your server may have aggressive timeout settings

---

## Display Issues

### Characters look wrong / boxes appearing
Ensure you have a Nerd Font installed. terX bundles FiraCode Nerd Font and Hack Nerd Font, but you can configure a custom font in settings.

### Text is blurry
terX uses WebGL2 for rendering. On high-DPI displays, ensure your system scaling is set correctly. Try adjusting the font size in settings.

### Terminal colors look wrong
Try changing the theme in Settings (`Ctrl/Cmd+,`). Different themes have different color palettes.

---

## File Manager

### SFTP is slow
SFTP performance depends on:
- Network latency to the server
- Server's SFTP subsystem performance
- File sizes and count

For large transfers, consider using `rsync` or `scp` directly in the terminal.

### Can't see hidden files
Hidden files (starting with `.`) are shown by default. If they're not visible, check the file manager settings.

---

## Storage

### I forgot my master password
Unfortunately, there is no way to recover data encrypted with a forgotten master password. This is by design - we cannot access your encrypted data.

**Recommendation:** Keep a secure backup of your master password.

### Can I export my hosts?
Currently, there's no built-in export function. This feature is planned for a future release.

### How do I migrate from local to cloud storage?
1. Note down your host configurations
2. Sign up for terX Cloud
3. Re-enter your hosts in the new storage mode

---

## Other

### How do I report a bug?
Open an issue on [GitHub Issues](https://github.com/OutrageLabs/terX/issues) using the bug report template.

### How do I request a feature?
Open an issue on [GitHub Issues](https://github.com/OutrageLabs/terX/issues) using the feature request template.

### Where are settings stored?
- **macOS**: `~/Library/Application Support/com.outragelabs.terx/`
- **Windows**: `%APPDATA%\com.outragelabs.terx\`
- **Linux**: `~/.config/com.outragelabs.terx/`

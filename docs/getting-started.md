# Getting Started

## First Launch

When you first open terX, you'll be asked to choose a storage mode:

### Storage Options

| Mode | Description |
|------|-------------|
| **Local Storage** | All data stored encrypted on your computer. Best for single-device use. |
| **terX Cloud** | Sync your hosts across devices. Requires account creation. |

Both options use AES-256-GCM encryption. Your master password is never stored.

## Setting Up Your Master Password

After choosing storage mode, create a master password:
- Used to encrypt all your credentials
- Required each time you open terX
- Cannot be recovered if forgotten

**Tip:** Use a strong, memorable password.

## Adding Your First Host

1. Click the **+** button in the sidebar (or press `Ctrl/Cmd+N`)
2. Fill in the connection details:
   - **Name**: Display name for this host
   - **Host**: Hostname or IP address
   - **Port**: SSH port (default: 22)
   - **Username**: Your SSH username
3. Choose authentication method:
   - **Password**: Enter password (stored encrypted)
   - **SSH Key**: Select or paste your private key
4. Click **Save**

## Connecting

Click on any host in the sidebar to connect. The terminal will open and you'll see the SSH session.

### Host Key Verification
On first connection to a new host, terX will show the server's host key fingerprint. Verify this matches your server's key and click "Accept" to save it.

## Using Multiple Tabs

- **New tab to same host**: `Ctrl/Cmd+T`
- **Switch tabs**: `Ctrl+Tab` / `Ctrl+Shift+Tab`
- **Close tab**: `Ctrl/Cmd+W`

## File Manager (SFTP)

Press `F5` while connected to open the dual-pane file manager:
- **Left pane**: Local filesystem
- **Right pane**: Remote server (SFTP)

File operations:
- **F5**: Copy selected files
- **F6**: Move selected files
- **F7**: Create directory
- **F8**: Delete selected files
- **F2**: Rename

## Keyboard Shortcuts

Press `F1` to see all available keyboard shortcuts.

## Next Steps

- [Keyboard Shortcuts](keyboard-shortcuts.md) - Full shortcut reference
- [FAQ](faq.md) - Common questions and answers

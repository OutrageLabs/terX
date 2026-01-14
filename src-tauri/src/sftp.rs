// sftp.rs
// SFTP client for file manager - uses existing SSH session

use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// File entry information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(rename = "isSymlink")]
    pub is_symlink: bool,
    pub size: u64,
    pub modified: Option<i64>, // Unix timestamp in seconds
    pub permissions: Option<u32>,
}

/// Directory listing result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub path: String,
    pub entries: Vec<FileEntry>,
}

/// Transfer progress information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub id: String,
    pub source: String,
    pub destination: String,
    pub direction: TransferDirection,
    #[serde(rename = "totalBytes")]
    pub total_bytes: u64,
    #[serde(rename = "transferredBytes")]
    pub transferred_bytes: u64,
    pub status: TransferStatus,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransferDirection {
    Upload,
    Download,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransferStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

// ============================================================================
// SFTP Operations
// ============================================================================

/// List directory contents
pub async fn list_dir(sftp: &SftpSession, path: &str) -> Result<DirectoryListing, SftpError> {
    let resolved_path = if path == "~" || path.is_empty() {
        // Get home directory
        sftp.canonicalize(".")
            .await
            .map_err(|e| SftpError::Protocol(e.to_string()))?
    } else {
        path.to_string()
    };

    let mut entries = Vec::new();
    let dir = sftp
        .read_dir(&resolved_path)
        .await
        .map_err(|e| SftpError::Protocol(format!("Failed to read directory {}: {}", resolved_path, e)))?;

    // ReadDir is a synchronous iterator
    for entry in dir {
        let file_name = entry.file_name();

        // Skip . and ..
        if file_name == "." || file_name == ".." {
            continue;
        }

        let metadata = entry.metadata();
        let file_path = if resolved_path.ends_with('/') {
            format!("{}{}", resolved_path, file_name)
        } else {
            format!("{}/{}", resolved_path, file_name)
        };

        entries.push(FileEntry {
            name: file_name,
            path: file_path,
            is_dir: metadata.is_dir(),
            is_symlink: metadata.is_symlink(),
            size: metadata.size.unwrap_or(0),
            modified: metadata.mtime.map(|t| t as i64),
            permissions: metadata.permissions,
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(DirectoryListing {
        path: resolved_path,
        entries,
    })
}

/// Create directory
pub async fn mkdir(sftp: &SftpSession, path: &str) -> Result<(), SftpError> {
    sftp.create_dir(path)
        .await
        .map_err(|e| SftpError::Protocol(format!("Failed to create directory {}: {}", path, e)))
}

/// Remove file or directory
pub async fn remove(sftp: &SftpSession, path: &str, recursive: bool) -> Result<(), SftpError> {
    let metadata = sftp
        .metadata(path)
        .await
        .map_err(|e| SftpError::Protocol(format!("Failed to get metadata for {}: {}", path, e)))?;

    if metadata.is_dir() {
        if recursive {
            remove_dir_recursive(sftp, path).await?;
        } else {
            sftp.remove_dir(path)
                .await
                .map_err(|e| SftpError::Protocol(format!("Failed to remove directory {}: {}", path, e)))?;
        }
    } else {
        sftp.remove_file(path)
            .await
            .map_err(|e| SftpError::Protocol(format!("Failed to remove file {}: {}", path, e)))?;
    }

    Ok(())
}

/// Recursively remove directory
async fn remove_dir_recursive(sftp: &SftpSession, path: &str) -> Result<(), SftpError> {
    let dir = sftp
        .read_dir(path)
        .await
        .map_err(|e| SftpError::Protocol(e.to_string()))?;

    // Collect entries first to avoid holding iterator across await points
    let entries: Vec<_> = dir.collect();

    for entry in entries {
        let file_name = entry.file_name();

        if file_name == "." || file_name == ".." {
            continue;
        }

        let full_path = format!("{}/{}", path, file_name);
        let metadata = entry.metadata();

        if metadata.is_dir() {
            Box::pin(remove_dir_recursive(sftp, &full_path)).await?;
        } else {
            sftp.remove_file(&full_path)
                .await
                .map_err(|e| SftpError::Protocol(e.to_string()))?;
        }
    }

    sftp.remove_dir(path)
        .await
        .map_err(|e| SftpError::Protocol(format!("Failed to remove directory {}: {}", path, e)))
}

/// Rename/move file or directory
pub async fn rename(sftp: &SftpSession, old_path: &str, new_path: &str) -> Result<(), SftpError> {
    sftp.rename(old_path, new_path)
        .await
        .map_err(|e| SftpError::Protocol(format!("Failed to rename {} to {}: {}", old_path, new_path, e)))
}

/// Download file from remote to local
pub async fn download(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &str,
    transfer_id: &str,
    cancel_rx: &mut tokio::sync::watch::Receiver<bool>,
    progress_callback: impl Fn(TransferProgress),
) -> Result<(), SftpError> {
    // Get file size
    let metadata = sftp
        .metadata(remote_path)
        .await
        .map_err(|e| SftpError::Protocol(format!("Failed to get metadata: {}", e)))?;

    let total_bytes = metadata.size.unwrap_or(0);

    // Open remote file
    let mut remote_file = sftp
        .open(remote_path)
        .await
        .map_err(|e| SftpError::Protocol(format!("Failed to open remote file: {}", e)))?;

    // Create local file
    let mut local_file = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to create local file: {}", e)))?;

    let mut transferred: u64 = 0;
    let mut buffer = vec![0u8; 64 * 1024]; // 64KB chunks

    loop {
        // Check for cancellation
        if *cancel_rx.borrow() {
            // Clean up partial file
            let _ = tokio::fs::remove_file(local_path).await;
            return Err(SftpError::Cancelled);
        }

        let n = remote_file
            .read(&mut buffer)
            .await
            .map_err(|e| SftpError::Io(format!("Read error: {}", e)))?;

        if n == 0 {
            break;
        }

        local_file
            .write_all(&buffer[..n])
            .await
            .map_err(|e| SftpError::Io(format!("Write error: {}", e)))?;

        transferred += n as u64;

        // Report progress
        progress_callback(TransferProgress {
            id: transfer_id.to_string(),
            source: remote_path.to_string(),
            destination: local_path.to_string(),
            direction: TransferDirection::Download,
            total_bytes,
            transferred_bytes: transferred,
            status: TransferStatus::InProgress,
            error: None,
        });
    }

    local_file.flush().await.map_err(|e| SftpError::Io(e.to_string()))?;

    Ok(())
}

/// Upload file from local to remote
pub async fn upload(
    sftp: &SftpSession,
    local_path: &str,
    remote_path: &str,
    transfer_id: &str,
    cancel_rx: &mut tokio::sync::watch::Receiver<bool>,
    progress_callback: impl Fn(TransferProgress),
) -> Result<(), SftpError> {
    // Get local file size
    let local_metadata = tokio::fs::metadata(local_path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to get local file metadata: {}", e)))?;

    let total_bytes = local_metadata.len();

    // Open local file
    let mut local_file = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to open local file: {}", e)))?;

    // Create remote file
    let mut remote_file = sftp
        .create(remote_path)
        .await
        .map_err(|e| SftpError::Protocol(format!("Failed to create remote file: {}", e)))?;

    let mut transferred: u64 = 0;
    let mut buffer = vec![0u8; 64 * 1024]; // 64KB chunks

    loop {
        // Check for cancellation
        if *cancel_rx.borrow() {
            // Clean up partial remote file
            let _ = sftp.remove_file(remote_path).await;
            return Err(SftpError::Cancelled);
        }

        let n = local_file
            .read(&mut buffer)
            .await
            .map_err(|e| SftpError::Io(format!("Read error: {}", e)))?;

        if n == 0 {
            break;
        }

        remote_file
            .write_all(&buffer[..n])
            .await
            .map_err(|e| SftpError::Io(format!("Write error: {}", e)))?;

        transferred += n as u64;

        // Report progress
        progress_callback(TransferProgress {
            id: transfer_id.to_string(),
            source: local_path.to_string(),
            destination: remote_path.to_string(),
            direction: TransferDirection::Upload,
            total_bytes,
            transferred_bytes: transferred,
            status: TransferStatus::InProgress,
            error: None,
        });
    }

    remote_file.flush().await.map_err(|e| SftpError::Io(e.to_string()))?;
    remote_file.shutdown().await.map_err(|e| SftpError::Io(e.to_string()))?;

    Ok(())
}

/// Recursively download directory from remote to local
pub async fn download_dir(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &str,
    transfer_id: &str,
    cancel_rx: &mut tokio::sync::watch::Receiver<bool>,
    progress_callback: impl Fn(TransferProgress) + Clone,
) -> Result<(), SftpError> {
    // 1. Create local directory
    tokio::fs::create_dir_all(local_path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to create dir {}: {}", local_path, e)))?;

    // 2. List remote directory
    let listing = list_dir(sftp, remote_path).await?;

    // 3. Process each entry
    for entry in listing.entries {
        if *cancel_rx.borrow() {
            return Err(SftpError::Cancelled);
        }

        let remote = format!("{}/{}", remote_path, entry.name);
        let local = format!("{}/{}", local_path, entry.name);

        if entry.is_dir {
            Box::pin(download_dir(sftp, &remote, &local, transfer_id, cancel_rx, progress_callback.clone())).await?;
        } else {
            download(sftp, &remote, &local, transfer_id, cancel_rx, &progress_callback).await?;
        }
    }
    Ok(())
}

/// Recursively upload directory from local to remote
pub async fn upload_dir(
    sftp: &SftpSession,
    local_path: &str,
    remote_path: &str,
    transfer_id: &str,
    cancel_rx: &mut tokio::sync::watch::Receiver<bool>,
    progress_callback: impl Fn(TransferProgress) + Clone,
) -> Result<(), SftpError> {
    // 1. Create remote directory (ignore error if exists)
    let _ = sftp.create_dir(remote_path).await;

    // 2. List local directory
    let mut dir = tokio::fs::read_dir(local_path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to read dir {}: {}", local_path, e)))?;

    // 3. Process each entry
    while let Some(entry) = dir.next_entry().await.map_err(|e| SftpError::Io(e.to_string()))? {
        if *cancel_rx.borrow() {
            return Err(SftpError::Cancelled);
        }

        let local = entry.path().to_string_lossy().to_string();
        let name = entry.file_name().to_string_lossy().to_string();
        let remote = format!("{}/{}", remote_path, name);
        let file_type = entry.file_type().await.map_err(|e| SftpError::Io(e.to_string()))?;

        if file_type.is_dir() {
            Box::pin(upload_dir(sftp, &local, &remote, transfer_id, cancel_rx, progress_callback.clone())).await?;
        } else {
            upload(sftp, &local, &remote, transfer_id, cancel_rx, &progress_callback).await?;
        }
    }
    Ok(())
}

// ============================================================================
// Local Filesystem Operations
// ============================================================================

/// List local directory contents
pub async fn local_list_dir(path: &str) -> Result<DirectoryListing, SftpError> {
    let resolved_path = if path == "~" || path.is_empty() {
        dirs::home_dir()
            .ok_or_else(|| SftpError::Io("Cannot determine home directory".to_string()))?
            .to_string_lossy()
            .to_string()
    } else {
        path.to_string()
    };

    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(&resolved_path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to read directory {}: {}", resolved_path, e)))?;

    while let Some(entry) = dir.next_entry().await.map_err(|e| SftpError::Io(e.to_string()))? {
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_path = entry.path().to_string_lossy().to_string();

        let metadata = entry.metadata().await.map_err(|e| SftpError::Io(e.to_string()))?;
        let file_type = entry.file_type().await.map_err(|e| SftpError::Io(e.to_string()))?;

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64);

        #[cfg(unix)]
        let permissions = {
            use std::os::unix::fs::PermissionsExt;
            Some(metadata.permissions().mode())
        };
        #[cfg(not(unix))]
        let permissions = None;

        entries.push(FileEntry {
            name: file_name,
            path: file_path,
            is_dir: file_type.is_dir(),
            is_symlink: file_type.is_symlink(),
            size: metadata.len(),
            modified,
            permissions,
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(DirectoryListing {
        path: resolved_path,
        entries,
    })
}

/// Get home directory path
pub fn local_get_home_dir() -> Result<String, SftpError> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| SftpError::Io("Cannot determine home directory".to_string()))
}

/// Create local directory
pub async fn local_mkdir(path: &str) -> Result<(), SftpError> {
    tokio::fs::create_dir_all(path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to create directory: {}", e)))
}

/// Remove local file or directory
pub async fn local_remove(path: &str, recursive: bool) -> Result<(), SftpError> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to get metadata: {}", e)))?;

    if metadata.is_dir() {
        if recursive {
            tokio::fs::remove_dir_all(path)
                .await
                .map_err(|e| SftpError::Io(format!("Failed to remove directory: {}", e)))?;
        } else {
            tokio::fs::remove_dir(path)
                .await
                .map_err(|e| SftpError::Io(format!("Failed to remove directory: {}", e)))?;
        }
    } else {
        tokio::fs::remove_file(path)
            .await
            .map_err(|e| SftpError::Io(format!("Failed to remove file: {}", e)))?;
    }

    Ok(())
}

/// Rename/move local file or directory
pub async fn local_rename(old_path: &str, new_path: &str) -> Result<(), SftpError> {
    tokio::fs::rename(old_path, new_path)
        .await
        .map_err(|e| SftpError::Io(format!("Failed to rename: {}", e)))
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, thiserror::Error)]
#[allow(dead_code)]
pub enum SftpError {
    #[error("Channel error: {0}")]
    Channel(String),
    #[error("Protocol error: {0}")]
    Protocol(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("Transfer cancelled")]
    Cancelled,
    #[error("Session not found")]
    SessionNotFound,
}

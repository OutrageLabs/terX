mod credentials;
mod sftp;
mod ssh;

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, Mutex};

// Application state for SSH sessions
pub struct AppState {
    // Active SSH sessions (session_id -> write sender)
    ssh_sessions: Mutex<HashMap<String, SshSessionHandle>>,
    // Active SFTP sessions (sftp_session_id -> SFTP handle)
    sftp_sessions: Mutex<HashMap<String, SftpSessionHandle>>,
    // Active transfers (transfer_id -> cancel sender)
    active_transfers: Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>,
    // Credentials manager
    credentials: Mutex<credentials::CredentialsManager>,
}

struct SshSessionHandle {
    write_tx: mpsc::Sender<Vec<u8>>,
    resize_tx: mpsc::Sender<(u32, u32)>,
    // SSH handle for creating additional channels (SFTP)
    ssh_handle: Arc<russh::client::Handle<ssh::SshHandler>>,
}

struct SftpSessionHandle {
    sftp: Arc<russh_sftp::client::SftpSession>,
    #[allow(dead_code)] // Kept for future use (e.g., closing SSH when SFTP closes)
    ssh_session_id: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            ssh_sessions: Mutex::new(HashMap::new()),
            sftp_sessions: Mutex::new(HashMap::new()),
            active_transfers: Mutex::new(HashMap::new()),
            credentials: Mutex::new(credentials::CredentialsManager::new()),
        }
    }
}

#[tauri::command]
fn app_exit(app: AppHandle) {
    app.exit(0);
}

/// System info structure for debug panel
#[derive(serde::Serialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub arch: String,
    pub hostname: String,
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let os_name = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    // Get OS version
    let os_version = if cfg!(target_os = "macos") {
        // Use sw_vers on macOS
        std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    } else if cfg!(target_os = "linux") {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|s| {
                s.lines()
                    .find(|l| l.starts_with("PRETTY_NAME="))
                    .map(|l| l.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
            })
            .unwrap_or_else(|| "Linux".to_string())
    } else if cfg!(target_os = "windows") {
        "Windows".to_string()
    } else {
        "unknown".to_string()
    };

    let hostname = hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "unknown".to_string());

    SystemInfo {
        os_name,
        os_version,
        arch,
        hostname,
    }
}

// ============================================================================
// Local Storage Commands (new storage system)
// ============================================================================

/// App configuration structure
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AppConfig {
    pub mode: String,
    pub locale: String,
    pub theme: String,
    #[serde(rename = "uiFontSize", default = "default_ui_font_size")]
    pub ui_font_size: i32,
    #[serde(rename = "terminalFontFamily", default = "default_terminal_font_family")]
    pub terminal_font_family: String,
    #[serde(rename = "terminalFontSize", default = "default_terminal_font_size")]
    pub terminal_font_size: i32,
    // Legacy - kept for backwards compatibility
    #[serde(rename = "fontSize", skip_serializing_if = "Option::is_none")]
    pub font_size: Option<i32>,
    #[serde(rename = "ownSupabase")]
    pub own_supabase: Option<OwnSupabaseConfig>,
}

fn default_ui_font_size() -> i32 { 14 }
fn default_terminal_font_family() -> String { "fira-code".to_string() }
fn default_terminal_font_size() -> i32 { 15 }

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct OwnSupabaseConfig {
    pub url: Option<String>,
    pub key: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            mode: String::new(),  // Empty = first run, show storage selector
            locale: "en-US".to_string(),
            theme: "catppuccin-mocha".to_string(),
            ui_font_size: 14,
            terminal_font_family: "fira-code".to_string(),
            terminal_font_size: 15,
            font_size: None,
            own_supabase: None,
        }
    }
}

/// Get config directory path (Tauri app config dir)
fn get_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    // Create directory if it doesn't exist
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    Ok(config_dir)
}

/// Get terX storage directory path (~/.config/terx/)
fn get_terx_storage_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

    let storage_dir = home_dir.join(".config").join("terx");

    // Create directory if it doesn't exist
    if !storage_dir.exists() {
        fs::create_dir_all(&storage_dir)
            .map_err(|e| format!("Failed to create terx config dir: {}", e))?;
    }

    Ok(storage_dir)
}

/// Get storage file path (~/.config/terx/storage.json)
fn get_storage_path() -> Result<PathBuf, String> {
    Ok(get_terx_storage_dir()?.join("storage.json"))
}

/// Load app configuration
#[tauri::command]
fn config_load(app: AppHandle) -> Result<AppConfig, String> {
    let config_dir = get_config_dir(&app)?;
    let config_path = config_dir.join("config.json");

    if !config_path.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: AppConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config)
}

/// Save app configuration
#[tauri::command]
fn config_save(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let config_dir = get_config_dir(&app)?;
    let config_path = config_dir.join("config.json");

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// Check if local storage data exists (~/.config/terx/storage.json)
#[tauri::command]
fn local_storage_exists() -> bool {
    match get_storage_path() {
        Ok(path) => path.exists() && fs::metadata(&path).map(|m| m.len() > 0).unwrap_or(false),
        Err(_) => false,
    }
}

/// Load local storage data (encrypted string from ~/.config/terx/storage.json)
#[tauri::command]
fn local_storage_load() -> Result<String, String> {
    let data_path = get_storage_path()?;

    if !data_path.exists() {
        return Ok(String::new());
    }

    let content = fs::read_to_string(&data_path)
        .map_err(|e| format!("Failed to read local data: {}", e))?;

    Ok(content)
}

/// Save local storage data (encrypted string to ~/.config/terx/storage.json)
#[tauri::command]
fn local_storage_save(data: String) -> Result<(), String> {
    let data_path = get_storage_path()?;

    fs::write(&data_path, data)
        .map_err(|e| format!("Failed to write local data: {}", e))?;

    Ok(())
}

/// Move storage file to backup (~/.config/terx/storage.json -> storage.json.bak)
#[tauri::command]
fn local_storage_backup() -> Result<(), String> {
    let data_path = get_storage_path()?;

    if !data_path.exists() {
        return Ok(());
    }

    let backup_path = get_terx_storage_dir()?.join("storage.json.bak");

    // Remove old backup if exists
    if backup_path.exists() {
        fs::remove_file(&backup_path)
            .map_err(|e| format!("Failed to remove old backup: {}", e))?;
    }

    // Move current file to backup
    fs::rename(&data_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    Ok(())
}

/// Get storage file path (for display purposes)
#[tauri::command]
fn local_storage_path() -> Result<String, String> {
    Ok(get_storage_path()?.to_string_lossy().to_string())
}

// ============================================================================
// SSH Commands
// ============================================================================

/// Host structure to return to frontend
#[derive(serde::Serialize)]
pub struct HostInfo {
    pub name: String,
    pub description: String,
    pub ip: String,
    pub port: String,
    pub login: String,
}

/// Set credentials for sshManager API
#[tauri::command]
async fn credentials_set(
    state: State<'_, Arc<AppState>>,
    api_key: String,
    master_password: String,
) -> Result<(), String> {
    let mut credentials = state.credentials.lock().await;
    credentials.set_credentials(api_key, &master_password);
    Ok(())
}

/// Set only master password (local mode without API)
#[tauri::command]
async fn credentials_set_master_password(
    state: State<'_, Arc<AppState>>,
    master_password: String,
) -> Result<(), String> {
    let mut credentials = state.credentials.lock().await;
    credentials.set_master_password(&master_password);
    Ok(())
}

/// Sync credentials with sshManager API
#[tauri::command]
async fn credentials_sync(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut credentials = state.credentials.lock().await;
    credentials
        .sync_from_api()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns list of hosts
#[tauri::command]
async fn credentials_list_hosts(state: State<'_, Arc<AppState>>) -> Result<Vec<HostInfo>, String> {
    let credentials = state.credentials.lock().await;
    let hosts: Vec<HostInfo> = credentials
        .hosts()
        .iter()
        .map(|h| HostInfo {
            name: h.name.clone(),
            description: h.description.clone(),
            ip: h.ip.clone(),
            port: h.port.clone(),
            login: h.login.clone(),
        })
        .collect();
    Ok(hosts)
}

/// Load local configuration
#[tauri::command]
async fn credentials_load(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut credentials = state.credentials.lock().await;
    credentials.load_config().map_err(|e| e.to_string())?;
    Ok(())
}

/// Connect via SSH to host
#[tauri::command]
async fn ssh_connect(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    key_path: Option<String>,
    key_data: Option<String>,
    key_passphrase: Option<String>,
    terminal_type: Option<String>,
    cols: Option<u32>,
    rows: Option<u32>,
) -> Result<String, String> {
    use uuid::Uuid;

    let session_id = Uuid::new_v4().to_string();
    let term_type = terminal_type.unwrap_or_else(|| "xterm-ghostty".to_string());
    let cols = cols.unwrap_or(80);
    let rows = rows.unwrap_or(24);

    // Determine authentication method
    // Priority: key_data > key_path > password
    let auth = if let Some(data) = key_data {
        // SSH key data (content of private key)
        ssh::AuthMethod::Key {
            key_data: data,
            passphrase: key_passphrase,
        }
    } else if let Some(key) = key_path {
        // SSH key file path
        ssh::AuthMethod::KeyFile {
            path: key,
            passphrase: key_passphrase,
        }
    } else if let Some(pass) = password {
        ssh::AuthMethod::Password(pass)
    } else {
        return Err("No authentication method provided".to_string());
    };

    // Connect
    let (session, channels, close_signal) = ssh::SshSession::connect(&host, port, &username, auth, &term_type, cols, rows)
        .await
        .map_err(|e| e.to_string())?;

    // Get SSH handle for SFTP before moving session
    let ssh_handle = session.handle();

    // Save session handle (using channels from ssh.rs)
    {
        let mut sessions = state.ssh_sessions.lock().await;
        sessions.insert(
            session_id.clone(),
            SshSessionHandle {
                write_tx: channels.input_tx.clone(),
                resize_tx: channels.resize_tx.clone(),
                ssh_handle,
            },
        );
    }

    // Start session handler task
    let sid = session_id.clone();
    let app_handle = app.clone();
    let state_clone = state.inner().clone();

    tokio::spawn(async move {
        let mut session = session;
        let mut close_signal = close_signal;

        loop {
            tokio::select! {
                // Data from server
                Some(data) = session.recv() => {
                    // Send to frontend
                    let _ = app_handle.emit(&format!("ssh-data-{}", sid), data);
                }

                // Session close signal (EOF/close from server)
                _ = close_signal.wait() => {
                    log::info!("SSH session {} received close signal", sid);
                    break;
                }
            }
        }

        // Remove session from state
        {
            let mut sessions = state_clone.ssh_sessions.lock().await;
            sessions.remove(&sid);
        }

        // Notify frontend about disconnect
        let _ = app_handle.emit(&format!("ssh-closed-{}", sid), ());

        log::info!("SSH session {} closed", sid);
    });

    Ok(session_id)
}

/// Send data to SSH session
#[tauri::command]
async fn ssh_write(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let write_tx = {
        let sessions = state.ssh_sessions.lock().await;
        sessions
            .get(&session_id)
            .map(|h| h.write_tx.clone())
            .ok_or_else(|| "Session not found".to_string())?
    };
    write_tx.send(data).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Change SSH terminal size
#[tauri::command]
async fn ssh_resize(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let resize_tx = {
        let sessions = state.ssh_sessions.lock().await;
        sessions
            .get(&session_id)
            .map(|h| h.resize_tx.clone())
            .ok_or_else(|| "Session not found".to_string())?
    };
    resize_tx.send((cols, rows)).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Disconnect SSH session
#[tauri::command]
async fn ssh_disconnect(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.ssh_sessions.lock().await;
    if sessions.remove(&session_id).is_some() {
        log::info!("SSH session {} disconnected by user", session_id);
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

/// Connect via SSH to host from local configuration (by name)
#[tauri::command]
async fn ssh_connect_host(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    host_name: String,
    cols: Option<u32>,
    rows: Option<u32>,
) -> Result<String, String> {
    use uuid::Uuid;

    let session_id = Uuid::new_v4().to_string();
    let cols = cols.unwrap_or(80);
    let rows = rows.unwrap_or(24);

    // Find host and connect
    let (session, channels, close_signal) = {
        let credentials = state.credentials.lock().await;

        // Find host by name
        let host = credentials
            .hosts()
            .iter()
            .find(|h| h.name == host_name)
            .ok_or_else(|| format!("Host '{}' not found", host_name))?
            .clone();

        // Use existing connect_from_host function
        ssh::connect_from_host(&host, &credentials, None, cols, rows)
            .await
            .map_err(|e| e.to_string())?
    };

    // Get SSH handle for SFTP before moving session
    let ssh_handle = session.handle();

    // Save session handle (using channels from ssh.rs)
    {
        let mut sessions = state.ssh_sessions.lock().await;
        sessions.insert(
            session_id.clone(),
            SshSessionHandle {
                write_tx: channels.input_tx.clone(),
                resize_tx: channels.resize_tx.clone(),
                ssh_handle,
            },
        );
    }

    // Start session handler task
    let sid = session_id.clone();
    let app_handle = app.clone();
    let state_clone = state.inner().clone();

    tokio::spawn(async move {
        let mut session = session;
        let mut close_signal = close_signal;

        loop {
            tokio::select! {
                // Data from server
                Some(data) = session.recv() => {
                    // Send to frontend
                    let _ = app_handle.emit(&format!("ssh-data-{}", sid), data);
                }

                // Session close signal (EOF/close from server)
                _ = close_signal.wait() => {
                    log::info!("SSH session {} (host: {}) received close signal", sid, host_name);
                    break;
                }
            }
        }

        // Remove session from state
        {
            let mut sessions = state_clone.ssh_sessions.lock().await;
            sessions.remove(&sid);
        }

        // Notify frontend about disconnect
        let _ = app_handle.emit(&format!("ssh-closed-{}", sid), ());

        log::info!("SSH session {} (host: {}) closed", sid, host_name);
    });

    Ok(session_id)
}

// ============================================================================
// SFTP Commands
// ============================================================================

/// Open SFTP session on existing SSH connection
#[tauri::command]
async fn sftp_open(
    state: State<'_, Arc<AppState>>,
    ssh_session_id: String,
) -> Result<String, String> {
    use uuid::Uuid;

    // Get SSH handle from session
    let ssh_handle = {
        let sessions = state.ssh_sessions.lock().await;
        sessions
            .get(&ssh_session_id)
            .map(|h| h.ssh_handle.clone())
            .ok_or_else(|| format!("SSH session '{}' not found", ssh_session_id))?
    };

    // Create SFTP session
    let sftp = ssh::create_sftp_session(&ssh_handle)
        .await
        .map_err(|e| e.to_string())?;

    let sftp_session_id = Uuid::new_v4().to_string();

    // Store SFTP session wrapped in Arc
    {
        let mut sftp_sessions = state.sftp_sessions.lock().await;
        sftp_sessions.insert(
            sftp_session_id.clone(),
            SftpSessionHandle {
                sftp: Arc::new(sftp),
                ssh_session_id,
            },
        );
    }

    log::info!("SFTP session {} opened", sftp_session_id);
    Ok(sftp_session_id)
}

/// Close SFTP session
#[tauri::command]
async fn sftp_close(
    state: State<'_, Arc<AppState>>,
    sftp_session_id: String,
) -> Result<(), String> {
    let mut sftp_sessions = state.sftp_sessions.lock().await;
    if sftp_sessions.remove(&sftp_session_id).is_some() {
        log::info!("SFTP session {} closed", sftp_session_id);
        Ok(())
    } else {
        Err(format!("SFTP session '{}' not found", sftp_session_id))
    }
}

/// List remote directory
#[tauri::command]
async fn sftp_list_dir(
    state: State<'_, Arc<AppState>>,
    sftp_session_id: String,
    path: String,
) -> Result<sftp::DirectoryListing, String> {
    let sftp_sessions = state.sftp_sessions.lock().await;
    let handle = sftp_sessions
        .get(&sftp_session_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_session_id))?;

    sftp::list_dir(&handle.sftp, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Create remote directory
#[tauri::command]
async fn sftp_mkdir(
    state: State<'_, Arc<AppState>>,
    sftp_session_id: String,
    path: String,
) -> Result<(), String> {
    let sftp_sessions = state.sftp_sessions.lock().await;
    let handle = sftp_sessions
        .get(&sftp_session_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_session_id))?;

    sftp::mkdir(&handle.sftp, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Remove remote file or directory
#[tauri::command]
async fn sftp_remove(
    state: State<'_, Arc<AppState>>,
    sftp_session_id: String,
    path: String,
    recursive: bool,
) -> Result<(), String> {
    let sftp_sessions = state.sftp_sessions.lock().await;
    let handle = sftp_sessions
        .get(&sftp_session_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_session_id))?;

    sftp::remove(&handle.sftp, &path, recursive)
        .await
        .map_err(|e| e.to_string())
}

/// Rename remote file or directory
#[tauri::command]
async fn sftp_rename(
    state: State<'_, Arc<AppState>>,
    sftp_session_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let sftp_sessions = state.sftp_sessions.lock().await;
    let handle = sftp_sessions
        .get(&sftp_session_id)
        .ok_or_else(|| format!("SFTP session '{}' not found", sftp_session_id))?;

    sftp::rename(&handle.sftp, &old_path, &new_path)
        .await
        .map_err(|e| e.to_string())
}

/// Download file from remote to local
#[tauri::command]
async fn sftp_download(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    sftp_session_id: String,
    remote_path: String,
    local_path: String,
    transfer_id: String,
) -> Result<(), String> {
    // Create cancellation channel
    let (cancel_tx, mut cancel_rx) = tokio::sync::watch::channel(false);

    // Store cancel sender
    {
        let mut transfers = state.active_transfers.lock().await;
        transfers.insert(transfer_id.clone(), cancel_tx);
    }

    // Get SFTP session (need to clone for async block)
    let sftp = {
        let sftp_sessions = state.sftp_sessions.lock().await;
        let handle = sftp_sessions
            .get(&sftp_session_id)
            .ok_or_else(|| format!("SFTP session '{}' not found", sftp_session_id))?;
        handle.sftp.clone()
    };

    let app_clone = app.clone();
    let tid = transfer_id.clone();
    let rp = remote_path.clone();
    let lp = local_path.clone();
    let state_clone = state.inner().clone();

    // Spawn download task
    tokio::spawn(async move {
        // Check if it's a directory
        let is_dir = match sftp.metadata(&rp).await {
            Ok(m) => m.is_dir(),
            Err(_) => false,
        };

        let result = if is_dir {
            sftp::download_dir(
                &sftp,
                &rp,
                &lp,
                &tid,
                &mut cancel_rx,
                |progress| {
                    let _ = app_clone.emit(&format!("transfer-progress-{}", tid), &progress);
                },
            )
            .await
        } else {
            sftp::download(
                &sftp,
                &rp,
                &lp,
                &tid,
                &mut cancel_rx,
                |progress| {
                    let _ = app_clone.emit(&format!("transfer-progress-{}", tid), &progress);
                },
            )
            .await
        };

        // Remove from active transfers
        {
            let mut transfers = state_clone.active_transfers.lock().await;
            transfers.remove(&tid);
        }

        // Emit completion or error
        match result {
            Ok(_) => {
                let progress = sftp::TransferProgress {
                    id: tid.clone(),
                    source: rp,
                    destination: lp,
                    direction: sftp::TransferDirection::Download,
                    total_bytes: 0,
                    transferred_bytes: 0,
                    status: sftp::TransferStatus::Completed,
                    error: None,
                };
                let _ = app_clone.emit(&format!("transfer-complete-{}", tid), &progress);
            }
            Err(e) => {
                let progress = sftp::TransferProgress {
                    id: tid.clone(),
                    source: rp,
                    destination: lp,
                    direction: sftp::TransferDirection::Download,
                    total_bytes: 0,
                    transferred_bytes: 0,
                    status: if matches!(e, sftp::SftpError::Cancelled) {
                        sftp::TransferStatus::Cancelled
                    } else {
                        sftp::TransferStatus::Failed
                    },
                    error: Some(e.to_string()),
                };
                let _ = app_clone.emit(&format!("transfer-error-{}", tid), &progress);
            }
        }
    });

    Ok(())
}

/// Upload file from local to remote
#[tauri::command]
async fn sftp_upload(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    sftp_session_id: String,
    local_path: String,
    remote_path: String,
    transfer_id: String,
) -> Result<(), String> {
    // Create cancellation channel
    let (cancel_tx, mut cancel_rx) = tokio::sync::watch::channel(false);

    // Store cancel sender
    {
        let mut transfers = state.active_transfers.lock().await;
        transfers.insert(transfer_id.clone(), cancel_tx);
    }

    // Get SFTP session
    let sftp = {
        let sftp_sessions = state.sftp_sessions.lock().await;
        let handle = sftp_sessions
            .get(&sftp_session_id)
            .ok_or_else(|| format!("SFTP session '{}' not found", sftp_session_id))?;
        handle.sftp.clone()
    };

    let app_clone = app.clone();
    let tid = transfer_id.clone();
    let lp = local_path.clone();
    let rp = remote_path.clone();
    let state_clone = state.inner().clone();

    // Spawn upload task
    tokio::spawn(async move {
        // Check if it's a directory
        let is_dir = match tokio::fs::metadata(&lp).await {
            Ok(m) => m.is_dir(),
            Err(_) => false,
        };

        let result = if is_dir {
            sftp::upload_dir(
                &sftp,
                &lp,
                &rp,
                &tid,
                &mut cancel_rx,
                |progress| {
                    let _ = app_clone.emit(&format!("transfer-progress-{}", tid), &progress);
                },
            )
            .await
        } else {
            sftp::upload(
                &sftp,
                &lp,
                &rp,
                &tid,
                &mut cancel_rx,
                |progress| {
                    let _ = app_clone.emit(&format!("transfer-progress-{}", tid), &progress);
                },
            )
            .await
        };

        // Remove from active transfers
        {
            let mut transfers = state_clone.active_transfers.lock().await;
            transfers.remove(&tid);
        }

        // Emit completion or error
        match result {
            Ok(_) => {
                let progress = sftp::TransferProgress {
                    id: tid.clone(),
                    source: lp,
                    destination: rp,
                    direction: sftp::TransferDirection::Upload,
                    total_bytes: 0,
                    transferred_bytes: 0,
                    status: sftp::TransferStatus::Completed,
                    error: None,
                };
                let _ = app_clone.emit(&format!("transfer-complete-{}", tid), &progress);
            }
            Err(e) => {
                let progress = sftp::TransferProgress {
                    id: tid.clone(),
                    source: lp,
                    destination: rp,
                    direction: sftp::TransferDirection::Upload,
                    total_bytes: 0,
                    transferred_bytes: 0,
                    status: if matches!(e, sftp::SftpError::Cancelled) {
                        sftp::TransferStatus::Cancelled
                    } else {
                        sftp::TransferStatus::Failed
                    },
                    error: Some(e.to_string()),
                };
                let _ = app_clone.emit(&format!("transfer-error-{}", tid), &progress);
            }
        }
    });

    Ok(())
}

/// Cancel active transfer
#[tauri::command]
async fn sftp_cancel_transfer(
    state: State<'_, Arc<AppState>>,
    transfer_id: String,
) -> Result<(), String> {
    let transfers = state.active_transfers.lock().await;
    if let Some(cancel_tx) = transfers.get(&transfer_id) {
        let _ = cancel_tx.send(true);
        Ok(())
    } else {
        Err(format!("Transfer '{}' not found or already completed", transfer_id))
    }
}

// ============================================================================
// Local Filesystem Commands (for file manager)
// ============================================================================

/// List local directory
#[tauri::command]
async fn local_list_dir(path: String) -> Result<sftp::DirectoryListing, String> {
    sftp::local_list_dir(&path)
        .await
        .map_err(|e| e.to_string())
}

/// Get home directory
#[tauri::command]
fn local_get_home_dir() -> Result<String, String> {
    sftp::local_get_home_dir().map_err(|e| e.to_string())
}

/// Create local directory
#[tauri::command]
async fn local_mkdir(path: String) -> Result<(), String> {
    sftp::local_mkdir(&path)
        .await
        .map_err(|e| e.to_string())
}

/// Remove local file or directory
#[tauri::command]
async fn local_remove(path: String, recursive: bool) -> Result<(), String> {
    sftp::local_remove(&path, recursive)
        .await
        .map_err(|e| e.to_string())
}

/// Rename local file or directory
#[tauri::command]
async fn local_rename(old_path: String, new_path: String) -> Result<(), String> {
    sftp::local_rename(&old_path, &new_path)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// App Runner
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            // SSH
            ssh_connect,
            ssh_connect_host,
            ssh_write,
            ssh_resize,
            ssh_disconnect,
            // SFTP
            sftp_open,
            sftp_close,
            sftp_list_dir,
            sftp_mkdir,
            sftp_remove,
            sftp_rename,
            sftp_download,
            sftp_upload,
            sftp_cancel_transfer,
            // Local Filesystem (for file manager)
            local_list_dir,
            local_get_home_dir,
            local_mkdir,
            local_remove,
            local_rename,
            // Local Storage (new)
            config_load,
            config_save,
            local_storage_exists,
            local_storage_load,
            local_storage_save,
            local_storage_backup,
            local_storage_path,
            // Credentials (legacy - kept for backwards compatibility)
            credentials_set,
            credentials_set_master_password,
            credentials_sync,
            credentials_load,
            credentials_list_hosts,
            // App
            app_exit,
            get_system_info,
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // On Windows/Linux, deep links spawn a new instance with URL as CLI arg
            // This handler is called in the existing instance with the args
            if let Some(url) = args.get(1) {
                if url.starts_with("terx://") {
                    log::info!("Deep link received via single-instance: {}", url);
                    let _ = app.emit("deep-link-received", url.clone());
                }
            }
            // Focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Register deep link scheme on startup
            #[cfg(any(target_os = "linux", target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("terx");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

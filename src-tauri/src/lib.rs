mod credentials;
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
    // Credentials manager
    credentials: Mutex<credentials::CredentialsManager>,
}

struct SshSessionHandle {
    write_tx: mpsc::Sender<Vec<u8>>,
    resize_tx: mpsc::Sender<(u32, u32)>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            ssh_sessions: Mutex::new(HashMap::new()),
            credentials: Mutex::new(credentials::CredentialsManager::new()),
        }
    }
}

#[tauri::command]
fn app_exit(app: AppHandle) {
    app.exit(0);
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
            mode: "local".to_string(),
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
    let auth = if let Some(key) = key_path {
        ssh::AuthMethod::KeyFile {
            path: key,
            passphrase: None,
        }
    } else if let Some(pass) = password {
        ssh::AuthMethod::Password(pass)
    } else {
        return Err("No authentication method provided".to_string());
    };

    // Connect
    let (session, close_signal) = ssh::SshSession::connect(&host, port, &username, auth, &term_type, cols, rows)
        .await
        .map_err(|e| e.to_string())?;

    // Communication channels
    let (write_tx, mut write_rx) = mpsc::channel::<Vec<u8>>(256);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u32, u32)>(16);

    // Save session handle
    {
        let mut sessions = state.ssh_sessions.lock().await;
        sessions.insert(
            session_id.clone(),
            SshSessionHandle { write_tx, resize_tx },
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
                // Data to send to server
                Some(data) = write_rx.recv() => {
                    if let Err(e) = session.write(&data).await {
                        log::error!("SSH write error: {}", e);
                        break;
                    }
                }

                // Resize
                Some((cols, rows)) = resize_rx.recv() => {
                    if let Err(e) = session.resize(cols, rows).await {
                        log::error!("SSH resize error: {}", e);
                    }
                }

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

                else => {
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
    let (session, close_signal) = {
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

    // Communication channels
    let (write_tx, mut write_rx) = mpsc::channel::<Vec<u8>>(256);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u32, u32)>(16);

    // Save session handle
    {
        let mut sessions = state.ssh_sessions.lock().await;
        sessions.insert(
            session_id.clone(),
            SshSessionHandle { write_tx, resize_tx },
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
                // Data to send to server
                Some(data) = write_rx.recv() => {
                    if let Err(e) = session.write(&data).await {
                        log::error!("SSH write error: {}", e);
                        break;
                    }
                }

                // Resize
                Some((cols, rows)) = resize_rx.recv() => {
                    if let Err(e) = session.resize(cols, rows).await {
                        log::error!("SSH resize error: {}", e);
                    }
                }

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

                else => {
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

// ssh.rs
// SSH client based on russh

use async_trait::async_trait;
use russh::client::{self, Config, Handler, Msg};
use russh::{Channel, ChannelId, Disconnect};
use ssh_key::public::PublicKey;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::credentials::{CredentialsManager, Host};
use russh_sftp::client::SftpSession;

/// Handler for SSH client (public for SFTP reuse)
pub struct SshHandler {
    /// Channel for sending data from server to frontend
    output_tx: mpsc::Sender<Vec<u8>>,
    /// Channel for signaling session close
    close_tx: mpsc::Sender<()>,
}

#[async_trait]
impl Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO: Implement server key verification
        // For now, accept all keys (like ssh -o StrictHostKeyChecking=no)
        log::warn!("SSH: Accepting server key without verification");
        Ok(true)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        // Send data to frontend
        let _ = self.output_tx.send(data.to_vec()).await;
        Ok(())
    }

    async fn extended_data(
        &mut self,
        _channel: ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        // stderr also sent to frontend
        let _ = self.output_tx.send(data.to_vec()).await;
        Ok(())
    }

    async fn channel_eof(
        &mut self,
        _channel: ChannelId,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        // Server sent EOF - session ending
        log::info!("SSH: Channel EOF received");
        let _ = self.close_tx.send(()).await;
        Ok(())
    }

    async fn channel_close(
        &mut self,
        _channel: ChannelId,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        // Channel closed by server
        log::info!("SSH: Channel closed by server");
        let _ = self.close_tx.send(()).await;
        Ok(())
    }
}

/// SSH authentication method
#[allow(dead_code)]
pub enum AuthMethod {
    Password(String),
    Key { key_data: String, passphrase: Option<String> },
    KeyFile { path: String, passphrase: Option<String> },
    Agent,
}

/// SSH session
pub struct SshSession {
    session: Arc<client::Handle<SshHandler>>,
    channel: Channel<Msg>,
    output_rx: mpsc::Receiver<Vec<u8>>,
}

impl SshSession {
    /// Get a reference to the session handle for creating additional channels (e.g., SFTP)
    pub fn handle(&self) -> Arc<client::Handle<SshHandler>> {
        self.session.clone()
    }
}

/// Create SFTP session from an SSH handle
pub async fn create_sftp_session(handle: &client::Handle<SshHandler>) -> Result<SftpSession, SshError> {
    // Open a new session channel for SFTP
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| SshError::Channel(format!("Failed to open SFTP channel: {}", e)))?;

    // Request SFTP subsystem
    channel
        .request_subsystem(false, "sftp")
        .await
        .map_err(|e| SshError::Channel(format!("Failed to request SFTP subsystem: {}", e)))?;

    // Create SFTP session from channel stream
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| SshError::Channel(format!("Failed to initialize SFTP: {}", e)))?;

    Ok(sftp)
}

/// Separate channel for signaling session close (avoid double mutable borrow)
pub struct SshCloseSignal {
    close_rx: mpsc::Receiver<()>,
}

impl SshCloseSignal {
    /// Wait for close signal (channel_eof or channel_close)
    pub async fn wait(&mut self) -> Option<()> {
        self.close_rx.recv().await
    }
}

impl SshSession {
    /// Create new SSH session
    /// Returns (session, close_signal) - close_signal is separate to avoid borrow conflicts
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        auth: AuthMethod,
        terminal_type: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(Self, SshCloseSignal), SshError> {
        let config = Config::default();
        let config = Arc::new(config);

        // Channel for communication with frontend
        let (output_tx, output_rx) = mpsc::channel(1024);
        // Channel for signaling close
        let (close_tx, close_rx) = mpsc::channel(1);

        let handler = SshHandler { output_tx, close_tx };

        // Connection
        let addr = format!("{}:{}", host, port);
        log::info!("SSH: Connecting to {}", addr);

        let mut session = client::connect(config, &addr, handler)
            .await
            .map_err(|e| SshError::Connection(e.to_string()))?;

        // Authentication
        let authenticated = match auth {
            AuthMethod::Password(password) => {
                log::info!("SSH: Authenticating with password");
                session
                    .authenticate_password(username, &password)
                    .await
                    .map_err(|e| SshError::Auth(e.to_string()))?
            }
            AuthMethod::Key { key_data, passphrase } => {
                log::info!("SSH: Authenticating with key (data length: {} bytes)", key_data.len());
                let key_pair = if let Some(ref pass) = passphrase {
                    log::info!("SSH: Decoding key with passphrase");
                    russh_keys::decode_secret_key(&key_data, Some(pass))
                        .map_err(|e| {
                            log::error!("SSH: Key decode failed: {}", e);
                            SshError::Key(e.to_string())
                        })?
                } else {
                    log::info!("SSH: Decoding key without passphrase");
                    russh_keys::decode_secret_key(&key_data, None)
                        .map_err(|e| {
                            log::error!("SSH: Key decode failed: {}", e);
                            SshError::Key(e.to_string())
                        })?
                };
                log::info!("SSH: Key decoded successfully");
                log::info!("SSH: Calling authenticate_publickey...");

                // Add timeout for authentication
                let auth_future = session.authenticate_publickey(username, Arc::new(key_pair));
                match tokio::time::timeout(std::time::Duration::from_secs(30), auth_future).await {
                    Ok(result) => {
                        match result {
                            Ok(auth_result) => {
                                log::info!("SSH: authenticate_publickey result: {}", auth_result);
                                auth_result
                            }
                            Err(e) => {
                                log::error!("SSH: Key auth error: {}", e);
                                return Err(SshError::Auth(format!("Key authentication error: {}", e)));
                            }
                        }
                    }
                    Err(_) => {
                        log::error!("SSH: Key authentication timed out after 30 seconds");
                        return Err(SshError::Auth("Key authentication timed out".to_string()));
                    }
                }
            }
            AuthMethod::KeyFile { path, passphrase } => {
                log::info!("SSH: Authenticating with key file: {}", path);
                let key_data = std::fs::read_to_string(&path)
                    .map_err(|e| SshError::Key(format!("Cannot read key file: {}", e)))?;
                let key_pair = if let Some(pass) = passphrase {
                    russh_keys::decode_secret_key(&key_data, Some(&pass))
                        .map_err(|e| SshError::Key(e.to_string()))?
                } else {
                    russh_keys::decode_secret_key(&key_data, None)
                        .map_err(|e| SshError::Key(e.to_string()))?
                };
                session
                    .authenticate_publickey(username, Arc::new(key_pair))
                    .await
                    .map_err(|e| SshError::Auth(e.to_string()))?
            }
            AuthMethod::Agent => {
                log::info!("SSH: Authenticating with SSH agent");
                // TODO: Implement SSH agent
                return Err(SshError::Auth("SSH agent not implemented yet".to_string()));
            }
        };

        if !authenticated {
            return Err(SshError::Auth("Authentication failed - check credentials or ensure public key is in authorized_keys".to_string()));
        }

        log::info!("SSH: Authenticated successfully");

        // Open channel
        let channel = session
            .channel_open_session()
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        // Request PTY
        log::info!("SSH: Requesting PTY with terminal type: {}, size: {}x{}", terminal_type, cols, rows);
        channel
            .request_pty(
                false,
                terminal_type,
                cols,
                rows,
                0,   // pix_width
                0,   // pix_height
                &[], // terminal modes
            )
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        // Request shell
        log::info!("SSH: Requesting shell");
        channel
            .request_shell(false)
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        Ok((
            Self {
                session: Arc::new(session),
                channel,
                output_rx,
            },
            SshCloseSignal { close_rx },
        ))
    }

    /// Send data to SSH server
    pub async fn write(&self, data: &[u8]) -> Result<(), SshError> {
        self.channel
            .data(data)
            .await
            .map_err(|e| SshError::Write(e.to_string()))
    }

    /// Change terminal size
    pub async fn resize(&self, cols: u32, rows: u32) -> Result<(), SshError> {
        self.channel
            .window_change(cols, rows, 0, 0)
            .await
            .map_err(|e| SshError::Resize(e.to_string()))
    }

    /// Receive data from server (non-blocking)
    #[allow(dead_code)]
    pub fn try_recv(&mut self) -> Option<Vec<u8>> {
        self.output_rx.try_recv().ok()
    }

    /// Receive data from server (blocking)
    pub async fn recv(&mut self) -> Option<Vec<u8>> {
        self.output_rx.recv().await
    }

    /// Close session
    #[allow(dead_code)]
    pub async fn close(self) -> Result<(), SshError> {
        self.channel
            .close()
            .await
            .map_err(|e| SshError::Close(e.to_string()))?;

        self.session
            .disconnect(Disconnect::ByApplication, "Closing session", "en")
            .await
            .map_err(|e| SshError::Close(e.to_string()))?;

        Ok(())
    }
}

/// Helper function to create session from sshManager host
#[allow(dead_code)]
pub async fn connect_from_host(
    host: &Host,
    credentials: &CredentialsManager,
    key_index: Option<usize>,
    cols: u32,
    rows: u32,
) -> Result<(SshSession, SshCloseSignal), SshError> {
    let port: u16 = host.port.parse().unwrap_or(22);
    let terminal_type = if host.terminal_type.is_empty() {
        "xterm-ghostty"
    } else {
        &host.terminal_type
    };

    // Determine authentication method
    // password_id >= 0: password from passwords[password_id] array
    // password_id < 0: key from keys[-(password_id + 1)] array
    let auth = if let Some(idx) = key_index {
        // Use explicitly provided key
        if let Some(key) = credentials.get_key(idx) {
            if let Some(key_data) = credentials.get_key_data(key) {
                AuthMethod::Key {
                    key_data,
                    passphrase: None,
                }
            } else if !key.path.is_empty() {
                AuthMethod::KeyFile {
                    path: key.path.clone(),
                    passphrase: None,
                }
            } else {
                return Err(SshError::Auth("No key data available".to_string()));
            }
        } else {
            return Err(SshError::Auth("Key not found".to_string()));
        }
    } else if host.password_id < 0 {
        // Negative password_id = SSH key from config
        if let Some(key_data) = credentials.get_key_for_host(host) {
            log::info!("SSH: Using SSH key from config (password_id: {})", host.password_id);
            AuthMethod::Key {
                key_data,
                passphrase: None,
            }
        } else {
            return Err(SshError::Auth(format!("SSH key not found for password_id: {}", host.password_id)));
        }
    } else if let Some(password) = credentials.get_password_for_host(host) {
        // Non-negative/zero password_id = password from config
        log::info!("SSH: Using password from config (password_id: {})", host.password_id);
        AuthMethod::Password(password)
    } else {
        // Fallback: try default SSH keys
        let home = dirs::home_dir().unwrap_or_default();
        let key_paths = [
            home.join(".ssh/id_ed25519"),
            home.join(".ssh/id_rsa"),
            home.join(".ssh/id_ecdsa"),
        ];

        let mut found_key: Option<String> = None;
        for key_path in &key_paths {
            if key_path.exists() {
                log::info!("SSH: Fallback to default key: {:?}", key_path);
                found_key = Some(key_path.to_string_lossy().to_string());
                break;
            }
        }

        if let Some(path) = found_key {
            AuthMethod::KeyFile {
                path,
                passphrase: None,
            }
        } else {
            return Err(SshError::Auth("No authentication method available (no password in config, no SSH keys found)".to_string()));
        }
    };

    SshSession::connect(&host.ip, port, &host.login, auth, terminal_type, cols, rows).await
}

#[derive(Debug, thiserror::Error)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    Connection(String),
    #[error("Authentication failed: {0}")]
    Auth(String),
    #[error("Key error: {0}")]
    Key(String),
    #[error("Channel error: {0}")]
    Channel(String),
    #[error("Write error: {0}")]
    Write(String),
    #[error("Resize error: {0}")]
    Resize(String),
    #[error("Close error: {0}")]
    #[allow(dead_code)]
    Close(String),
}

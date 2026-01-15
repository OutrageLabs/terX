// credentials.rs
// Structures compatible with sshManager and sync with API

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const API_BASE_URL: &str = "https://okkin.eu/api/v1/";
const KEY_SIZE: usize = 32;
const NONCE_SIZE: usize = 12;

/// Host - SSH connection configuration (compatible with sshManager)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Host {
    pub name: String,
    pub description: String,
    pub login: String,
    pub ip: String,
    pub port: String,
    pub password_id: i32,
    #[serde(default)]
    pub terminal_type: String,
    #[serde(default)]
    pub keep_alive: bool,
    #[serde(default)]
    pub compression: bool,
}

/// Password - SSH password (encrypted in API)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Password {
    pub description: String,
    pub password: String, // encrypted hex
}

/// Key - SSH key
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Key {
    pub description: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub key_data: String, // encrypted hex
}

/// Config - full configuration (compatible with sshManager)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub hosts: Vec<Host>,
    #[serde(default)]
    pub passwords: Vec<Password>,
    #[serde(default)]
    pub keys: Vec<Key>,
}

/// Cipher - AES-256-GCM encryption (compatible with sshManager)
pub struct Cipher {
    key: [u8; KEY_SIZE],
}

impl Cipher {
    /// Create new Cipher from password (compatible with sshManager)
    pub fn new(password: &str) -> Self {
        let mut key = [0u8; KEY_SIZE];
        let password_bytes = password.as_bytes();
        let len = password_bytes.len().min(KEY_SIZE);
        key[..len].copy_from_slice(&password_bytes[..len]);
        Self { key }
    }

    /// Decrypt data (format: hex(nonce + ciphertext))
    pub fn decrypt(&self, encrypted_hex: &str) -> Result<String, CryptoError> {
        if encrypted_hex.is_empty() {
            return Ok(String::new());
        }

        let combined = hex::decode(encrypted_hex)
            .map_err(|e| CryptoError::HexDecode(e.to_string()))?;

        if combined.len() < NONCE_SIZE {
            return Err(CryptoError::CiphertextTooShort);
        }

        let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
        let nonce = Nonce::from_slice(nonce_bytes);

        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| CryptoError::CipherInit(e.to_string()))?;

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| CryptoError::Decryption(e.to_string()))?;

        String::from_utf8(plaintext).map_err(|e| CryptoError::Utf8(e.to_string()))
    }

    /// Encrypt data (format: hex(nonce + ciphertext))
    #[allow(dead_code)]
    pub fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError> {
        use aes_gcm::aead::{OsRng, rand_core::RngCore};

        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| CryptoError::CipherInit(e.to_string()))?;

        let mut nonce_bytes = [0u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| CryptoError::Encryption(e.to_string()))?;

        let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);

        Ok(hex::encode(combined))
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Failed to decode hex: {0}")]
    HexDecode(String),
    #[error("Ciphertext too short")]
    CiphertextTooShort,
    #[error("Failed to initialize cipher: {0}")]
    CipherInit(String),
    #[error("Decryption failed: {0}")]
    Decryption(String),
    #[error("Encryption failed: {0}")]
    #[allow(dead_code)]
    Encryption(String),
    #[error("UTF-8 conversion failed: {0}")]
    Utf8(String),
}

/// Response from sync API
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SyncResponse {
    pub status: String,
    pub message: String,
    pub data: SyncData,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SyncData {
    pub hosts: Vec<serde_json::Value>,
    pub passwords: Vec<serde_json::Value>,
    pub keys: Vec<serde_json::Value>,
    pub last_sync: Option<String>,
}

/// Credentials manager - handles API sync and local files
pub struct CredentialsManager {
    api_key: Option<String>,
    cipher: Option<Cipher>,
    config: Config,
    config_path: PathBuf,
}

impl CredentialsManager {
    pub fn new() -> Self {
        // Use ~/.config/terx/ for compatibility with sshManager (Linux-style path)
        let config_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".config")
            .join("terx")
            .join("config.json");

        Self {
            api_key: None,
            cipher: None,
            config: Config::default(),
            config_path,
        }
    }

    /// Set API key and master password
    pub fn set_credentials(&mut self, api_key: String, master_password: &str) {
        self.api_key = Some(api_key);
        self.cipher = Some(Cipher::new(master_password));
    }

    /// Set only master password (without API key - for local mode)
    pub fn set_master_password(&mut self, master_password: &str) {
        self.cipher = Some(Cipher::new(master_password));
    }

    /// Fetch configuration from API
    pub async fn sync_from_api(&mut self) -> Result<(), SyncError> {
        let api_key = self.api_key.as_ref().ok_or(SyncError::NoApiKey)?;
        let cipher = self.cipher.as_ref().ok_or(SyncError::NoCipher)?;

        let client = reqwest::Client::new();
        let response = client
            .get(format!("{}/sync", API_BASE_URL))
            .header("X-Api-Key", api_key)
            .send()
            .await
            .map_err(|e| SyncError::Request(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SyncError::ApiError(format!(
                "Status: {}",
                response.status()
            )));
        }

        let sync_response: SyncResponse = response
            .json()
            .await
            .map_err(|e| SyncError::Parse(e.to_string()))?;

        // Process hosts
        let mut hosts = Vec::new();
        for host_value in sync_response.data.hosts {
            if let Some(host_map) = host_value.as_object() {
                let host = Host {
                    name: decrypt_field(cipher, host_map, "name")?,
                    description: decrypt_field(cipher, host_map, "description")?,
                    login: decrypt_field(cipher, host_map, "login")?,
                    ip: decrypt_field(cipher, host_map, "ip")?,
                    port: decrypt_field(cipher, host_map, "port")?,
                    password_id: host_map
                        .get("password_id")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                    terminal_type: host_map
                        .get("terminal_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("xterm-ghostty")
                        .to_string(),
                    keep_alive: host_map
                        .get("keep_alive")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    compression: host_map
                        .get("compression")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                };
                hosts.push(host);
            }
        }

        // Process passwords
        let mut passwords = Vec::new();
        for pass_value in sync_response.data.passwords {
            if let Some(pass_map) = pass_value.as_object() {
                let password = Password {
                    description: pass_map
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    password: pass_map
                        .get("password")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                };
                passwords.push(password);
            }
        }

        // Process keys
        let mut keys = Vec::new();
        for key_value in sync_response.data.keys {
            if let Some(key_map) = key_value.as_object() {
                let key = Key {
                    description: key_map
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    path: key_map
                        .get("path")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    key_data: key_map
                        .get("key_data")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                };
                keys.push(key);
            }
        }

        self.config = Config {
            hosts,
            passwords,
            keys,
        };

        // Save locally
        self.save_config()?;

        Ok(())
    }

    /// Save configuration to file
    fn save_config(&self) -> Result<(), SyncError> {
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| SyncError::Io(e.to_string()))?;
        }

        let json = serde_json::to_string_pretty(&self.config)
            .map_err(|e| SyncError::Parse(e.to_string()))?;

        std::fs::write(&self.config_path, json)
            .map_err(|e| SyncError::Io(e.to_string()))?;

        Ok(())
    }

    /// Load configuration from file
    pub fn load_config(&mut self) -> Result<(), SyncError> {
        if !self.config_path.exists() {
            return Ok(());
        }

        let json = std::fs::read_to_string(&self.config_path)
            .map_err(|e| SyncError::Io(e.to_string()))?;

        self.config = serde_json::from_str(&json)
            .map_err(|e| SyncError::Parse(e.to_string()))?;

        Ok(())
    }

    /// Returns list of hosts
    pub fn hosts(&self) -> &[Host] {
        &self.config.hosts
    }

    /// Returns decrypted password for host
    /// password_id >= 0: index to passwords array (0-based)
    /// password_id < 0: this is a key, not a password
    pub fn get_password_for_host(&self, host: &Host) -> Option<String> {
        // Negative password_id means SSH key, not password
        if host.password_id < 0 {
            return None;
        }

        let cipher = self.cipher.as_ref()?;
        let password_idx = host.password_id as usize;

        if password_idx >= self.config.passwords.len() {
            return None;
        }

        let password = &self.config.passwords[password_idx];
        cipher.decrypt(&password.password).ok()
    }

    /// Returns decrypted SSH key for host
    /// password_id < 0: keyIndex = -(password_id + 1)
    /// -1 = keys[0], -2 = keys[1], etc.
    pub fn get_key_for_host(&self, host: &Host) -> Option<String> {
        // Non-negative or zero password_id means password, not key
        if host.password_id >= 0 {
            return None;
        }

        let cipher = self.cipher.as_ref()?;
        let key_idx = (-(host.password_id + 1)) as usize;

        if key_idx >= self.config.keys.len() {
            return None;
        }

        let key = &self.config.keys[key_idx];
        if key.key_data.is_empty() {
            return None;
        }

        cipher.decrypt(&key.key_data).ok()
    }

    /// Returns decrypted key content
    #[allow(dead_code)]
    pub fn get_key_data(&self, key: &Key) -> Option<String> {
        let cipher = self.cipher.as_ref()?;

        if !key.key_data.is_empty() {
            cipher.decrypt(&key.key_data).ok()
        } else {
            None
        }
    }

    /// Returns key by index
    #[allow(dead_code)]
    pub fn get_key(&self, index: usize) -> Option<&Key> {
        self.config.keys.get(index)
    }
}

fn decrypt_field(
    cipher: &Cipher,
    map: &serde_json::Map<String, serde_json::Value>,
    field: &str,
) -> Result<String, SyncError> {
    let encrypted = map
        .get(field)
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if encrypted.is_empty() {
        return Ok(String::new());
    }

    cipher
        .decrypt(encrypted)
        .map_err(|e| SyncError::Crypto(e.to_string()))
}

#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("No API key configured")]
    NoApiKey,
    #[error("No cipher configured")]
    NoCipher,
    #[error("Request failed: {0}")]
    Request(String),
    #[error("API error: {0}")]
    ApiError(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Crypto error: {0}")]
    Crypto(String),
    #[error("IO error: {0}")]
    Io(String),
}

// hostkeys.rs
// Host key verification and known_hosts management

use chrono::{DateTime, Utc};
use md5::Digest as Md5Digest;
use russh::keys::PublicKeyBase64;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Host key verification mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationMode {
    /// Reject unknown and changed keys
    Strict,
    /// Ask user for unknown and changed keys (default)
    Ask,
    /// Auto-accept new keys, ask for changed keys
    AcceptNew,
    /// Auto-accept all keys (insecure)
    AcceptAll,
}

impl Default for VerificationMode {
    fn default() -> Self {
        Self::Ask
    }
}

/// User decision for host key verification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserDecision {
    /// Trust permanently (save to known_hosts)
    TrustPermanently,
    /// Trust for this session only
    TrustOnce,
    /// Reject connection
    Reject,
}

/// Result of host key verification
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerificationResult {
    /// Key is known and matches
    Known,
    /// Key is unknown (first connection)
    Unknown,
    /// Key has changed (possible MITM attack!)
    Changed { old_fingerprint: String },
}

/// Stored host key entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredHostKey {
    /// SHA256 fingerprint (base64, without "SHA256:" prefix)
    pub fingerprint_sha256: String,
    /// MD5 fingerprint (hex with colons)
    pub fingerprint_md5: String,
    /// Key algorithm (ed25519, rsa, ecdsa, etc.)
    pub algorithm: String,
    /// Raw public key data (base64)
    pub key_data: String,
    /// First time this key was seen
    pub first_seen: DateTime<Utc>,
    /// Last time this key was verified
    pub last_seen: DateTime<Utc>,
    /// Number of successful connections
    pub connection_count: u64,
    /// Whether user chose "Trust Permanently"
    pub trusted_permanently: bool,
}

/// Host key information for UI display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostKeyInfo {
    /// Host identifier (host:port)
    pub host_id: String,
    /// SHA256 fingerprint
    pub fingerprint_sha256: String,
    /// MD5 fingerprint
    pub fingerprint_md5: String,
    /// Key algorithm
    pub algorithm: String,
    /// ASCII art visual fingerprint
    pub randomart: String,
    /// Is this a key change (MITM warning)?
    pub is_changed: bool,
    /// Old fingerprint (if changed)
    pub old_fingerprint: Option<String>,
}

/// Known hosts settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownHostsSettings {
    /// Verification mode
    #[serde(default)]
    pub verification_mode: VerificationMode,
    /// Whether to hash hostnames (for privacy)
    #[serde(default)]
    pub hash_hostnames: bool,
}

impl Default for KnownHostsSettings {
    fn default() -> Self {
        Self {
            verification_mode: VerificationMode::Ask,
            hash_hostnames: false,
        }
    }
}

/// Known hosts storage format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownHostsFile {
    /// File format version
    pub version: u32,
    /// Map of host:port -> host key
    pub hosts: HashMap<String, StoredHostKey>,
    /// Settings
    #[serde(default)]
    pub settings: KnownHostsSettings,
}

impl Default for KnownHostsFile {
    fn default() -> Self {
        Self {
            version: 1,
            hosts: HashMap::new(),
            settings: KnownHostsSettings::default(),
        }
    }
}

/// Known hosts store
pub struct KnownHostsStore {
    /// Storage file path
    path: PathBuf,
    /// In-memory data
    data: KnownHostsFile,
}

impl KnownHostsStore {
    /// Create new store (loads from disk if exists)
    pub fn new() -> Self {
        let path = Self::default_path();
        let data = Self::load_from_path(&path).unwrap_or_default();
        Self { path, data }
    }

    /// Get default storage path (~/.config/terx/known_hosts.json)
    fn default_path() -> PathBuf {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        home.join(".config").join("terx").join("known_hosts.json")
    }

    /// Load from specific path
    fn load_from_path(path: &PathBuf) -> Option<KnownHostsFile> {
        if !path.exists() {
            return None;
        }
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    }

    /// Save to disk
    pub fn save(&self) -> Result<(), String> {
        // Ensure parent directory exists
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        let content = serde_json::to_string_pretty(&self.data)
            .map_err(|e| format!("Failed to serialize: {}", e))?;

        fs::write(&self.path, content)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(())
    }

    /// Get current verification mode
    pub fn verification_mode(&self) -> VerificationMode {
        self.data.settings.verification_mode
    }

    /// Set verification mode
    pub fn set_verification_mode(&mut self, mode: VerificationMode) {
        self.data.settings.verification_mode = mode;
    }

    /// Generate host identifier
    pub fn host_id(host: &str, port: u16) -> String {
        if port == 22 {
            host.to_string()
        } else {
            format!("[{}]:{}", host, port)
        }
    }

    /// Verify a host key
    pub fn verify_host_key(
        &self,
        host: &str,
        port: u16,
        key: &russh::keys::PublicKey,
    ) -> VerificationResult {
        let host_id = Self::host_id(host, port);
        let fingerprint = Self::compute_fingerprint_sha256(key);

        match self.data.hosts.get(&host_id) {
            None => VerificationResult::Unknown,
            Some(stored) => {
                if stored.fingerprint_sha256 == fingerprint {
                    VerificationResult::Known
                } else {
                    VerificationResult::Changed {
                        old_fingerprint: stored.fingerprint_sha256.clone(),
                    }
                }
            }
        }
    }

    /// Store a host key
    pub fn store_host_key(
        &mut self,
        host: &str,
        port: u16,
        key: &russh::keys::PublicKey,
        permanent: bool,
    ) -> Result<(), String> {
        let host_id = Self::host_id(host, port);
        let now = Utc::now();

        let entry = StoredHostKey {
            fingerprint_sha256: Self::compute_fingerprint_sha256(key),
            fingerprint_md5: Self::compute_fingerprint_md5(key),
            algorithm: Self::key_algorithm(key),
            key_data: Self::encode_key_data(key),
            first_seen: now,
            last_seen: now,
            connection_count: 1,
            trusted_permanently: permanent,
        };

        self.data.hosts.insert(host_id, entry);

        if permanent {
            self.save()?;
        }

        Ok(())
    }

    /// Update last seen timestamp for a known host
    pub fn update_last_seen(&mut self, host: &str, port: u16) {
        let host_id = Self::host_id(host, port);
        if let Some(entry) = self.data.hosts.get_mut(&host_id) {
            entry.last_seen = Utc::now();
            entry.connection_count += 1;
            // Auto-save if permanently trusted
            if entry.trusted_permanently {
                let _ = self.save();
            }
        }
    }

    /// Remove a host key
    pub fn remove_host_key(&mut self, host: &str, port: u16) -> Result<bool, String> {
        let host_id = Self::host_id(host, port);
        let removed = self.data.hosts.remove(&host_id).is_some();
        if removed {
            self.save()?;
        }
        Ok(removed)
    }

    /// List all known hosts
    pub fn list_hosts(&self) -> Vec<(String, &StoredHostKey)> {
        self.data
            .hosts
            .iter()
            .map(|(k, v)| (k.clone(), v))
            .collect()
    }

    /// Get host key info for UI display
    pub fn get_host_key_info(
        &self,
        host: &str,
        port: u16,
        key: &russh::keys::PublicKey,
    ) -> HostKeyInfo {
        let host_id = Self::host_id(host, port);
        let verification = self.verify_host_key(host, port, key);

        let (is_changed, old_fingerprint) = match verification {
            VerificationResult::Changed { old_fingerprint } => (true, Some(old_fingerprint)),
            _ => (false, None),
        };

        HostKeyInfo {
            host_id,
            fingerprint_sha256: format!("SHA256:{}", Self::compute_fingerprint_sha256(key)),
            fingerprint_md5: Self::compute_fingerprint_md5(key),
            algorithm: Self::key_algorithm(key),
            randomart: Self::generate_randomart(key),
            is_changed,
            old_fingerprint,
        }
    }

    /// Compute SHA256 fingerprint (base64, no padding)
    fn compute_fingerprint_sha256(key: &russh::keys::PublicKey) -> String {
        let key_bytes = key.public_key_bytes();
        let mut hasher = Sha256::new();
        hasher.update(&key_bytes);
        let hash = hasher.finalize();
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD_NO_PAD, hash)
    }

    /// Compute MD5 fingerprint (hex with colons)
    fn compute_fingerprint_md5(key: &russh::keys::PublicKey) -> String {
        use md5::Md5;
        let key_bytes = key.public_key_bytes();
        let mut hasher = Md5::new();
        hasher.update(&key_bytes);
        let hash = hasher.finalize();
        hash.iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join(":")
    }

    /// Get key algorithm name
    fn key_algorithm(key: &russh::keys::PublicKey) -> String {
        key.algorithm().as_str().to_string()
    }

    /// Encode key data as base64
    fn encode_key_data(key: &russh::keys::PublicKey) -> String {
        base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            key.public_key_bytes(),
        )
    }

    /// Generate ASCII art randomart (similar to OpenSSH)
    fn generate_randomart(key: &russh::keys::PublicKey) -> String {
        let key_bytes = key.public_key_bytes();
        let mut hasher = Sha256::new();
        hasher.update(&key_bytes);
        let hash = hasher.finalize();

        let algorithm = key.algorithm();
        let algo = algorithm.as_str();
        let bits = match algo {
            "ssh-ed25519" => 256,
            "ssh-rsa" => 2048, // Assumption, could vary
            "ecdsa-sha2-nistp256" => 256,
            "ecdsa-sha2-nistp384" => 384,
            "ecdsa-sha2-nistp521" => 521,
            _ => 256,
        };

        Self::drunken_bishop(&hash, algo, bits)
    }

    /// Drunken Bishop algorithm for visual fingerprint
    fn drunken_bishop(hash: &[u8], algo: &str, bits: usize) -> String {
        const WIDTH: usize = 17;
        const HEIGHT: usize = 9;
        const CHARS: &[u8] = b" .o+=*BOX@%&#/^SE";

        let mut field = [[0u8; WIDTH]; HEIGHT];
        let mut x = WIDTH / 2;
        let mut y = HEIGHT / 2;

        // Mark start position
        let start_x = x;
        let start_y = y;

        for byte in hash {
            for i in 0..4 {
                let bits = (byte >> (i * 2)) & 0x03;
                let dx = if bits & 1 != 0 { 1i32 } else { -1i32 };
                let dy = if bits & 2 != 0 { 1i32 } else { -1i32 };

                x = (x as i32 + dx).clamp(0, (WIDTH - 1) as i32) as usize;
                y = (y as i32 + dy).clamp(0, (HEIGHT - 1) as i32) as usize;

                if field[y][x] < 14 {
                    field[y][x] += 1;
                }
            }
        }

        // Mark start and end positions
        field[start_y][start_x] = 15; // 'S'
        field[y][x] = 16; // 'E'

        // Build output
        let algo_short = match algo {
            "ssh-ed25519" => "ED25519",
            "ssh-rsa" => "RSA",
            "ecdsa-sha2-nistp256" => "ECDSA",
            "ecdsa-sha2-nistp384" => "ECDSA",
            "ecdsa-sha2-nistp521" => "ECDSA",
            _ => algo,
        };

        let header = format!("+--[{} {}]", algo_short, bits);
        let header = format!("{}{}+", header, "-".repeat(WIDTH + 2 - header.len()));

        let mut lines = vec![header];

        for row in &field {
            let chars: String = row
                .iter()
                .map(|&v| CHARS[v.min((CHARS.len() - 1) as u8) as usize] as char)
                .collect();
            lines.push(format!("|{}|", chars));
        }

        lines.push(format!("+{}+", "-".repeat(WIDTH)));

        lines.join("\n")
    }

    /// Import from OpenSSH known_hosts file
    pub fn import_system_known_hosts(&mut self) -> Result<usize, String> {
        let home = dirs::home_dir().ok_or("Cannot get home directory")?;
        let ssh_known_hosts = home.join(".ssh").join("known_hosts");

        if !ssh_known_hosts.exists() {
            return Ok(0);
        }

        let content = fs::read_to_string(&ssh_known_hosts)
            .map_err(|e| format!("Failed to read known_hosts: {}", e))?;

        let mut imported = 0;

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            // Parse OpenSSH format: hostname algorithm base64-key [comment]
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 3 {
                continue;
            }

            let host_part = parts[0];
            let algorithm = parts[1];
            let key_b64 = parts[2];

            // Parse hostname (handle [host]:port and hashed hostnames)
            let (host, port) = if host_part.starts_with('|') {
                // Hashed hostname - skip (we can't reverse the hash)
                continue;
            } else if host_part.starts_with('[') {
                // [host]:port format
                if let Some(bracket_end) = host_part.find(']') {
                    let h = &host_part[1..bracket_end];
                    let p = host_part[bracket_end + 1..]
                        .trim_start_matches(':')
                        .parse()
                        .unwrap_or(22);
                    (h.to_string(), p)
                } else {
                    continue;
                }
            } else {
                // hostname or hostname,ip format
                let h = host_part.split(',').next().unwrap_or(host_part);
                (h.to_string(), 22u16)
            };

            // Decode key
            let key_data = match base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                key_b64,
            ) {
                Ok(d) => d,
                Err(_) => continue,
            };

            // Try to parse the key to compute fingerprints
            // This is simplified - in production you'd use the full key parsing
            let fingerprint_sha256 = {
                let mut hasher = Sha256::new();
                hasher.update(&key_data);
                let hash = hasher.finalize();
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD_NO_PAD, hash)
            };

            let fingerprint_md5 = {
                use md5::Md5;
                let mut hasher = Md5::new();
                hasher.update(&key_data);
                let hash = hasher.finalize();
                hash.iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<Vec<_>>()
                    .join(":")
            };

            let host_id = Self::host_id(&host, port);
            let now = Utc::now();

            let entry = StoredHostKey {
                fingerprint_sha256,
                fingerprint_md5,
                algorithm: algorithm.to_string(),
                key_data: key_b64.to_string(),
                first_seen: now,
                last_seen: now,
                connection_count: 0,
                trusted_permanently: true,
            };

            if !self.data.hosts.contains_key(&host_id) {
                self.data.hosts.insert(host_id, entry);
                imported += 1;
            }
        }

        if imported > 0 {
            self.save()?;
        }

        Ok(imported)
    }
}

impl Default for KnownHostsStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_host_id_standard_port() {
        assert_eq!(KnownHostsStore::host_id("example.com", 22), "example.com");
    }

    #[test]
    fn test_host_id_custom_port() {
        assert_eq!(
            KnownHostsStore::host_id("example.com", 2222),
            "[example.com]:2222"
        );
    }

    #[test]
    fn test_verification_mode_default() {
        assert_eq!(VerificationMode::default(), VerificationMode::Ask);
    }
}

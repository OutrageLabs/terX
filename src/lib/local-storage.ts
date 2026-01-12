/**
 * Local Storage Backend for terX
 *
 * Uses Tauri filesystem APIs to store data locally.
 * All sensitive data is encrypted with AES-256-GCM before storage.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Host, Password, Key, Tag } from "./database.types";
import { encrypt, decrypt, isEncryptionReady, getSalt, ENCRYPTED_FIELDS } from "./crypto";

// Storage format: SALT_HEX:ENCRYPTED_DATA (salt is 32 hex chars = 16 bytes)
const SALT_HEX_LENGTH = 32;
const STORAGE_SEPARATOR = ":";

// Storage config interface (from storage.ts)
export interface StorageConfig {
  mode: "local" | "terx-cloud" | "own-supabase";
  locale: string;
  theme: string;           // Theme ID (e.g., "catppuccin-mocha", "dracula")
  uiFontSize: number;      // UI font size in px
  terminalFontFamily: string;  // "fira-code" | "hack" | "system-mono"
  terminalFontSize: number;    // Terminal font size in px
  // Legacy - kept for backwards compatibility
  fontSize?: number;
  ownSupabase?: {
    url: string | null;
    key: string | null;
  };
}

// Local data structure (stored encrypted)
interface LocalData {
  hosts: LocalHost[];
  passwords: LocalPassword[];
  keys: LocalKey[];
  tags: LocalTag[];
  hostTags: { hostId: string; tagId: string }[];
  salt: string;
}

// Local versions of types (with string IDs instead of UUID)
interface LocalHost extends Omit<Host, "user_id"> {
  id: string;
}

interface LocalPassword extends Omit<Password, "user_id"> {
  id: string;
}

interface LocalKey extends Omit<Key, "user_id"> {
  id: string;
}

interface LocalTag extends Omit<Tag, "user_id"> {
  id: string;
}

// Host with relations for getHosts
interface HostWithRelations extends LocalHost {
  password?: LocalPassword | null;
  key?: LocalKey | null;
  tags?: LocalTag[];
}

// Empty default data
const EMPTY_DATA: LocalData = {
  hosts: [],
  passwords: [],
  keys: [],
  tags: [],
  hostTags: [],
  salt: "",
};

// In-memory cache of decrypted data
let cachedData: LocalData | null = null;

/**
 * Generate a UUID v4
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current timestamp in ISO format
 */
function now(): string {
  return new Date().toISOString();
}

// =============================================================================
// Config file operations (unencrypted)
// =============================================================================

/**
 * Load config from Tauri
 */
export async function loadConfig(): Promise<StorageConfig> {
  try {
    const config = await invoke<StorageConfig>("config_load");
    // Migration: handle old fontSize field
    if (config.fontSize && !config.uiFontSize) {
      config.uiFontSize = config.fontSize;
    }
    if (!config.terminalFontFamily) {
      config.terminalFontFamily = "fira-code";
    }
    if (!config.terminalFontSize) {
      config.terminalFontSize = 15;
    }
    return config;
  } catch (error) {
    console.warn("[local-storage] Failed to load config:", error);
    return {
      mode: "local",
      locale: "en-US",
      theme: "catppuccin-mocha",
      uiFontSize: 14,
      terminalFontFamily: "fira-code",
      terminalFontSize: 15,
    };
  }
}

/**
 * Save config to Tauri
 */
export async function saveConfig(config: StorageConfig): Promise<void> {
  await invoke("config_save", { config });
}

// =============================================================================
// Local data file operations (encrypted)
// =============================================================================

/**
 * Check if local data file exists
 */
export function hasLocalData(): boolean {
  // This is a sync check - we can't call Tauri here
  // In practice, check if we have cached data or call Tauri
  return cachedData !== null;
}

/**
 * Check if local data exists (async version)
 */
export async function checkLocalDataExists(): Promise<boolean> {
  try {
    return await invoke<boolean>("local_storage_exists");
  } catch {
    return false;
  }
}

/**
 * Get the salt from stored data (for password verification)
 * Returns null if file doesn't exist or is empty
 */
export async function getStoredSalt(): Promise<string | null> {
  try {
    const rawData = await invoke<string>("local_storage_load");
    if (!rawData || rawData.length < SALT_HEX_LENGTH + 1) {
      return null;
    }

    // Extract salt from format: SALT_HEX:ENCRYPTED_DATA
    const separatorIndex = rawData.indexOf(STORAGE_SEPARATOR);
    if (separatorIndex !== SALT_HEX_LENGTH) {
      // Old format without salt prefix - migration needed
      return null;
    }

    return rawData.substring(0, SALT_HEX_LENGTH);
  } catch {
    return null;
  }
}

/**
 * Get the storage file path (for error messages)
 */
export async function getStoragePath(): Promise<string> {
  try {
    return await invoke<string>("local_storage_path");
  } catch {
    return "~/.config/terx/storage.json";
  }
}

/**
 * Backup the storage file (move to .bak)
 */
export async function backupLocalStorage(): Promise<void> {
  await invoke("local_storage_backup");
  cachedData = null;
}

/**
 * Load local data from disk and decrypt
 */
async function loadLocalData(): Promise<LocalData> {
  if (cachedData) return cachedData;

  if (!isEncryptionReady()) {
    throw new Error("Encryption not initialized");
  }

  try {
    const rawData = await invoke<string>("local_storage_load");

    if (!rawData) {
      cachedData = { ...EMPTY_DATA };
      return cachedData;
    }

    // Parse format: SALT_HEX:ENCRYPTED_DATA
    const separatorIndex = rawData.indexOf(STORAGE_SEPARATOR);
    let encryptedJson: string;

    if (separatorIndex === SALT_HEX_LENGTH) {
      // New format with salt prefix
      encryptedJson = rawData.substring(SALT_HEX_LENGTH + 1);
    } else {
      // Old format without salt - try to decrypt directly
      encryptedJson = rawData;
    }

    const decrypted = await decrypt(encryptedJson);
    cachedData = JSON.parse(decrypted) as LocalData;
    return cachedData;
  } catch (error) {
    console.error("[local-storage] Failed to load data:", error);
    // Re-throw to allow handling in auth flow
    throw error;
  }
}

/**
 * Save local data to disk (encrypted)
 * Format: SALT_HEX:ENCRYPTED_DATA
 */
async function saveLocalData(): Promise<void> {
  if (!cachedData) return;

  if (!isEncryptionReady()) {
    throw new Error("Encryption not initialized");
  }

  const salt = getSalt();
  if (!salt) {
    throw new Error("No salt available");
  }

  const json = JSON.stringify(cachedData);
  const encrypted = await encrypt(json);

  // Format: SALT_HEX:ENCRYPTED_DATA
  const dataWithSalt = salt + STORAGE_SEPARATOR + encrypted;
  await invoke("local_storage_save", { data: dataWithSalt });
}

/**
 * Clear cached data
 */
export function clearCache(): void {
  cachedData = null;
}

// =============================================================================
// CRUD: Hosts
// =============================================================================

export async function getHosts(): Promise<HostWithRelations[]> {
  const data = await loadLocalData();

  return data.hosts.map((host) => {
    // Find related password
    const password = host.password_id
      ? data.passwords.find((p) => p.id === host.password_id) || null
      : null;

    // Find related key
    const key = host.key_id
      ? data.keys.find((k) => k.id === host.key_id) || null
      : null;

    // Find related tags
    const tagIds = data.hostTags
      .filter((ht) => ht.hostId === host.id)
      .map((ht) => ht.tagId);
    const tags = data.tags.filter((t) => tagIds.includes(t.id));

    return { ...host, password, key, tags };
  });
}

export async function createHost(
  host: Omit<Host, "id" | "user_id" | "created_at" | "updated_at">,
  tagIds?: string[]
): Promise<LocalHost> {
  const data = await loadLocalData();

  const newHost: LocalHost = {
    ...host,
    id: generateId(),
    created_at: now(),
    updated_at: now(),
  };

  data.hosts.push(newHost);

  // Add tags
  if (tagIds && tagIds.length > 0) {
    for (const tagId of tagIds) {
      data.hostTags.push({ hostId: newHost.id, tagId });
    }
  }

  await saveLocalData();
  return newHost;
}

export async function updateHost(
  id: string,
  updates: Partial<Host>,
  tagIds?: string[]
): Promise<LocalHost> {
  const data = await loadLocalData();

  const index = data.hosts.findIndex((h) => h.id === id);
  if (index === -1) throw new Error(`Host not found: ${id}`);

  // Update host
  data.hosts[index] = {
    ...data.hosts[index],
    ...updates,
    updated_at: now(),
  };

  // Update tags if provided
  if (tagIds !== undefined) {
    // Remove existing tags
    data.hostTags = data.hostTags.filter((ht) => ht.hostId !== id);

    // Add new tags
    for (const tagId of tagIds) {
      data.hostTags.push({ hostId: id, tagId });
    }
  }

  await saveLocalData();
  return data.hosts[index];
}

export async function deleteHost(id: string): Promise<void> {
  const data = await loadLocalData();

  data.hosts = data.hosts.filter((h) => h.id !== id);
  data.hostTags = data.hostTags.filter((ht) => ht.hostId !== id);

  await saveLocalData();
}

// =============================================================================
// CRUD: Passwords
// =============================================================================

export async function getPasswords(): Promise<LocalPassword[]> {
  const data = await loadLocalData();
  return data.passwords;
}

export async function createPassword(
  password: Omit<Password, "id" | "user_id" | "created_at" | "updated_at">
): Promise<LocalPassword> {
  const data = await loadLocalData();

  const newPassword: LocalPassword = {
    ...password,
    id: generateId(),
    created_at: now(),
    updated_at: now(),
  };

  data.passwords.push(newPassword);
  await saveLocalData();
  return newPassword;
}

export async function updatePassword(
  id: string,
  updates: Partial<Password>
): Promise<LocalPassword> {
  const data = await loadLocalData();

  const index = data.passwords.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Password not found: ${id}`);

  data.passwords[index] = {
    ...data.passwords[index],
    ...updates,
    updated_at: now(),
  };

  await saveLocalData();
  return data.passwords[index];
}

export async function deletePassword(id: string): Promise<void> {
  const data = await loadLocalData();

  data.passwords = data.passwords.filter((p) => p.id !== id);

  // Also remove references from hosts
  for (const host of data.hosts) {
    if (host.password_id === id) {
      host.password_id = null;
    }
  }

  await saveLocalData();
}

// =============================================================================
// CRUD: Keys
// =============================================================================

export async function getKeys(): Promise<LocalKey[]> {
  const data = await loadLocalData();
  return data.keys;
}

export async function createKey(
  key: Omit<Key, "id" | "user_id" | "created_at" | "updated_at">
): Promise<LocalKey> {
  const data = await loadLocalData();

  const newKey: LocalKey = {
    ...key,
    id: generateId(),
    created_at: now(),
    updated_at: now(),
  };

  data.keys.push(newKey);
  await saveLocalData();
  return newKey;
}

export async function updateKey(id: string, updates: Partial<Key>): Promise<LocalKey> {
  const data = await loadLocalData();

  const index = data.keys.findIndex((k) => k.id === id);
  if (index === -1) throw new Error(`Key not found: ${id}`);

  data.keys[index] = {
    ...data.keys[index],
    ...updates,
    updated_at: now(),
  };

  await saveLocalData();
  return data.keys[index];
}

export async function deleteKey(id: string): Promise<void> {
  const data = await loadLocalData();

  data.keys = data.keys.filter((k) => k.id !== id);

  // Also remove references from hosts
  for (const host of data.hosts) {
    if (host.key_id === id) {
      host.key_id = null;
    }
  }

  await saveLocalData();
}

// =============================================================================
// CRUD: Tags
// =============================================================================

export async function getTags(): Promise<LocalTag[]> {
  const data = await loadLocalData();
  return data.tags;
}

export async function createTag(
  tag: Omit<Tag, "id" | "user_id" | "created_at">
): Promise<LocalTag> {
  const data = await loadLocalData();

  const newTag: LocalTag = {
    ...tag,
    id: generateId(),
    created_at: now(),
  };

  data.tags.push(newTag);
  await saveLocalData();
  return newTag;
}

export async function updateTag(id: string, updates: Partial<Tag>): Promise<LocalTag> {
  const data = await loadLocalData();

  const index = data.tags.findIndex((t) => t.id === id);
  if (index === -1) throw new Error(`Tag not found: ${id}`);

  data.tags[index] = {
    ...data.tags[index],
    ...updates,
  };

  await saveLocalData();
  return data.tags[index];
}

export async function deleteTag(id: string): Promise<void> {
  const data = await loadLocalData();

  data.tags = data.tags.filter((t) => t.id !== id);
  data.hostTags = data.hostTags.filter((ht) => ht.tagId !== id);

  await saveLocalData();
}

// =============================================================================
// Import/Export
// =============================================================================

/**
 * Export all data as JSON (for backup)
 */
export async function exportData(): Promise<string> {
  const data = await loadLocalData();
  return JSON.stringify(data, null, 2);
}

/**
 * Import data from JSON (for restore)
 */
export async function importData(json: string): Promise<void> {
  const data = JSON.parse(json) as LocalData;

  // Validate structure
  if (!data.hosts || !data.passwords || !data.keys || !data.tags) {
    throw new Error("Invalid data format");
  }

  cachedData = data;
  await saveLocalData();
}

/**
 * Try to load local data (for password verification)
 * This is used to test if the password is correct
 * Returns true if successful, false if decryption failed
 */
export async function tryLoadLocalData(): Promise<boolean> {
  try {
    cachedData = null; // Clear cache to force reload
    await loadLocalData();
    return true;
  } catch (error) {
    console.log("[local-storage] tryLoadLocalData failed:", error);
    return false;
  }
}

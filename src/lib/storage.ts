/**
 * Storage Manager for terX
 *
 * Unified interface for managing hosts, passwords, keys, and tags
 * across different storage backends:
 * - Local: Tauri filesystem (encrypted with master password)
 * - terX Cloud: Supabase (E2E encrypted)
 * - Own Supabase: User's own Supabase instance (placeholder)
 */

import type { Host, Password, Key, Tag, AuthType } from "./database.types";
import * as supabase from "./supabase";
import * as localStorage from "./local-storage";
import { initEncryption, isEncryptionReady, clearEncryption } from "./crypto";

// Storage modes
export type StorageMode = "local" | "terx-cloud" | "own-supabase";

// Configuration stored in app config file
export interface StorageConfig {
  mode: StorageMode;
  locale: string;
  theme: string;           // Theme ID (e.g., "catppuccin-mocha", "dracula")
  uiFontSize: number;      // UI font size in px
  terminalFontFamily: string;  // "fira-code" | "hack" | "system-mono"
  terminalFontSize: number;    // Terminal font size in px
  cursorStyle: 'block' | 'underline';  // Cursor shape
  cursorBlink: boolean;    // Cursor blinking
  // Legacy - kept for backwards compatibility
  fontSize?: number;
  ownSupabase?: {
    url: string | null;
    key: string | null;
  };
}

// Default configuration
const DEFAULT_CONFIG: StorageConfig = {
  mode: undefined as unknown as StorageMode,  // Force storage selector on first run
  locale: "en-US",
  theme: "catppuccin-mocha",
  uiFontSize: 14,
  terminalFontFamily: "fira-code",
  terminalFontSize: 15,
  cursorStyle: "block",
  cursorBlink: false,
  ownSupabase: {
    url: null,
    key: null,
  },
};

// Current state
let currentConfig: StorageConfig = { ...DEFAULT_CONFIG };
let isInitialized = false;
let masterPasswordSet = false;

// Event listeners
type StorageEventType = "config-changed" | "auth-changed" | "data-changed";
type StorageEventListener = (event: StorageEventType, data?: unknown) => void;
const listeners: Set<StorageEventListener> = new Set();

/**
 * Emit event to all listeners
 */
function emit(event: StorageEventType, data?: unknown): void {
  listeners.forEach((listener) => listener(event, data));
}

/**
 * Subscribe to storage events
 */
export function onStorageEvent(listener: StorageEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Load configuration from disk
 */
export async function loadConfig(): Promise<StorageConfig> {
  try {
    const config = await localStorage.loadConfig();
    currentConfig = { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.warn("[storage] Failed to load config, using defaults:", error);
    currentConfig = { ...DEFAULT_CONFIG };
  }

  isInitialized = true;
  return currentConfig;
}

/**
 * Save configuration to disk
 */
export async function saveConfig(config: Partial<StorageConfig>): Promise<void> {
  currentConfig = { ...currentConfig, ...config };
  await localStorage.saveConfig(currentConfig);
  emit("config-changed", currentConfig);
}

/**
 * Get current configuration
 */
export function getConfig(): StorageConfig {
  return { ...currentConfig };
}

/**
 * Get current storage mode
 */
export function getStorageMode(): StorageMode {
  return currentConfig.mode;
}

/**
 * Set storage mode
 */
export async function setStorageMode(mode: StorageMode): Promise<void> {
  if (mode === currentConfig.mode) return;

  // Clear current state
  clearEncryption();
  masterPasswordSet = false;

  // Update config
  await saveConfig({ mode });

  // Initialize new backend
  if (mode === "terx-cloud") {
    supabase.initSupabase({ mode: "terx-cloud" });
  } else if (mode === "own-supabase" && currentConfig.ownSupabase?.url && currentConfig.ownSupabase?.key) {
    supabase.initSupabase({
      mode: "own-supabase",
      supabaseUrl: currentConfig.ownSupabase.url,
      supabaseKey: currentConfig.ownSupabase.key,
    });
  }

  emit("config-changed", currentConfig);
}

// =============================================================================
// Master Password / Encryption
// =============================================================================

/**
 * Check if master password is required (sync version using cache)
 */
export function isMasterPasswordRequired(): boolean {
  // Master password is always required for cloud storage
  // For local storage, it's required if data exists
  if (currentConfig.mode === "local") {
    return localStorage.hasLocalData();
  }
  return true;
}

/**
 * Check if local storage data exists (async version)
 */
export async function checkLocalDataExists(): Promise<boolean> {
  return localStorage.checkLocalDataExists();
}

/**
 * Get stored salt from local storage
 */
export async function getStoredSalt(): Promise<string | null> {
  return localStorage.getStoredSalt();
}

/**
 * Try to load local data (for password verification)
 */
export async function tryLoadLocalData(): Promise<boolean> {
  return localStorage.tryLoadLocalData();
}

/**
 * Backup local storage (move to .bak)
 */
export async function backupLocalStorage(): Promise<void> {
  return localStorage.backupLocalStorage();
}

/**
 * Get storage file path (for error messages)
 */
export async function getStoragePath(): Promise<string> {
  return localStorage.getStoragePath();
}

/**
 * Check if master password is set for this session
 */
export function isMasterPasswordSet(): boolean {
  return masterPasswordSet && isEncryptionReady();
}

/**
 * Set master password for encryption/decryption
 * Returns salt (for new users) or validates existing (for returning users)
 */
export async function setMasterPassword(
  password: string,
  existingSalt?: string
): Promise<{ success: boolean; salt?: string; error?: string }> {
  try {
    const salt = await initEncryption(password, existingSalt);
    masterPasswordSet = true;
    return { success: true, salt };
  } catch (error) {
    console.error("[storage] Failed to set master password:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Clear master password and encryption state
 */
export function clearMasterPassword(): void {
  clearEncryption();
  masterPasswordSet = false;
}

// =============================================================================
// Authentication (Cloud only)
// =============================================================================

/**
 * Check if user is authenticated (cloud modes only)
 */
export async function isAuthenticated(): Promise<boolean> {
  if (currentConfig.mode === "local") return true;

  const user = await supabase.getUser();
  return user !== null;
}

/**
 * Get current user (cloud modes only)
 */
export async function getUser() {
  if (currentConfig.mode === "local") return null;
  return supabase.getUser();
}

/**
 * Sign in with email/password
 */
export async function signIn(email: string, password: string) {
  if (currentConfig.mode === "local") {
    throw new Error("Cannot sign in in local mode");
  }
  const result = await supabase.signIn(email, password);
  if (!result.error) {
    emit("auth-changed", { user: result.data.user });
  }
  return result;
}

/**
 * Sign up with email/password
 */
export async function signUp(
  email: string,
  password: string,
  metadata?: { first_name?: string; last_name?: string }
) {
  if (currentConfig.mode === "local") {
    throw new Error("Cannot sign up in local mode");
  }
  return supabase.signUp(email, password, metadata);
}

/**
 * Get GitHub OAuth URL for external browser login
 */
export async function getGitHubOAuthUrl(): Promise<string> {
  if (currentConfig.mode === "local") {
    throw new Error("Cannot sign in with GitHub in local mode");
  }
  return supabase.getGitHubOAuthUrl();
}

/**
 * Sign in with GitHub OAuth
 * Opens the OAuth URL in system browser (not WebView) for full passkey support
 */
export async function signInWithGitHub(): Promise<void> {
  const url = await getGitHubOAuthUrl();
  console.log("[storage] Opening GitHub OAuth in external browser:", url);

  // Open in system browser using tauri-plugin-opener
  // This allows full passkey/WebAuthn support since it's a real browser
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
  console.log("[storage] openUrl called successfully");
}

/**
 * Sign out
 */
export async function signOut() {
  // Sign out from Supabase if in cloud mode
  if (currentConfig.mode !== "local") {
    await supabase.signOut();
  }

  // Clear encryption state
  clearMasterPassword();

  // Clear mode so storage selector shows on next app start
  currentConfig.mode = undefined as unknown as StorageMode;
  await saveConfig({ mode: undefined as unknown as StorageMode });

  emit("auth-changed", { user: null });
}

// =============================================================================
// CRUD: Hosts
// =============================================================================

export interface HostWithRelations extends Host {
  password?: Password | null;
  key?: Key | null;
  tags?: Tag[];
}

/**
 * Get all hosts
 */
export async function getHosts(): Promise<HostWithRelations[]> {
  if (currentConfig.mode === "local") {
    // Local storage doesn't have user_id, add placeholder for compatibility
    const hosts = await localStorage.getHosts();
    return hosts.map((h) => ({ ...h, user_id: "local" })) as HostWithRelations[];
  }
  return supabase.getHosts();
}

/**
 * Create a new host
 */
export async function createHost(
  host: Omit<Host, "id" | "user_id" | "created_at" | "updated_at">,
  tagIds?: string[]
): Promise<Host> {
  let result: Host;

  if (currentConfig.mode === "local") {
    const localResult = await localStorage.createHost(host, tagIds);
    result = { ...localResult, user_id: "local" } as Host;
  } else {
    result = await supabase.createHost(host, tagIds);
  }

  emit("data-changed", { type: "host", action: "create", data: result });
  return result;
}

/**
 * Update a host
 */
export async function updateHost(
  id: string,
  updates: Partial<Host>,
  tagIds?: string[]
): Promise<Host> {
  let result: Host;

  if (currentConfig.mode === "local") {
    const localResult = await localStorage.updateHost(id, updates, tagIds);
    result = { ...localResult, user_id: "local" } as Host;
  } else {
    result = await supabase.updateHost(id, updates, tagIds);
  }

  emit("data-changed", { type: "host", action: "update", data: result });
  return result;
}

/**
 * Delete a host
 */
export async function deleteHost(id: string): Promise<void> {
  if (currentConfig.mode === "local") {
    await localStorage.deleteHost(id);
  } else {
    await supabase.deleteHost(id);
  }

  emit("data-changed", { type: "host", action: "delete", id });
}

// =============================================================================
// CRUD: Passwords
// =============================================================================

/**
 * Get all passwords
 */
export async function getPasswords(): Promise<Password[]> {
  if (currentConfig.mode === "local") {
    const passwords = await localStorage.getPasswords();
    return passwords.map((p) => ({ ...p, user_id: "local" })) as Password[];
  }
  return supabase.getPasswords();
}

/**
 * Create a new password
 */
export async function createPassword(
  password: Omit<Password, "id" | "user_id" | "created_at" | "updated_at">
): Promise<Password> {
  let result: Password;

  if (currentConfig.mode === "local") {
    const localResult = await localStorage.createPassword(password);
    result = { ...localResult, user_id: "local" } as Password;
  } else {
    result = await supabase.createPassword(password);
  }

  emit("data-changed", { type: "password", action: "create", data: result });
  return result;
}

/**
 * Update a password
 */
export async function updatePassword(id: string, updates: Partial<Password>): Promise<Password> {
  let result: Password;

  if (currentConfig.mode === "local") {
    const localResult = await localStorage.updatePassword(id, updates);
    result = { ...localResult, user_id: "local" } as Password;
  } else {
    result = await supabase.updatePassword(id, updates);
  }

  emit("data-changed", { type: "password", action: "update", data: result });
  return result;
}

/**
 * Delete a password
 */
export async function deletePassword(id: string): Promise<void> {
  if (currentConfig.mode === "local") {
    await localStorage.deletePassword(id);
  } else {
    await supabase.deletePassword(id);
  }

  emit("data-changed", { type: "password", action: "delete", id });
}

// =============================================================================
// CRUD: Keys
// =============================================================================

/**
 * Get all SSH keys
 */
export async function getKeys(): Promise<Key[]> {
  if (currentConfig.mode === "local") {
    const keys = await localStorage.getKeys();
    return keys.map((k) => ({ ...k, user_id: "local" })) as Key[];
  }
  return supabase.getKeys();
}

/**
 * Create a new SSH key
 */
export async function createKey(
  key: Omit<Key, "id" | "user_id" | "created_at" | "updated_at">
): Promise<Key> {
  let result: Key;

  if (currentConfig.mode === "local") {
    const localResult = await localStorage.createKey(key);
    result = { ...localResult, user_id: "local" } as Key;
  } else {
    result = await supabase.createKey(key);
  }

  emit("data-changed", { type: "key", action: "create", data: result });
  return result;
}

/**
 * Update an SSH key
 */
export async function updateKey(id: string, updates: Partial<Key>): Promise<Key> {
  let result: Key;

  if (currentConfig.mode === "local") {
    const localResult = await localStorage.updateKey(id, updates);
    result = { ...localResult, user_id: "local" } as Key;
  } else {
    result = await supabase.updateKey(id, updates);
  }

  emit("data-changed", { type: "key", action: "update", data: result });
  return result;
}

/**
 * Delete an SSH key
 */
export async function deleteKey(id: string): Promise<void> {
  if (currentConfig.mode === "local") {
    await localStorage.deleteKey(id);
  } else {
    await supabase.deleteKey(id);
  }

  emit("data-changed", { type: "key", action: "delete", id });
}

// =============================================================================
// CRUD: Tags
// =============================================================================

/**
 * Get all tags
 */
export async function getTags(): Promise<Tag[]> {
  if (currentConfig.mode === "local") {
    const tags = await localStorage.getTags();
    return tags.map((t) => ({ ...t, user_id: "local" })) as Tag[];
  }
  return supabase.getTags();
}

/**
 * Create a new tag
 */
export async function createTag(
  tag: Omit<Tag, "id" | "user_id" | "created_at">
): Promise<Tag> {
  let result: Tag;

  if (currentConfig.mode === "local") {
    const localResult = await localStorage.createTag(tag);
    result = { ...localResult, user_id: "local" } as Tag;
  } else {
    result = await supabase.createTag(tag);
  }

  emit("data-changed", { type: "tag", action: "create", data: result });
  return result;
}

/**
 * Update a tag
 */
export async function updateTag(id: string, updates: Partial<Tag>): Promise<Tag> {
  let result: Tag;

  if (currentConfig.mode === "local") {
    const localResult = await localStorage.updateTag(id, updates);
    result = { ...localResult, user_id: "local" } as Tag;
  } else {
    result = await supabase.updateTag(id, updates);
  }

  emit("data-changed", { type: "tag", action: "update", data: result });
  return result;
}

/**
 * Delete a tag
 */
export async function deleteTag(id: string): Promise<void> {
  if (currentConfig.mode === "local") {
    await localStorage.deleteTag(id);
  } else {
    await supabase.deleteTag(id);
  }

  emit("data-changed", { type: "tag", action: "delete", id });
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize storage system
 * Call this once at app startup
 */
export async function initStorage(): Promise<StorageConfig> {
  // Load config from disk
  await loadConfig();

  // Initialize appropriate backend
  if (currentConfig.mode === "terx-cloud") {
    supabase.initSupabase({ mode: "terx-cloud" });
  } else if (currentConfig.mode === "own-supabase") {
    if (currentConfig.ownSupabase?.url && currentConfig.ownSupabase?.key) {
      supabase.initSupabase({
        mode: "own-supabase",
        supabaseUrl: currentConfig.ownSupabase.url,
        supabaseKey: currentConfig.ownSupabase.key,
      });
    }
  }

  console.log(`[storage] Initialized with mode: ${currentConfig.mode}`);
  return currentConfig;
}

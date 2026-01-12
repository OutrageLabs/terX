/**
 * Supabase Client for terX
 *
 * Supports three storage modes:
 * 1. terX Cloud (default) - hosted Supabase instance
 * 2. Own Supabase - user provides their own Supabase credentials
 * 3. Local only - no cloud sync
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Host,
  HostInsert,
  Password,
  PasswordInsert,
  Key,
  KeyInsert,
  Tag,
  TagInsert,
  UserProfile,
} from "./database.types";
import {
  isEncryptionReady,
  encryptFields,
  decryptFields,
  ENCRYPTED_FIELDS,
} from "./crypto";

// terX Cloud configuration (default)
const TERX_CLOUD_URL = "https://wmzptalcvruyzmfbbobr.supabase.co";
const TERX_CLOUD_KEY = "sb_publishable_92zIYK7mTNBFJakeXGwCGw_M9C453Kl";

export type StorageMode = "terx-cloud" | "own-supabase" | "local";

export interface StorageConfig {
  mode: StorageMode;
  supabaseUrl?: string;
  supabaseKey?: string;
}

let supabaseClient: SupabaseClient<Database> | null = null;
let currentConfig: StorageConfig = { mode: "local" };

/**
 * Initialize Supabase client with given configuration
 */
export function initSupabase(config: StorageConfig): SupabaseClient<Database> | null {
  currentConfig = config;

  if (config.mode === "local") {
    supabaseClient = null;
    return null;
  }

  const url = config.mode === "terx-cloud" ? TERX_CLOUD_URL : config.supabaseUrl!;
  const key = config.mode === "terx-cloud" ? TERX_CLOUD_KEY : config.supabaseKey!;

  supabaseClient = createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storageKey: "terx-auth",
    },
  });

  return supabaseClient;
}

/**
 * Get current Supabase client (may be null if local mode)
 */
export function getSupabase(): SupabaseClient<Database> | null {
  return supabaseClient;
}

/**
 * Get current storage configuration
 */
export function getStorageConfig(): StorageConfig {
  return currentConfig;
}

/**
 * Check if cloud storage is enabled
 */
export function isCloudEnabled(): boolean {
  return currentConfig.mode !== "local" && supabaseClient !== null;
}

// =============================================================================
// Auth helpers
// =============================================================================

export interface SignUpMetadata {
  first_name?: string;
  last_name?: string;
}

export async function signUp(email: string, password: string, metadata?: SignUpMetadata) {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  return supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      // Email confirmation link will redirect to terx.app landing page
      emailRedirectTo: "https://terx.app/auth/confirm",
    },
  });
}

export async function signIn(email: string, password: string) {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  return supabaseClient.auth.signInWithPassword({ email, password });
}

/**
 * Get GitHub OAuth URL for external browser
 * Returns the URL to open in system browser (not WebView)
 */
export async function getGitHubOAuthUrl(): Promise<string> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: "github",
    options: {
      // Redirect to landing page which will pass tokens via deep link
      redirectTo: "https://terx.app/auth/callback",
      // Don't open in WebView - we'll open in external browser
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error("Failed to get OAuth URL");

  return data.url;
}

/**
 * Handle OAuth callback from deep link URL
 * Extracts access_token and refresh_token from URL fragment
 */
export async function handleOAuthCallback(url: string): Promise<boolean> {
  if (!supabaseClient) return false;

  try {
    // Parse the URL - tokens are in the fragment (after #)
    const urlObj = new URL(url);
    const fragment = urlObj.hash.substring(1); // Remove leading #
    const params = new URLSearchParams(fragment);

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      console.error("OAuth callback missing tokens");
      return false;
    }

    // Set the session with the tokens
    const { error } = await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error("Failed to set session:", error);
      return false;
    }

    return true;
  } catch (e) {
    console.error("Failed to handle OAuth callback:", e);
    return false;
  }
}

export async function signOut() {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  return supabaseClient.auth.signOut();
}

export async function getUser() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getUser();
  return data.user;
}

export async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

// =============================================================================
// CRUD: Passwords (with E2E encryption)
// =============================================================================

export async function getPasswords(): Promise<Password[]> {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("passwords").select("*");
  if (error) throw error;

  // Decrypt password field if encryption is ready
  if (isEncryptionReady() && data) {
    return Promise.all(
      data.map((p) => decryptFields(p, [...ENCRYPTED_FIELDS.password]))
    );
  }
  return data ?? [];
}

export async function createPassword(password: Omit<PasswordInsert, "user_id">): Promise<Password> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  if (!isEncryptionReady()) throw new Error("Encryption not initialized");
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  // Encrypt password field before storing
  const encrypted = await encryptFields(password, [...ENCRYPTED_FIELDS.password]);

  const { data, error } = await supabaseClient
    .from("passwords")
    .insert({ ...encrypted, user_id: user.id })
    .select()
    .single();

  if (error) throw error;

  // Return decrypted version
  return decryptFields(data, [...ENCRYPTED_FIELDS.password]);
}

export async function updatePassword(id: string, updates: Partial<Password>): Promise<Password> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  if (!isEncryptionReady()) throw new Error("Encryption not initialized");

  // Encrypt password field if present
  const encrypted = await encryptFields(updates, [...ENCRYPTED_FIELDS.password]);

  const { data, error } = await supabaseClient
    .from("passwords")
    .update(encrypted)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Return decrypted version
  return decryptFields(data, [...ENCRYPTED_FIELDS.password]);
}

export async function deletePassword(id: string): Promise<void> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  const { error } = await supabaseClient.from("passwords").delete().eq("id", id);
  if (error) throw error;
}

// =============================================================================
// CRUD: Keys (with E2E encryption)
// =============================================================================

export async function getKeys(): Promise<Key[]> {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("keys").select("*");
  if (error) throw error;

  // Decrypt key_data and passphrase if encryption is ready
  if (isEncryptionReady() && data) {
    return Promise.all(
      data.map((k) => decryptFields(k, [...ENCRYPTED_FIELDS.key]))
    );
  }
  return data ?? [];
}

export async function createKey(key: Omit<KeyInsert, "user_id">): Promise<Key> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  if (!isEncryptionReady()) throw new Error("Encryption not initialized");
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  // Encrypt key_data and passphrase before storing
  const encrypted = await encryptFields(key, [...ENCRYPTED_FIELDS.key]);

  const { data, error } = await supabaseClient
    .from("keys")
    .insert({ ...encrypted, user_id: user.id })
    .select()
    .single();

  if (error) throw error;

  // Return decrypted version
  return decryptFields(data, [...ENCRYPTED_FIELDS.key]);
}

export async function updateKey(id: string, updates: Partial<Key>): Promise<Key> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  if (!isEncryptionReady()) throw new Error("Encryption not initialized");

  // Encrypt key fields if present
  const encrypted = await encryptFields(updates, [...ENCRYPTED_FIELDS.key]);

  const { data, error } = await supabaseClient
    .from("keys")
    .update(encrypted)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Return decrypted version
  return decryptFields(data, [...ENCRYPTED_FIELDS.key]);
}

export async function deleteKey(id: string): Promise<void> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  const { error } = await supabaseClient.from("keys").delete().eq("id", id);
  if (error) throw error;
}

// =============================================================================
// CRUD: Tags (with E2E encryption)
// =============================================================================

export async function getTags(): Promise<Tag[]> {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("tags").select("*");
  if (error) throw error;

  // Decrypt tag fields if encryption is ready
  if (isEncryptionReady() && data) {
    return Promise.all(
      data.map((t) => decryptFields(t, [...ENCRYPTED_FIELDS.tag]))
    );
  }
  return data ?? [];
}

export async function createTag(tag: Omit<TagInsert, "user_id">): Promise<Tag> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  if (!isEncryptionReady()) throw new Error("Encryption not initialized");
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  // Encrypt tag fields before storing
  const encrypted = await encryptFields(tag, [...ENCRYPTED_FIELDS.tag]);

  const { data, error } = await supabaseClient
    .from("tags")
    .insert({ ...encrypted, user_id: user.id })
    .select()
    .single();

  if (error) throw error;

  // Return decrypted version
  return decryptFields(data, [...ENCRYPTED_FIELDS.tag]);
}

export async function updateTag(id: string, updates: Partial<Tag>): Promise<Tag> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  if (!isEncryptionReady()) throw new Error("Encryption not initialized");

  // Encrypt tag fields if present
  const encrypted = await encryptFields(updates, [...ENCRYPTED_FIELDS.tag]);

  const { data, error } = await supabaseClient
    .from("tags")
    .update(encrypted)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Return decrypted version
  return decryptFields(data, [...ENCRYPTED_FIELDS.tag]);
}

export async function deleteTag(id: string): Promise<void> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  const { error } = await supabaseClient.from("tags").delete().eq("id", id);
  if (error) throw error;
}

// =============================================================================
// CRUD: Hosts (with E2E encryption)
// =============================================================================

export interface HostWithRelations extends Host {
  password?: Password | null;
  key?: Key | null;
  tags?: Tag[];
}

export async function getHosts(): Promise<HostWithRelations[]> {
  if (!supabaseClient) return [];

  const { data, error } = await supabaseClient
    .from("hosts")
    .select(`
      *,
      password:passwords(*),
      key:keys(*),
      host_tags(tag:tags(*))
    `);

  if (error) throw error;
  if (!data) return [];

  // Transform host_tags to flat tags array and decrypt fields
  const hosts = data.map((host) => ({
    ...host,
    tags: host.host_tags?.map((ht: { tag: Tag }) => ht.tag) ?? [],
  }));

  // Decrypt if encryption is ready
  if (isEncryptionReady()) {
    return Promise.all(
      hosts.map(async (host) => {
        const decryptedHost = await decryptFields(host, [...ENCRYPTED_FIELDS.host]);

        // Also decrypt related password and key if present
        if (decryptedHost.password) {
          decryptedHost.password = await decryptFields(
            decryptedHost.password,
            [...ENCRYPTED_FIELDS.password]
          );
        }
        if (decryptedHost.key) {
          decryptedHost.key = await decryptFields(
            decryptedHost.key,
            [...ENCRYPTED_FIELDS.key]
          );
        }

        return decryptedHost;
      })
    );
  }

  return hosts;
}

export async function createHost(
  host: Omit<HostInsert, "user_id">,
  tagIds?: string[]
): Promise<Host> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  if (!isEncryptionReady()) throw new Error("Encryption not initialized");
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  // Encrypt ip, port, login before storing
  const encrypted = await encryptFields(host, [...ENCRYPTED_FIELDS.host]);

  const { data, error } = await supabaseClient
    .from("hosts")
    .insert({ ...encrypted, user_id: user.id })
    .select()
    .single();

  if (error) throw error;

  // Add tags if provided
  if (tagIds && tagIds.length > 0) {
    await supabaseClient
      .from("host_tags")
      .insert(tagIds.map((tag_id) => ({ host_id: data.id, tag_id })));
  }

  // Return decrypted version
  return decryptFields(data, [...ENCRYPTED_FIELDS.host]);
}

export async function updateHost(
  id: string,
  updates: Partial<Host>,
  tagIds?: string[]
): Promise<Host> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  if (!isEncryptionReady()) throw new Error("Encryption not initialized");

  // Encrypt host fields if present
  const encrypted = await encryptFields(updates, [...ENCRYPTED_FIELDS.host]);

  const { data, error } = await supabaseClient
    .from("hosts")
    .update(encrypted)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Update tags if provided
  if (tagIds !== undefined) {
    // Remove existing tags
    await supabaseClient.from("host_tags").delete().eq("host_id", id);

    // Add new tags
    if (tagIds.length > 0) {
      await supabaseClient
        .from("host_tags")
        .insert(tagIds.map((tag_id) => ({ host_id: id, tag_id })));
    }
  }

  // Return decrypted version
  return decryptFields(data, [...ENCRYPTED_FIELDS.host]);
}

export async function deleteHost(id: string): Promise<void> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  const { error } = await supabaseClient.from("hosts").delete().eq("id", id);
  if (error) throw error;
}

// =============================================================================
// Sync: Full data export/import
// =============================================================================

export interface SyncData {
  passwords: Password[];
  keys: Key[];
  tags: Tag[];
  hosts: Host[];
  host_tags: { host_id: string; tag_id: string }[];
}

export async function exportAllData(): Promise<SyncData> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");

  const [passwords, keys, tags, hosts, hostTags] = await Promise.all([
    supabaseClient.from("passwords").select("*"),
    supabaseClient.from("keys").select("*"),
    supabaseClient.from("tags").select("*"),
    supabaseClient.from("hosts").select("*"),
    supabaseClient.from("host_tags").select("*"),
  ]);

  return {
    passwords: passwords.data ?? [],
    keys: keys.data ?? [],
    tags: tags.data ?? [],
    hosts: hosts.data ?? [],
    host_tags: hostTags.data ?? [],
  };
}

// =============================================================================
// User Profile: Encryption verification data
// Master password is NEVER stored - only salt and test sample
// =============================================================================

/**
 * Get current user's encryption profile
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  if (!supabaseClient) return null;
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabaseClient
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    // PGRST116 = no rows returned (new user)
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

/**
 * Create user profile with encryption verification data
 * Called on first master password setup
 */
export async function createUserProfile(
  encryptionSalt: string,
  testEncrypted: string
): Promise<UserProfile> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabaseClient
    .from("user_profiles")
    .insert({
      user_id: user.id,
      encryption_salt: encryptionSalt,
      test_encrypted: testEncrypted,
      failed_attempts: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Increment failed password attempts
 * Returns the new count
 */
export async function incrementFailedAttempts(): Promise<number> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  // Get current count
  const profile = await getUserProfile();
  if (!profile) throw new Error("User profile not found");

  const newCount = (profile.failed_attempts ?? 0) + 1;

  const { error } = await supabaseClient
    .from("user_profiles")
    .update({
      failed_attempts: newCount,
      last_failed_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) throw error;
  return newCount;
}

/**
 * Reset failed attempts counter (after successful login)
 */
export async function resetFailedAttempts(): Promise<void> {
  if (!supabaseClient) return;
  const user = await getUser();
  if (!user) return;

  await supabaseClient
    .from("user_profiles")
    .update({
      failed_attempts: 0,
      last_failed_at: null,
    })
    .eq("user_id", user.id);
}

/**
 * Delete user profile and all encrypted data
 * Called after 6 failed password attempts (data wipe)
 */
export async function wipeUserData(): Promise<void> {
  if (!supabaseClient) throw new Error("Cloud storage not initialized");
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  // Delete all user data (cascade will handle host_tags)
  await Promise.all([
    supabaseClient.from("hosts").delete().eq("user_id", user.id),
    supabaseClient.from("passwords").delete().eq("user_id", user.id),
    supabaseClient.from("keys").delete().eq("user_id", user.id),
    supabaseClient.from("tags").delete().eq("user_id", user.id),
    supabaseClient.from("user_profiles").delete().eq("user_id", user.id),
  ]);
}

/**
 * Maximum failed attempts before warning (5) and wipe (6)
 */
export const MAX_FAILED_ATTEMPTS_WARNING = 5;
export const MAX_FAILED_ATTEMPTS_WIPE = 6;

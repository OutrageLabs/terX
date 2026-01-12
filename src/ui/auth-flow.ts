/**
 * Auth Flow Orchestrator for terX
 *
 * Handles the complete authentication flow:
 * 1. Storage mode selection (first run or from settings)
 * 2. Authentication (for cloud modes)
 * 3. Master password entry
 * 4. Session restoration
 */

import { t } from "../i18n";
import * as storage from "../lib/storage";
import * as supabase from "../lib/supabase";
import { validatePassword, getSalt, encrypt } from "../lib/crypto";
import { showStorageSelector } from "./storage-selector";
import { showAuth, showVerificationMessage } from "./auth";
import { showMasterPassword, showMasterPasswordWithAttempts, showCloudMasterPassword, getMasterPasswordMode } from "./master-password";
import type { StorageMode, StorageConfig } from "../lib/storage";

// Maximum password attempts for local storage
const MAX_PASSWORD_ATTEMPTS = 3;

export interface AuthFlowResult {
  success: boolean;
  mode: StorageMode;
  isNewUser?: boolean;
}

/**
 * Run the complete auth flow
 *
 * @param forceStorageSelection - Force storage mode selection even if already configured
 */
export async function runAuthFlow(forceStorageSelection = false): Promise<AuthFlowResult> {
  // Initialize storage (loads config AND initializes Supabase if cloud mode)
  const config = await storage.initStorage();
  const currentMode = config.mode;

  // Step 1: Storage mode selection (first run or forced)
  let selectedMode = currentMode;

  if (forceStorageSelection || !currentMode) {
    const mode = await showStorageSelector(currentMode);
    if (!mode) {
      // User cancelled - stay with current mode
      return { success: false, mode: currentMode };
    }
    selectedMode = mode;

    // Save if changed
    if (selectedMode !== currentMode) {
      await storage.setStorageMode(selectedMode);
    }
  }

  // Step 2: Handle based on storage mode
  if (selectedMode === "local") {
    // Local mode - just need master password if data exists
    return handleLocalMode();
  } else if (selectedMode === "terx-cloud") {
    // Cloud mode - need authentication first
    return handleCloudMode();
  } else {
    // Own Supabase - placeholder for future
    console.warn("Own Supabase mode not yet implemented");
    return { success: false, mode: selectedMode };
  }
}

/**
 * Handle local storage mode
 */
async function handleLocalMode(): Promise<AuthFlowResult> {
  // Check if master password is already set for this session
  if (storage.isMasterPasswordSet()) {
    return { success: true, mode: "local" };
  }

  // Check if local data exists (returning user) - use async version
  const hasData = await storage.checkLocalDataExists();

  if (!hasData) {
    // New user - set up master password
    const result = await showMasterPassword("setup");
    if (!result.success) {
      return { success: false, mode: "local" };
    }
    return { success: true, mode: "local", isNewUser: true };
  }

  // Returning user - get salt from stored data and unlock
  const storedSalt = await storage.getStoredSalt();

  // Show unlock dialog with 3-attempt logic
  const result = await showMasterPasswordWithAttempts(
    storedSalt,
    MAX_PASSWORD_ATTEMPTS,
    async () => {
      // Called after max attempts - backup the file
      await storage.backupLocalStorage();
    }
  );

  if (!result.success) {
    if (result.backupCreated) {
      // File was backed up after 3 failed attempts
      // User can restart app to create new storage
      return { success: false, mode: "local" };
    }
    return { success: false, mode: "local" };
  }

  return { success: true, mode: "local" };
}

/**
 * Handle terX Cloud mode
 */
async function handleCloudMode(): Promise<AuthFlowResult> {
  // Check if already authenticated
  const isAuth = await storage.isAuthenticated();

  if (!isAuth) {
    // Need to authenticate
    const authResult = await showAuth("signIn");

    // User wants to switch to local storage
    if (authResult.switchToLocal) {
      await storage.setStorageMode("local");
      return handleLocalMode();
    }

    if (!authResult.success) {
      return { success: false, mode: "terx-cloud" };
    }

    if (authResult.needsEmailVerification) {
      showVerificationMessage();
      return { success: false, mode: "terx-cloud" };
    }
  }

  // Check if master password is already set for this session
  if (storage.isMasterPasswordSet()) {
    return { success: true, mode: "terx-cloud" };
  }

  // Get user profile from database (not user_metadata)
  const userProfile = await supabase.getUserProfile();
  const isNewUser = !userProfile;

  if (isNewUser) {
    // New user - setup master password (double entry)
    const mpResult = await showMasterPassword("setup");

    if (!mpResult.success) {
      return { success: false, mode: "terx-cloud" };
    }

    // After successful setup, encryption is initialized
    // Save salt and test_encrypted to user_profiles table
    const salt = getSalt();
    if (salt) {
      const testEncrypted = await encrypt("terx-password-test");
      await supabase.createUserProfile(salt, testEncrypted);
    }

    return { success: true, mode: "terx-cloud", isNewUser: true };
  }

  // Returning user - show unlock dialog with attempt tracking
  const mpResult = await showCloudMasterPassword(
    userProfile.encryption_salt,
    userProfile.test_encrypted,
    userProfile.failed_attempts ?? 0
  );

  if (!mpResult.success) {
    if (mpResult.dataWiped) {
      // All data was wiped after 6 failed attempts
      // User needs to set up new master password
      return handleCloudMode();
    }
    return { success: false, mode: "terx-cloud" };
  }

  return { success: true, mode: "terx-cloud" };
}

/**
 * Check if auth flow is needed
 */
export async function isAuthRequired(): Promise<boolean> {
  const config = storage.getConfig();

  // If no mode selected, auth is required
  if (!config.mode) {
    return true;
  }

  // If master password already set, no auth needed
  if (storage.isMasterPasswordSet()) {
    return false;
  }

  // For cloud mode, check authentication
  if (config.mode === "terx-cloud" || config.mode === "own-supabase") {
    const isAuth = await storage.isAuthenticated();
    return !isAuth || !storage.isMasterPasswordSet();
  }

  // For local mode, check if data exists (need master password)
  return storage.isMasterPasswordRequired();
}

/**
 * Handle auth state changes (e.g., from OAuth redirect)
 */
export function setupAuthListener(callback: (isAuthenticated: boolean) => void): () => void {
  return storage.onStorageEvent((event, data) => {
    if (event === "auth-changed") {
      const authData = data as { user: unknown } | undefined;
      callback(!!authData?.user);
    }
  });
}

/**
 * Sign out and clear session
 */
export async function signOut(): Promise<void> {
  await storage.signOut();
  storage.clearMasterPassword();
}

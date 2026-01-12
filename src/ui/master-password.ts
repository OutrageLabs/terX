/**
 * Master Password Dialog for terX
 *
 * Handles master password entry for E2E encryption:
 * - New users: Set up encryption password
 * - Returning users: Enter existing password to unlock
 *
 * The master password never leaves the client.
 * It's used to derive an AES-256 key via PBKDF2.
 */

import { t } from "../i18n";
import { eyeIcon, eyeOffIcon } from "./dialogs";
import * as storage from "../lib/storage";
import * as supabase from "../lib/supabase";
import { validatePassword, initEncryption } from "../lib/crypto";

export type MasterPasswordMode = "unlock" | "setup";

interface MasterPasswordResult {
  success: boolean;
  error?: string;
  backupCreated?: boolean;
}

interface CloudMasterPasswordResult {
  success: boolean;
  error?: string;
  dataWiped?: boolean;
}

// Icons
const lockIcon = `<svg class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
</svg>`;

const shieldIcon = `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
</svg>`;

/**
 * Show master password dialog
 */
export async function showMasterPassword(
  mode: MasterPasswordMode,
  existingSalt?: string
): Promise<MasterPasswordResult> {
  return new Promise((resolve) => {
    let isLoading = false;
    let showPassword = false;
    let showConfirmPassword = false;

    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "master-password-overlay";

    const render = (errorMessage?: string) => {
      overlay.innerHTML = `
        <div class="master-password-container">
          <!-- Logo & Branding -->
          <div class="master-password-header">
            <div class="master-password-logo">
              <div class="master-password-logo-icon">${lockIcon}</div>
            </div>
            <h1 class="master-password-title">terX</h1>
            <p class="master-password-subtitle">
              ${mode === "setup" ? t("masterPassword.setNewDesc") : t("masterPassword.description")}
            </p>
          </div>

          <!-- Error Message -->
          ${errorMessage ? `
            <div class="master-password-error">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>${errorMessage}</span>
            </div>
          ` : ""}

          <!-- Form -->
          <form class="master-password-form">
            <div class="master-password-field">
              <label class="master-password-label">${t("masterPassword.title")}</label>
              <div class="master-password-input-wrapper">
                <input
                  type="${showPassword ? "text" : "password"}"
                  name="master-password"
                  class="master-password-input"
                  placeholder="${t("masterPassword.placeholder")}"
                  required
                  minlength="8"
                  autocomplete="off"
                  ${isLoading ? "disabled" : ""}
                />
                <button type="button" class="master-password-toggle" data-action="toggle-password" tabindex="-1">
                  ${showPassword ? eyeOffIcon : eyeIcon}
                </button>
              </div>
              <p class="master-password-hint">${t("masterPassword.minLength")}</p>
            </div>

            ${mode === "setup" ? `
              <div class="master-password-field">
                <label class="master-password-label">${t("masterPassword.confirm")}</label>
                <div class="master-password-input-wrapper">
                  <input
                    type="${showConfirmPassword ? "text" : "password"}"
                    name="confirm-password"
                    class="master-password-input"
                    placeholder="${t("masterPassword.confirmPlaceholder")}"
                    required
                    minlength="8"
                    autocomplete="off"
                    ${isLoading ? "disabled" : ""}
                  />
                  <button type="button" class="master-password-toggle" data-action="toggle-confirm" tabindex="-1">
                    ${showConfirmPassword ? eyeOffIcon : eyeIcon}
                  </button>
                </div>
              </div>
            ` : ""}

            <button type="submit" class="master-password-submit" ${isLoading ? "disabled" : ""}>
              ${isLoading ? `
                <svg class="master-password-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"/>
                </svg>
                ${t("masterPassword.unlocking")}
              ` : `
                ${shieldIcon}
                ${mode === "setup" ? t("masterPassword.setNew") : t("masterPassword.unlock")}
              `}
            </button>
          </form>

          <!-- Footer -->
          <div class="master-password-footer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>${t("masterPassword.e2eEncryption")}</span>
          </div>
        </div>
      `;

      setupEventListeners();
    };

    const setupEventListeners = () => {
      // Toggle password visibility
      overlay.querySelector('[data-action="toggle-password"]')?.addEventListener("click", (e) => {
        e.preventDefault();
        showPassword = !showPassword;
        const input = overlay.querySelector('input[name="master-password"]') as HTMLInputElement;
        const btn = e.currentTarget as HTMLButtonElement;
        if (input) {
          input.type = showPassword ? "text" : "password";
          btn.innerHTML = showPassword ? eyeOffIcon : eyeIcon;
          input.focus();
        }
      });

      // Toggle confirm password visibility
      overlay.querySelector('[data-action="toggle-confirm"]')?.addEventListener("click", (e) => {
        e.preventDefault();
        showConfirmPassword = !showConfirmPassword;
        const input = overlay.querySelector('input[name="confirm-password"]') as HTMLInputElement;
        const btn = e.currentTarget as HTMLButtonElement;
        if (input) {
          input.type = showConfirmPassword ? "text" : "password";
          btn.innerHTML = showConfirmPassword ? eyeOffIcon : eyeIcon;
          input.focus();
        }
      });

      // Form submission
      const form = overlay.querySelector("form") as HTMLFormElement;
      form?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const password = formData.get("master-password") as string;
        const confirmPassword = formData.get("confirm-password") as string;

        // Validate
        if (!password || password.length < 8) {
          render(t("masterPassword.minLength"));
          return;
        }

        // Check confirmation for setup mode
        if (mode === "setup" && password !== confirmPassword) {
          render(t("masterPassword.passwordMismatch"));
          return;
        }

        isLoading = true;
        render();

        try {
          const result = await storage.setMasterPassword(password, existingSalt);

          if (!result.success) {
            isLoading = false;
            render(result.error || t("masterPassword.wrongPassword"));
            return;
          }

          // Success - fade out
          overlay.style.opacity = "0";
          setTimeout(() => {
            overlay.remove();
            resolve({ success: true });
          }, 300);
        } catch (error) {
          isLoading = false;
          render(error instanceof Error ? error.message : t("errors.unknownError"));
        }
      });
    };

    // Initial render
    render();

    // Mount
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    // Focus password input
    setTimeout(() => {
      const passwordInput = overlay.querySelector('input[name="master-password"]') as HTMLInputElement;
      passwordInput?.focus();
    }, 100);
  });
}

/**
 * Determine master password mode based on user state
 */
export function getMasterPasswordMode(userHasSalt: boolean): MasterPasswordMode {
  return userHasSalt ? "unlock" : "setup";
}

/**
 * Show master password dialog with attempt tracking for local storage unlock
 *
 * @param storedSalt - Salt extracted from stored data (or null if migration needed)
 * @param maxAttempts - Maximum number of attempts before backup
 * @param onMaxAttempts - Callback when max attempts reached (should backup file)
 */
export async function showMasterPasswordWithAttempts(
  storedSalt: string | null,
  maxAttempts: number,
  onMaxAttempts: () => Promise<void>
): Promise<MasterPasswordResult> {
  return new Promise((resolve) => {
    let attempts = 0;
    let isLoading = false;
    let showPassword = false;

    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "master-password-overlay";

    const render = (errorMessage?: string, attemptsLeft?: number) => {
      const attemptsInfo = attemptsLeft !== undefined && attemptsLeft < maxAttempts
        ? `<span class="text-red-400 text-sm">(${t("masterPassword.attemptsLeft", { count: attemptsLeft })})</span>`
        : "";

      overlay.innerHTML = `
        <div class="master-password-container">
          <!-- Logo & Branding -->
          <div class="master-password-header">
            <div class="master-password-logo">
              <div class="master-password-logo-icon">${lockIcon}</div>
            </div>
            <h1 class="master-password-title">terX</h1>
            <p class="master-password-subtitle">${t("masterPassword.description")}</p>
          </div>

          <!-- Error Message -->
          ${errorMessage ? `
            <div class="master-password-error">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>${errorMessage} ${attemptsInfo}</span>
            </div>
          ` : ""}

          <!-- Form -->
          <form class="master-password-form">
            <div class="master-password-field">
              <label class="master-password-label">${t("masterPassword.title")}</label>
              <div class="master-password-input-wrapper">
                <input
                  type="${showPassword ? "text" : "password"}"
                  name="master-password"
                  class="master-password-input"
                  placeholder="${t("masterPassword.placeholder")}"
                  required
                  minlength="8"
                  autocomplete="off"
                  ${isLoading ? "disabled" : ""}
                />
                <button type="button" class="master-password-toggle" data-action="toggle-password" tabindex="-1">
                  ${showPassword ? eyeOffIcon : eyeIcon}
                </button>
              </div>
            </div>

            <button type="submit" class="master-password-submit" ${isLoading ? "disabled" : ""}>
              ${isLoading ? `
                <svg class="master-password-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"/>
                </svg>
                ${t("masterPassword.unlocking")}
              ` : `
                ${shieldIcon}
                ${t("masterPassword.unlock")}
              `}
            </button>
          </form>

          <!-- Footer -->
          <div class="master-password-footer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>${t("masterPassword.e2eEncryption")}</span>
          </div>
        </div>
      `;

      setupEventListeners();
    };

    const setupEventListeners = () => {
      // Toggle password visibility
      overlay.querySelector('[data-action="toggle-password"]')?.addEventListener("click", (e) => {
        e.preventDefault();
        showPassword = !showPassword;
        const input = overlay.querySelector('input[name="master-password"]') as HTMLInputElement;
        const btn = e.currentTarget as HTMLButtonElement;
        if (input) {
          input.type = showPassword ? "text" : "password";
          btn.innerHTML = showPassword ? eyeOffIcon : eyeIcon;
          input.focus();
        }
      });

      // Form submission
      const form = overlay.querySelector("form") as HTMLFormElement;
      form?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const password = formData.get("master-password") as string;

        if (!password || password.length < 8) {
          render(t("masterPassword.minLength"));
          return;
        }

        isLoading = true;
        render();

        try {
          // Initialize encryption with password and stored salt
          const result = await storage.setMasterPassword(password, storedSalt || undefined);

          if (!result.success) {
            attempts++;
            isLoading = false;

            if (attempts >= maxAttempts) {
              // Max attempts reached - backup and show final error
              await onMaxAttempts();

              overlay.innerHTML = `
                <div class="master-password-container">
                  <div class="master-password-header">
                    <div class="master-password-logo">
                      <div class="master-password-logo-icon text-red-400">${lockIcon}</div>
                    </div>
                    <h1 class="master-password-title text-red-400">${t("masterPassword.maxAttemptsTitle")}</h1>
                    <p class="master-password-subtitle">${t("masterPassword.maxAttemptsDesc")}</p>
                  </div>
                  <button class="master-password-submit" data-action="close">
                    ${t("common.ok")}
                  </button>
                </div>
              `;

              overlay.querySelector('[data-action="close"]')?.addEventListener("click", () => {
                overlay.remove();
                resolve({ success: false, backupCreated: true });
              });
              return;
            }

            render(t("masterPassword.wrongPassword"), maxAttempts - attempts);
            return;
          }

          // Password correct - now try to actually load the data to verify
          const loadSuccess = await storage.tryLoadLocalData();

          if (!loadSuccess) {
            attempts++;
            isLoading = false;
            storage.clearMasterPassword();

            if (attempts >= maxAttempts) {
              await onMaxAttempts();

              overlay.innerHTML = `
                <div class="master-password-container">
                  <div class="master-password-header">
                    <div class="master-password-logo">
                      <div class="master-password-logo-icon text-red-400">${lockIcon}</div>
                    </div>
                    <h1 class="master-password-title text-red-400">${t("masterPassword.maxAttemptsTitle")}</h1>
                    <p class="master-password-subtitle">${t("masterPassword.maxAttemptsDesc")}</p>
                  </div>
                  <button class="master-password-submit" data-action="close">
                    ${t("common.ok")}
                  </button>
                </div>
              `;

              overlay.querySelector('[data-action="close"]')?.addEventListener("click", () => {
                overlay.remove();
                resolve({ success: false, backupCreated: true });
              });
              return;
            }

            render(t("masterPassword.wrongPassword"), maxAttempts - attempts);
            return;
          }

          // Success - fade out
          overlay.style.opacity = "0";
          setTimeout(() => {
            overlay.remove();
            resolve({ success: true });
          }, 300);
        } catch (error) {
          attempts++;
          isLoading = false;
          storage.clearMasterPassword();

          if (attempts >= maxAttempts) {
            await onMaxAttempts();

            overlay.innerHTML = `
              <div class="master-password-container">
                <div class="master-password-header">
                  <div class="master-password-logo">
                    <div class="master-password-logo-icon text-red-400">${lockIcon}</div>
                  </div>
                  <h1 class="master-password-title text-red-400">${t("masterPassword.maxAttemptsTitle")}</h1>
                  <p class="master-password-subtitle">${t("masterPassword.maxAttemptsDesc")}</p>
                </div>
                <button class="master-password-submit" data-action="close">
                  ${t("common.ok")}
                </button>
              </div>
            `;

            overlay.querySelector('[data-action="close"]')?.addEventListener("click", () => {
              overlay.remove();
              resolve({ success: false, backupCreated: true });
            });
            return;
          }

          render(t("masterPassword.wrongPassword"), maxAttempts - attempts);
        }
      });
    };

    // Initial render
    render();

    // Mount
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    // Focus password input
    setTimeout(() => {
      const passwordInput = overlay.querySelector('input[name="master-password"]') as HTMLInputElement;
      passwordInput?.focus();
    }, 100);
  });
}

/**
 * Show master password dialog for cloud storage with attempt tracking
 *
 * Flow:
 * - Attempts 1-5: Show warning with remaining attempts after failure
 * - Attempt 5: Show final warning that next failure will wipe data
 * - Attempt 6: Wipe all user data and return dataWiped: true
 *
 * @param encryptionSalt - Salt from user_profiles table
 * @param testEncrypted - Test encrypted data from user_profiles table
 * @param currentFailedAttempts - Current failed attempts count from DB
 */
export async function showCloudMasterPassword(
  encryptionSalt: string,
  testEncrypted: string,
  currentFailedAttempts: number
): Promise<CloudMasterPasswordResult> {
  return new Promise((resolve) => {
    let isLoading = false;
    let showPasswordToggle = false;
    let failedAttempts = currentFailedAttempts;

    const MAX_WARNINGS = supabase.MAX_FAILED_ATTEMPTS_WARNING; // 5
    const MAX_WIPE = supabase.MAX_FAILED_ATTEMPTS_WIPE; // 6

    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "master-password-overlay";

    const render = (errorMessage?: string) => {
      const attemptsRemaining = MAX_WIPE - failedAttempts;
      const showWarningBanner = failedAttempts > 0 && failedAttempts < MAX_WIPE;
      const isFinalWarning = failedAttempts === MAX_WARNINGS;

      overlay.innerHTML = `
        <div class="master-password-container">
          <!-- Logo & Branding -->
          <div class="master-password-header">
            <div class="master-password-logo">
              <div class="master-password-logo-icon">${lockIcon}</div>
            </div>
            <h1 class="master-password-title">terX</h1>
            <p class="master-password-subtitle">${t("masterPassword.description")}</p>
          </div>

          <!-- Warning about remaining attempts -->
          ${showWarningBanner ? `
            <div class="master-password-warning ${isFinalWarning ? 'master-password-warning-final' : ''}">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <span>
                ${isFinalWarning
                  ? t("masterPassword.finalWarning")
                  : t("masterPassword.attemptsLeft", { count: attemptsRemaining })}
              </span>
            </div>
          ` : ""}

          <!-- Error Message -->
          ${errorMessage ? `
            <div class="master-password-error">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>${errorMessage}</span>
            </div>
          ` : ""}

          <!-- Form -->
          <form class="master-password-form">
            <div class="master-password-field">
              <label class="master-password-label">${t("masterPassword.title")}</label>
              <div class="master-password-input-wrapper">
                <input
                  type="${showPasswordToggle ? "text" : "password"}"
                  name="master-password"
                  class="master-password-input"
                  placeholder="${t("masterPassword.placeholder")}"
                  required
                  minlength="8"
                  autocomplete="off"
                  ${isLoading ? "disabled" : ""}
                />
                <button type="button" class="master-password-toggle" data-action="toggle-password" tabindex="-1">
                  ${showPasswordToggle ? eyeOffIcon : eyeIcon}
                </button>
              </div>
            </div>

            <button type="submit" class="master-password-submit" ${isLoading ? "disabled" : ""}>
              ${isLoading ? `
                <svg class="master-password-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"/>
                </svg>
                ${t("masterPassword.unlocking")}
              ` : `
                ${shieldIcon}
                ${t("masterPassword.unlock")}
              `}
            </button>
          </form>

          <!-- Footer -->
          <div class="master-password-footer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>${t("masterPassword.e2eEncryption")}</span>
          </div>
        </div>
      `;

      setupCloudEventListeners();
    };

    const showDataWipedScreen = () => {
      overlay.innerHTML = `
        <div class="master-password-container">
          <div class="master-password-header">
            <div class="master-password-logo">
              <div class="master-password-logo-icon text-red-400">${lockIcon}</div>
            </div>
            <h1 class="master-password-title text-red-400">${t("masterPassword.dataWipedTitle")}</h1>
            <p class="master-password-subtitle">${t("masterPassword.dataWipedDesc")}</p>
          </div>
          <button class="master-password-submit" data-action="close">
            ${t("common.ok")}
          </button>
        </div>
      `;

      overlay.querySelector('[data-action="close"]')?.addEventListener("click", () => {
        overlay.remove();
        resolve({ success: false, dataWiped: true });
      });
    };

    const setupCloudEventListeners = () => {
      // Toggle password visibility
      overlay.querySelector('[data-action="toggle-password"]')?.addEventListener("click", (e) => {
        e.preventDefault();
        showPasswordToggle = !showPasswordToggle;
        const input = overlay.querySelector('input[name="master-password"]') as HTMLInputElement;
        const btn = e.currentTarget as HTMLButtonElement;
        if (input) {
          input.type = showPasswordToggle ? "text" : "password";
          btn.innerHTML = showPasswordToggle ? eyeOffIcon : eyeIcon;
          input.focus();
        }
      });

      // Form submission
      const form = overlay.querySelector("form") as HTMLFormElement;
      form?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const password = formData.get("master-password") as string;

        if (!password || password.length < 8) {
          render(t("masterPassword.minLength"));
          return;
        }

        isLoading = true;
        render();

        try {
          // Validate password against stored test data
          const isValid = await validatePassword(password, encryptionSalt, testEncrypted);

          if (!isValid) {
            isLoading = false;

            // Increment failed attempts in database
            failedAttempts = await supabase.incrementFailedAttempts();

            if (failedAttempts >= MAX_WIPE) {
              // Max attempts reached - wipe all data
              await supabase.wipeUserData();
              showDataWipedScreen();
              return;
            }

            render(t("masterPassword.wrongPassword"));
            return;
          }

          // Password correct - initialize encryption
          await initEncryption(password, encryptionSalt);

          // Reset failed attempts counter
          await supabase.resetFailedAttempts();

          // Success - fade out
          overlay.style.opacity = "0";
          setTimeout(() => {
            overlay.remove();
            resolve({ success: true });
          }, 300);
        } catch (error) {
          isLoading = false;
          render(error instanceof Error ? error.message : t("errors.unknownError"));
        }
      });
    };

    // Initial render
    render();

    // Mount
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    // Focus password input
    setTimeout(() => {
      const passwordInput = overlay.querySelector('input[name="master-password"]') as HTMLInputElement;
      passwordInput?.focus();
    }, 100);
  });
}

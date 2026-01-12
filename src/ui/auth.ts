/**
 * Authentication UI for terX Cloud
 *
 * Provides login/registration screens with:
 * - Email/password authentication
 * - GitHub OAuth
 * - Form validation
 * - Error handling
 */

import { t } from "../i18n";
import { showDialog, githubIcon, eyeIcon, eyeOffIcon, inputClasses, labelClasses } from "./dialogs";
import * as storage from "../lib/storage";

export type AuthMode = "signIn" | "signUp";

interface AuthResult {
  success: boolean;
  error?: string;
  needsEmailVerification?: boolean;
  switchToLocal?: boolean;
}

/**
 * Show authentication dialog
 */
export async function showAuth(initialMode: AuthMode = "signIn"): Promise<AuthResult> {
  return new Promise((resolve) => {
    let currentMode = initialMode;
    let isLoading = false;

    const getContent = (mode: AuthMode, errorMessage?: string) => `
      ${errorMessage ? `
        <div class="alert alert-error mb-4">${errorMessage}</div>
      ` : ""}

      <!-- GitHub OAuth -->
      <button
        class="btn btn-oauth-github w-full"
        data-action="github"
        ${isLoading ? "disabled" : ""}
      >
        ${githubIcon}
        ${t("auth.signInWithGitHub")}
      </button>

      <!-- Divider -->
      <div class="divider-text my-5">
        <span>${t("auth.orDivider")}</span>
      </div>

      <!-- Form -->
      <form class="flex flex-col gap-4" data-mode="${mode}">
        ${mode === "signUp" ? `
          <!-- Name fields for registration -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="${labelClasses}">${t("auth.firstName")}</label>
              <input
                type="text"
                name="firstName"
                class="${inputClasses}"
                placeholder="${t("auth.firstNamePlaceholder")}"
                required
                ${isLoading ? "disabled" : ""}
              />
            </div>
            <div>
              <label class="${labelClasses}">${t("auth.lastName")}</label>
              <input
                type="text"
                name="lastName"
                class="${inputClasses}"
                placeholder="${t("auth.lastNamePlaceholder")}"
                required
                ${isLoading ? "disabled" : ""}
              />
            </div>
          </div>
        ` : ""}

        <div>
          <label class="${labelClasses}">${t("auth.email")}</label>
          <input
            type="email"
            name="email"
            class="${inputClasses}"
            placeholder="${t("auth.emailPlaceholder")}"
            required
            ${isLoading ? "disabled" : ""}
          />
        </div>

        <div class="form-group">
          <label class="${labelClasses}">${t("auth.password")}</label>
          <div class="relative">
            <input
              type="password"
              name="password"
              class="${inputClasses} pr-10"
              placeholder="${t("auth.passwordPlaceholder")}"
              required
              minlength="6"
              ${isLoading ? "disabled" : ""}
            />
            <div class="input-actions">
              <button type="button" class="input-action-btn" data-action="toggle-password" tabindex="-1">
                ${eyeIcon}
              </button>
            </div>
          </div>
          ${mode === "signUp" ? `
            <p class="text-sm text-overlay-0 mt-1.5">${t("auth.passwordMinLength")}</p>
          ` : ""}
        </div>

        <button
          type="submit"
          class="btn btn-primary w-full"
          ${isLoading ? "disabled" : ""}
        >
          ${isLoading
            ? (mode === "signIn" ? t("auth.signingIn") : t("auth.creatingAccount"))
            : (mode === "signIn" ? t("auth.signIn") : t("auth.signUp"))
          }
        </button>
      </form>

      <!-- Footer -->
      <div class="auth-footer">
        ${mode === "signIn" ? `
          <button class="auth-link" data-action="switch-mode">${t("auth.signUp")}</button>
          <span class="auth-separator">•</span>
          <button class="auth-link" data-action="forgot-password">${t("auth.forgotPassword")}</button>
        ` : `
          <button class="auth-link" data-action="switch-mode">${t("auth.signIn")}</button>
        `}
      </div>

      <!-- Use Local Storage Option -->
      <div class="mt-4 pt-4 border-t border-surface-0 text-center">
        <button class="auth-link text-overlay-1" data-action="use-local">
          ${t("auth.useLocalStorage")}
        </button>
      </div>
    `;

    const { element, close } = showDialog({
      title: `<svg class="w-5 h-5 text-blue" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> terX Cloud`,
      content: getContent(currentMode),
      onClose: () => resolve({ success: false }),
    });

    const updateContent = (errorMessage?: string) => {
      const body = element.querySelector("[class*='px-6 py-5']") || element.querySelector("div:nth-child(2)");
      if (body) {
        body.innerHTML = getContent(currentMode, errorMessage);
        setupEventListeners();
      }
    };

    const setupEventListeners = () => {
      // GitHub OAuth - opens in system browser for full passkey support
      element.querySelector('[data-action="github"]')?.addEventListener("click", async () => {
        try {
          isLoading = true;
          updateContent();
          await storage.signInWithGitHub();
          // Show message that user was redirected to browser
          // Dialog stays open - will be closed when deep link callback arrives
          isLoading = false;
          updateContent(t("auth.redirectedToBrowser"));
        } catch (error) {
          isLoading = false;
          updateContent(error instanceof Error ? error.message : t("errors.unknownError"));
        }
      });

      // Toggle password visibility
      element.querySelector('[data-action="toggle-password"]')?.addEventListener("click", (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const input = element.querySelector('input[name="password"]') as HTMLInputElement;
        if (input) {
          const isPassword = input.type === "password";
          input.type = isPassword ? "text" : "password";
          btn.innerHTML = isPassword ? eyeOffIcon : eyeIcon;
        }
      });

      // Switch between sign in / sign up
      element.querySelector('[data-action="switch-mode"]')?.addEventListener("click", () => {
        currentMode = currentMode === "signIn" ? "signUp" : "signIn";
        updateContent();
      });

      // Forgot password
      element.querySelector('[data-action="forgot-password"]')?.addEventListener("click", () => {
        // TODO: Implement password reset
        console.log("Forgot password clicked");
      });

      // Use local storage instead
      element.querySelector('[data-action="use-local"]')?.addEventListener("click", () => {
        close();
        resolve({ success: false, switchToLocal: true });
      });

      // Form submission
      const form = element.querySelector("form") as HTMLFormElement;
      form?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;
        const firstName = formData.get("firstName") as string;
        const lastName = formData.get("lastName") as string;

        // Validate
        if (!email) {
          updateContent(t("auth.emailRequired"));
          return;
        }
        if (!password) {
          updateContent(t("auth.passwordRequired"));
          return;
        }
        if (password.length < 6) {
          updateContent(t("auth.passwordMinLength"));
          return;
        }

        // Validate name fields for sign up
        if (currentMode === "signUp") {
          if (!firstName || !firstName.trim()) {
            updateContent(t("auth.firstNameRequired"));
            return;
          }
          if (!lastName || !lastName.trim()) {
            updateContent(t("auth.lastNameRequired"));
            return;
          }
        }

        isLoading = true;
        updateContent();

        try {
          if (currentMode === "signIn") {
            const result = await storage.signIn(email, password);
            if (result.error) {
              isLoading = false;
              updateContent(t("auth.invalidCredentials"));
              return;
            }
            close();
            resolve({ success: true });
          } else {
            const result = await storage.signUp(email, password, {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            });
            if (result.error) {
              isLoading = false;
              updateContent(result.error.message);
              return;
            }
            close();
            resolve({ success: true, needsEmailVerification: true });
          }
        } catch (error) {
          isLoading = false;
          updateContent(error instanceof Error ? error.message : t("errors.unknownError"));
        }
      });
    };

    setupEventListeners();

    // Focus email input
    setTimeout(() => {
      const emailInput = element.querySelector('input[name="email"]') as HTMLInputElement;
      emailInput?.focus();
    }, 100);
  });
}

/**
 * Show email verification message
 */
export function showVerificationMessage(): void {
  showDialog({
    title: t("common.success"),
    content: `
      <div class="alert alert-success">${t("auth.accountCreated")}</div>
    `,
  });
}

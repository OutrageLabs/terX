/**
 * Password Edit Dialog for terX
 *
 * Dialog for creating and editing stored passwords
 */

import { t } from "../i18n";
import { showDialog, inputClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, eyeIcon, eyeOffIcon } from "./dialogs";
import * as storage from "../lib/storage";
import type { Password } from "../lib/database.types";

interface PasswordDialogResult {
  saved: boolean;
  password?: Password;
}

// Icons
const generateIcon = `
<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
  <path d="M3 3v5h5"></path>
  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
  <path d="M16 16h5v5"></path>
</svg>
`;

const copyIcon = `
<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>
`;

/**
 * Show password edit dialog
 */
export async function showPasswordEditDialog(
  password?: Password
): Promise<PasswordDialogResult> {
  return new Promise((resolve) => {
    const isEdit = !!password;
    let showPassword = false;

    const getContent = () => `
      <form class="flex flex-col gap-4">
        <!-- Name -->
        <div>
          <label class="${labelClasses}">${t("passwords.name")} <span class="text-red">*</span></label>
          <input
            type="text"
            class="${inputClasses}"
            name="name"
            placeholder="${t("passwords.namePlaceholder")}"
            value="${password?.name || ""}"
            required
          >
        </div>

        <!-- Password -->
        <div class="form-group">
          <label class="${labelClasses}">${t("passwords.password")} <span class="text-red">*</span></label>
          <div class="relative">
            <input
              type="${showPassword ? "text" : "password"}"
              class="${inputClasses} pr-24"
              name="password"
              placeholder="${t("passwords.passwordPlaceholder")}"
              value="${password?.password || ""}"
              required
            >
            <div class="input-actions">
              <button type="button" class="input-action-btn" data-action="toggle-password"
                      title="${t("passwords.showPassword")}">
                ${showPassword ? eyeOffIcon : eyeIcon}
              </button>
              <button type="button" class="input-action-btn" data-action="generate"
                      title="${t("passwords.generatePassword")}">
                ${generateIcon}
              </button>
              <button type="button" class="input-action-btn" data-action="copy"
                      title="${t("passwords.copyPassword")}">
                ${copyIcon}
              </button>
            </div>
            <span class="input-feedback" data-feedback="copy">${t("passwords.copied")}</span>
          </div>
        </div>
      </form>
    `;

    const { element, close } = showDialog({
      title: isEdit ? t("passwords.edit") : t("passwords.add"),
      content: getContent(),
      onClose: () => resolve({ saved: false }),
    });

    // Add footer
    const footer = document.createElement("div");
    footer.className = "dialog-footer";
    footer.innerHTML = `
      <button class="${buttonSecondaryClasses}" data-action="cancel">${t("common.cancel")}</button>
      <button class="${buttonPrimaryClasses}" data-action="save">${t("common.save")}</button>
    `;
    element.appendChild(footer);

    // Event listeners
    const passwordInput = element.querySelector('input[name="password"]') as HTMLInputElement;

    // Toggle password visibility
    element.querySelector('[data-action="toggle-password"]')?.addEventListener("click", (e) => {
      showPassword = !showPassword;
      passwordInput.type = showPassword ? "text" : "password";
      const btn = e.currentTarget as HTMLButtonElement;
      btn.innerHTML = showPassword ? eyeOffIcon : eyeIcon;
      btn.title = showPassword ? t("passwords.hidePassword") : t("passwords.showPassword");
    });

    // Generate password
    element.querySelector('[data-action="generate"]')?.addEventListener("click", () => {
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
      let generated = "";
      const array = new Uint32Array(16);
      crypto.getRandomValues(array);
      for (let i = 0; i < 16; i++) {
        generated += chars[array[i] % chars.length];
      }
      passwordInput.value = generated;

      // Show password when generating
      if (!showPassword) {
        showPassword = true;
        passwordInput.type = "text";
        const toggleBtn = element.querySelector('[data-action="toggle-password"]') as HTMLButtonElement;
        toggleBtn.innerHTML = eyeOffIcon;
      }
    });

    // Copy password
    element.querySelector('[data-action="copy"]')?.addEventListener("click", async () => {
      if (passwordInput.value) {
        await navigator.clipboard.writeText(passwordInput.value);

        // Show feedback
        const feedback = element.querySelector('[data-feedback="copy"]') as HTMLElement;
        if (feedback) {
          feedback.classList.add("input-feedback-visible");
          setTimeout(() => {
            feedback.classList.remove("input-feedback-visible");
          }, 1500);
        }
      }
    });

    // Cancel
    footer.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
      close();
      resolve({ saved: false });
    });

    // Save
    footer.querySelector('[data-action="save"]')?.addEventListener("click", async () => {
      const form = element.querySelector("form") as HTMLFormElement;
      const formData = new FormData(form);

      const name = formData.get("name") as string;
      const passwordValue = formData.get("password") as string;

      if (!name || !passwordValue) {
        return;
      }

      const passwordData = {
        name,
        password: passwordValue,
      };

      try {
        let savedPassword: Password;
        if (isEdit && password) {
          savedPassword = await storage.updatePassword(password.id, passwordData);
        } else {
          savedPassword = await storage.createPassword(passwordData);
        }

        close();
        resolve({ saved: true, password: savedPassword });
      } catch (error) {
        console.error("[password-dialog] Failed to save password:", error);
      }
    });

    // Focus first input
    setTimeout(() => {
      const nameInput = element.querySelector('input[name="name"]') as HTMLInputElement;
      nameInput?.focus();
    }, 100);
  });
}

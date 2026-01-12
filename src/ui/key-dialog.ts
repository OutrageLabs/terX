/**
 * SSH Key Edit Dialog for terX
 *
 * Dialog for creating and editing SSH keys
 */

import { t } from "../i18n";
import { showDialog, inputClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, eyeIcon, eyeOffIcon } from "./dialogs";
import * as storage from "../lib/storage";
import type { Key } from "../lib/database.types";

interface KeyDialogResult {
  saved: boolean;
  key?: Key;
}

// Icons
const importIcon = `
<svg class="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
  <polyline points="17 8 12 3 7 8"></polyline>
  <line x1="12" y1="3" x2="12" y2="15"></line>
</svg>
`;

/**
 * Show SSH key edit dialog
 */
export async function showKeyEditDialog(key?: Key): Promise<KeyDialogResult> {
  return new Promise((resolve) => {
    const isEdit = !!key;
    let showPassphrase = false;

    const getContent = () => `
      <form class="flex flex-col gap-4">
        <!-- Name -->
        <div>
          <label class="${labelClasses}">${t("keys.name")} <span class="text-red">*</span></label>
          <input
            type="text"
            class="${inputClasses}"
            name="name"
            placeholder="${t("keys.namePlaceholder")}"
            value="${key?.name || ""}"
            required
          >
        </div>

        <!-- Private Key -->
        <div class="form-group">
          <label class="${labelClasses}">${t("keys.privateKey")} <span class="text-red">*</span></label>
          <textarea
            class="${inputClasses} font-mono text-xs resize-y min-h-[120px]"
            name="key_data"
            placeholder="${t("keys.privateKeyPlaceholder")}"
            rows="8"
            required
          >${key?.key_data || ""}</textarea>
          <button type="button" class="form-hint inline-flex items-center gap-1" data-action="import-file">
            ${importIcon} ${t("keys.importFromFile")}
          </button>
        </div>

        <!-- Passphrase -->
        <div class="form-group">
          <label class="${labelClasses}">${t("keys.passphrase")}</label>
          <div class="relative">
            <input
              type="${showPassphrase ? "text" : "password"}"
              class="${inputClasses} pr-10"
              name="passphrase"
              placeholder="${t("keys.passphrasePlaceholder")}"
              value="${key?.passphrase || ""}"
            >
            <div class="input-actions">
              <button type="button" class="input-action-btn" data-action="toggle-passphrase" tabindex="-1">
                ${showPassphrase ? eyeOffIcon : eyeIcon}
              </button>
            </div>
          </div>
        </div>
      </form>

      <input type="file" id="key-file-input" class="hidden" accept=".pem,.key,.ppk,*">
    `;

    const { element, close } = showDialog({
      title: isEdit ? t("keys.edit") : t("keys.add"),
      content: getContent(),
      onClose: () => resolve({ saved: false }),
      size: "lg",
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
    const keyDataTextarea = element.querySelector('textarea[name="key_data"]') as HTMLTextAreaElement;
    const passphraseInput = element.querySelector('input[name="passphrase"]') as HTMLInputElement;

    // Toggle passphrase visibility
    element.querySelector('[data-action="toggle-passphrase"]')?.addEventListener("click", (e) => {
      showPassphrase = !showPassphrase;
      passphraseInput.type = showPassphrase ? "text" : "password";
      const btn = e.currentTarget as HTMLButtonElement;
      btn.innerHTML = showPassphrase ? eyeOffIcon : eyeIcon;
    });

    // Import from file
    const fileInput = element.querySelector("#key-file-input") as HTMLInputElement;

    element.querySelector('[data-action="import-file"]')?.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          keyDataTextarea.value = content;

          // Auto-fill name from filename if empty
          const nameInput = element.querySelector('input[name="name"]') as HTMLInputElement;
          if (!nameInput.value) {
            nameInput.value = file.name.replace(/\.(pem|key|ppk)$/i, "");
          }
        };
        reader.readAsText(file);
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
      const keyData = formData.get("key_data") as string;
      const passphrase = formData.get("passphrase") as string;

      if (!name || !keyData) {
        return;
      }

      const keyDataObj = {
        name,
        key_data: keyData,
        passphrase: passphrase || null,
      };

      try {
        let savedKey: Key;
        if (isEdit && key) {
          savedKey = await storage.updateKey(key.id, keyDataObj);
        } else {
          savedKey = await storage.createKey(keyDataObj);
        }

        close();
        resolve({ saved: true, key: savedKey });
      } catch (error) {
        console.error("[key-dialog] Failed to save key:", error);
      }
    });

    // Focus first input
    setTimeout(() => {
      const nameInput = element.querySelector('input[name="name"]') as HTMLInputElement;
      nameInput?.focus();
    }, 100);
  });
}

/**
 * Storage Mode Selector for terX
 *
 * Allows users to choose between storage modes:
 * - Local: Data stored only on this device
 * - terX Cloud: Sync across devices with E2E encryption
 * - Own Supabase: User's own Supabase instance (placeholder)
 */

import { t } from "../i18n";
import { showDialog } from "./dialogs";
import type { StorageMode } from "../lib/storage";

/**
 * Show storage mode selection dialog
 * Returns the selected mode or null if cancelled
 */
export async function showStorageSelector(
  currentMode?: StorageMode
): Promise<StorageMode | null> {
  return new Promise((resolve) => {
    const selectedMode = currentMode || "terx-cloud";

    const content = `
      <p class="text-sm text-subtext-1 text-center mb-6">
        ${t("storage.selectMode")}
      </p>

      <div class="flex flex-col gap-3">
        <!-- Local Option -->
        <label class="storage-option ${selectedMode === "local" ? "storage-option-selected" : ""}" data-mode="local">
          <input type="radio" name="storage-mode" value="local" class="storage-option-radio"
                 ${selectedMode === "local" ? "checked" : ""}>
          <div class="flex-1">
            <div class="storage-option-title">
              <svg class="w-5 h-5 text-overlay-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              ${t("storage.local")}
            </div>
            <p class="storage-option-desc">${t("storage.localDesc")}</p>
          </div>
        </label>

        <!-- terX Cloud Option -->
        <label class="storage-option ${selectedMode === "terx-cloud" ? "storage-option-selected" : ""}" data-mode="terx-cloud">
          <input type="radio" name="storage-mode" value="terx-cloud" class="storage-option-radio"
                 ${selectedMode === "terx-cloud" ? "checked" : ""}>
          <div class="flex-1">
            <div class="storage-option-title">
              <svg class="w-5 h-5 text-blue" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              </svg>
              ${t("storage.cloud")}
              <span class="badge badge-success">${t("storage.cloudRecommended")}</span>
            </div>
            <p class="storage-option-desc">${t("storage.cloudDesc")}</p>
          </div>
        </label>

        <!-- Own Supabase Option (disabled) -->
        <label class="storage-option storage-option-disabled" data-mode="own-supabase">
          <input type="radio" name="storage-mode" value="own-supabase" class="storage-option-radio" disabled>
          <div class="flex-1">
            <div class="storage-option-title">
              <svg class="w-5 h-5 text-overlay-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
              ${t("storage.ownSupabase")}
              <span class="badge">${t("storage.comingSoon")}</span>
            </div>
            <p class="storage-option-desc">${t("storage.ownSupabaseDesc")}</p>
          </div>
        </label>
      </div>
    `;

    const { element, close } = showDialog({
      title: t("storage.selectMode"),
      content,
      showCloseButton: false,
      size: "lg",
    });

    // Add footer with continue button
    const footer = document.createElement("div");
    footer.className = "dialog-footer";
    footer.innerHTML = `
      <button class="btn btn-primary w-full" data-action="continue">
        ${t("common.continue")}
      </button>
    `;
    element.appendChild(footer);

    // Handle radio selection visual feedback
    const radioOptions = element.querySelectorAll("label[data-mode]:not([data-mode='own-supabase'])");
    radioOptions.forEach((option) => {
      option.addEventListener("click", () => {
        // Reset all options
        radioOptions.forEach((o) => {
          o.classList.remove("storage-option-selected");
        });
        // Highlight selected
        option.classList.add("storage-option-selected");
        const radio = option.querySelector("input") as HTMLInputElement;
        if (radio) radio.checked = true;
      });
    });

    // Handle continue button
    footer.querySelector('[data-action="continue"]')?.addEventListener("click", () => {
      const selected = element.querySelector(
        'input[name="storage-mode"]:checked'
      ) as HTMLInputElement;
      if (selected) {
        close();
        resolve(selected.value as StorageMode);
      }
    });
  });
}

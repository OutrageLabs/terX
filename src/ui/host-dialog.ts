/**
 * Host Edit Dialog for terX
 *
 * Dialog for creating and editing SSH hosts
 */

import { t } from "../i18n";
import { showDialog, inputClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, eyeIcon, eyeOffIcon } from "./dialogs";
import * as storage from "../lib/storage";
import type { Host, Password, Key, Tag, AuthType } from "../lib/database.types";
import type { HostWithRelations } from "../lib/storage";

interface HostDialogResult {
  saved: boolean;
  host?: Host;
}

/**
 * Show host edit dialog
 */
export async function showHostEditDialog(
  host?: HostWithRelations,
  passwords: Password[] = [],
  keys: Key[] = [],
  tags: Tag[] = []
): Promise<HostDialogResult> {
  return new Promise((resolve) => {
    const isEdit = !!host;
    let authType: AuthType = host?.auth_type || "password";
    let selectedTagIds = host?.tags?.map((t) => t.id) || [];

    const getContent = () => `
      <form class="flex flex-col gap-4">
        <!-- Name -->
        <div>
          <label class="${labelClasses}">${t("hosts.name")} <span class="text-red">*</span></label>
          <input
            type="text"
            class="${inputClasses}"
            name="name"
            placeholder="${t("hosts.namePlaceholder")}"
            value="${host?.name || ""}"
            required
          >
        </div>

        <!-- Description -->
        <div>
          <label class="${labelClasses}">${t("hosts.description")}</label>
          <input
            type="text"
            class="${inputClasses}"
            name="description"
            placeholder="${t("hosts.descriptionPlaceholder")}"
            value="${host?.description || ""}"
          >
        </div>

        <!-- Connection Section -->
        <div class="form-section">
          <span class="form-section-title">${t("hosts.connection")}</span>
        </div>

        <!-- Host/IP + Port -->
        <div class="flex gap-3">
          <div class="flex-1">
            <label class="${labelClasses}">${t("hosts.hostIp")} <span class="text-red">*</span></label>
            <input
              type="text"
              class="${inputClasses}"
              name="ip"
              placeholder="${t("hosts.hostIpPlaceholder")}"
              value="${host?.ip || ""}"
              required
            >
          </div>
          <div class="w-20">
            <label class="${labelClasses}">${t("hosts.port")}</label>
            <input
              type="text"
              class="${inputClasses}"
              name="port"
              value="${host?.port || "22"}"
            >
          </div>
        </div>

        <!-- Username -->
        <div>
          <label class="${labelClasses}">${t("hosts.username")} <span class="text-red">*</span></label>
          <input
            type="text"
            class="${inputClasses}"
            name="login"
            placeholder="${t("hosts.usernamePlaceholder")}"
            value="${host?.login || ""}"
            required
          >
        </div>

        <!-- Authentication Section -->
        <div class="form-section">
          <span class="form-section-title">${t("hosts.authentication")}</span>
        </div>

        <!-- Auth Toggle -->
        <div class="toggle-btn-group">
          <button type="button"
            class="toggle-btn ${authType === "password" ? "toggle-btn-active" : ""}"
            data-auth="password">
            ${t("hosts.usePassword")}
          </button>
          <button type="button"
            class="toggle-btn ${authType === "key" ? "toggle-btn-active" : ""}"
            data-auth="key">
            ${t("hosts.useKey")}
          </button>
        </div>

        <!-- Password Auth Content -->
        <div data-auth-content="password" style="display: ${authType === "password" ? "block" : "none"}">
          <label class="${labelClasses}">${t("hosts.selectPassword")}</label>
          <select class="${inputClasses}" name="password_id">
            <option value="">-- ${t("hosts.selectPassword")} --</option>
            ${passwords.map((p) => `
              <option value="${p.id}" ${host?.password_id === p.id ? "selected" : ""}>${p.name}</option>
            `).join("")}
          </select>
          <button type="button" class="form-hint" data-action="add-password">
            + ${t("hosts.addNewPassword")}
          </button>
        </div>

        <!-- Key Auth Content -->
        <div data-auth-content="key" style="display: ${authType === "key" ? "block" : "none"}">
          <label class="${labelClasses}">${t("hosts.selectKey")}</label>
          <select class="${inputClasses}" name="key_id">
            <option value="">-- ${t("hosts.selectKey")} --</option>
            ${keys.map((k) => `
              <option value="${k.id}" ${host?.key_id === k.id ? "selected" : ""}>${k.name}</option>
            `).join("")}
          </select>
          <button type="button" class="form-hint" data-action="add-key">
            + ${t("hosts.addNewKey")}
          </button>
        </div>

        <!-- Tags Section -->
        <div class="form-section">
          <span class="form-section-title">${t("hosts.tags")}</span>
        </div>

        <!-- Tags Selector -->
        <div class="flex flex-wrap gap-2">
          ${tags.map((tag) => `
            <label class="chip ${selectedTagIds.includes(tag.id) ? "chip-selected" : ""}"
                   data-tag-id="${tag.id}">
              <input type="checkbox" name="tags" value="${tag.id}"
                     class="hidden" ${selectedTagIds.includes(tag.id) ? "checked" : ""}>
              <span class="chip-dot" style="background: ${tag.color}"></span>
              <span>${tag.name}</span>
            </label>
          `).join("")}
          ${tags.length === 0 ? `<p class="text-sm text-overlay-0">${t("tags.noTags")}</p>` : ""}
        </div>
      </form>
    `;

    const { element, close } = showDialog({
      title: isEdit ? t("hosts.edit") : t("hosts.add"),
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
    const setupEventListeners = () => {
      // Auth type toggle
      element.querySelectorAll("[data-auth]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const newAuth = btn.getAttribute("data-auth") as AuthType;
          authType = newAuth;

          // Update button states
          element.querySelectorAll("[data-auth]").forEach((b) => {
            const isActive = b.getAttribute("data-auth") === newAuth;
            b.className = `toggle-btn ${isActive ? "toggle-btn-active" : ""}`;
          });

          // Show/hide content
          element.querySelectorAll("[data-auth-content]").forEach((content) => {
            (content as HTMLElement).style.display =
              content.getAttribute("data-auth-content") === newAuth ? "block" : "none";
          });
        });
      });

      // Tag selection
      element.querySelectorAll("[data-tag-id]").forEach((label) => {
        label.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).tagName === "INPUT") return;

          const checkbox = label.querySelector("input") as HTMLInputElement;
          checkbox.checked = !checkbox.checked;

          const tagId = label.getAttribute("data-tag-id")!;
          if (checkbox.checked) {
            if (!selectedTagIds.includes(tagId)) selectedTagIds.push(tagId);
            label.className = "chip chip-selected";
          } else {
            selectedTagIds = selectedTagIds.filter((id) => id !== tagId);
            label.className = "chip";
          }
        });
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
        const ip = formData.get("ip") as string;
        const login = formData.get("login") as string;

        // Validate required fields
        if (!name || !ip || !login) {
          return;
        }

        const hostData = {
          name,
          description: (formData.get("description") as string) || null,
          ip,
          port: (formData.get("port") as string) || "22",
          login,
          auth_type: authType,
          password_id: authType === "password" ? (formData.get("password_id") as string) || null : null,
          key_id: authType === "key" ? (formData.get("key_id") as string) || null : null,
        };

        try {
          let savedHost: Host;
          if (isEdit && host) {
            savedHost = await storage.updateHost(host.id, hostData, selectedTagIds);
          } else {
            savedHost = await storage.createHost(hostData, selectedTagIds);
          }

          close();
          resolve({ saved: true, host: savedHost });
        } catch (error) {
          console.error("[host-dialog] Failed to save host:", error);
        }
      });

      // Add new password
      element.querySelector('[data-action="add-password"]')?.addEventListener("click", async () => {
        const { showPasswordEditDialog } = await import("./password-dialog");
        const result = await showPasswordEditDialog();
        if (result.saved && result.password) {
          // Refresh passwords and update select
          const newPasswords = await storage.getPasswords();
          const select = element.querySelector('select[name="password_id"]') as HTMLSelectElement;
          if (select) {
            select.innerHTML = `
              <option value="">-- ${t("hosts.selectPassword")} --</option>
              ${newPasswords.map((p) => `
                <option value="${p.id}" ${p.id === result.password?.id ? "selected" : ""}>${p.name}</option>
              `).join("")}
            `;
          }
        }
      });

      // Add new key
      element.querySelector('[data-action="add-key"]')?.addEventListener("click", async () => {
        const { showKeyEditDialog } = await import("./key-dialog");
        const result = await showKeyEditDialog();
        if (result.saved && result.key) {
          // Refresh keys and update select
          const newKeys = await storage.getKeys();
          const select = element.querySelector('select[name="key_id"]') as HTMLSelectElement;
          if (select) {
            select.innerHTML = `
              <option value="">-- ${t("hosts.selectKey")} --</option>
              ${newKeys.map((k) => `
                <option value="${k.id}" ${k.id === result.key?.id ? "selected" : ""}>${k.name}</option>
              `).join("")}
            `;
          }
        }
      });
    };

    setupEventListeners();

    // Focus first input
    setTimeout(() => {
      const nameInput = element.querySelector('input[name="name"]') as HTMLInputElement;
      nameInput?.focus();
    }, 100);
  });
}

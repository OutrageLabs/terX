/**
 * Settings Panel for terX
 *
 * Slide-out panel with tabs for managing:
 * - Hosts
 * - Passwords
 * - SSH Keys
 * - Tags
 * - Preferences (language, theme, font size)
 * - Account (sign out, change password)
 */

import { t, setLocale } from "../i18n";
import { showConfirm } from "./dialogs";
import { showStorageSelector } from "./storage-selector";
import { showHostEditDialog } from "./host-dialog";
import * as storage from "../lib/storage";
import * as themes from "../lib/themes";
import type { TerminalFontFamily } from "../lib/themes";
import type { Host, Password, Key, Tag } from "../lib/database.types";
import type { HostWithRelations } from "../lib/storage";
import { signOut, runAuthFlow } from "./auth-flow";

export type SettingsTab = "hosts" | "passwords" | "keys" | "tags" | "preferences" | "account";

interface SettingsPanelOptions {
  initialTab?: SettingsTab;
  onClose?: () => void;
  onHostSelect?: (host: HostWithRelations) => void;
}

// Settings panel instance
let settingsPanel: HTMLElement | null = null;
let currentTab: SettingsTab = "hosts";

// Cached data
let hostsCache: HostWithRelations[] = [];
let passwordsCache: Password[] = [];
let keysCache: Key[] = [];
let tagsCache: Tag[] = [];

// Icons
const settingsIcon = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
const closeIcon = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const serverIcon = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`;
const keyIcon = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>`;
const sshKeyIcon = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const tagIcon = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;
const editIcon = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
const deleteIcon = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
const connectIcon = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
const serverIconLarge = `<svg class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`;
const keyIconLarge = `<svg class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>`;
const sshKeyIconLarge = `<svg class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const tagIconLarge = `<svg class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;

/**
 * Show the settings panel
 */
export async function showSettings(options: SettingsPanelOptions = {}): Promise<void> {
  if (settingsPanel) {
    if (options.initialTab) {
      switchTab(options.initialTab);
    }
    return;
  }

  currentTab = options.initialTab || "hosts";

  // Create panel
  settingsPanel = document.createElement("div");
  settingsPanel.className = "dialog-overlay";
  settingsPanel.style.opacity = "0";
  settingsPanel.style.transition = "opacity 0.2s ease";

  settingsPanel.innerHTML = `
    <div class="settings-panel" data-panel>
      <!-- Header -->
      <div class="panel-header">
        <h2 class="panel-title flex items-center gap-2">
          ${settingsIcon} ${t("settings.title")}
        </h2>
        <button class="btn btn-ghost btn-icon" data-action="close">
          ${closeIcon}
        </button>
      </div>

      <!-- Tabs -->
      <div class="tabs px-4">
        ${renderTabs()}
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-5" data-content>
        <div class="empty-state">
          <p class="text-subtext-0">${t("common.loading")}</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById("ui-root")?.appendChild(settingsPanel);

  // Animate in
  requestAnimationFrame(() => {
    settingsPanel!.style.opacity = "1";
    settingsPanel?.querySelector("[data-panel]")?.classList.add("visible");
  });

  // Setup event listeners
  setupEventListeners(options);

  // Load initial data and render tab
  await loadAllData();
  renderTabContent(currentTab);
}

/**
 * Hide the settings panel
 */
export function hideSettings(): void {
  if (!settingsPanel) return;

  settingsPanel.style.opacity = "0";
  settingsPanel.querySelector("[data-panel]")?.classList.remove("visible");

  setTimeout(() => {
    settingsPanel?.remove();
    settingsPanel = null;
  }, 200);
}

/**
 * Toggle settings panel
 */
export async function toggleSettings(options: SettingsPanelOptions = {}): Promise<void> {
  if (settingsPanel) {
    hideSettings();
  } else {
    await showSettings(options);
  }
}

/**
 * Load all data from storage
 */
async function loadAllData(): Promise<void> {
  try {
    [hostsCache, passwordsCache, keysCache, tagsCache] = await Promise.all([
      storage.getHosts(),
      storage.getPasswords(),
      storage.getKeys(),
      storage.getTags(),
    ]);
  } catch (error) {
    console.error("[settings] Failed to load data:", error);
  }
}

/**
 * Render tabs
 */
function renderTabs(): string {
  const tabs: SettingsTab[] = ["hosts", "passwords", "keys", "tags", "preferences", "account"];

  return tabs
    .map(
      (tab) => `
    <button
      class="tab ${tab === currentTab ? "tab-active" : ""}"
      data-tab="${tab}"
    >
      ${t(`settings.tabs.${tab}`)}
    </button>
  `
    )
    .join("");
}

/**
 * Switch to a different tab
 */
function switchTab(tab: SettingsTab): void {
  if (tab === currentTab) return;

  currentTab = tab;

  // Update tab buttons
  const tabs = settingsPanel?.querySelectorAll("[data-tab]");
  tabs?.forEach((t) => {
    const isActive = t.getAttribute("data-tab") === tab;
    t.className = `tab ${isActive ? "tab-active" : ""}`;
  });

  // Render new content
  renderTabContent(tab);
}

/**
 * Render content for a tab
 */
function renderTabContent(tab: SettingsTab): void {
  const content = settingsPanel?.querySelector("[data-content]");
  if (!content) return;

  switch (tab) {
    case "hosts":
      content.innerHTML = renderHostsTab();
      setupHostsEventListeners();
      break;
    case "passwords":
      content.innerHTML = renderPasswordsTab();
      setupPasswordsEventListeners();
      break;
    case "keys":
      content.innerHTML = renderKeysTab();
      setupKeysEventListeners();
      break;
    case "tags":
      content.innerHTML = renderTagsTab();
      setupTagsEventListeners();
      break;
    case "preferences":
      content.innerHTML = renderPreferencesTab();
      setupPreferencesEventListeners();
      break;
    case "account":
      content.innerHTML = renderAccountTab();
      setupAccountEventListeners();
      break;
  }
}

// =============================================================================
// Hosts Tab
// =============================================================================

function renderHostsTab(): string {
  if (hostsCache.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon text-overlay-0">${serverIconLarge}</div>
        <h3 class="empty-state-title">${t("hosts.noHosts")}</h3>
        <p class="empty-state-description">${t("hosts.noHostsDesc")}</p>
        <button class="btn btn-primary btn-sm" data-action="add-host">
          ${t("hosts.add")}
        </button>
      </div>
    `;
  }

  return `
    <div class="settings-section-header">
      <input
        type="text"
        class="input"
        style="width: 200px;"
        placeholder="${t("hosts.search")}"
        data-action="search-hosts"
      >
      <button class="btn btn-primary btn-sm" data-action="add-host">
        ${t("hosts.add")}
      </button>
    </div>
    <div class="settings-list">
      ${hostsCache.map((host) => renderHostItem(host)).join("")}
    </div>
  `;
}

function renderHostItem(host: HostWithRelations): string {
  const tagBadges = host.tags?.map((tag) => `
    <span class="tag" style="background: ${tag.color}">${tag.name}</span>
  `).join("") || "";

  return `
    <div class="item-card" data-host-id="${host.id}">
      <div class="item-card-icon">${serverIcon}</div>
      <div class="item-card-content">
        <div class="item-card-title">${host.name}</div>
        <div class="item-card-subtitle">${host.login}@${host.ip}:${host.port}</div>
        ${tagBadges ? `<div class="flex gap-1 mt-1.5 flex-wrap">${tagBadges}</div>` : ""}
      </div>
      <div class="item-card-actions">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="connect-host" data-id="${host.id}" title="${t("hosts.connect")}">
          ${connectIcon}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="edit-host" data-id="${host.id}" title="${t("common.edit")}">
          ${editIcon}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm text-red hover:bg-red/10" data-action="delete-host" data-id="${host.id}" title="${t("common.delete")}">
          ${deleteIcon}
        </button>
      </div>
    </div>
  `;
}

function setupHostsEventListeners(): void {
  const content = settingsPanel?.querySelector("[data-content]");
  if (!content) return;

  content.querySelector('[data-action="add-host"]')?.addEventListener("click", () => {
    showHostDialog();
  });

  content.querySelector('[data-action="search-hosts"]')?.addEventListener("input", (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    const items = content.querySelectorAll("[data-host-id]");
    items.forEach((item) => {
      const text = item.textContent?.toLowerCase() || "";
      (item as HTMLElement).style.display = text.includes(query) ? "" : "none";
    });
  });

  content.querySelectorAll("[data-action]").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "edit-host" && id) {
      btn.addEventListener("click", () => {
        const host = hostsCache.find((h) => h.id === id);
        if (host) showHostDialog(host);
      });
    }

    if (action === "delete-host" && id) {
      btn.addEventListener("click", async () => {
        const host = hostsCache.find((h) => h.id === id);
        if (!host) return;

        const confirmed = await showConfirm({
          title: t("hosts.delete"),
          message: t("hosts.deleteConfirm", { name: host.name }),
          danger: true,
        });

        if (confirmed) {
          await storage.deleteHost(id);
          hostsCache = hostsCache.filter((h) => h.id !== id);
          renderTabContent("hosts");
        }
      });
    }

    if (action === "connect-host" && id) {
      btn.addEventListener("click", () => {
        const host = hostsCache.find((h) => h.id === id);
        if (host) {
          window.dispatchEvent(new CustomEvent("terx-connect-host", { detail: host }));
          hideSettings();
        }
      });
    }
  });
}

// =============================================================================
// Passwords Tab
// =============================================================================

function renderPasswordsTab(): string {
  if (passwordsCache.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon text-overlay-0">${keyIconLarge}</div>
        <h3 class="empty-state-title">${t("passwords.noPasswords")}</h3>
        <p class="empty-state-description">${t("passwords.noPasswordsDesc")}</p>
        <button class="btn btn-primary btn-sm" data-action="add-password">
          ${t("passwords.add")}
        </button>
      </div>
    `;
  }

  return `
    <div class="settings-section-header">
      <span class="settings-section-title">${t("passwords.saved")}</span>
      <button class="btn btn-primary btn-sm" data-action="add-password">
        ${t("passwords.add")}
      </button>
    </div>
    <div class="settings-list">
      ${passwordsCache.map((pwd) => renderPasswordItem(pwd)).join("")}
    </div>
  `;
}

function renderPasswordItem(pwd: Password): string {
  return `
    <div class="item-card" data-password-id="${pwd.id}">
      <div class="item-card-icon">${keyIcon}</div>
      <div class="item-card-content">
        <div class="item-card-title">${pwd.name}</div>
        <div class="item-card-subtitle">••••••••</div>
      </div>
      <div class="item-card-actions">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="edit-password" data-id="${pwd.id}" title="${t("common.edit")}">
          ${editIcon}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm text-red hover:bg-red/10" data-action="delete-password" data-id="${pwd.id}" title="${t("common.delete")}">
          ${deleteIcon}
        </button>
      </div>
    </div>
  `;
}

function setupPasswordsEventListeners(): void {
  const content = settingsPanel?.querySelector("[data-content]");
  if (!content) return;

  content.querySelector('[data-action="add-password"]')?.addEventListener("click", () => {
    showPasswordDialog();
  });

  content.querySelectorAll("[data-action]").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "edit-password" && id) {
      btn.addEventListener("click", () => {
        const pwd = passwordsCache.find((p) => p.id === id);
        if (pwd) showPasswordDialog(pwd);
      });
    }

    if (action === "delete-password" && id) {
      btn.addEventListener("click", async () => {
        const pwd = passwordsCache.find((p) => p.id === id);
        if (!pwd) return;

        const confirmed = await showConfirm({
          title: t("passwords.delete"),
          message: t("passwords.deleteConfirm", { name: pwd.name }),
          danger: true,
        });

        if (confirmed) {
          await storage.deletePassword(id);
          passwordsCache = passwordsCache.filter((p) => p.id !== id);
          renderTabContent("passwords");
        }
      });
    }
  });
}

// =============================================================================
// Keys Tab
// =============================================================================

function renderKeysTab(): string {
  if (keysCache.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon text-overlay-0">${sshKeyIconLarge}</div>
        <h3 class="empty-state-title">${t("keys.noKeys")}</h3>
        <p class="empty-state-description">${t("keys.noKeysDesc")}</p>
        <button class="btn btn-primary btn-sm" data-action="add-key">
          ${t("keys.add")}
        </button>
      </div>
    `;
  }

  return `
    <div class="settings-section-header">
      <span class="settings-section-title">${t("keys.saved")}</span>
      <button class="btn btn-primary btn-sm" data-action="add-key">
        ${t("keys.add")}
      </button>
    </div>
    <div class="settings-list">
      ${keysCache.map((key) => renderKeyItem(key)).join("")}
    </div>
  `;
}

function renderKeyItem(key: Key): string {
  return `
    <div class="item-card" data-key-id="${key.id}">
      <div class="item-card-icon">${sshKeyIcon}</div>
      <div class="item-card-content">
        <div class="item-card-title">${key.name}</div>
        <div class="item-card-subtitle">${key.passphrase ? "🔒 " + t("keys.passphrase") : ""}</div>
      </div>
      <div class="item-card-actions">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="edit-key" data-id="${key.id}" title="${t("common.edit")}">
          ${editIcon}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm text-red hover:bg-red/10" data-action="delete-key" data-id="${key.id}" title="${t("common.delete")}">
          ${deleteIcon}
        </button>
      </div>
    </div>
  `;
}

function setupKeysEventListeners(): void {
  const content = settingsPanel?.querySelector("[data-content]");
  if (!content) return;

  content.querySelector('[data-action="add-key"]')?.addEventListener("click", () => {
    showKeyDialog();
  });

  content.querySelectorAll("[data-action]").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "edit-key" && id) {
      btn.addEventListener("click", () => {
        const key = keysCache.find((k) => k.id === id);
        if (key) showKeyDialog(key);
      });
    }

    if (action === "delete-key" && id) {
      btn.addEventListener("click", async () => {
        const key = keysCache.find((k) => k.id === id);
        if (!key) return;

        const confirmed = await showConfirm({
          title: t("keys.delete"),
          message: t("keys.deleteConfirm", { name: key.name }),
          danger: true,
        });

        if (confirmed) {
          await storage.deleteKey(id);
          keysCache = keysCache.filter((k) => k.id !== id);
          renderTabContent("keys");
        }
      });
    }
  });
}

// =============================================================================
// Tags Tab
// =============================================================================

function renderTagsTab(): string {
  if (tagsCache.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon text-overlay-0">${tagIconLarge}</div>
        <h3 class="empty-state-title">${t("tags.noTags")}</h3>
        <p class="empty-state-description">${t("tags.noTagsDesc")}</p>
        <button class="btn btn-primary btn-sm" data-action="add-tag">
          ${t("tags.add")}
        </button>
      </div>
    `;
  }

  return `
    <div class="settings-section-header">
      <span class="settings-section-title">${t("tags.saved")}</span>
      <button class="btn btn-primary btn-sm" data-action="add-tag">
        ${t("tags.add")}
      </button>
    </div>
    <div class="settings-list">
      ${tagsCache.map((tag) => renderTagItem(tag)).join("")}
    </div>
  `;
}

function renderTagItem(tag: Tag): string {
  return `
    <div class="item-card" data-tag-id="${tag.id}">
      <span class="w-6 h-6 rounded-full flex-shrink-0" style="background: ${tag.color}"></span>
      <div class="item-card-content">
        <div class="item-card-title">${tag.name}</div>
      </div>
      <div class="item-card-actions">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="edit-tag" data-id="${tag.id}" title="${t("common.edit")}">
          ${editIcon}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm text-red hover:bg-red/10" data-action="delete-tag" data-id="${tag.id}" title="${t("common.delete")}">
          ${deleteIcon}
        </button>
      </div>
    </div>
  `;
}

function setupTagsEventListeners(): void {
  const content = settingsPanel?.querySelector("[data-content]");
  if (!content) return;

  content.querySelector('[data-action="add-tag"]')?.addEventListener("click", () => {
    showTagDialog();
  });

  content.querySelectorAll("[data-action]").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "edit-tag" && id) {
      btn.addEventListener("click", () => {
        const tag = tagsCache.find((t) => t.id === id);
        if (tag) showTagDialog(tag);
      });
    }

    if (action === "delete-tag" && id) {
      btn.addEventListener("click", async () => {
        const tag = tagsCache.find((t) => t.id === id);
        if (!tag) return;

        const confirmed = await showConfirm({
          title: t("tags.delete"),
          message: t("tags.deleteConfirm", { name: tag.name }),
          danger: true,
        });

        if (confirmed) {
          await storage.deleteTag(id);
          tagsCache = tagsCache.filter((t) => t.id !== id);
          renderTabContent("tags");
        }
      });
    }
  });
}

// =============================================================================
// Preferences Tab
// =============================================================================

function renderPreferencesTab(): string {
  const config = storage.getConfig();
  const allThemes = themes.getAllThemes();

  // Group themes by type
  const darkThemes = allThemes.filter(t => t.ui.isDark);
  const lightThemes = allThemes.filter(t => !t.ui.isDark);

  const uiFontSize = config.uiFontSize || 14;
  const terminalFontSize = config.terminalFontSize || 15;
  const terminalFontFamily = config.terminalFontFamily || "fira-code";
  const cursorStyle = config.cursorStyle || "block";
  const cursorBlink = config.cursorBlink || false;

  return `
    <!-- Terminal Section -->
    <span class="settings-section-title">${t("settings.preferences.terminal")}</span>
    <div class="settings-row" style="margin-top: 0.5rem;">
      <div class="form-group">
        <label class="text-label">${t("settings.preferences.terminalFont")}</label>
        <select class="input select" data-action="change-terminal-font">
          <option value="fira-code" ${terminalFontFamily === "fira-code" ? "selected" : ""}>Fira Code</option>
          <option value="hack" ${terminalFontFamily === "hack" ? "selected" : ""}>Hack</option>
          <option value="system-mono" ${terminalFontFamily === "system-mono" ? "selected" : ""}>${t("settings.preferences.systemMono")}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="text-label">${t("settings.preferences.terminalFontSize")}</label>
        <div class="flex items-center gap-1">
          <button class="btn btn-ghost btn-icon btn-sm" data-action="terminal-font-decrease" title="-">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <input type="range" class="flex-1" min="10" max="42" value="${terminalFontSize}" data-action="change-terminal-font-size">
          <button class="btn btn-ghost btn-icon btn-sm" data-action="terminal-font-increase" title="+">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <span class="text-xs text-text w-8 text-right" data-terminal-font-size-display>${terminalFontSize}px</span>
        </div>
      </div>
    </div>
    <div class="settings-row" style="margin-top: 0.75rem;">
      <div class="form-group">
        <label class="text-label">${t("settings.preferences.cursorStyle")}</label>
        <select class="input select" data-action="change-cursor-style">
          <option value="block" ${cursorStyle === "block" ? "selected" : ""}>█ Block</option>
          <option value="underline" ${cursorStyle === "underline" ? "selected" : ""}>▁ Underline</option>
        </select>
      </div>
      <div class="form-group">
        <label class="text-label">${t("settings.preferences.cursorBlink")}</label>
        <div class="flex items-center h-9">
          <label class="toggle-switch">
            <input type="checkbox" data-action="toggle-cursor-blink" ${cursorBlink ? "checked" : ""}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Interface Section -->
    <span class="settings-section-title">${t("settings.preferences.ui")}</span>
    <div class="settings-row" style="margin-top: 0.5rem;">
      <div class="form-group">
        <label class="text-label">${t("settings.preferences.language")}</label>
        <select class="input select" data-action="change-locale">
          <option value="en-US" ${config.locale === "en-US" ? "selected" : ""}>English</option>
          <option value="pl-PL" ${config.locale === "pl-PL" ? "selected" : ""}>Polski</option>
        </select>
      </div>
      <div class="form-group">
        <label class="text-label">${t("settings.preferences.theme")}</label>
        <select class="input select" data-action="change-theme">
          <optgroup label="${t("settings.preferences.darkThemes")}">
            ${darkThemes.map(theme => `<option value="${theme.id}" ${config.theme === theme.id ? "selected" : ""}>${theme.name}</option>`).join("")}
          </optgroup>
          <optgroup label="${t("settings.preferences.lightThemes")}">
            ${lightThemes.map(theme => `<option value="${theme.id}" ${config.theme === theme.id ? "selected" : ""}>${theme.name}</option>`).join("")}
          </optgroup>
        </select>
      </div>
    </div>
    <div class="form-group" style="max-width: 50%;">
      <label class="text-label">${t("settings.preferences.uiFontSize")}</label>
      <div class="flex items-center gap-1">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="ui-font-decrease" title="-">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <input type="range" class="flex-1" min="12" max="18" value="${uiFontSize}" data-action="change-ui-font-size">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="ui-font-increase" title="+">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <span class="text-xs text-text w-8 text-right" data-ui-font-size-display>${uiFontSize}px</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Clipboard Shortcuts Section -->
    <span class="settings-section-title">${t("settings.preferences.clipboard")}</span>
    <div class="settings-row" style="margin-top: 0.5rem;">
      <div class="form-group">
        <label class="text-label">${t("settings.preferences.ctrlShiftCV")}</label>
        <span class="text-hint">Ctrl+Shift+C / Ctrl+Shift+V</span>
      </div>
      <div class="flex items-center h-9">
        <label class="toggle-switch">
          <input type="checkbox" data-action="toggle-ctrl-shift-cv" ${config.enableCtrlShiftCV !== false ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="settings-row" style="margin-top: 0.5rem;">
      <div class="form-group">
        <label class="text-label">${t("settings.preferences.insertShortcuts")}</label>
        <span class="text-hint">Ctrl+Insert / Shift+Insert</span>
      </div>
      <div class="flex items-center h-9">
        <label class="toggle-switch">
          <input type="checkbox" data-action="toggle-insert-shortcuts" ${config.enableInsertShortcuts ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Selection Settings Section -->
    <span class="settings-section-title">${t("settings.selection")}</span>
    <div class="settings-row" style="margin-top: 0.5rem;">
      <div class="form-group">
        <label class="text-label">${t("settings.selectionRequireShift")}</label>
        <span class="text-hint">${t("settings.selectionRequireShiftDesc")}</span>
      </div>
      <div class="flex items-center h-9">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-selection-shift" data-action="toggle-selection-shift" ${config.selectionRequireShift !== false ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
}

function setupPreferencesEventListeners(): void {
  const content = settingsPanel?.querySelector("[data-content]");
  if (!content) return;

  // Language change
  content.querySelector('[data-action="change-locale"]')?.addEventListener("change", async (e) => {
    const locale = (e.target as HTMLSelectElement).value;
    await setLocale(locale as "en-US" | "pl-PL");
    await storage.saveConfig({ locale });
    hideSettings();
    showSettings({ initialTab: "preferences" });
  });

  // Theme change (applies immediately)
  content.querySelector('[data-action="change-theme"]')?.addEventListener("change", async (e) => {
    const themeId = (e.target as HTMLSelectElement).value;
    await storage.saveConfig({ theme: themeId });

    // Apply theme immediately
    const theme = themes.getThemeById(themeId);
    if (theme) {
      themes.applyUITheme(theme);
      // Dispatch event for terminal to update
      window.dispatchEvent(new CustomEvent("terx-theme-change", { detail: theme }));
    }
  });

  // Terminal font family change
  content.querySelector('[data-action="change-terminal-font"]')?.addEventListener("change", async (e) => {
    const fontFamily = (e.target as HTMLSelectElement).value as TerminalFontFamily;
    await storage.saveConfig({ terminalFontFamily: fontFamily });
    window.dispatchEvent(new CustomEvent("terx-terminal-font-change", { detail: { family: fontFamily } }));
  });

  // Cursor style change
  content.querySelector('[data-action="change-cursor-style"]')?.addEventListener("change", async (e) => {
    const style = (e.target as HTMLSelectElement).value as 'block' | 'underline';
    await storage.saveConfig({ cursorStyle: style });
    window.dispatchEvent(new CustomEvent("terx-cursor-style-change", { detail: style }));
  });

  // Cursor blink toggle
  content.querySelector('[data-action="toggle-cursor-blink"]')?.addEventListener("change", async (e) => {
    const blink = (e.target as HTMLInputElement).checked;
    await storage.saveConfig({ cursorBlink: blink });
    window.dispatchEvent(new CustomEvent("terx-cursor-blink-change", { detail: blink }));
  });

  // Terminal font size change (with live preview)
  const terminalFontSizeInput = content.querySelector('[data-action="change-terminal-font-size"]') as HTMLInputElement;
  const terminalFontSizeDisplay = content.querySelector('[data-terminal-font-size-display]');

  terminalFontSizeInput?.addEventListener("input", (e) => {
    const size = parseInt((e.target as HTMLInputElement).value);
    if (terminalFontSizeDisplay) {
      terminalFontSizeDisplay.textContent = `${size}px`;
    }
    // Live preview
    window.dispatchEvent(new CustomEvent("terx-terminal-font-size-change", { detail: size }));
  });

  terminalFontSizeInput?.addEventListener("change", async (e) => {
    const size = parseInt((e.target as HTMLInputElement).value);
    await storage.saveConfig({ terminalFontSize: size });
  });

  // UI font size change (with live preview)
  const uiFontSizeInput = content.querySelector('[data-action="change-ui-font-size"]') as HTMLInputElement;
  const uiFontSizeDisplay = content.querySelector('[data-ui-font-size-display]');

  uiFontSizeInput?.addEventListener("input", (e) => {
    const size = parseInt((e.target as HTMLInputElement).value);
    if (uiFontSizeDisplay) {
      uiFontSizeDisplay.textContent = `${size}px`;
    }
    // Apply immediately
    themes.applyUIFontSize(size);
  });

  uiFontSizeInput?.addEventListener("change", async (e) => {
    const size = parseInt((e.target as HTMLInputElement).value);
    await storage.saveConfig({ uiFontSize: size });
  });

  // Terminal font size +/- buttons
  const adjustTerminalFontSize = (delta: number) => {
    if (!terminalFontSizeInput) return;
    const currentSize = parseInt(terminalFontSizeInput.value);
    const newSize = Math.max(10, Math.min(24, currentSize + delta));
    terminalFontSizeInput.value = String(newSize);
    if (terminalFontSizeDisplay) {
      terminalFontSizeDisplay.textContent = `${newSize}px`;
    }
    window.dispatchEvent(new CustomEvent("terx-terminal-font-size-change", { detail: newSize }));
    storage.saveConfig({ terminalFontSize: newSize });
  };

  content.querySelector('[data-action="terminal-font-decrease"]')?.addEventListener("click", () => {
    adjustTerminalFontSize(-1);
  });

  content.querySelector('[data-action="terminal-font-increase"]')?.addEventListener("click", () => {
    adjustTerminalFontSize(1);
  });

  // UI font size +/- buttons
  const adjustUIFontSize = (delta: number) => {
    if (!uiFontSizeInput) return;
    const currentSize = parseInt(uiFontSizeInput.value);
    const newSize = Math.max(12, Math.min(18, currentSize + delta));
    uiFontSizeInput.value = String(newSize);
    if (uiFontSizeDisplay) {
      uiFontSizeDisplay.textContent = `${newSize}px`;
    }
    themes.applyUIFontSize(newSize);
    storage.saveConfig({ uiFontSize: newSize });
  };

  content.querySelector('[data-action="ui-font-decrease"]')?.addEventListener("click", () => {
    adjustUIFontSize(-1);
  });

  content.querySelector('[data-action="ui-font-increase"]')?.addEventListener("click", () => {
    adjustUIFontSize(1);
  });

  // Clipboard shortcuts toggles
  content.querySelector('[data-action="toggle-ctrl-shift-cv"]')?.addEventListener("change", async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    await storage.saveConfig({ enableCtrlShiftCV: enabled });
    window.dispatchEvent(new CustomEvent("terx-clipboard-shortcuts-change"));
  });

  content.querySelector('[data-action="toggle-insert-shortcuts"]')?.addEventListener("change", async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    await storage.saveConfig({ enableInsertShortcuts: enabled });
    window.dispatchEvent(new CustomEvent("terx-clipboard-shortcuts-change"));
  });

  // Selection mode toggle
  const selectionShiftToggle = content.querySelector('[data-action="toggle-selection-shift"]');
  selectionShiftToggle?.addEventListener("change", async (e) => {
    const requireShift = (e.target as HTMLInputElement).checked;
    await storage.saveConfig({ selectionRequireShift: requireShift });
    window.dispatchEvent(new CustomEvent("terx-selection-shift-change", {
      detail: { requireShift }
    }));
  });

  // Sync with footer toggle (when changed from footer)
  const handleSelectionShiftSync = (e: Event) => {
    const customEvent = e as CustomEvent;
    if (selectionShiftToggle) {
      (selectionShiftToggle as HTMLInputElement).checked = customEvent.detail.requireShift;
    }
  };
  window.addEventListener("terx-selection-shift-sync", handleSelectionShiftSync);
}

// =============================================================================
// Account Tab
// =============================================================================

function renderAccountTab(): string {
  const config = storage.getConfig();
  const modeLabels: Record<string, string> = {
    local: t("storage.local"),
    "terx-cloud": t("storage.cloud"),
    "own-supabase": t("storage.ownSupabase"),
  };

  return `
    <div class="flex flex-col gap-5">
      <div class="form-group">
        <label class="text-label">${t("settings.account.storageMode")}</label>
        <div class="text-text font-medium">${modeLabels[config.mode] || config.mode}</div>
      </div>

      ${config.mode === "terx-cloud" ? `
        <div class="form-group">
          <label class="text-label">${t("settings.account.signedInAs")}</label>
          <div class="text-text font-medium" id="account-email">...</div>
        </div>
      ` : ""}

      <div class="divider"></div>

      ${config.mode !== "local" ? `
        <button class="btn btn-secondary w-full" data-action="sign-out">
          ${t("settings.account.signOut")}
        </button>
      ` : ""}

      <button class="btn btn-secondary w-full" data-action="change-storage-mode">
        ${t("storage.selectMode")}
      </button>

      <div class="divider"></div>

      <div class="card">
        <div class="card-body">
          <h4 class="text-red font-medium mb-2">${t("settings.account.dangerZone")}</h4>
          <p class="text-sm text-subtext-0 mb-4">${t("settings.account.deleteAccountWarning")}</p>
          <button class="btn btn-danger" data-action="delete-account" disabled>
            ${t("settings.account.deleteAccount")}
          </button>
        </div>
      </div>
    </div>
  `;
}

async function setupAccountEventListeners(): Promise<void> {
  const content = settingsPanel?.querySelector("[data-content]");
  if (!content) return;

  const emailEl = content.querySelector("#account-email");
  if (emailEl) {
    const user = await storage.getUser();
    emailEl.textContent = user?.email || "Unknown";
  }

  content.querySelector('[data-action="sign-out"]')?.addEventListener("click", async () => {
    const confirmed = await showConfirm({
      title: t("settings.account.signOut"),
      message: t("auth.signOutConfirm"),
    });

    if (confirmed) {
      await signOut();
      hideSettings();

      // Show storage selector to let user choose next action
      const mode = await showStorageSelector();

      if (mode) {
        await storage.setStorageMode(mode);
        // Reload to run full auth flow for selected mode
        window.location.reload();
      }
    }
  });

  content.querySelector('[data-action="change-storage-mode"]')?.addEventListener("click", async () => {
    hideSettings();
    const currentMode = storage.getStorageMode();
    const mode = await showStorageSelector(currentMode);

    if (mode && mode !== currentMode) {
      // Sign out first if changing from cloud mode
      if (currentMode === "terx-cloud" || currentMode === "own-supabase") {
        await signOut();
      }

      // Set new mode
      await storage.setStorageMode(mode);

      // Reload app to run full auth flow for new mode
      // This will show auth popup for cloud modes or master password for local
      window.location.reload();
    }
  });
}

// =============================================================================
// Dialogs for CRUD
// =============================================================================

async function showHostDialog(host?: HostWithRelations): Promise<void> {
  const result = await showHostEditDialog(host, passwordsCache, keysCache, tagsCache);
  if (result) {
    await loadAllData();
    renderTabContent("hosts");
  }
}

async function showPasswordDialog(password?: Password): Promise<void> {
  const { showPasswordEditDialog } = await import("./password-dialog");
  const result = await showPasswordEditDialog(password);
  if (result) {
    await loadAllData();
    renderTabContent("passwords");
  }
}

async function showKeyDialog(key?: Key): Promise<void> {
  const { showKeyEditDialog } = await import("./key-dialog");
  const result = await showKeyEditDialog(key);
  if (result) {
    await loadAllData();
    renderTabContent("keys");
  }
}

async function showTagDialog(tag?: Tag): Promise<void> {
  const { showTagEditDialog } = await import("./tag-dialog");
  const result = await showTagEditDialog(tag);
  if (result) {
    await loadAllData();
    renderTabContent("tags");
  }
}

// =============================================================================
// Event Listeners Setup
// =============================================================================

function setupEventListeners(options: SettingsPanelOptions): void {
  if (!settingsPanel) return;

  settingsPanel.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    hideSettings();
    options.onClose?.();
  });

  settingsPanel.addEventListener("click", (e) => {
    if (e.target === settingsPanel) {
      hideSettings();
      options.onClose?.();
    }
  });

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideSettings();
      options.onClose?.();
      document.removeEventListener("keydown", handleKeydown);
    }
  };
  document.addEventListener("keydown", handleKeydown);

  settingsPanel.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab") as SettingsTab;
      if (tabName) switchTab(tabName);
    });
  });
}

// Export for use in other modules
export { hostsCache, passwordsCache, keysCache, tagsCache };

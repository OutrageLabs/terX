/**
 * Sidebar Component for terX
 *
 * Professional slide-out sidebar (overlay) with:
 * - Host list grouped by tags
 * - Search/filter
 * - Quick settings access
 * - Blur backdrop (like settings panel)
 */

import { t } from "../i18n";
import * as storage from "../lib/storage";
import type { HostWithRelations } from "../lib/storage";
import type { Tag } from "../lib/database.types";

export interface SidebarOptions {
  onHostSelect?: (host: HostWithRelations) => void;
  onHostTransfer?: (host: HostWithRelations) => void;
  onSettingsClick?: () => void;
  onAddHost?: () => void;
}

// Sidebar state
let sidebarOverlay: HTMLElement | null = null;
let isVisible = false;
let hostsCache: HostWithRelations[] = [];
let tagsCache: Tag[] = [];
let searchQuery = "";
let expandedTags = new Set<string>();
let sidebarOptions: SidebarOptions = {};

// Icons
const settingsIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const closeIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const searchIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const plusIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const chevronIcon = `<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
const serverIcon = `<svg class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
const errorIcon = `<svg class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
// Transfer/SFTP icon (folder with arrows)
const transferIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" title="File Transfer"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/><path d="M12 11v6m0 0l-2-2m2 2l2-2"/></svg>`;

/**
 * Initialize sidebar with options (call once at startup)
 */
export function initSidebar(options: SidebarOptions = {}): void {
  sidebarOptions = options;

  // Listen for storage changes
  storage.onStorageEvent((event) => {
    if (event === "data-changed") {
      loadSidebarData();
    }
  });

  // Listen for host connection events (SSH)
  window.addEventListener("terx-connect-host", ((e: CustomEvent) => {
    const host = e.detail as HostWithRelations;
    sidebarOptions.onHostSelect?.(host);
  }) as EventListener);

  // Listen for host transfer events (SFTP)
  window.addEventListener("terx-transfer-host", ((e: CustomEvent) => {
    const host = e.detail as HostWithRelations;
    sidebarOptions.onHostTransfer?.(host);
  }) as EventListener);
}

/**
 * Show the sidebar overlay
 */
export async function showSidebar(): Promise<void> {
  if (sidebarOverlay) {
    return; // Already visible
  }

  isVisible = true;

  // Create overlay
  sidebarOverlay = document.createElement("div");
  sidebarOverlay.className = "sidebar-overlay";
  sidebarOverlay.style.opacity = "0";
  sidebarOverlay.style.transition = "opacity 0.2s ease";

  sidebarOverlay.innerHTML = `
    <div class="sidebar-panel" data-panel>
      <!-- Header -->
      <div class="sidebar-header">
        <h2 class="sidebar-title">${t("sidebar.hosts")}</h2>
        <div class="flex items-center gap-1">
          <button class="btn btn-ghost btn-icon btn-sm" data-action="settings" title="${t("sidebar.settings")}">
            ${settingsIcon}
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" data-action="close" title="${t("common.close")}">
            ${closeIcon}
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="sidebar-search">
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-overlay-0 pointer-events-none">
            ${searchIcon}
          </span>
          <input
            type="text"
            data-action="search"
            class="input pl-10"
            placeholder="${t("hosts.search")}"
          />
        </div>
      </div>

      <!-- Host List -->
      <div class="sidebar-content" data-content>
        <div class="empty-state">
          <div class="text-overlay-0">${t("common.loading")}</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="sidebar-footer">
        <button class="btn btn-primary w-full" data-action="add-host">
          ${plusIcon}
          ${t("hosts.add")}
        </button>
      </div>
    </div>
  `;

  document.getElementById("ui-root")?.appendChild(sidebarOverlay);

  // Setup event listeners
  setupSidebarEventListeners();

  // Animate in
  requestAnimationFrame(() => {
    sidebarOverlay!.style.opacity = "1";
    sidebarOverlay?.querySelector("[data-panel]")?.classList.add("visible");
  });

  // Load data
  await loadSidebarData();

  // Focus search input
  setTimeout(() => {
    const searchInput = sidebarOverlay?.querySelector('[data-action="search"]') as HTMLInputElement;
    searchInput?.focus();
  }, 200);
}

/**
 * Hide the sidebar overlay
 */
export function hideSidebar(): void {
  if (!sidebarOverlay) return;

  isVisible = false;

  // Animate out
  sidebarOverlay.style.opacity = "0";
  sidebarOverlay?.querySelector("[data-panel]")?.classList.remove("visible");

  setTimeout(() => {
    sidebarOverlay?.remove();
    sidebarOverlay = null;
  }, 200);
}

/**
 * Toggle sidebar visibility
 */
export function toggleSidebar(): void {
  if (isVisible) {
    hideSidebar();
  } else {
    showSidebar();
  }
}

/**
 * Check if sidebar is visible
 */
export function isSidebarVisible(): boolean {
  return isVisible;
}

/**
 * Refresh sidebar data
 */
export async function refreshSidebar(): Promise<void> {
  await loadSidebarData();
}

/**
 * Set the currently connected host
 * @deprecated Multiple connections per host are now supported - this function is a no-op
 */
export function setConnectedHost(_hostId: string | null): void {
  // No-op: multiple connections per host are now supported
  // Keeping this function for backwards compatibility
}

/**
 * Load data from storage
 */
async function loadSidebarData(): Promise<void> {
  try {
    [hostsCache, tagsCache] = await Promise.all([
      storage.getHosts(),
      storage.getTags(),
    ]);

    // Expand all tags by default
    tagsCache.forEach((tag) => expandedTags.add(tag.id));
    expandedTags.add("untagged");

    if (sidebarOverlay) {
      renderHostList();
    }
  } catch (error) {
    console.error("[sidebar] Failed to load data:", error);
    const content = sidebarOverlay?.querySelector("[data-content]");
    if (content) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon text-red">${errorIcon}</div>
          <p class="empty-state-description">${t("common.error")}</p>
        </div>
      `;
    }
  }
}

/**
 * Render the host list grouped by tags
 */
function renderHostList(): void {
  const content = sidebarOverlay?.querySelector("[data-content]");
  if (!content) return;

  // Filter hosts by search query
  const filteredHosts = searchQuery
    ? hostsCache.filter(
        (host) =>
          host.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          host.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
          host.login.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : hostsCache;

  if (filteredHosts.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${serverIcon}</div>
        <p class="empty-state-title">
          ${searchQuery ? t("common.noResults") : t("hosts.noHosts")}
        </p>
        ${!searchQuery ? `<p class="empty-state-description">${t("hosts.noHostsDesc")}</p>` : ""}
      </div>
    `;
    return;
  }

  // Group hosts by tags
  const tagGroups = new Map<string, HostWithRelations[]>();
  const untaggedHosts: HostWithRelations[] = [];

  // Initialize tag groups
  tagsCache.forEach((tag) => {
    tagGroups.set(tag.id, []);
  });

  // Distribute hosts to groups
  filteredHosts.forEach((host) => {
    if (!host.tags || host.tags.length === 0) {
      untaggedHosts.push(host);
    } else {
      host.tags.forEach((tag) => {
        const group = tagGroups.get(tag.id);
        if (group) {
          group.push(host);
        }
      });
    }
  });

  // Render groups
  let html = "";

  tagsCache.forEach((tag) => {
    const hosts = tagGroups.get(tag.id) || [];
    if (hosts.length === 0 && searchQuery) return;

    const isExpanded = expandedTags.has(tag.id);

    html += `
      <div class="sidebar-group" data-tag-id="${tag.id}">
        <button class="sidebar-group-header" data-action="toggle-group" data-group="${tag.id}">
          <span class="transition-transform ${isExpanded ? 'rotate-90' : ''}">${chevronIcon}</span>
          <span class="w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background: ${tag.color}"></span>
          <span class="flex-1 truncate">${tag.name}</span>
          <span class="sidebar-group-count">${hosts.length}</span>
        </button>
        <div class="${isExpanded ? '' : 'hidden'}">
          ${hosts.map((host) => renderHostItem(host)).join("")}
        </div>
      </div>
    `;
  });

  // Untagged group
  if (untaggedHosts.length > 0 || !searchQuery) {
    const isExpanded = expandedTags.has("untagged");

    html += `
      <div class="sidebar-group" data-tag-id="untagged">
        <button class="sidebar-group-header" data-action="toggle-group" data-group="untagged">
          <span class="transition-transform ${isExpanded ? 'rotate-90' : ''}">${chevronIcon}</span>
          <span class="flex-1 truncate">${t("hosts.untagged")}</span>
          <span class="sidebar-group-count">${untaggedHosts.length}</span>
        </button>
        <div class="${isExpanded ? '' : 'hidden'}">
          ${untaggedHosts.map((host) => renderHostItem(host)).join("")}
        </div>
      </div>
    `;
  }

  content.innerHTML = html;

  // Setup SSH button listeners
  content.querySelectorAll('[data-action="ssh"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const hostId = btn.getAttribute("data-host-id");
      const host = hostsCache.find((h) => h.id === hostId);
      if (host) {
        hideSidebar();
        window.dispatchEvent(new CustomEvent("terx-connect-host", { detail: host }));
      }
    });
  });

  // Setup Transfer button listeners
  content.querySelectorAll('[data-action="transfer"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const hostId = btn.getAttribute("data-host-id");
      const host = hostsCache.find((h) => h.id === hostId);
      if (host) {
        hideSidebar();
        window.dispatchEvent(new CustomEvent("terx-transfer-host", { detail: host }));
      }
    });
  });

  // Setup group toggle listeners
  content.querySelectorAll('[data-action="toggle-group"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const groupId = btn.getAttribute("data-group");
      if (!groupId) return;

      if (expandedTags.has(groupId)) {
        expandedTags.delete(groupId);
      } else {
        expandedTags.add(groupId);
      }

      renderHostList();
    });
  });
}

/**
 * Render a single host item - click opens SSH, folder icon opens file manager
 * Multiple connections per host are supported - no "connected" indicator
 */
function renderHostItem(host: HostWithRelations): string {
  return `
    <div class="sidebar-item" data-action="ssh" data-host-id="${host.id}">
      <span class="sidebar-item-dot"></span>
      <span class="flex-1 truncate">${host.name}</span>
      <div class="sidebar-item-actions">
        <button class="sidebar-action-btn" data-action="transfer" data-host-id="${host.id}" title="File Transfer">
          ${transferIcon}
        </button>
      </div>
    </div>
  `;
}

/**
 * Setup event listeners
 */
function setupSidebarEventListeners(): void {
  if (!sidebarOverlay) return;

  // Close button
  sidebarOverlay.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    hideSidebar();
  });

  // Settings button
  sidebarOverlay.querySelector('[data-action="settings"]')?.addEventListener("click", () => {
    hideSidebar();
    sidebarOptions.onSettingsClick?.();
  });

  // Click on backdrop closes sidebar
  sidebarOverlay.addEventListener("click", (e) => {
    if (e.target === sidebarOverlay) {
      hideSidebar();
    }
  });

  // Search input
  const searchInput = sidebarOverlay.querySelector('[data-action="search"]') as HTMLInputElement;
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderHostList();
  });

  // Add host button
  sidebarOverlay.querySelector('[data-action="add-host"]')?.addEventListener("click", () => {
    hideSidebar();
    sidebarOptions.onAddHost?.();
  });

  // Escape key closes sidebar
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideSidebar();
      document.removeEventListener("keydown", handleKeydown);
    }
  };
  document.addEventListener("keydown", handleKeydown);
}

// Legacy exports for backwards compatibility
export function createSidebar(options: SidebarOptions = {}): HTMLElement {
  initSidebar(options);
  // Return empty div - sidebar is now overlay-based
  const placeholder = document.createElement("div");
  placeholder.style.display = "none";
  return placeholder;
}

export function getSidebarElement(): HTMLElement | null {
  return sidebarOverlay;
}

/**
 * Tab Bar Component for terX Multi-Tab Terminal
 *
 * Renders and manages the terminal session tabs.
 * Supports both terminal sessions and file manager tabs.
 */

import { t } from '../i18n';
import {
  sessionManager,
  type TerminalSession,
  type SessionStatus,
  type SessionEventType,
} from '../lib/session-manager';
import {
  isFileManagerTabId,
  isFileManagerVisible,
  onFileManagerEvent,
  getFileManagerSshSessionId,
  getFileManagerTabId,
} from './file-manager';
import { setConnectedHost } from './sidebar';

// File manager tab info
interface FileManagerTab {
  id: string; // 'fm:{sshSessionId}'
  sshSessionId: string;
  hostName: string;
}

// Module state for file manager tabs
let fileManagerTab: FileManagerTab | null = null;
let activeTabId: string | null = null; // Może być session ID lub file manager tab ID

// Tab bar options
export interface TabBarOptions {
  onTabClick?: (sessionId: string) => void;
  onTabClose?: (sessionId: string) => void;
  onFileManagerTabClick?: (tabId: string) => void;
  onFileManagerTabClose?: (tabId: string) => void;
}

// Module state
let tabBarElement: HTMLElement | null = null;
let options: TabBarOptions = {};

/**
 * Initialize the tab bar
 */
export function initTabBar(opts: TabBarOptions = {}): void {
  options = opts;
  tabBarElement = document.getElementById('tab-bar');

  if (!tabBarElement) {
    console.error('[TabBar] #tab-bar element not found');
    return;
  }

  // Setup event delegation for tab clicks
  tabBarElement.addEventListener('click', handleTabClick);

  // Subscribe to session manager events
  sessionManager.onSessionEvent(handleSessionEvent);

  // Subscribe to file manager events
  onFileManagerEvent(handleFileManagerEvent);

  // Initial render
  renderTabBar();
}

/**
 * Handle file manager events
 */
function handleFileManagerEvent(
  event: 'opened' | 'closed' | 'activated',
  data?: { tabId?: string }
): void {
  if (event === 'opened' && data?.tabId) {
    // Nowy file manager tab
    const sshSessionId = data.tabId.substring(3); // Usuń 'fm:'
    const session = sessionManager.getSession(sshSessionId);
    fileManagerTab = {
      id: data.tabId,
      sshSessionId,
      hostName: session?.hostName || 'Files',
    };
    activeTabId = data.tabId;
    renderTabBar();
  } else if (event === 'closed') {
    fileManagerTab = null;
    // Przywróć aktywny terminal tab
    const activeSession = sessionManager.getActiveSession();
    activeTabId = activeSession?.id || null;

    // Jeśli nie ma żadnych aktywnych sesji SSH - wyczyść indicator w sidebarze
    const allSessions = sessionManager.getAllSessions();
    if (allSessions.length === 0) {
      setConnectedHost(null);
    }

    renderTabBar();
  } else if (event === 'activated' && data?.tabId) {
    activeTabId = data.tabId;
    renderTabBar();
  }
}

/**
 * Handle clicks on tab bar (event delegation)
 */
function handleTabClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Close button clicked
  const closeBtn = target.closest('[data-action="close-tab"]') as HTMLElement;
  if (closeBtn) {
    e.stopPropagation();
    const tabId = closeBtn.dataset.tabId || closeBtn.dataset.sessionId;
    if (tabId) {
      if (isFileManagerTabId(tabId)) {
        // Close file manager tab
        if (options.onFileManagerTabClose) {
          options.onFileManagerTabClose(tabId);
        }
      } else {
        // Close terminal tab
        if (options.onTabClose) {
          options.onTabClose(tabId);
        }
      }
    }
    return;
  }

  // Tab clicked
  const tab = target.closest('[data-action="switch-tab"]') as HTMLElement;
  if (tab) {
    const tabId = tab.dataset.tabId || tab.dataset.sessionId;
    if (tabId) {
      if (isFileManagerTabId(tabId)) {
        // Switch to file manager tab
        if (options.onFileManagerTabClick) {
          options.onFileManagerTabClick(tabId);
        }
      } else {
        // Switch to terminal tab
        if (options.onTabClick) {
          options.onTabClick(tabId);
        }
      }
    }
  }
}

/**
 * Handle session manager events
 */
function handleSessionEvent(
  event: SessionEventType,
  data?: { sessionId?: string; status?: SessionStatus }
): void {
  switch (event) {
    case 'session-created':
    case 'session-closed':
    case 'all-sessions-closed':
      renderTabBar();
      break;
    case 'session-switched':
      // Terminal session switched - zawsze aktualizuj active tab na terminal
      activeTabId = data?.sessionId || null;
      renderTabBar();
      break;
    case 'session-status-changed':
      if (data?.sessionId) {
        updateTabStatus(data.sessionId, data.status);
      }
      break;
  }
}

/**
 * Render the entire tab bar
 */
export function renderTabBar(): void {
  if (!tabBarElement) return;

  const sessions = sessionManager.getAllSessions();
  const hasFileManager = fileManagerTab !== null;
  const totalTabs = sessions.length + (hasFileManager ? 1 : 0);

  if (totalTabs === 0) {
    tabBarElement.innerHTML = '';
    tabBarElement.classList.add('hidden');
    return;
  }

  tabBarElement.classList.remove('hidden');

  // Render terminal tabs
  const terminalTabs = sessions
    .map((session) => renderTab(session, activeTabId === session.id))
    .join('');

  // Render file manager tab (jeśli otwarty)
  const fileManagerTabHtml = hasFileManager
    ? renderFileManagerTab(fileManagerTab!, activeTabId === fileManagerTab!.id)
    : '';

  tabBarElement.innerHTML = terminalTabs + fileManagerTabHtml;
}

/**
 * Render a single terminal tab
 */
function renderTab(session: TerminalSession, isActive: boolean): string {
  const statusClass = getStatusClass(session.status);
  const statusTitle = getStatusTitle(session.status);
  const activeClass = isActive ? 'terminal-tab-active' : '';

  return `
    <div
      class="terminal-tab ${activeClass}"
      data-tab-id="${session.id}"
      data-session-id="${session.id}"
      data-action="switch-tab"
      title="${session.hostInfo.login}@${session.hostInfo.ip}"
    >
      <span class="terminal-tab-status ${statusClass}" title="${statusTitle}"></span>
      <span class="terminal-tab-name">${escapeHtml(session.hostName)}</span>
      <button
        class="terminal-tab-close"
        data-action="close-tab"
        data-tab-id="${session.id}"
        data-session-id="${session.id}"
        title="${t('tabs.closeTab')}"
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Render file manager tab
 */
function renderFileManagerTab(tab: FileManagerTab, isActive: boolean): string {
  const activeClass = isActive ? 'terminal-tab-active' : '';

  return `
    <div
      class="terminal-tab terminal-tab-fm ${activeClass}"
      data-tab-id="${tab.id}"
      data-action="switch-tab"
      title="${t('fileManager.title') || 'File Manager'}: ${tab.hostName}"
    >
      <span class="terminal-tab-icon">
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </span>
      <span class="terminal-tab-name">${escapeHtml(tab.hostName)} - Files</span>
      <button
        class="terminal-tab-close"
        data-action="close-tab"
        data-tab-id="${tab.id}"
        title="${t('tabs.closeTab')}"
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Update status indicator for a specific tab
 */
function updateTabStatus(sessionId: string, status?: SessionStatus): void {
  if (!tabBarElement || !status) return;

  const tab = tabBarElement.querySelector(`[data-session-id="${sessionId}"]`);
  if (!tab) return;

  const statusEl = tab.querySelector('.terminal-tab-status');
  if (!statusEl) return;

  // Remove old status classes
  statusEl.classList.remove(
    'terminal-tab-status-connecting',
    'terminal-tab-status-connected',
    'terminal-tab-status-disconnected',
    'terminal-tab-status-error'
  );

  // Add new status class
  statusEl.classList.add(getStatusClass(status));
  statusEl.setAttribute('title', getStatusTitle(status));
}

/**
 * Get CSS class for status
 */
function getStatusClass(status: SessionStatus): string {
  return `terminal-tab-status-${status}`;
}

/**
 * Get title/tooltip for status
 */
function getStatusTitle(status: SessionStatus): string {
  switch (status) {
    case 'connecting':
      return t('tabs.connecting');
    case 'connected':
      return t('tabs.connected');
    case 'disconnected':
      return t('tabs.disconnected');
    case 'error':
      return t('tabs.error');
    default:
      return '';
  }
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Set active tab visually (called by session manager event)
 */
export function setActiveTab(tabId: string): void {
  if (!tabBarElement) return;

  activeTabId = tabId;

  // Remove active class from all tabs
  tabBarElement.querySelectorAll('.terminal-tab').forEach((tab) => {
    tab.classList.remove('terminal-tab-active');
  });

  // Add active class to target tab
  const tab = tabBarElement.querySelector(`[data-tab-id="${tabId}"]`);
  if (tab) {
    tab.classList.add('terminal-tab-active');
  }
}

/**
 * Get current active tab ID
 */
export function getActiveTabId(): string | null {
  return activeTabId;
}

/**
 * Check if file manager tab is active
 */
export function isFileManagerTabActive(): boolean {
  return activeTabId !== null && isFileManagerTabId(activeTabId);
}

/**
 * Destroy the tab bar
 */
export function destroyTabBar(): void {
  if (tabBarElement) {
    tabBarElement.removeEventListener('click', handleTabClick);
    tabBarElement.innerHTML = '';
  }
  tabBarElement = null;
  options = {};
}

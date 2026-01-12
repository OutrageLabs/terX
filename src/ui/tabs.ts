/**
 * Tab Bar Component for terX Multi-Tab Terminal
 *
 * Renders and manages the terminal session tabs.
 */

import { t } from '../i18n';
import {
  sessionManager,
  type TerminalSession,
  type SessionStatus,
  type SessionEventType,
} from '../lib/session-manager';

// Tab bar options
export interface TabBarOptions {
  onTabClick?: (sessionId: string) => void;
  onTabClose?: (sessionId: string) => void;
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

  // Initial render
  renderTabBar();
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
    const sessionId = closeBtn.dataset.sessionId;
    if (sessionId && options.onTabClose) {
      options.onTabClose(sessionId);
    }
    return;
  }

  // Tab clicked
  const tab = target.closest('[data-action="switch-tab"]') as HTMLElement;
  if (tab) {
    const sessionId = tab.dataset.sessionId;
    if (sessionId && options.onTabClick) {
      options.onTabClick(sessionId);
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
    case 'session-switched':
    case 'all-sessions-closed':
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
  const activeId = sessionManager.activeSessionId;

  if (sessions.length === 0) {
    tabBarElement.innerHTML = '';
    tabBarElement.classList.add('hidden');
    return;
  }

  tabBarElement.classList.remove('hidden');

  tabBarElement.innerHTML = sessions
    .map((session) => renderTab(session, session.id === activeId))
    .join('');
}

/**
 * Render a single tab
 */
function renderTab(session: TerminalSession, isActive: boolean): string {
  const statusClass = getStatusClass(session.status);
  const statusTitle = getStatusTitle(session.status);
  const activeClass = isActive ? 'terminal-tab-active' : '';

  return `
    <div
      class="terminal-tab ${activeClass}"
      data-session-id="${session.id}"
      data-action="switch-tab"
      title="${session.hostInfo.login}@${session.hostInfo.ip}"
    >
      <span class="terminal-tab-status ${statusClass}" title="${statusTitle}"></span>
      <span class="terminal-tab-name">${escapeHtml(session.hostName)}</span>
      <button
        class="terminal-tab-close"
        data-action="close-tab"
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
export function setActiveTab(sessionId: string): void {
  if (!tabBarElement) return;

  // Remove active class from all tabs
  tabBarElement.querySelectorAll('.terminal-tab').forEach((tab) => {
    tab.classList.remove('terminal-tab-active');
  });

  // Add active class to target tab
  const tab = tabBarElement.querySelector(`[data-session-id="${sessionId}"]`);
  if (tab) {
    tab.classList.add('terminal-tab-active');
  }
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

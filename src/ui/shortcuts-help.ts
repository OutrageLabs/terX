/**
 * Help Panel - tabbed mini documentation
 * Features: Shortcuts, Features, About
 */

import { t } from "../i18n";

let helpPopup: HTMLDivElement | null = null;
let backdrop: HTMLDivElement | null = null;
let currentTab: 'shortcuts' | 'features' | 'about' = 'shortcuts';

// Keyboard shortcuts organized by category
const SHORTCUTS = {
  general: [
    { keys: 'F1', descKey: 'openHelp' },
    { keys: 'Ctrl+H', descKey: 'toggleSidebar' },
    { keys: 'Ctrl+,', descKey: 'openSettings' },
    { keys: 'F3', descKey: 'debugPanel' },
  ],
  terminal: [
    { keys: 'Ctrl+Shift+C', descKey: 'copySelection' },
    { keys: 'Ctrl+Shift+V', descKey: 'pasteClipboard' },
    { keys: 'Shift+PageUp', descKey: 'scrollUp' },
    { keys: 'Shift+PageDown', descKey: 'scrollDown' },
    { keys: 'Cmd/Ctrl++', descKey: 'zoomIn' },
    { keys: 'Cmd/Ctrl+-', descKey: 'zoomOut' },
    { keys: 'Cmd/Ctrl+0', descKey: 'resetZoom' },
  ],
  tabs: [
    { keys: 'Ctrl+Tab', descKey: 'nextTab' },
    { keys: 'Ctrl+Shift+Tab', descKey: 'prevTab' },
    { keys: 'Ctrl+W', descKey: 'closeTab' },
  ],
  fileManager: [
    { keys: 'Ctrl+F5', descKey: 'openFileManager' },
    { keys: 'Tab', descKey: 'switchPanels' },
    { keys: 'Enter', descKey: 'openDownload' },
    { keys: 'F5', descKey: 'copy' },
    { keys: 'F6', descKey: 'moveRename' },
    { keys: 'F7', descKey: 'newFolder' },
    { keys: 'F8 / Del', descKey: 'delete' },
  ],
};

const FEATURES = [
  { icon: '⚡', key: 'gpuTerminal' },
  { icon: '👻', key: 'ghostty' },
  { icon: '📁', key: 'fileManager' },
  { icon: '🔐', key: 'encryption' },
  { icon: '☁️', key: 'cloudSync' },
  { icon: '✂️', key: 'selection' },
];

const ABOUT = {
  version: '0.1.6',
  stack: [
    { name: 'Framework', value: 'Tauri 2.0' },
    { name: 'VT Parser', value: 'Ghostty WASM' },
    { name: 'Renderer', value: 'beamterm (WebGL2)' },
    { name: 'SSH Client', value: 'russh' },
    { name: 'Encryption', value: 'AES-256-GCM + PBKDF2' },
  ],
};

function renderShortcutsTab(): string {
  const renderSection = (titleKey: string, shortcuts: typeof SHORTCUTS.general) => `
    <div class="help-section">
      <h4 class="help-section-title">${t(`help.sections.${titleKey}`)}</h4>
      <div class="help-shortcuts-list">
        ${shortcuts.map(s => `
          <div class="help-shortcut-row">
            <kbd class="help-kbd">${s.keys}</kbd>
            <span class="help-shortcut-desc">${t(`help.shortcuts.${s.descKey}`)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return `
    <div class="help-tab-content">
      ${renderSection('general', SHORTCUTS.general)}
      ${renderSection('terminal', SHORTCUTS.terminal)}
      ${renderSection('tabs', SHORTCUTS.tabs)}
      ${renderSection('fileManager', SHORTCUTS.fileManager)}
    </div>
  `;
}

function renderFeaturesTab(): string {
  return `
    <div class="help-tab-content">
      <div class="help-features-grid">
        ${FEATURES.map(f => `
          <div class="help-feature-card">
            <div class="help-feature-icon">${f.icon}</div>
            <div class="help-feature-content">
              <h4 class="help-feature-title">${t(`help.features.${f.key}.title`)}</h4>
              <p class="help-feature-desc">${t(`help.features.${f.key}.desc`)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAboutTab(): string {
  return `
    <div class="help-tab-content">
      <div class="help-about">
        <div class="help-about-header">
          <div class="help-about-logo">terX</div>
          <div class="help-about-version">v${ABOUT.version}</div>
        </div>
        <p class="help-about-tagline">${t('help.about.tagline')}</p>

        <div class="help-section">
          <h4 class="help-section-title">${t('help.about.techStack')}</h4>
          <div class="help-stack-list">
            ${ABOUT.stack.map(s => `
              <div class="help-stack-row">
                <span class="help-stack-name">${s.name}</span>
                <span class="help-stack-value">${s.value}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="help-section">
          <h4 class="help-section-title">${t('help.about.links')}</h4>
          <div class="help-links">
            <a href="https://github.com/OutrageLabs/terX" target="_blank" class="help-link">${t('help.about.github')} ↗</a>
            <a href="https://github.com/OutrageLabs/terX/issues" target="_blank" class="help-link">${t('help.about.reportIssue')} ↗</a>
          </div>
        </div>

        <div class="help-about-footer">
          <span>${t('help.about.madeWith')}</span>
          <span class="help-about-copyright">© 2024 OutrageLabs</span>
        </div>
      </div>
    </div>
  `;
}

function renderContent(): string {
  switch (currentTab) {
    case 'shortcuts': return renderShortcutsTab();
    case 'features': return renderFeaturesTab();
    case 'about': return renderAboutTab();
  }
}

function updateContent(): void {
  if (!helpPopup) return;

  const content = helpPopup.querySelector('.help-panel-body');
  if (content) {
    content.innerHTML = renderContent();
  }

  // Update active tab
  helpPopup.querySelectorAll('.help-tab').forEach(tab => {
    const tabName = tab.getAttribute('data-tab');
    tab.classList.toggle('active', tabName === currentTab);
  });
}

export function showShortcutsHelp(): void {
  if (helpPopup) {
    hideShortcutsHelp();
    return;
  }

  currentTab = 'shortcuts';

  // Backdrop
  backdrop = document.createElement('div');
  backdrop.className = 'help-backdrop';
  backdrop.addEventListener('click', hideShortcutsHelp);
  document.body.appendChild(backdrop);

  // Popup
  helpPopup = document.createElement('div');
  helpPopup.className = 'help-panel';

  helpPopup.innerHTML = `
    <div class="help-panel-header">
      <div class="help-tabs">
        <button class="help-tab active" data-tab="shortcuts">
          <svg class="help-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h.01M10 16h.01M14 16h.01M18 16h.01"/>
          </svg>
          ${t('help.tabs.shortcuts')}
        </button>
        <button class="help-tab" data-tab="features">
          <svg class="help-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          ${t('help.tabs.features')}
        </button>
        <button class="help-tab" data-tab="about">
          <svg class="help-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          ${t('help.tabs.about')}
        </button>
      </div>
      <button class="help-close" title="${t('help.close')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="help-panel-body">
      ${renderContent()}
    </div>
  `;

  // Tab click handlers
  helpPopup.querySelectorAll('.help-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.getAttribute('data-tab') as typeof currentTab;
      updateContent();
    });
  });

  // Close button handler
  helpPopup.querySelector('.help-close')?.addEventListener('click', hideShortcutsHelp);

  // ESC to close
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideShortcutsHelp();
      window.removeEventListener('keydown', escHandler);
    }
  };
  window.addEventListener('keydown', escHandler);

  document.body.appendChild(helpPopup);

  // Animate in
  requestAnimationFrame(() => {
    backdrop?.classList.add('visible');
    helpPopup?.classList.add('visible');
  });
}

export function hideShortcutsHelp(): void {
  if (backdrop) {
    backdrop.classList.remove('visible');
  }
  if (helpPopup) {
    helpPopup.classList.remove('visible');
  }

  // Wait for animation
  setTimeout(() => {
    if (backdrop) {
      backdrop.remove();
      backdrop = null;
    }
    if (helpPopup) {
      helpPopup.remove();
      helpPopup = null;
    }
  }, 200);
}

export function toggleShortcutsHelp(): void {
  if (helpPopup) {
    hideShortcutsHelp();
  } else {
    showShortcutsHelp();
  }
}

export function isShortcutsHelpOpen(): boolean {
  return helpPopup !== null;
}

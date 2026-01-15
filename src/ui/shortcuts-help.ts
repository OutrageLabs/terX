/**
 * Help Panel - tabbed mini documentation
 * Features: Shortcuts, Features, About
 */

let helpPopup: HTMLDivElement | null = null;
let backdrop: HTMLDivElement | null = null;
let currentTab: 'shortcuts' | 'features' | 'about' = 'shortcuts';

// Keyboard shortcuts organized by category
const SHORTCUTS = {
  general: [
    { keys: 'F1', description: 'Open this help' },
    { keys: 'Ctrl+H', description: 'Toggle hosts sidebar' },
    { keys: 'Ctrl+,', description: 'Open settings' },
    { keys: 'F3', description: 'Debug panel' },
  ],
  terminal: [
    { keys: 'Ctrl+Shift+C', description: 'Copy selection' },
    { keys: 'Ctrl+Shift+V', description: 'Paste clipboard' },
    { keys: 'Shift+PageUp', description: 'Scroll up' },
    { keys: 'Shift+PageDown', description: 'Scroll down' },
    { keys: 'Cmd/Ctrl++', description: 'Zoom in' },
    { keys: 'Cmd/Ctrl+-', description: 'Zoom out' },
    { keys: 'Cmd/Ctrl+0', description: 'Reset zoom' },
  ],
  tabs: [
    { keys: 'Ctrl+Tab', description: 'Next tab' },
    { keys: 'Ctrl+Shift+Tab', description: 'Previous tab' },
    { keys: 'Ctrl+W', description: 'Close tab' },
  ],
  fileManager: [
    { keys: 'Ctrl+F5', description: 'Open File Manager' },
    { keys: 'Tab', description: 'Switch panels' },
    { keys: 'Enter', description: 'Open / Download' },
    { keys: 'F5', description: 'Copy' },
    { keys: 'F6', description: 'Move / Rename' },
    { keys: 'F7', description: 'New folder' },
    { keys: 'F8 / Del', description: 'Delete' },
  ],
};

const FEATURES = [
  {
    title: 'GPU-Accelerated Terminal',
    icon: '⚡',
    description: 'WebGL2 rendering with sub-millisecond frame times. Smooth scrolling and selection.',
  },
  {
    title: 'Ghostty Terminal Emulation',
    icon: '👻',
    description: 'Full VT100/VT220 support via Ghostty WASM. Auto-installs xterm-ghostty terminfo on remote hosts.',
  },
  {
    title: 'SFTP File Manager',
    icon: '📁',
    description: 'Norton Commander-style dual-pane file browser with full keyboard navigation.',
  },
  {
    title: 'End-to-End Encryption',
    icon: '🔐',
    description: 'All credentials encrypted with AES-256-GCM. Master password never leaves your device.',
  },
  {
    title: 'Cloud Sync',
    icon: '☁️',
    description: 'Optional sync via terX Cloud. Client-side encryption ensures your data stays private.',
  },
  {
    title: 'Native Text Selection',
    icon: '✂️',
    description: 'Hardware-accelerated selection. Shift+Click mode for compatibility with terminal apps.',
  },
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
  links: [
    { label: 'GitHub', url: 'https://github.com/OutrageLabs/terX' },
    { label: 'Report Issue', url: 'https://github.com/OutrageLabs/terX/issues' },
  ],
};

function renderShortcutsTab(): string {
  const renderSection = (title: string, shortcuts: typeof SHORTCUTS.general) => `
    <div class="help-section">
      <h4 class="help-section-title">${title}</h4>
      <div class="help-shortcuts-list">
        ${shortcuts.map(s => `
          <div class="help-shortcut-row">
            <kbd class="help-kbd">${s.keys}</kbd>
            <span class="help-shortcut-desc">${s.description}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return `
    <div class="help-tab-content">
      ${renderSection('General', SHORTCUTS.general)}
      ${renderSection('Terminal', SHORTCUTS.terminal)}
      ${renderSection('Tabs', SHORTCUTS.tabs)}
      ${renderSection('File Manager', SHORTCUTS.fileManager)}
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
              <h4 class="help-feature-title">${f.title}</h4>
              <p class="help-feature-desc">${f.description}</p>
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
        <p class="help-about-tagline">Cross-Platform SSH Client with GPU-Accelerated Terminal</p>

        <div class="help-section">
          <h4 class="help-section-title">Tech Stack</h4>
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
          <h4 class="help-section-title">Links</h4>
          <div class="help-links">
            ${ABOUT.links.map(l => `
              <a href="${l.url}" target="_blank" class="help-link">${l.label} ↗</a>
            `).join('')}
          </div>
        </div>

        <div class="help-about-footer">
          <span>Made with Rust, TypeScript & WebAssembly</span>
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
          Shortcuts
        </button>
        <button class="help-tab" data-tab="features">
          <svg class="help-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          Features
        </button>
        <button class="help-tab" data-tab="about">
          <svg class="help-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          About
        </button>
      </div>
      <button class="help-close" title="Close (Esc)">
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

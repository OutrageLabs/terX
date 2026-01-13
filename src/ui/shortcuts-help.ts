/**
 * Shortcuts Help - wyświetla popup ze skrótami klawiszowymi
 */

let helpPopup: HTMLDivElement | null = null;
let backdrop: HTMLDivElement | null = null;

const SHORTCUTS = [
  { keys: 'F1', description: 'This help' },
  { keys: 'Ctrl+H', description: 'Toggle hosts sidebar' },
  { keys: 'Ctrl+,', description: 'Open settings' },
  { keys: 'Ctrl+Shift+E', description: 'Emoji picker' },
  { keys: 'Ctrl+Tab', description: 'Next tab' },
  { keys: 'Ctrl+Shift+Tab', description: 'Previous tab' },
  { keys: 'Ctrl+W', description: 'Close current tab' },
  { keys: 'Cmd/Ctrl + / -', description: 'Zoom in/out' },
  { keys: 'Cmd/Ctrl+0', description: 'Reset zoom' },
  { keys: 'Shift+PageUp/Down', description: 'Scroll history' },
  { keys: 'F3 / Alt+D', description: 'Debug window' },
];

const UI_HINTS = [
  { icon: '⇧', description: 'Selection mode toggle - Shift+Click or Direct selection' },
  { icon: '😀', description: 'Emoji picker' },
  { icon: '‹ ›', description: 'Theme switcher' },
];

export function showShortcutsHelp(): void {
  if (helpPopup) {
    hideShortcutsHelp();
    return;
  }

  // Backdrop
  backdrop = document.createElement('div');
  backdrop.className = 'shortcuts-backdrop';
  backdrop.addEventListener('click', hideShortcutsHelp);
  document.body.appendChild(backdrop);

  // Popup
  helpPopup = document.createElement('div');
  helpPopup.className = 'shortcuts-popup';

  helpPopup.innerHTML = `
    <div class="shortcuts-header">
      <h3>Keyboard Shortcuts</h3>
      <button class="shortcuts-close" title="Close">&times;</button>
    </div>
    <div class="shortcuts-content">
      <div class="shortcuts-section">
        <div class="shortcuts-list">
          ${SHORTCUTS.map(s => `
            <div class="shortcut-row">
              <kbd>${s.keys}</kbd>
              <span>${s.description}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="shortcuts-divider"></div>
      <div class="shortcuts-section">
        <h4>Status Bar</h4>
        <div class="shortcuts-list">
          ${UI_HINTS.map(h => `
            <div class="shortcut-row">
              <span class="ui-hint-icon">${h.icon}</span>
              <span>${h.description}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Close button handler
  helpPopup.querySelector('.shortcuts-close')?.addEventListener('click', hideShortcutsHelp);

  // ESC to close
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideShortcutsHelp();
      window.removeEventListener('keydown', escHandler);
    }
  };
  window.addEventListener('keydown', escHandler);

  document.body.appendChild(helpPopup);
}

export function hideShortcutsHelp(): void {
  if (backdrop) {
    backdrop.remove();
    backdrop = null;
  }
  if (helpPopup) {
    helpPopup.remove();
    helpPopup = null;
  }
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

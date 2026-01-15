/**
 * Dialog utilities for terX
 *
 * Provides reusable dialog/modal functionality with:
 * - Consistent styling using CSS component classes
 * - Keyboard navigation (ESC to close)
 * - Focus trapping
 * - Animations
 */

import { t } from "../i18n";

// Catppuccin Mocha theme colors (for reference in JS)
export const theme = {
  base: "#1e1e2e",
  mantle: "#181825",
  crust: "#11111b",
  surface0: "#313244",
  surface1: "#45475a",
  surface2: "#585b70",
  overlay0: "#6c7086",
  overlay1: "#7f849c",
  text: "#cdd6f4",
  subtext0: "#a6adc8",
  subtext1: "#bac2de",
  blue: "#89b4fa",
  green: "#a6e3a1",
  red: "#f38ba8",
  yellow: "#f9e2af",
  mauve: "#cba6f7",
  lavender: "#b4befe",
  peach: "#fab387",
};

/**
 * Get the UI root element for mounting dialogs
 */
function getUIRoot(): HTMLElement {
  let root = document.getElementById("ui-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "ui-root";
    document.body.appendChild(root);
  }
  return root;
}

/**
 * Create and show a dialog
 */
export function showDialog(options: {
  title?: string;
  content: string;
  onClose?: () => void;
  showCloseButton?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}): {
  element: HTMLElement;
  close: () => void;
} {
  const size = options.size || "md";

  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  overlay.style.opacity = "0";
  overlay.style.transition = "opacity 0.2s ease";

  overlay.innerHTML = `
    <div class="dialog dialog-${size} animate-scaleIn" role="dialog" aria-modal="true">
      ${options.title ? `
        <div class="dialog-header">
          <h2 class="dialog-title">${options.title}</h2>
        </div>
      ` : ""}
      <div class="dialog-body">
        ${options.content}
      </div>
    </div>
  `;

  getUIRoot().appendChild(overlay);

  const dialog = overlay.querySelector('[role="dialog"]') as HTMLElement;

  // Animate in
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
  });

  const close = () => {
    overlay.style.opacity = "0";
    dialog.style.transform = "scale(0.95)";
    dialog.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      options.onClose?.();
    }, 200);
  };

  // Close on overlay click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && options.showCloseButton !== false) {
      close();
    }
  });

  // Close on ESC
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && options.showCloseButton !== false) {
      close();
      document.removeEventListener("keydown", handleKeydown);
    }
  };
  document.addEventListener("keydown", handleKeydown);

  // Focus first input
  const firstInput = overlay.querySelector("input") as HTMLInputElement;
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 100);
  }

  return {
    element: dialog,
    close,
  };
}

/**
 * Show a confirmation dialog
 */
export async function showConfirm(options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const { element, close } = showDialog({
      title: options.title,
      content: `
        <p class="text-subtext-1 leading-relaxed">${options.message}</p>
      `,
      onClose: () => resolve(false),
    });

    // Add footer with buttons
    const footer = document.createElement("div");
    footer.className = "dialog-footer";
    footer.innerHTML = `
      <button class="btn btn-secondary" data-action="cancel">
        ${options.cancelText || t("common.cancel")}
      </button>
      <button class="btn ${options.danger ? "btn-danger" : "btn-primary"}" data-action="confirm">
        ${options.confirmText || t("common.confirm")}
      </button>
    `;
    element.appendChild(footer);

    footer.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
      close();
      resolve(false);
    });

    footer.querySelector('[data-action="confirm"]')?.addEventListener("click", () => {
      close();
      resolve(true);
    });
  });
}

// Common SVG icons
export const githubIcon = `
<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
</svg>
`;

export const lockIcon = `
<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
</svg>
`;

export const eyeIcon = `
<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
  <circle cx="12" cy="12" r="3"></circle>
</svg>
`;

export const eyeOffIcon = `
<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
  <line x1="1" y1="1" x2="23" y2="23"></line>
</svg>
`;

// Error icon (inline color for reliability)
export const errorIcon = `
<svg style="width: 48px; height: 48px; color: var(--color-red, #f38ba8);" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
</svg>
`;

// Warning icon (inline color for reliability)
export const warningIcon = `
<svg style="width: 48px; height: 48px; color: var(--color-yellow, #f9e2af);" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
</svg>
`;

/**
 * Show an error dialog with a styled error message
 */
export function showError(options: {
  title: string;
  message: string;
  details?: string;
  buttonText?: string;
}): Promise<void> {
  return new Promise((resolve) => {
    const { element, close } = showDialog({
      title: options.title,
      content: `
        <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; padding: 8px 0;">
          ${errorIcon}
          <p style="color: var(--color-text, #cdd6f4); line-height: 1.6;">${options.message}</p>
          ${options.details ? `
            <div style="width: 100%; margin-top: 8px; padding: 12px; background: var(--color-crust, #11111b); border-radius: 8px; text-align: left;">
              <code style="font-size: 11px; color: var(--color-subtext-0, #a6adc8); word-break: break-all; white-space: pre-wrap;">${options.details}</code>
            </div>
          ` : ''}
        </div>
      `,
      size: 'sm',
      onClose: () => resolve(),
    });

    // Add footer with button
    const footer = document.createElement("div");
    footer.className = "dialog-footer";
    footer.style.justifyContent = "center";
    footer.innerHTML = `
      <button class="btn btn-primary" data-action="ok">
        ${options.buttonText || t("common.ok") || "OK"}
      </button>
    `;
    element.appendChild(footer);

    footer.querySelector('[data-action="ok"]')?.addEventListener("click", () => {
      close();
      resolve();
    });
  });
}

/**
 * Show a warning dialog
 */
export function showWarning(options: {
  title: string;
  message: string;
  details?: string;
  buttonText?: string;
}): Promise<void> {
  return new Promise((resolve) => {
    const { element, close } = showDialog({
      title: options.title,
      content: `
        <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; padding: 8px 0;">
          ${warningIcon}
          <p style="color: var(--color-text, #cdd6f4); line-height: 1.6;">${options.message}</p>
          ${options.details ? `
            <div style="width: 100%; margin-top: 8px; padding: 12px; background: var(--color-crust, #11111b); border-radius: 8px; text-align: left;">
              <code style="font-size: 11px; color: var(--color-subtext-0, #a6adc8); word-break: break-all; white-space: pre-wrap;">${options.details}</code>
            </div>
          ` : ''}
        </div>
      `,
      size: 'sm',
      onClose: () => resolve(),
    });

    // Add footer with button
    const footer = document.createElement("div");
    footer.className = "dialog-footer";
    footer.style.justifyContent = "center";
    footer.innerHTML = `
      <button class="btn btn-primary" data-action="ok">
        ${options.buttonText || t("common.ok") || "OK"}
      </button>
    `;
    element.appendChild(footer);

    footer.querySelector('[data-action="ok"]')?.addEventListener("click", () => {
      close();
      resolve();
    });
  });
}

// CSS class exports (using new component classes)
export const inputClasses = "input";
export const labelClasses = "text-label";
export const buttonPrimaryClasses = "btn btn-primary";
export const buttonSecondaryClasses = "btn btn-secondary";
export const buttonDangerClasses = "btn btn-danger";
export const buttonGhostClasses = "btn btn-ghost btn-icon";

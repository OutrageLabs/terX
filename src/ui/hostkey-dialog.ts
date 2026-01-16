/**
 * Host Key Verification Dialog for terX
 *
 * Dialogs for SSH host key verification:
 * - Unknown host dialog (first connection)
 * - Changed host key dialog (MITM warning!)
 */

import { t } from "../i18n";
import { invoke } from "@tauri-apps/api/core";
import {
  showDialog,
  buttonPrimaryClasses,
  buttonSecondaryClasses,
  theme,
} from "./dialogs";

/**
 * Host key information from Rust backend
 */
export interface HostKeyInfo {
  host_id: string;
  fingerprint_sha256: string;
  fingerprint_md5: string;
  algorithm: string;
  randomart: string;
  is_changed: boolean;
  old_fingerprint: string | null;
}

/**
 * Host key verification event payload
 */
export interface HostKeyVerifyEvent {
  verification_id: string;
  key_info: HostKeyInfo;
}

/**
 * User decision for host key verification
 */
export type UserDecision = "trust_permanently" | "trust_once" | "reject";

/**
 * Show dialog for unknown host (first connection)
 */
export async function showUnknownHostDialog(
  verificationId: string,
  keyInfo: HostKeyInfo
): Promise<UserDecision> {
  return new Promise((resolve) => {
    let showRandomart = false;

    const getContent = () => `
      <div class="hostkey-dialog">
        <div class="hostkey-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${theme.yellow}" stroke-width="2">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
          </svg>
        </div>

        <div class="hostkey-message">
          <p class="text-subtext0">${t("hostkey.unknownMessage")}</p>
          <p class="hostkey-host-id">'${keyInfo.host_id}'</p>
        </div>

        <div class="hostkey-details">
          <div class="hostkey-detail-row">
            <span class="hostkey-label">${t("hostkey.keyType")}</span>
            <span class="hostkey-value font-mono">${keyInfo.algorithm}</span>
          </div>
          <div class="hostkey-detail-row">
            <span class="hostkey-label">SHA256:</span>
            <span class="hostkey-value hostkey-fingerprint font-mono">${keyInfo.fingerprint_sha256.replace("SHA256:", "")}</span>
          </div>
          <div class="hostkey-detail-row">
            <span class="hostkey-label">MD5:</span>
            <span class="hostkey-value hostkey-fingerprint font-mono">${keyInfo.fingerprint_md5}</span>
          </div>
        </div>

        <div class="hostkey-randomart-toggle">
          <button type="button" class="hostkey-toggle-btn" id="toggleRandomart">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron ${showRandomart ? "rotate-90" : ""}">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            ${t("hostkey.showVisualFingerprint")}
          </button>
          <div class="hostkey-randomart ${showRandomart ? "" : "hidden"}" id="randomartContent">
            <pre class="font-mono">${keyInfo.randomart}</pre>
          </div>
        </div>

        <p class="hostkey-question">${t("hostkey.trustQuestion")}</p>

        <div class="hostkey-buttons">
          <button type="button" class="${buttonSecondaryClasses}" id="rejectBtn">
            ${t("hostkey.reject")}
          </button>
          <button type="button" class="${buttonSecondaryClasses}" id="trustOnceBtn">
            ${t("hostkey.trustOnce")}
          </button>
          <button type="button" class="${buttonPrimaryClasses}" id="trustAlwaysBtn">
            ${t("hostkey.trustAlways")}
          </button>
        </div>
      </div>
    `;

    const { element, close } = showDialog({
      title: t("hostkey.unknownHost"),
      content: getContent(),
      size: "md",
      showCloseButton: false,
    });

    const handleDecision = async (decision: UserDecision) => {
      try {
        await invoke("host_key_decision", {
          verificationId,
          decision,
        });
      } catch (e) {
        console.error("Failed to send host key decision:", e);
      }
      close();
      resolve(decision);
    };

    // Toggle randomart
    const toggleBtn = element.querySelector("#toggleRandomart");
    const randomartContent = element.querySelector("#randomartContent");
    const chevron = element.querySelector(".chevron");

    toggleBtn?.addEventListener("click", () => {
      showRandomart = !showRandomart;
      randomartContent?.classList.toggle("hidden");
      chevron?.classList.toggle("rotate-90");
    });

    // Button handlers
    element.querySelector("#rejectBtn")?.addEventListener("click", () => {
      handleDecision("reject");
    });

    element.querySelector("#trustOnceBtn")?.addEventListener("click", () => {
      handleDecision("trust_once");
    });

    element.querySelector("#trustAlwaysBtn")?.addEventListener("click", () => {
      handleDecision("trust_permanently");
    });

    // ESC = reject
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDecision("reject");
      }
    };
    document.addEventListener("keydown", handleKeydown);

    // Cleanup on close
    const originalClose = close;
    const wrappedClose = () => {
      document.removeEventListener("keydown", handleKeydown);
      originalClose();
    };

    // Replace close function
    Object.assign({ close: wrappedClose });
  });
}

/**
 * Show dialog for changed host key (MITM warning!)
 */
export async function showChangedHostKeyDialog(
  verificationId: string,
  keyInfo: HostKeyInfo
): Promise<UserDecision> {
  return new Promise((resolve) => {
    const getContent = () => `
      <div class="hostkey-dialog hostkey-dialog-warning">
        <div class="hostkey-warning-banner">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${theme.red}" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p class="hostkey-warning-title">${t("hostkey.warningMitm")}</p>
            <p class="hostkey-warning-subtitle">${t("hostkey.warningMitmSubtitle")}</p>
          </div>
        </div>

        <div class="hostkey-message">
          <p class="hostkey-host-id">'${keyInfo.host_id}'</p>
        </div>

        <div class="hostkey-comparison">
          <div class="hostkey-comparison-row">
            <span class="hostkey-comparison-label">${t("hostkey.previousKey")}</span>
            <span class="hostkey-comparison-value hostkey-fingerprint font-mono text-red">
              SHA256:${keyInfo.old_fingerprint || "???"}
            </span>
          </div>
          <div class="hostkey-comparison-arrow">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${theme.overlay0}" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <polyline points="19 12 12 19 5 12"/>
            </svg>
          </div>
          <div class="hostkey-comparison-row">
            <span class="hostkey-comparison-label">${t("hostkey.currentKey")}</span>
            <span class="hostkey-comparison-value hostkey-fingerprint font-mono text-yellow">
              ${keyInfo.fingerprint_sha256}
            </span>
          </div>
        </div>

        <div class="hostkey-details">
          <div class="hostkey-detail-row">
            <span class="hostkey-label">${t("hostkey.keyType")}</span>
            <span class="hostkey-value font-mono">${keyInfo.algorithm}</span>
          </div>
        </div>

        <p class="hostkey-contact-admin">${t("hostkey.contactAdmin")}</p>

        <div class="hostkey-buttons">
          <button type="button" class="${buttonPrimaryClasses} btn-danger" id="rejectBtn">
            ${t("hostkey.reject")}
          </button>
          <button type="button" class="${buttonSecondaryClasses}" id="trustOnceBtn">
            ${t("hostkey.trustOnce")}
          </button>
          <button type="button" class="${buttonSecondaryClasses}" id="replaceKeyBtn">
            ${t("hostkey.replaceKey")}
          </button>
        </div>
      </div>
    `;

    const { element, close } = showDialog({
      title: t("hostkey.warningHostKeyChanged"),
      content: getContent(),
      size: "md",
      showCloseButton: false,
    });

    const handleDecision = async (decision: UserDecision) => {
      try {
        await invoke("host_key_decision", {
          verificationId,
          decision,
        });
      } catch (e) {
        console.error("Failed to send host key decision:", e);
      }
      close();
      resolve(decision);
    };

    // Button handlers - note: reject is primary action for security
    element.querySelector("#rejectBtn")?.addEventListener("click", () => {
      handleDecision("reject");
    });

    element.querySelector("#trustOnceBtn")?.addEventListener("click", () => {
      handleDecision("trust_once");
    });

    element.querySelector("#replaceKeyBtn")?.addEventListener("click", () => {
      handleDecision("trust_permanently");
    });

    // ESC = reject (safe default)
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDecision("reject");
      }
    };
    document.addEventListener("keydown", handleKeydown);
  });
}

/**
 * Handle host key verification event from backend
 */
export async function handleHostKeyVerifyEvent(
  event: HostKeyVerifyEvent
): Promise<UserDecision> {
  const { verification_id, key_info } = event;

  if (key_info.is_changed) {
    return showChangedHostKeyDialog(verification_id, key_info);
  } else {
    return showUnknownHostDialog(verification_id, key_info);
  }
}

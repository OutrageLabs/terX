/**
 * Tag Edit Dialog for terX
 *
 * Dialog for creating and editing tags
 */

import { t } from "../i18n";
import { showDialog, labelClasses, inputClasses, buttonPrimaryClasses, buttonSecondaryClasses } from "./dialogs";
import * as storage from "../lib/storage";
import type { Tag } from "../lib/database.types";

interface TagDialogResult {
  saved: boolean;
  tag?: Tag;
}

// Predefined colors (Catppuccin palette)
const TAG_COLORS = [
  "#f38ba8", // Red
  "#fab387", // Peach
  "#f9e2af", // Yellow
  "#a6e3a1", // Green
  "#94e2d5", // Teal
  "#89dceb", // Sky
  "#89b4fa", // Blue
  "#cba6f7", // Mauve
  "#f5c2e7", // Pink
  "#b4befe", // Lavender
];

/**
 * Show tag edit dialog
 */
export async function showTagEditDialog(tag?: Tag): Promise<TagDialogResult> {
  return new Promise((resolve) => {
    const isEdit = !!tag;
    let selectedColor = tag?.color || TAG_COLORS[0];

    const getContent = () => `
      <form class="flex flex-col gap-4">
        <!-- Name -->
        <div>
          <label class="${labelClasses}">${t("tags.name")} <span class="text-red">*</span></label>
          <input
            type="text"
            class="${inputClasses}"
            name="name"
            placeholder="${t("tags.namePlaceholder")}"
            value="${tag?.name || ""}"
            required
          >
        </div>

        <!-- Color Picker -->
        <div class="form-group">
          <label class="${labelClasses}">${t("tags.color")}</label>
          <div class="color-picker">
            ${TAG_COLORS.map(
              (color) => `
              <button
                type="button"
                class="color-swatch ${color === selectedColor ? "color-swatch-selected" : ""}"
                data-color="${color}"
                style="background: ${color}"
              ></button>
            `
            ).join("")}
          </div>
          <input type="hidden" name="color" value="${selectedColor}">
        </div>

        <!-- Preview -->
        <div class="preview-box">
          <span class="preview-tag" style="background: ${selectedColor}" data-preview>
            ${tag?.name || t("tags.namePlaceholder")}
          </span>
        </div>
      </form>
    `;

    const { element, close } = showDialog({
      title: isEdit ? t("tags.edit") : t("tags.add"),
      content: getContent(),
      onClose: () => resolve({ saved: false }),
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
    const colorInput = element.querySelector('input[name="color"]') as HTMLInputElement;
    const nameInput = element.querySelector('input[name="name"]') as HTMLInputElement;
    const previewBadge = element.querySelector("[data-preview]") as HTMLElement;

    // Color selection
    element.querySelectorAll("[data-color]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const color = btn.getAttribute("data-color");
        if (!color) return;

        selectedColor = color;
        colorInput.value = color;

        // Update selected state
        element.querySelectorAll("[data-color]").forEach((b) => {
          const isSelected = b.getAttribute("data-color") === color;
          b.className = `color-swatch ${isSelected ? "color-swatch-selected" : ""}`;
        });

        // Update preview
        previewBadge.style.background = color;
      });
    });

    // Update preview on name change
    nameInput.addEventListener("input", () => {
      previewBadge.textContent = nameInput.value || t("tags.namePlaceholder");
    });

    // Cancel
    footer.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
      close();
      resolve({ saved: false });
    });

    // Save
    footer.querySelector('[data-action="save"]')?.addEventListener("click", async () => {
      const name = nameInput.value.trim();

      if (!name) {
        return;
      }

      const tagData = {
        name,
        color: selectedColor,
      };

      try {
        let savedTag: Tag;
        if (isEdit && tag) {
          savedTag = await storage.updateTag(tag.id, tagData);
        } else {
          savedTag = await storage.createTag(tagData);
        }

        close();
        resolve({ saved: true, tag: savedTag });
      } catch (error) {
        console.error("[tag-dialog] Failed to save tag:", error);
      }
    });

    // Focus first input
    setTimeout(() => {
      nameInput.focus();
    }, 100);
  });
}

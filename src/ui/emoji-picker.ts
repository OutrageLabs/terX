/**
 * Emoji Picker - używa emoji-picker-element (Web Component)
 *
 * Lekki picker (~40KB), wygląda natywnie, zero zależności.
 * https://github.com/nolanlawson/emoji-picker-element
 */

import 'emoji-picker-element';
import type { EmojiClickEvent } from 'emoji-picker-element/shared';

// Typ dla pickera - emoji-picker-element eksportuje jako Web Component
type Picker = HTMLElement & {
  skinToneEmoji?: string;
  dataSource?: string;
};

let currentPicker: Picker | null = null;
let backdrop: HTMLDivElement | null = null;

export interface EmojiPickerOptions {
  /** Callback wywoływany po wybraniu emoji */
  onSelect: (emoji: string) => void;
  /** Element względem którego pozycjonować picker (opcjonalnie) */
  anchor?: HTMLElement;
}

/**
 * Otwiera emoji picker
 */
export function showEmojiPicker(options: EmojiPickerOptions): void {
  // Zamknij istniejący picker
  if (currentPicker) {
    hideEmojiPicker();
  }

  // Utwórz backdrop (kliknięcie zamyka picker)
  backdrop = document.createElement('div');
  backdrop.className = 'emoji-picker-backdrop';
  backdrop.addEventListener('click', hideEmojiPicker);
  document.body.appendChild(backdrop);

  // Utwórz picker
  const picker = document.createElement('emoji-picker') as Picker;
  picker.className = 'emoji-picker-popup';

  // Obsługa wyboru emoji
  picker.addEventListener('emoji-click', ((event: EmojiClickEvent) => {
    const emoji = event.detail.unicode;
    if (emoji) {
      options.onSelect(emoji);
    }
    hideEmojiPicker();
  }) as EventListener);

  // Pozycjonowanie - nad przyciskiem anchor lub na środku
  if (options.anchor) {
    const rect = options.anchor.getBoundingClientRect();
    // Pozycjonuj nad przyciskiem, wyśrodkowany
    picker.style.position = 'fixed';
    picker.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    picker.style.left = `${rect.left + rect.width / 2}px`;
    picker.style.transform = 'translateX(-50%)';
  } else {
    // Środek ekranu
    picker.style.position = 'fixed';
    picker.style.top = '50%';
    picker.style.left = '50%';
    picker.style.transform = 'translate(-50%, -50%)';
  }

  document.body.appendChild(picker);
  currentPicker = picker;

  // Focus na picker (dla keyboard navigation)
  requestAnimationFrame(() => {
    const searchInput = picker.shadowRoot?.querySelector('input');
    if (searchInput) {
      searchInput.focus();
    }
  });
}

/**
 * Zamyka emoji picker
 */
export function hideEmojiPicker(): void {
  if (backdrop) {
    backdrop.remove();
    backdrop = null;
  }
  if (currentPicker) {
    currentPicker.remove();
    currentPicker = null;
  }
}

/**
 * Toggle emoji picker
 */
export function toggleEmojiPicker(options: EmojiPickerOptions): void {
  if (currentPicker) {
    hideEmojiPicker();
  } else {
    showEmojiPicker(options);
  }
}

/**
 * Sprawdza czy picker jest otwarty
 */
export function isEmojiPickerOpen(): boolean {
  return currentPicker !== null;
}

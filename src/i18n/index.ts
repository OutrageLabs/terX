/**
 * Internationalization (i18n) Manager for terX
 *
 * Provides simple, lightweight translation support with:
 * - Lazy loading of language files
 * - Automatic language detection
 * - Parameter interpolation
 * - TypeScript type safety
 */

import enUS from "./en-US.json";

// Available locales
export type Locale = "en-US" | "pl-PL";

// Translation dictionary type (nested object with string leaves)
type TranslationValue = string | { [key: string]: TranslationValue };
type Translations = { [key: string]: TranslationValue };

// Storage key for persisting locale preference
const LOCALE_STORAGE_KEY = "terx-locale";

// Default locale
const DEFAULT_LOCALE: Locale = "en-US";

// Available locales with display names
export const AVAILABLE_LOCALES: { code: Locale; name: string; nativeName: string }[] = [
  { code: "en-US", name: "English", nativeName: "English" },
  { code: "pl-PL", name: "Polish", nativeName: "Polski" },
];

// Current state
let currentLocale: Locale = DEFAULT_LOCALE;
let translations: Translations = enUS;
let isInitialized = false;

// Event listeners for locale changes
type LocaleChangeListener = (locale: Locale) => void;
const listeners: Set<LocaleChangeListener> = new Set();

/**
 * Get nested value from object using dot notation
 * e.g., getNestedValue(obj, "auth.signIn") returns obj.auth.signIn
 */
function getNestedValue(obj: Translations, path: string): string | undefined {
  const keys = path.split(".");
  let current: TranslationValue | undefined = obj;

  for (const key of keys) {
    if (current === undefined || typeof current === "string") {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Interpolate parameters in translation string
 * e.g., interpolate("Hello {name}!", { name: "World" }) returns "Hello World!"
 */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;

  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Load translations for a specific locale
 */
async function loadTranslations(locale: Locale): Promise<Translations> {
  switch (locale) {
    case "en-US":
      return enUS;
    case "pl-PL":
      // Dynamic import for non-default locales
      const plPL = await import("./pl-PL.json");
      return plPL.default || plPL;
    default:
      console.warn(`Unknown locale: ${locale}, falling back to ${DEFAULT_LOCALE}`);
      return enUS;
  }
}

/**
 * Detect user's preferred locale
 */
function detectLocale(): Locale {
  // 1. Check localStorage
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && AVAILABLE_LOCALES.some((l) => l.code === stored)) {
    return stored as Locale;
  }

  // 2. Check browser language
  const browserLang = navigator.language;

  // Exact match
  if (AVAILABLE_LOCALES.some((l) => l.code === browserLang)) {
    return browserLang as Locale;
  }

  // Language prefix match (e.g., "pl" matches "pl-PL")
  const langPrefix = browserLang.split("-")[0];
  const prefixMatch = AVAILABLE_LOCALES.find((l) => l.code.startsWith(langPrefix));
  if (prefixMatch) {
    return prefixMatch.code;
  }

  // 3. Fallback to default
  return DEFAULT_LOCALE;
}

/**
 * Initialize the i18n system
 * Call this once at app startup
 */
export async function initI18n(): Promise<void> {
  if (isInitialized) return;

  currentLocale = detectLocale();
  translations = await loadTranslations(currentLocale);
  isInitialized = true;

  console.log(`[i18n] Initialized with locale: ${currentLocale}`);
}

/**
 * Get the current locale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Set the current locale
 * This will load new translations and notify listeners
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (locale === currentLocale) return;

  if (!AVAILABLE_LOCALES.some((l) => l.code === locale)) {
    console.warn(`Unknown locale: ${locale}`);
    return;
  }

  translations = await loadTranslations(locale);
  currentLocale = locale;

  // Persist preference
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);

  // Notify listeners
  listeners.forEach((listener) => listener(locale));

  console.log(`[i18n] Locale changed to: ${locale}`);
}

/**
 * Subscribe to locale changes
 * Returns unsubscribe function
 */
export function onLocaleChange(listener: LocaleChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Translate a key to the current locale
 *
 * @param key - Dot-notation key (e.g., "auth.signIn")
 * @param params - Optional parameters for interpolation
 * @returns Translated string or the key if not found
 *
 * @example
 * t("common.save") // "Save"
 * t("hosts.deleteConfirm", { name: "server1" }) // "Are you sure you want to delete \"server1\"?"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const value = getNestedValue(translations, key);

  if (value === undefined) {
    console.warn(`[i18n] Missing translation for key: ${key}`);
    return key;
  }

  return interpolate(value, params);
}

/**
 * Check if a translation key exists
 */
export function hasTranslation(key: string): boolean {
  return getNestedValue(translations, key) !== undefined;
}

/**
 * Get all available locales
 */
export function getAvailableLocales(): typeof AVAILABLE_LOCALES {
  return AVAILABLE_LOCALES;
}

// Auto-initialize when imported (browser environment)
if (typeof window !== "undefined") {
  initI18n().catch(console.error);
}

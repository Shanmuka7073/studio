
import locales from './locales.json';

type Locales = typeof locales;
type LocaleKeys = keyof Locales;

const translations: Locales = locales;

/**
 * A simple translation function that returns a bilingual string.
 * @param key The key from locales.json to translate.
 * @returns A string in the format "English / తెలుగు"
 */
export function t(key: string): string {
  const entry = translations[key as LocaleKeys];
  if (entry) {
    return `${entry.en} / ${entry.te}`;
  }
  // Fallback for keys that might not be in the JSON file (like dynamic product names)
  return key;
}

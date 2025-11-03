
import locales from './locales.json';
import { useAppStore } from './store';

type LocaleEntry = string | string[];
type Locales = Record<string, Record<string, LocaleEntry>>;

const translations: Locales = locales;

/**
 * A simple translation function. It looks for a key in the JSON file
 * and returns the translation for the currently set language.
 * It does NOT fall back to English or render bilingual text anymore.
 * @param key The key from locales.json to translate.
 * @param lang The target language code (e.g., 'te-IN'). If not provided, it will be read from the app store.
 * @returns The translated string, or the original key if not found.
 */
export function t(key: string, lang?: string): string {
  const language = lang || useAppStore.getState().language;
  const langCode = language.split('-')[0]; // 'en' from 'en-IN'
  const entry = translations[key as keyof typeof translations];
  
  if (entry && entry[langCode]) {
    const regionalEntry = entry[langCode];
    // Return the first alias if it's an array
    return Array.isArray(regionalEntry) ? regionalEntry[0] : regionalEntry;
  }
  
  // Fallback for keys that might not be in the JSON, like dynamic product names
  return key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}


/**
 * Gets all aliases for a given key in a specific language.
 * @param key The key from locales.json.
 * @returns An object with arrays of aliases for all configured languages (e.g., { en: [], te: [], hi: [] }).
 */
export function getAllAliases(key: string): Record<string, string[]> {
    const entry = translations[key as keyof typeof translations];
    const result: Record<string, string[]> = {};

    if (entry) {
        for (const langCode in entry) {
            const langAliases = entry[langCode];
            result[langCode] = (Array.isArray(langAliases) ? langAliases : [langAliases]).filter(Boolean);
        }
    }
    
    return result;
}

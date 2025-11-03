
import locales from './locales.json';
import { useAppStore } from './store';

type LocaleEntry = string | string[];
type Locales = Record<string, Record<string, LocaleEntry>>;

const translations: Locales = locales;

/**
 * A simple translation function that displays bilingual text.
 * @param key The key from locales.json to translate.
 * @param lang The target language code (e.g., 'te-IN'). If not provided, it will be read from the app store.
 * @returns A string in the format "English / తెలుగు" or just "English".
 */
export function t(key: string, lang?: string): string {
  const language = lang || useAppStore.getState().language;
  const entry = translations[key as keyof typeof translations];
  
  if (entry) {
    const en = Array.isArray(entry.en) ? entry.en[0] : entry.en;
    
    // Do not show bilingual for English
    if (language === 'en-IN' || !entry[language]) {
        return en || key;
    }

    const regionalEntry = entry[language];
    const regional = Array.isArray(regionalEntry) ? regionalEntry[0] : regionalEntry;
    
    if (en && regional && en !== regional) {
      return `${en} / ${regional}`;
    }
    return en || key;
  }
  
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

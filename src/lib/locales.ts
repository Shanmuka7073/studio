
import locales from './locales.json';

type LocaleEntry = string | string[];
type Locales = Record<string, Record<string, LocaleEntry>>;

const translations: Locales = locales;

/**
 * A simple translation function.
 * If the entry for the key is an array, it returns the first item.
 * @param key The key from locales.json to translate.
 * @returns A string in the format "English" or "English / తెలుగు" based on the entry type.
 */
export function t(key: string): string {
  const entry = translations[key as keyof typeof translations];
  
  if (entry) {
    const en = Array.isArray(entry.en) ? entry.en[0] : entry.en;
    const te = Array.isArray(entry.te) ? entry.te[0] : entry.te;
    
    if (en && te) {
      return `${en} / ${te}`;
    }
    return en || key;
  }
  
  // Fallback for keys that might not be in the JSON file (like dynamic product names)
  return key;
}

/**
 * Gets all aliases for a given key.
 * @param key The key from locales.json.
 * @returns An object with 'en' and 'te' arrays of aliases.
 */
export function getAllAliases(key: string): { en: string[], te: string[] } {
    const entry = translations[key as keyof typeof translations];
    const result = { en: [] as string[], te: [] as string[] };

    if (entry) {
        result.en = (Array.isArray(entry.en) ? entry.en : [entry.en]).filter(Boolean);
        result.te = (Array.isArray(entry.te) ? entry.te : [entry.te]).filter(Boolean);
    }
    
    return result;
}

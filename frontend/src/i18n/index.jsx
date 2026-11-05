import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.js';
import translations from './translations.js';

export const LANGUAGES = [['en-IN', 'English'], ['hi-IN', 'हिंदी'], ['mr-IN', 'मराठी'], ['ta-IN', 'தமிழ்'], ['te-IN', 'తెలుగు'], ['kn-IN', 'ಕನ್ನಡ'], ['gu-IN', 'ગુજરાતી'], ['bn-IN', 'বাংলা'], ['ml-IN', 'മലയാളം'], ['pa-IN', 'ਪੰਜਾਬੀ']];
const STORAGE = 'ud_language';

export function translate(table, key, vars = {}) {
  const text = table?.[key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => { try { return localStorage.getItem(STORAGE) || 'en-IN'; } catch { return 'en-IN'; } });
  const setLanguage = useCallback(value => { setLanguageState(value); try { localStorage.setItem(STORAGE, value); } catch { /* ignore */ } }, []);
  useEffect(() => { document.documentElement.lang = language.slice(0, 2); }, [language]);
  const [loaded, setLoaded] = useState({});
  const code = language.slice(0, 2);
  useEffect(() => {
    if (!translations[code] || loaded[code]) return;
    translations[code]().then(module => setLoaded(current => ({ ...current, [code]: module.default }))).catch(() => {});
  }, [code, loaded]);
  const table = loaded[code];
  const t = useCallback((key, vars) => translate(table, key, vars), [table]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

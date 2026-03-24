import { createContext, useContext, useState, useEffect } from 'react';
import { createTranslator } from './i18n.js';
import { api } from './api.js';

const I18nContext = createContext(createTranslator('en'));

export function I18nProvider({ children }) {
  const [t, setT] = useState(() => createTranslator('en'));

  useEffect(() => {
    api.getSettings().catch(() => ({})).then(s => {
      setT(() => createTranslator(s.defaultLocale || 'en'));
    });
  }, []);

  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}

// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createTranslator, translations } from './i18n.js';
import { api } from './api.js';

const LS_KEY = 'gp_ui_locale';

function resolveLocale(locale) {
  if (!locale) return 'en';
  if (translations[locale]) return locale;
  // Prefix match: 'pt' → 'pt-BR', 'zh' → first zh-* match
  const prefix = locale.split('-')[0];
  const match = Object.keys(translations).find(k => k.startsWith(prefix + '-') || k === prefix);
  return match || 'en';
}

const I18nCtx   = createContext(createTranslator('en'));
const LocaleCtx = createContext({ locale: 'en', setLocale: () => {} });

export function I18nProvider({ children }) {
  // Seed from localStorage for instant first render in the correct locale.
  const [locale, setLocaleState] = useState(() => {
    try {
      return resolveLocale(localStorage.getItem(LS_KEY) || 'en');
    } catch {
      return 'en';
    }
  });

  // Override with server-side user preference on mount.
  useEffect(() => {
    Promise.all([
      api.me().catch(() => null),
      api.getSettings().catch(() => ({})),
    ]).then(([user, settings]) => {
      const raw = user?.locale || settings?.defaultLocale;
      if (raw) {
        const resolved = resolveLocale(raw);
        setLocaleState(resolved);
        try { localStorage.setItem(LS_KEY, resolved); } catch {}
      }
    });
  }, []);

  const setLocale = (newLocale) => {
    const resolved = resolveLocale(newLocale);
    setLocaleState(resolved);
    try { localStorage.setItem(LS_KEY, resolved); } catch {}
  };

  const t = useMemo(() => createTranslator(locale), [locale]);

  return (
    <LocaleCtx.Provider value={{ locale, setLocale }}>
      <I18nCtx.Provider value={t}>
        {children}
      </I18nCtx.Provider>
    </LocaleCtx.Provider>
  );
}

export function useT()      { return useContext(I18nCtx); }
export function useLocale() { return useContext(LocaleCtx); }

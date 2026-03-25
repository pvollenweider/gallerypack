// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createTranslator } from './i18n.js';
import { api } from './api.js';

const I18nCtx    = createContext(createTranslator('en'));
const LocaleCtx  = createContext({ locale: 'en', setLocale: () => {} });

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    Promise.all([
      api.me().catch(() => null),
      api.getSettings().catch(() => ({})),
    ]).then(([user, settings]) => {
      const l = user?.locale || settings?.defaultLocale || 'en';
      setLocale(l);
    });
  }, []);

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

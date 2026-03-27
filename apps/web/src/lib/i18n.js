// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/lib/i18n.js — admin UI translations
// Translations live in src/locales/<locale>.json.
// The gallery viewer is localised at build time by the engine (separate system).

import en    from '../locales/en.json';
import fr    from '../locales/fr.json';
import de    from '../locales/de.json';
import es    from '../locales/es.json';
import it    from '../locales/it.json';
import ptBR  from '../locales/pt-BR.json';
import ptPT  from '../locales/pt-PT.json';
import nl    from '../locales/nl.json';
import ja    from '../locales/ja.json';
import ko    from '../locales/ko.json';
import pl    from '../locales/pl.json';
import sv    from '../locales/sv.json';
import tr    from '../locales/tr.json';
import cs    from '../locales/cs.json';
import uk    from '../locales/uk.json';
import el    from '../locales/el.json';
import nb    from '../locales/nb.json';
import da    from '../locales/da.json';

export const translations = {
  en,
  fr,
  de,
  es,
  it,
  'pt-BR': ptBR,
  'pt-PT': ptPT,
  pt: ptBR,   // legacy alias
  nl,
  ja,
  jp: ja,     // legacy alias (was 'jp' in old code)
  ko,
  pl,
  sv,
  tr,
  cs,
  uk,
  el,
  nb,
  da,
};

/**
 * Create a translator function for the given locale.
 * Falls back to English for any missing key.
 * @param {string} locale
 * @returns {function(key: string, vars?: object): string}
 */
export function createTranslator(locale) {
  const lang = translations[locale] || translations.en;
  return function t(key, vars = {}) {
    let str = lang[key] ?? translations.en[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
    return str;
  };
}

/** Supported UI locales with display names */
export const UI_LOCALE_OPTIONS = [
  { value: 'en',    label: 'English' },
  { value: 'fr',    label: 'Français' },
  { value: 'de',    label: 'Deutsch' },
  { value: 'es',    label: 'Español' },
  { value: 'it',    label: 'Italiano' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'nl',    label: 'Nederlands' },
  { value: 'ja',    label: '日本語' },
  { value: 'ko',    label: '한국어' },
  { value: 'pl',    label: 'Polski' },
  { value: 'sv',    label: 'Svenska' },
  { value: 'tr',    label: 'Türkçe' },
  { value: 'cs',    label: 'Čeština' },
  { value: 'uk',    label: 'Українська' },
  { value: 'el',    label: 'Ελληνικά' },
  { value: 'nb',    label: 'Norsk bokmål' },
  { value: 'da',    label: 'Dansk' },
];

/** Convert a human-readable title to a URL slug. */
export function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')         // trim leading/trailing dashes
    || 'gallery';
}

/** Format bytes to human-readable size. */
export function formatSize(bytes) {
  if (!bytes || bytes === 0) return null;
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return Math.round(bytes / 1024) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useT } from '../lib/I18nContext.jsx';

const APP_VERSION = __APP_VERSION__ ?? 'dev';

export function Footer() {
  const t = useT();
  return (
    <footer style={s.footer}>
      <span style={s.brand}>{t('app_brand')}</span>
      <span style={s.sep}>·</span>
      <span style={s.version}>{APP_VERSION}</span>
      <span style={s.sep}>·</span>
      <a href="https://github.com/pvollenweider/gallerypack" target="_blank" rel="noreferrer" style={s.link}>
        GitHub
      </a>
    </footer>
  );
}

const s = {
  footer:  { borderTop: '1px solid #eee', background: '#fff', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#aaa' },
  brand:   { fontWeight: 600, color: '#ccc', letterSpacing: '-0.01em' },
  sep:     { color: '#ddd' },
  version: {},
  link:    { color: '#aaa', textDecoration: 'none' },
};

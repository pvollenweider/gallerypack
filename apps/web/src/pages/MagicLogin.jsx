// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/I18nContext.jsx';

// States: loading → valid | invalid → (on click) logging_in → done
export default function MagicLogin() {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const { setUser } = useAuth();
  const t           = useT();

  const [state,  setState]  = useState('loading'); // loading | valid | invalid | logging_in
  const [email,  setEmail]  = useState('');
  const [error,  setError]  = useState('');

  // On mount: validate token (GET — no side effects, safe for mail scanners)
  useEffect(() => {
    api.checkMagicLink(token)
      .then(({ email: e }) => { setEmail(e || ''); setState('valid'); })
      .catch(err => { setError(err.message); setState('invalid'); });
  }, [token]);

  // On button click: consume token (POST — creates session)
  async function handleLogin() {
    setState('logging_in');
    try {
      await api.consumeMagicLink(token);
      const u = await api.me();
      setUser(u);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setState('invalid');
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>GalleryPack</h1>

        {state === 'loading' && (
          <p style={s.sub}>{t('loading')}</p>
        )}

        {state === 'valid' && (
          <>
            {email && <p style={s.sub}>{email}</p>}
            <button style={s.btn} onClick={handleLogin}>
              {t('magic_confirm_btn')}
            </button>
          </>
        )}

        {state === 'logging_in' && (
          <p style={s.sub}>{t('magic_loading')}</p>
        )}

        {state === 'invalid' && (
          <>
            <p style={s.error}>{error}</p>
            <a href="/forgot-password" style={s.link}>{t('magic_request_new')}</a>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page:  { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#f0f0f0' },
  card:  { background:'#fff', borderRadius:12, padding:'2.5rem 2rem', width:'100%', maxWidth:360, boxShadow:'0 2px 16px #0001', textAlign:'center' },
  title: { margin:'0 0 1.5rem', fontSize:'1.4rem', fontWeight:700, letterSpacing:'-0.02em' },
  sub:   { margin:'0 0 1.25rem', fontSize:'0.9rem', color:'#888' },
  btn:   { width:'100%', padding:'0.65rem', background:'#111', color:'#fff', border:'none', borderRadius:8, fontSize:'0.95rem', fontWeight:600, cursor:'pointer' },
  error: { margin:'0 0 1rem', fontSize:'0.9rem', color:'#c00' },
  link:  { fontSize:'0.85rem', color:'#888', textDecoration:'none' },
};

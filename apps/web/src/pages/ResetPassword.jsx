// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

export default function ResetPassword() {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const t = useT();
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [checking,  setChecking]  = useState(true);
  const [invalid,   setInvalid]   = useState(false);

  useEffect(() => {
    api.checkResetToken(token)
      .then(d => setEmail(d.email))
      .catch(() => setInvalid(true))
      .finally(() => setChecking(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== password2) return setError(t('profile_passwords_mismatch'));
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (checking) return (
    <div style={s.page}><div style={s.card}><p style={s.sub}>{t('reset_checking')}</p></div></div>
  );

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>GalleryPack</h1>
        {invalid ? (
          <>
            <p style={s.error}>{t('reset_invalid')}</p>
            <Link to="/login" style={s.link}>{t('back_to_login')}</Link>
          </>
        ) : (
          <>
            <p style={s.sub}>{t('reset_heading', { email })}</p>
            <form onSubmit={handleSubmit} style={s.form}>
              <input
                style={s.input}
                type="password" placeholder={t('reset_new_placeholder')} autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)}
                minLength={8} required
              />
              <input
                style={s.input}
                type="password" placeholder={t('reset_confirm_placeholder')} autoComplete="new-password"
                value={password2} onChange={e => setPassword2(e.target.value)}
                minLength={8} required
              />
              {error && <p style={s.error}>{error}</p>}
              <button style={s.btn} type="submit" disabled={loading}>
                {loading ? t('saving') : t('reset_submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page:  { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#f0f0f0' },
  card:  { background:'#fff', borderRadius:12, padding:'2.5rem 2rem', width:'100%', maxWidth:360, boxShadow:'0 2px 16px #0001' },
  title: { margin:'0 0 1.5rem', fontSize:'1.4rem', fontWeight:700, textAlign:'center', letterSpacing:'-0.02em' },
  sub:   { margin:'0 0 1.25rem', fontSize:'0.875rem', color:'#555', lineHeight:1.5 },
  form:  { display:'flex', flexDirection:'column', gap:'0.75rem' },
  input: { padding:'0.6rem 0.75rem', border:'1px solid #ddd', borderRadius:6, fontSize:'0.95rem', outline:'none' },
  btn:   { padding:'0.65rem', background:'#111', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.95rem' },
  error: { margin:0, color:'#c00', fontSize:'0.85rem' },
  link:  { fontSize:'0.85rem', color:'#888', textDecoration:'none' },
};

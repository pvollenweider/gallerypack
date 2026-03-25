// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/I18nContext.jsx';

const ROLE_COLORS = { owner: '#7c3aed', admin: '#2563eb', editor: '#0891b2', photographer: '#059669' };

export default function AcceptInvite() {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const { setUser } = useAuth();
  const t = useT();

  const [invite,    setInvite]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getInviteInfo(token)
      .then(setInvite)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== password2) { setError(t('profile_passwords_mismatch')); return; }
    if (password.length < 8)    { setError(t('invite_error_min_length')); return; }
    setError('');
    setSubmitting(true);
    try {
      await api.acceptInvite(token, password);
      const me = await api.me();
      setUser(me);
      if (invite?.galleryId) {
        navigate(`/galleries/${invite.galleryId}`, { replace: true });
      } else if (me?.role === 'photographer') {
        const galleries = await api.myGalleries().catch(() => []);
        navigate(galleries[0] ? `/galleries/${galleries[0].id}` : '/', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  const ROLE_LABELS = {
    owner:        t('role_owner'),
    admin:        t('role_admin'),
    editor:       t('role_editor'),
    photographer: t('role_photographer'),
  };

  if (loading) return <div style={s.center}><div style={s.card}><p style={s.sub}>{t('loading')}</p></div></div>;

  if (error && !invite) return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={s.logo}>GalleryPack</div>
        <p style={s.errorMsg}>{error || t('invite_invalid_link')}</p>
        <a href="/login" style={s.link}>{t('back_to_login')}</a>
      </div>
    </div>
  );

  if (invite?.alreadyAccepted) return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={s.logo}>GalleryPack</div>
        <p style={s.sub}>{t('invite_already_accepted')}</p>
        <a href="/login" style={s.link}>{t('invite_go_login')}</a>
      </div>
    </div>
  );

  return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={s.logo}>GalleryPack</div>
        <h1 style={s.title}>{t('invite_title')}</h1>
        <p style={s.sub}>
          {t('invite_subtitle', { studio: invite?.studioName || '…' })}{' '}
          <span style={{ ...s.roleBadge, background: ROLE_COLORS[invite?.role] + '18', color: ROLE_COLORS[invite?.role] }}>
            {ROLE_LABELS[invite?.role] || invite?.role}
          </span>
        </p>
        {invite?.galleryTitle && (
          <p style={s.sub}>{t('invite_for_gallery', { gallery: invite.galleryTitle })}</p>
        )}
        <p style={s.email}>{invite?.email}</p>

        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>{t('invite_choose_password')}</label>
          <input
            style={s.input}
            type="password"
            placeholder={t('invite_password_placeholder')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required minLength={8} autoFocus
          />
          <input
            style={s.input}
            type="password"
            placeholder={t('invite_confirm_placeholder')}
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            required
          />
          {error && <p style={s.errorMsg}>{error}</p>}
          <button style={s.btn} type="submit" disabled={submitting}>
            {submitting ? t('invite_creating') : t('invite_create')}
          </button>
        </form>
      </div>
    </div>
  );
}

const s = {
  center:    { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f8' },
  card:      { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '2.5rem 2rem', width: '100%', maxWidth: 400, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' },
  logo:      { fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#111', marginBottom: '1.5rem' },
  title:     { fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#111' },
  sub:       { color: '#666', fontSize: '0.9rem', margin: '0 0 0.25rem', lineHeight: 1.5 },
  email:     { color: '#999', fontSize: '0.82rem', margin: '0 0 1.5rem' },
  roleBadge: { display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: 4, fontSize: '0.82rem', fontWeight: 600 },
  form:      { display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' },
  label:     { fontSize: '0.8rem', fontWeight: 600, color: '#555' },
  input:     { padding: '0.55rem 0.75rem', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.9rem', outline: 'none' },
  btn:       { padding: '0.65rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', marginTop: '0.25rem' },
  errorMsg:  { color: '#dc2626', fontSize: '0.82rem', margin: 0 },
  link:      { color: '#555', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-block', marginTop: '1rem' },
};

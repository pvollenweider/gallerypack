// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// Page d'accueil : liste des studios accessibles
// - superadmin : tous les studios + création
// - utilisateur normal : son studio unique
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/I18nContext.jsx';
import { Toast } from '../components/Toast.jsx';

function slugify(str) {
  return str.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function StudiosPage() {
  const t                   = useT();
  const navigate            = useNavigate();
  const { user, setUser, logout } = useAuth();
  const isSuperadmin        = user?.platformRole === 'superadmin';

  const [studios,     setStudios]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [toast,       setToast]       = useState('');
  const [creating,    setCreating]    = useState(false);
  const [switching,   setSwitching]   = useState(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', plan: 'free', ownerEmail: '' });
  const [inviteLink, setInviteLink] = useState('');
  const [license,     setLicense]     = useState(null); // { source, features, limits, ... }

  // Photographers don't have studio access — redirect them to their gallery
  useEffect(() => {
    if (user?.role === 'photographer') {
      api.myGalleries().then(gs => {
        if (gs?.[0]) navigate(`/galleries/${gs[0].id}`, { replace: true });
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => { load(); }, [isSuperadmin]);

  async function load() {
    setLoading(true);
    try {
      if (isSuperadmin) {
        const [studioList, lic] = await Promise.all([
          api.listPlatformStudios(),
          api.getPlatformLicense().catch(() => null),
        ]);
        setStudios(studioList);
        setLicense(lic);
      } else {
        // Regular user — show their studio
        if (user?.studioId) {
          setStudios([{ id: user.studioId, name: user.studioName || user.studioId, slug: '', is_default: 1, member_count: null, gallery_count: null }]);
        }
      }
    } catch (e) { setToast(e.message); }
    finally { setLoading(false); }
  }

  function handleNameChange(v) {
    setForm(f => ({ ...f, name: v, slug: slugTouched ? f.slug : slugify(v) }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const studio = await api.createPlatformStudio(form);
      setStudios(ss => [...ss, studio]);
      setCreating(false);
      setForm({ name: '', slug: '', plan: 'free', ownerEmail: '' });
      setSlugTouched(false);
      if (studio.inviteToken) {
        const base = window.location.origin;
        setInviteLink(`${base}/admin/invite/${studio.inviteToken}`);
      }
      setToast(t('studios_toast_created'));
    } catch (err) {
      if (err.data?.error === 'organization_limit_reached' || err.message?.includes('organization_limit_reached')) {
        setCreating(false);
        setToast(t('license_org_limit_toast'));
      } else {
        setToast(err.message);
      }
    }
  }

  // Derived: is org creation blocked by the license?
  const orgLimitReached = isSuperadmin && license && (() => {
    const hasMultiOrg = license.features?.includes('multi_organization');
    const limit = hasMultiOrg
      ? (license.limits?.organization_limit ?? Infinity)
      : 1;
    return limit !== Infinity && studios.length >= limit;
  })();

  async function handleEnter(studioId) {
    setSwitching(studioId);
    try {
      if (isSuperadmin) {
        await api.switchStudio(studioId);
        const me = await api.me();
        setUser(me);
      }
      navigate('/studio');
    } catch (e) { setToast(e.message); }
    finally { setSwitching(null); }
  }

  async function handleDelete(id) {
    if (!confirm(t('studios_confirm_delete'))) return;
    try {
      await api.deletePlatformStudio(id);
      setStudios(ss => ss.filter(s => s.id !== id));
      setToast(t('studios_toast_deleted'));
    } catch (e) { setToast(e.message); }
  }

  const PLAN_COLORS = { free: '#888', pro: '#2563eb', agency: '#7c3aed' };

  return (
    <div style={s.page}>
      <header style={s.header}>
        <span style={s.logo}>GalleryPack</span>
        <div style={s.headerRight}>
          <span style={s.userLabel}>{user?.email}</span>
          {isSuperadmin && <Link to="/inspector" style={s.outlineBtn}>Inspector</Link>}
          {isSuperadmin && (
            <Link to="/settings#license" style={{ ...s.outlineBtn, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {license?.source === 'license'
                ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                : <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />}
              {t('section_license')}
            </Link>
          )}
          <Link to="/settings" style={s.outlineBtn}>{t('settings')}</Link>
          <button style={s.outlineBtn} onClick={logout}>{t('sign_out')}</button>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.toolbar}>
          <h2 style={s.heading}>{t('studios_title')}</h2>
          {isSuperadmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                style={{ ...s.primaryBtn, opacity: orgLimitReached ? 0.45 : 1, cursor: orgLimitReached ? 'not-allowed' : 'pointer' }}
                onClick={() => !orgLimitReached && setCreating(v => !v)}
                title={orgLimitReached ? t('license_org_limit_tooltip') : undefined}
              >
                {t('studios_new')}
              </button>
            </div>
          )}
        </div>

        {orgLimitReached && (
          <div style={s.upgradeBanner}>
            <span style={{ fontWeight: 600 }}>{t('license_org_limit_title')}</span>
            {' '}{t('license_org_limit_body')}
            {' '}<Link to="/settings#license" style={{ color: '#2563eb' }}>{t('license_upgrade_link')}</Link>
          </div>
        )}

        {creating && (
          <form style={s.createForm} onSubmit={handleCreate}>
            <div style={s.formRow}>
              <input
                style={s.input}
                placeholder={t('studios_name_placeholder')}
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                required autoFocus
              />
              <input
                style={{ ...s.input, fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: 180 }}
                placeholder="slug"
                value={form.slug}
                onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: e.target.value })); }}
                required
              />
              <select style={{ ...s.input, maxWidth: 120 }} value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                {['free','pro','agency'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={s.formRow}>
              <input
                style={s.input}
                type="email"
                placeholder={t('studios_owner_email_placeholder')}
                value={form.ownerEmail}
                onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))}
              />
              {form.ownerEmail && (
                <span style={{ fontSize: '0.78rem', color: '#888', alignSelf: 'center' }}>
                  {t('studios_owner_invite_hint')}
                </span>
              )}
            </div>
            <div style={{ display:'flex', gap:'0.5rem' }}>
              <button style={s.primaryBtn} type="submit">{t('studios_create_btn')}</button>
              <button style={s.outlineBtn} type="button" onClick={() => setCreating(false)}>{t('cancel')}</button>
            </div>
          </form>
        )}

        {inviteLink && (
          <div style={s.inviteBanner}>
            <span style={{ fontSize: '0.82rem', color: '#555', flex: 1, wordBreak: 'break-all' }}>
              🔗 {inviteLink}
            </span>
            <button style={s.outlineBtn} onClick={() => { navigator.clipboard.writeText(inviteLink); setToast(t('access_copied')); }}>
              {t('team_invite_link_copy')}
            </button>
            <button style={{ ...s.outlineBtn, color: '#999' }} onClick={() => setInviteLink('')}>✕</button>
          </div>
        )}

        {loading ? (
          <p style={s.dim}>{t('loading')}</p>
        ) : studios.length === 0 ? (
          <div style={s.empty}>
            <p>{t('studios_empty')}</p>
            {isSuperadmin && <button style={s.primaryBtn} onClick={() => setCreating(true)}>{t('studios_new')}</button>}
          </div>
        ) : (
          <div style={s.grid}>
            {studios.map(studio => (
              <div key={studio.id} style={s.card}>
                <div style={s.cardBody}>
                  <div style={s.cardName}>
                    {studio.name}
                    {studio.is_default === 1 && <span style={s.defaultBadge}>{t('studios_default_badge')}</span>}
                  </div>
                  {isSuperadmin && (
                    <div style={s.cardMeta}>
                      <span style={{ color: PLAN_COLORS[studio.plan] || '#888', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>{studio.plan}</span>
                      {studio.member_count != null && <span style={s.metaChip}>{studio.member_count} {t('studios_members_label')}</span>}
                      {studio.gallery_count != null && <span style={s.metaChip}>{studio.gallery_count} {t('studios_galleries_label')}</span>}
                    </div>
                  )}
                </div>
                <div style={s.cardActions}>
                  <button
                    style={s.enterBtn}
                    onClick={() => handleEnter(studio.id)}
                    disabled={switching === studio.id}
                  >
                    {switching === studio.id ? '…' : t('studios_enter_btn')}
                  </button>
                  {isSuperadmin && !studio.is_default && (
                    <button style={s.dangerBtn} onClick={() => handleDelete(studio.id)}>{t('delete')}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

const s = {
  page:        { minHeight: '100vh', background: '#f8f8f8' },
  header:      { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo:        { fontWeight: 700, letterSpacing: '-0.02em' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  userLabel:   { fontSize: '0.85rem', color: '#888' },
  main:        { maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' },
  toolbar:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
  heading:     { margin: 0, fontSize: '1.3rem', fontWeight: 700 },
  createForm:  { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  formRow:     { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  input:       { padding: '0.45rem 0.7rem', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.875rem', outline: 'none', flex: '1 1 160px' },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' },
  card:        { background: '#fff', borderRadius: 10, border: '1px solid #eee', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  cardBody:    { flex: 1, minWidth: 0 },
  cardName:    { fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  cardMeta:    { display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' },
  metaChip:   { fontSize: '0.75rem', color: '#888', background: '#f5f5f5', padding: '0.1rem 0.5rem', borderRadius: 99 },
  cardActions: { display: 'flex', gap: '0.5rem', flexShrink: 0 },
  enterBtn:    { padding: '0.45rem 1.1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  dangerBtn:   { padding: '0.4rem 0.7rem', background: 'none', color: '#c00', border: '1px solid #fcc', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' },
  defaultBadge:{ fontSize: '0.68rem', background: '#f0f0f0', color: '#888', padding: '0.1rem 0.45rem', borderRadius: 3, fontWeight: 500 },
  empty:       { textAlign: 'center', padding: '4rem', color: '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' },
  primaryBtn:   { padding: '0.45rem 1.1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  outlineBtn:   { padding: '0.45rem 0.9rem', background: 'none', color: '#111', border: '1px solid #ddd', borderRadius: 6, fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'none' },
  dim:          { color: '#888', fontSize: '0.875rem' },
  inviteBanner:  { display: 'flex', gap: '0.75rem', alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' },
  upgradeBanner: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#78350f', lineHeight: 1.5 },
};

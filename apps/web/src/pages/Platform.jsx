import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';
import { Toast } from '../components/Toast.jsx';

export default function Platform() {
  const t = useT();
  const [studios,   setStudios]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState('');
  const [creating,  setCreating]  = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', plan: 'free', ownerEmail: '', ownerPassword: '', ownerName: '' });
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setStudios(await api.listPlatformStudios()); }
    catch (e) { setToast(e.message); }
    finally { setLoading(false); }
  }

  function slugify(str) {
    return str.toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
      setForm({ name: '', slug: '', plan: 'free', ownerEmail: '', ownerPassword: '', ownerName: '' });
      setSlugTouched(false);
      setToast(t('platform_toast_created'));
    } catch (err) { setToast(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm(t('platform_confirm_delete'))) return;
    try {
      await api.deletePlatformStudio(id);
      setStudios(ss => ss.filter(s => s.id !== id));
      setToast(t('platform_toast_deleted'));
    } catch (e) { setToast(e.message); }
  }

  const PLAN_COLORS = { free: '#888', pro: '#2563eb', agency: '#7c3aed' };

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>{t('back_to_galleries')}</Link>
        <span style={s.title}>{t('platform_title')}</span>
        <button style={s.primaryBtn} onClick={() => setCreating(v => !v)}>
          {t('platform_new_studio')}
        </button>
      </header>

      <main style={s.main}>

        {creating && (
          <form style={s.createForm} onSubmit={handleCreate}>
            <div style={s.formRow}>
              <input
                style={s.input}
                placeholder={t('platform_studio_name_placeholder')}
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                required autoFocus
              />
              <input
                style={{ ...s.input, fontFamily: 'monospace', fontSize: '0.8rem' }}
                placeholder={t('platform_studio_slug_placeholder')}
                value={form.slug}
                onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: e.target.value })); }}
                required
              />
              <select style={s.input} value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                {['free','pro','agency'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={s.formRow}>
              <input
                style={s.input}
                type="email"
                placeholder={t('platform_owner_email_placeholder')}
                value={form.ownerEmail}
                onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))}
              />
              <input
                style={s.input}
                type="password"
                placeholder={t('platform_owner_password_placeholder')}
                value={form.ownerPassword}
                onChange={e => setForm(f => ({ ...f, ownerPassword: e.target.value }))}
              />
            </div>
            <div style={{ display:'flex', gap:'0.5rem' }}>
              <button style={s.primaryBtn} type="submit">{t('platform_create_studio_btn')}</button>
              <button style={s.outlineBtn} type="button" onClick={() => setCreating(false)}>{t('cancel')}</button>
            </div>
          </form>
        )}

        <h3 style={s.sectionLabel}>{t('platform_studios_section')}</h3>

        {loading ? (
          <p style={s.dim}>{t('loading')}</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t('platform_th_name')}</th>
                <th style={s.th}>{t('platform_th_slug')}</th>
                <th style={s.th}>{t('platform_th_plan')}</th>
                <th style={s.th}>{t('platform_th_members')}</th>
                <th style={s.th}>{t('platform_th_galleries')}</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {studios.map(studio => (
                <tr key={studio.id} style={s.tr}>
                  <td style={s.td}>
                    <span style={{ fontWeight: 500 }}>{studio.name}</span>
                    {studio.is_default === 1 && (
                      <span style={s.defaultBadge}>{t('platform_default_badge')}</span>
                    )}
                  </td>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '0.8rem', color: '#888' }}>{studio.slug}</td>
                  <td style={s.td}>
                    <span style={{ ...s.planBadge, color: PLAN_COLORS[studio.plan] || '#888' }}>{studio.plan}</span>
                  </td>
                  <td style={{ ...s.td, color: '#555', fontSize: '0.85rem' }}>{studio.member_count ?? 0}</td>
                  <td style={{ ...s.td, color: '#555', fontSize: '0.85rem' }}>{studio.gallery_count ?? 0}</td>
                  <td style={s.td}>
                    {!studio.is_default && (
                      <button style={s.dangerBtn} onClick={() => handleDelete(studio.id)}>{t('delete')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

const s = {
  page:        { minHeight: '100vh', background: '#f8f8f8' },
  header:      { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', gap: '1rem' },
  back:        { color: '#111', textDecoration: 'none', fontSize: '0.875rem' },
  title:       { fontWeight: 600, fontSize: '0.95rem', flex: 1 },
  main:        { maxWidth: 1000, margin: '0 auto', padding: '1.5rem' },
  sectionLabel:{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aaa', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid #eee' },
  createForm:  { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  formRow:     { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  th:          { textAlign: 'left', padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#999', fontWeight: 500, borderBottom: '1px solid #eee' },
  tr:          { borderBottom: '1px solid #f3f3f3' },
  td:          { padding: '0.6rem 1rem', verticalAlign: 'middle' },
  input:       { padding: '0.4rem 0.6rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.875rem', outline: 'none', minWidth: 160, flex: '1 1 160px' },
  primaryBtn:  { padding: '0.4rem 1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  outlineBtn:  { padding: '0.4rem 0.75rem', background: 'none', color: '#555', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' },
  dangerBtn:   { padding: '0.3rem 0.65rem', background: 'none', color: '#c00', border: '1px solid #fcc', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem' },
  planBadge:   { fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase' },
  defaultBadge:{ marginLeft: '0.4rem', fontSize: '0.7rem', background: '#f0f0f0', color: '#888', padding: '0.1rem 0.4rem', borderRadius: 3, fontWeight: 500 },
  dim:         { color: '#888', fontSize: '0.875rem' },
};

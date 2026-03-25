import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';
import { Toast } from '../components/Toast.jsx';

function slugify(str) {
  return str.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function Projects() {
  const t        = useT();
  const navigate = useNavigate();
  const [projects,  setProjects]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState('');
  const [creating,  setCreating]  = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newSlug,   setNewSlug]   = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName,  setEditName]  = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setProjects(await api.listProjects()); }
    catch (e) { setToast(e.message); }
    finally { setLoading(false); }
  }

  function handleNameChange(v) {
    setNewName(v);
    if (!slugTouched) setNewSlug(slugify(v));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.createProject({ name: newName.trim(), slug: newSlug || slugify(newName) });
      setCreating(false); setNewName(''); setNewSlug(''); setSlugTouched(false);
      setToast(t('projects_toast_created'));
      await load();
    } catch (err) { setToast(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm(t('projects_confirm_delete'))) return;
    try {
      await api.deleteProject(id);
      setProjects(ps => ps.filter(p => p.id !== id));
      setToast(t('projects_toast_deleted'));
    } catch (e) { setToast(e.message); }
  }

  async function handleEditSave(id) {
    try {
      await api.updateProject(id, { name: editName });
      setProjects(ps => ps.map(p => p.id === id ? { ...p, name: editName } : p));
      setEditingId(null);
      setToast(t('projects_toast_updated'));
    } catch (e) { setToast(e.message); }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>{t('back_to_galleries')}</Link>
        <span style={s.title}>{t('projects_title')}</span>
        <button style={s.primaryBtn} onClick={() => setCreating(v => !v)}>
          {t('projects_new')}
        </button>
      </header>

      <main style={s.main}>
        {creating && (
          <form style={s.newForm} onSubmit={handleCreate}>
            <input
              style={s.input}
              placeholder={t('projects_name_placeholder')}
              value={newName}
              onChange={e => handleNameChange(e.target.value)}
              autoFocus
              required
            />
            <input
              style={{ ...s.input, width: 160, fontFamily: 'monospace', fontSize: '0.8rem' }}
              placeholder={t('projects_slug_placeholder')}
              value={newSlug}
              onChange={e => { setNewSlug(e.target.value); setSlugTouched(true); }}
            />
            <button style={s.primaryBtn} type="submit">{t('projects_create_btn')}</button>
            <button style={s.outlineBtn} type="button" onClick={() => { setCreating(false); setNewName(''); setNewSlug(''); setSlugTouched(false); }}>{t('cancel')}</button>
          </form>
        )}

        {loading ? (
          <p style={s.dim}>{t('loading')}</p>
        ) : projects.length === 0 ? (
          <p style={s.dim}>{t('projects_no_projects')}</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t('projects_th_name')}</th>
                <th style={s.th}>{t('projects_th_slug')}</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} style={s.tr}>
                  <td style={s.td}>
                    {editingId === p.id ? (
                      <form style={{ display:'flex', gap:'0.4rem' }} onSubmit={e => { e.preventDefault(); handleEditSave(p.id); }}>
                        <input style={{ ...s.input, minWidth: 0, flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                        <button style={s.primaryBtn} type="submit">{t('save')}</button>
                        <button style={s.outlineBtn} type="button" onClick={() => setEditingId(null)}>{t('cancel')}</button>
                      </form>
                    ) : (
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                    )}
                  </td>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '0.8rem', color: '#888' }}>{p.slug}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <div style={{ display:'flex', gap:'0.4rem', justifyContent:'flex-end' }}>
                      <button style={s.outlineBtn} onClick={() => { setEditingId(p.id); setEditName(p.name); }}>{t('projects_edit_name')}</button>
                      <button style={s.dangerBtn} onClick={() => handleDelete(p.id)}>{t('delete')}</button>
                    </div>
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
  page:       { minHeight: '100vh', background: '#f8f8f8' },
  header:     { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', gap: '1rem' },
  back:       { color: '#111', textDecoration: 'none', fontSize: '0.875rem' },
  title:      { fontWeight: 600, fontSize: '0.95rem', flex: 1 },
  main:       { maxWidth: 860, margin: '0 auto', padding: '1.5rem' },
  newForm:    { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '1rem' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  th:         { textAlign: 'left', padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#999', fontWeight: 500, borderBottom: '1px solid #eee' },
  tr:         { borderBottom: '1px solid #f3f3f3' },
  td:         { padding: '0.6rem 1rem', verticalAlign: 'middle' },
  input:      { padding: '0.4rem 0.6rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.875rem', outline: 'none', minWidth: 200 },
  primaryBtn: { padding: '0.4rem 1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  outlineBtn: { padding: '0.4rem 0.75rem', background: 'none', color: '#555', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap', textDecoration: 'none' },
  dangerBtn:  { padding: '0.4rem 0.75rem', background: 'none', color: '#c00', border: '1px solid #fcc', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' },
  dim:        { color: '#888', fontSize: '0.875rem' },
};

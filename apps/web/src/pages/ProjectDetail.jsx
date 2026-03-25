// Page d'un projet : liste + création des galeries
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/I18nContext.jsx';
import { GalleryCard } from '../components/GalleryCard.jsx';
import { Toast } from '../components/Toast.jsx';

function slugify(str) {
  return str.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function ProjectDetail() {
  const { id }     = useParams();
  const t          = useT();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const canAdmin   = ['admin','owner'].includes(user?.studioRole) || user?.platformRole === 'superadmin';
  const canCreate  = ['collaborator','admin','owner'].includes(user?.studioRole) || user?.platformRole === 'superadmin';

  const [project,   setProject]   = useState(null);
  const [galleries, setGalleries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState('');

  // New gallery form
  const [creating,    setCreating]    = useState(false);
  const [newTitle,    setNewTitle]    = useState('');
  const [newSlug,     setNewSlug]     = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  // Project settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName,     setEditName]     = useState('');
  const [editSlug,     setEditSlug]     = useState('');
  const [slugConfirm,  setSlugConfirm]  = useState('');
  const [saving,       setSaving]       = useState(false);
  const [slugSaving,   setSlugSaving]   = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([
        api.getProject(id),
        api.getProjectGalleries(id),
      ]);
      setProject(p);
      setGalleries(g);
      setEditName(p.name || '');
      setEditSlug(p.slug || '');
    } catch (e) { setToast(e.message); }
    finally { setLoading(false); }
  }

  function handleTitleChange(v) {
    setNewTitle(v);
    if (!slugTouched) setNewSlug(slugify(v));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const slug  = newSlug || slugify(title);
    try {
      const g = await api.createProjectGallery(id, { slug, title });
      setCreating(false); setNewTitle(''); setNewSlug(''); setSlugTouched(false);
      navigate(`/galleries/${g.id}`);
    } catch (err) { setToast(err.message); }
  }

  async function handleBuild(galleryId) {
    try {
      const job = await api.triggerBuild(galleryId);
      navigate(`/jobs/${job.id}`);
    } catch (e) { setToast(e.message); }
  }

  async function handleDelete(galleryId) {
    if (!confirm(t('confirm_delete'))) return;
    try {
      await api.deleteGallery(galleryId);
      setGalleries(gs => gs.filter(g => g.id !== galleryId));
    } catch (e) { setToast(e.message); }
  }

  async function handleRenameName(e) {
    e.preventDefault();
    if (!editName.trim() || editName.trim() === project.name) return;
    setSaving(true);
    try {
      const updated = await api.updateProject(id, { name: editName.trim() });
      setProject(updated);
      setToast(t('project_saved'));
    } catch (err) { setToast(err.message); }
    finally { setSaving(false); }
  }

  async function handleRenameSlug(e) {
    e.preventDefault();
    if (slugConfirm !== project.slug) { setToast(t('project_slug_confirm_mismatch')); return; }
    setSlugSaving(true);
    try {
      const updated = await api.updateProject(id, { slug: editSlug });
      setProject(updated);
      setEditSlug(updated.slug);
      setSlugConfirm('');
      setToast(t('project_saved'));
    } catch (err) { setToast(err.message); }
    finally { setSlugSaving(false); }
  }

  if (loading) return <div style={s.center}>{t('loading')}</div>;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.breadcrumb}>
          <button style={s.back} onClick={() => navigate('/studio')}>
            ← {user?.studioName || t('studio_back')}
          </button>
          <span style={s.sep}>/</span>
          <span style={s.projectName}>{project?.name || '…'}</span>
        </div>
        <div style={s.headerRight}>
          {canAdmin && (
            <button
              style={{ ...s.outlineBtn, ...(settingsOpen ? { background: '#f5f5f5' } : {}) }}
              onClick={() => setSettingsOpen(v => !v)}
              title={t('settings')}
            >⚙</button>
          )}
          {canCreate && (
            <button style={s.primaryBtn} onClick={() => setCreating(v => !v)}>
              {t('new_gallery')}
            </button>
          )}
        </div>
      </header>

      {/* Settings panel */}
      {settingsOpen && (
        <div style={s.settingsPanel}>
          {/* Rename */}
          <form style={s.settingsSection} onSubmit={handleRenameName}>
            <p style={s.settingsLabel}>{t('project_name_label')}</p>
            <div style={s.settingsRow}>
              <input
                style={s.input}
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
              <button style={s.primaryBtn} type="submit" disabled={saving || editName.trim() === project?.name}>
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </form>

          {/* Danger zone — slug */}
          <form style={{ ...s.settingsSection, borderTop: '1px solid #fee2e2', paddingTop: '1rem' }} onSubmit={handleRenameSlug}>
            <p style={{ ...s.settingsLabel, color: '#dc2626' }}>{t('section_danger')}</p>
            <p style={s.settingsHint}>{t('project_slug_hint')}</p>
            <div style={s.settingsRow}>
              <input
                style={{ ...s.input, fontFamily: 'monospace' }}
                value={editSlug}
                onChange={e => setEditSlug(slugify(e.target.value) || e.target.value.toLowerCase())}
                placeholder="slug-url"
              />
            </div>
            <div style={{ ...s.settingsRow, marginTop: '0.5rem' }}>
              <input
                style={{ ...s.input, fontFamily: 'monospace', borderColor: '#fca5a5' }}
                value={slugConfirm}
                onChange={e => setSlugConfirm(e.target.value)}
                placeholder={t('project_slug_confirm_placeholder', { slug: project?.slug })}
              />
              <button
                style={{ ...s.primaryBtn, background: '#dc2626' }}
                type="submit"
                disabled={slugSaving || !editSlug || editSlug === project?.slug}
              >
                {slugSaving ? t('saving') : t('rename')}
              </button>
            </div>
          </form>
        </div>
      )}

      <main style={s.main}>
        {creating && (
          <form style={s.newForm} onSubmit={handleCreate}>
            <div style={s.newInputGroup}>
              <input
                style={s.input}
                placeholder={t('gallery_title_placeholder')}
                value={newTitle}
                onChange={e => handleTitleChange(e.target.value)}
                autoFocus
              />
              <input
                style={{ ...s.input, maxWidth: 200, fontFamily: 'monospace', fontSize: '0.8rem' }}
                placeholder="slug"
                value={newSlug}
                onChange={e => { setNewSlug(e.target.value); setSlugTouched(true); }}
              />
            </div>
            <button style={s.primaryBtn} type="submit">{t('create')}</button>
            <button style={s.outlineBtn} type="button" onClick={() => { setCreating(false); setNewTitle(''); setNewSlug(''); setSlugTouched(false); }}>{t('cancel')}</button>
          </form>
        )}

        {galleries.length === 0 && !creating ? (
          <div style={s.empty}>
            <p>{t('no_galleries')}</p>
            {canCreate && (
              <button style={s.primaryBtn} onClick={() => setCreating(true)}>
                {t('create_first_gallery')}
              </button>
            )}
          </div>
        ) : (
          <div style={s.grid}>
            {galleries.map(g => (
              <GalleryCard
                key={g.id}
                gallery={g}
                onBuild={handleBuild}
                onDelete={handleDelete}
                canBuild={canCreate}
              />
            ))}
          </div>
        )}
      </main>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

const s = {
  page:          { minHeight: '100vh', background: '#f8f8f8' },
  center:        { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' },
  header:        { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  breadcrumb:    { display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 },
  back:          { background: 'none', border: 'none', color: '#888', fontSize: '0.875rem', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', flexShrink: 0 },
  sep:           { color: '#ccc', fontSize: '0.9rem', flexShrink: 0 },
  projectName:   { fontWeight: 700, fontSize: '0.95rem', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerRight:   { display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 },
  settingsPanel: { background: '#fff', borderBottom: '1px solid #eee', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 600 },
  settingsSection:{ display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  settingsLabel: { margin: 0, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#aaa' },
  settingsRow:   { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  settingsHint:  { margin: 0, fontSize: '0.78rem', color: '#888' },
  main:          { maxWidth: 1100, margin: '0 auto', padding: '1.5rem' },
  newForm:       { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap', background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '1rem' },
  newInputGroup: { display: 'flex', gap: '0.5rem', flex: 1, flexWrap: 'wrap' },
  input:         { padding: '0.45rem 0.7rem', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.9rem', outline: 'none', flex: '1 1 180px' },
  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' },
  empty:         { textAlign: 'center', padding: '4rem', color: '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' },
  primaryBtn:    { padding: '0.45rem 1.1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  outlineBtn:    { padding: '0.45rem 0.85rem', background: 'none', color: '#555', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
};

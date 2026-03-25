// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api }          from '../lib/api.js';
import { useT }         from '../lib/I18nContext.jsx';
import { slugify }      from '../lib/i18n.js';
import { useAuth }      from '../lib/auth.jsx';
import { UploadZone }   from '../components/UploadZone.jsx';
import { Toast }        from '../components/Toast.jsx';

const LOCALES  = ['fr','en','de','es','it','pt'];
const ACCESS   = ['public','private','password'];

const EDITOR_ROLES = ['collaborator', 'admin', 'owner'];

export default function GalleryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const { user } = useAuth();
  const CAN_BUILD = ['collaborator', 'admin', 'owner'].includes(user?.studioRole) || user?.platformRole === 'superadmin';
  const canManageAccess = EDITOR_ROLES.includes(user?.studioRole) || user?.platformRole === 'superadmin';

  const [gallery,      setGallery]      = useState(null);
  const [photos,       setPhotos]       = useState([]);
  const [jobs,         setJobs]         = useState([]);
  const [tab,          setTab]          = useState('photos');
  const [saving,       setSaving]       = useState(false);
  const [form,         setForm]         = useState({});
  const [dragIdx,      setDragIdx]      = useState(null);
  const [reordering,   setReordering]   = useState(false);
  const [sortAsc,      setSortAsc]      = useState(true);
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [advOpen,      setAdvOpen]      = useState(false);
  const [dangerOpen,   setDangerOpen]   = useState(false);
  const [newSlug,      setNewSlug]      = useState('');
  const [renamingSlug, setRenamingSlug] = useState(false);
  const [toast,        setToast]        = useState('');

  // Access panel state
  const [accessOpen,      setAccessOpen]      = useState(false);
  const [members,         setMembers]         = useState([]);
  const [viewerTokens,    setViewerTokens]    = useState([]);
  const [invitations,     setInvitations]     = useState([]);
  const [newTokenLabel,   setNewTokenLabel]   = useState('');
  const [newTokenExpiry,  setNewTokenExpiry]  = useState('');
  const [creatingToken,   setCreatingToken]   = useState(false);
  const [inviteEmail,     setInviteEmail]     = useState('');
  const [inviteRole,      setInviteRole]      = useState('photographer');
  const [sendingInvite,   setSendingInvite]   = useState(false);
  const [inviteLink,      setInviteLink]      = useState('');
  const [studioMembers,   setStudioMembers]   = useState([]);
  const [addUserId,       setAddUserId]       = useState('');
  const [addRole,         setAddRole]         = useState('contributor');
  const [addingMember,    setAddingMember]    = useState(false);

  // Upload links state
  const [uploadLinks,     setUploadLinks]     = useState([]);
  const [newLinkLabel,    setNewLinkLabel]    = useState('');
  const [newLinkExpiry,   setNewLinkExpiry]   = useState('');
  const [creatingLink,    setCreatingLink]    = useState(false);
  const [newLinkUrl,      setNewLinkUrl]      = useState('');
  const [shareModal,      setShareModal]      = useState(null); // { url, label }

  // Inbox state
  const [inbox,           setInbox]           = useState(null); // { photos, counts }
  const [validating,      setValidating]      = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    try {
      const [g, p, j] = await Promise.all([api.getGallery(id), api.listPhotos(id), api.listJobs(id)]);
      setGallery(g);
      setPhotos(p);
      setJobs(j);
      if (g.builtAt && p.some(photo => photo.mtime > g.builtAt)) setNeedsRebuild(true);
      if (g.buildStatus !== 'done' && p.length > 0) setNeedsRebuild(true);
      const formData = {
        title: g.title || '', subtitle: g.subtitle || '',
        description: g.description || '',
        author: g.author || '', authorEmail: g.authorEmail || '',
        date: g.date || '', location: g.location || '',
        locale: g.locale || 'fr', access: g.access || 'public',
        password: '', coverPhoto: g.coverPhoto || '',
        allowDownloadImage: g.allowDownloadImage !== false,
        allowDownloadGallery: !!g.allowDownloadGallery,
      };
      setForm(formData);
      setNewSlug(g.slug);
      setAdvOpen(!!(
        formData.date || formData.location ||
        formData.locale !== 'fr' || formData.access !== 'public' ||
        formData.coverPhoto || !formData.allowDownloadImage ||
        formData.allowDownloadGallery
      ));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateGallery(id, form);
      setGallery(updated);
      setNeedsRebuild(true);
      setToast(t('settings_saved'));
    } catch (err) { setToast(`${t('error')}: ${err.message}`); }
    finally { setSaving(false); }
  }

  async function handleBuild(force = false) {
    try {
      const job = await api.triggerBuild(id, force);
      navigate(`/jobs/${job.id}`);
    } catch (e) { alert(e.message); }
  }

  async function handleDeletePhoto(filename) {
    if (!confirm(t('delete_photo_confirm', { file: filename }))) return;
    try {
      await api.deletePhoto(id, filename);
      setPhotos(p => p.filter(f => f.file !== filename));
      setNeedsRebuild(true);
    } catch (e) { alert(e.message); }
  }

  async function handleDeleteGallery() {
    if (!confirm(t('delete_gallery_confirm'))) return;
    try {
      await api.deleteGallery(id);
      navigate('/');
    } catch (e) { alert(e.message); }
  }

  async function handleRenameSlug(e) {
    e.preventDefault();
    const slug = newSlug.trim();
    if (!slug || slug === gallery.slug) return;
    setRenamingSlug(true);
    try {
      const updated = await api.renameSlug(id, slug);
      setGallery(updated);
      setNewSlug(updated.slug);
      setToast(t('settings_saved'));
    } catch (err) { setToast(`${t('error')}: ${err.message}`); }
    finally { setRenamingSlug(false); }
  }

  async function loadAccess() {
    const [mRes, vtRes, invRes, smRes] = await Promise.allSettled([
      api.getGalleryMembers(id),
      api.getViewerTokens(id),
      api.getInvitations(),
      api.listStudioMembers(),
    ]);
    if (mRes.status   === 'fulfilled') setMembers(mRes.value);
    if (vtRes.status  === 'fulfilled') setViewerTokens(vtRes.value);
    if (invRes.status === 'fulfilled') setInvitations(invRes.value);
    if (smRes.status  === 'fulfilled') {
      setStudioMembers(smRes.value);
      const first = smRes.value.find(s => s.role === 'photographer');
      if (first) setAddUserId(first.user.id);
    }
    const errors = [mRes, vtRes, invRes, smRes]
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message)
      .filter(Boolean);
    if (errors.length) setToast(errors.join(' · '));
  }

  async function handleMemberRoleChange(userId, role) {
    try {
      await api.putGalleryMember(id, userId, role);
      setMembers(ms => ms.map(m => m.user?.id === userId ? { ...m, role } : m));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function handleRemoveMember(userId) {
    try {
      await api.deleteGalleryMember(id, userId);
      setMembers(ms => ms.filter(m => m.user?.id !== userId));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    if (!addUserId) return;
    setAddingMember(true);
    try {
      await api.putGalleryMember(id, addUserId, 'contributor');
      await loadAccess();
    } catch (err) { setToast(`${t('error')}: ${err.message}`); }
    finally { setAddingMember(false); }
  }

  async function handleCreateToken(e) {
    e.preventDefault();
    setCreatingToken(true);
    try {
      const data = {};
      if (newTokenLabel.trim()) data.label = newTokenLabel.trim();
      if (newTokenExpiry) data.expiresAt = new Date(newTokenExpiry).getTime();
      const token = await api.createViewerToken(id, data);
      setViewerTokens(ts => [token, ...ts]);
      setNewTokenLabel('');
      setNewTokenExpiry('');
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setCreatingToken(false); }
  }

  async function handleRevokeToken(tokenId) {
    try {
      await api.deleteViewerToken(id, tokenId);
      setViewerTokens(ts => ts.filter(t => t.id !== tokenId));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  function copyTokenLink(token) {
    const url = `${window.location.origin}/${gallery.slug}/?vt=${token}`;
    navigator.clipboard.writeText(url).then(() => setToast(t('access_copied')));
  }

  async function handleSendInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSendingInvite(true);
    try {
      const inv = await api.createInvitation({ email: inviteEmail.trim(), role: 'photographer', galleryId: id, galleryRole: 'contributor' });
      setInviteEmail('');
      if (inv.existing) {
        // User already has an account — they've been re-added to the gallery directly
        setToast(t('access_member_readded'));
        await loadAccess();
      } else {
        setInvitations(is => [inv, ...is]);
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        setInviteLink(`${window.location.origin}${base}/invite/${inv.token}`);
        setToast(t('access_invite_sent'));
      }
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setSendingInvite(false); }
  }

  async function loadUploadLinks() {
    try {
      const links = await api.listUploadLinks(id);
      setUploadLinks(links);
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function handleCreateUploadLink(e) {
    e.preventDefault();
    setCreatingLink(true);
    setNewLinkUrl('');
    try {
      const data = {};
      if (newLinkLabel.trim()) data.label = newLinkLabel.trim();
      if (newLinkExpiry) data.expiresAt = new Date(newLinkExpiry).toISOString();
      const link = await api.createUploadLink(id, data);
      setUploadLinks(ls => [link, ...ls]);
      setNewLinkLabel('');
      setNewLinkExpiry('');
      setNewLinkUrl(link.uploadUrl);
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setCreatingLink(false); }
  }

  async function handleRevokeUploadLink(linkId) {
    try {
      await api.revokeUploadLink(id, linkId);
      setUploadLinks(ls => ls.map(l => l.id === linkId ? { ...l, active: false, revoked_at: new Date().toISOString() } : l));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function handleQuickShareLink() {
    try {
      const link = await api.createUploadLink(id, { label: 'Quick share' });
      setShareModal({ url: link.uploadUrl, label: gallery.title || gallery.slug });
      setUploadLinks(ls => [link, ...ls]);
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function loadInbox() {
    try {
      const data = await api.listInbox(id);
      setInbox(data);
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function handleValidateAll() {
    setValidating(true);
    try {
      await api.validatePhotos(id, { all: true });
      await loadInbox();
      setNeedsRebuild(true);
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setValidating(false); }
  }

  async function handleRejectAll() {
    if (!confirm('Reject and delete all pending photos?')) return;
    try {
      await api.rejectPhotos(id, { all: true });
      await loadInbox();
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function handleNotifyReady() {
    try {
      await api.notifyReady(id);
      setToast(t('photos_ready_sent'));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
  }

  async function sortPhotos(dir) {
    const sorted = [...photos].sort((a, b) =>
      dir === 'asc' ? a.file.localeCompare(b.file) : b.file.localeCompare(a.file));
    setPhotos(sorted);
    try {
      await api.reorderPhotos(id, sorted.map(p => p.file));
      setNeedsRebuild(true);
    } catch (e) { alert(e.message); }
  }

  function onDragStart(i) { setDragIdx(i); }
  function onDragOver(e, i) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    const next = [...photos];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setPhotos(next);
    setDragIdx(i);
  }
  async function onDragEnd() {
    setDragIdx(null);
    setReordering(true);
    try {
      await api.reorderPhotos(id, photos.map(p => p.file));
      setNeedsRebuild(true);
    } catch (e) { alert(e.message); }
    finally { setReordering(false); }
  }

  if (!gallery) return <div style={s.center}>{t('loading')}</div>;

  // Public URL path mirrors runner.js distNameOverride logic:
  // project galleries get /{project-slug}/{gallery-slug}/, others get /{slug}/
  const publicPath = (gallery.breadcrumb?.project?.slug && gallery.access !== 'password' && gallery.access !== 'private')
    ? `/${gallery.breadcrumb.project.slug}/${gallery.slug}`
    : `/${gallery.slug}`;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to={gallery.projectId ? `/projects/${gallery.projectId}` : '/studio'} style={s.back}>
          ← {gallery.breadcrumb?.project?.name || t('studio_back')}
        </Link>
        <span style={s.title}>{gallery.title || gallery.slug}</span>
        <div style={s.headerActions}>
          {gallery.buildStatus === 'done' && (
            <a href={`${publicPath}/`} target="_blank" rel="noreferrer" style={s.viewBtn}>
              {t('view_gallery_btn')}
            </a>
          )}
          {canManageAccess && (
            <button style={s.outlineBtn} onClick={handleQuickShareLink}>
              🔗 Share upload link
            </button>
          )}
          {CAN_BUILD && <>
            <button
              style={{ ...s.outlineBtn, ...(gallery.buildStatus === 'done' && !needsRebuild ? { opacity: 0.4, cursor: 'default' } : {}) }}
              onClick={() => handleBuild(false)}
              disabled={gallery.buildStatus === 'done' && !needsRebuild}
            >{t('build_btn')}</button>
            <button style={s.outlineBtn} onClick={() => handleBuild(true)}>{t('force_rebuild_btn')}</button>
          </>}
        </div>
      </header>

      {/* Tabs */}
      <div style={s.tabs}>
        {[
          'photos',
          'settings',
          'jobs',
          ...(canManageAccess ? ['access'] : []),
          ...(canManageAccess ? ['upload'] : []),
          ...(canManageAccess ? ['inbox']  : []),
        ].map(tabKey => (
          <button key={tabKey} style={{ ...s.tab, ...(tab === tabKey ? s.tabActive : {}) }}
            onClick={() => {
              setTab(tabKey);
              if (tabKey === 'access') loadAccess();
              if (tabKey === 'upload') loadUploadLinks();
              if (tabKey === 'inbox')  loadInbox();
            }}>
            {t(`tab_${tabKey}`)}
          </button>
        ))}
      </div>

      {needsRebuild && (
        <div style={s.rebuildBanner}>
          <span>{t('photos_changed_banner')}</span>
          {CAN_BUILD && <button style={s.rebuildBtn} onClick={() => handleBuild(false)}>{t('build_now')}</button>}
        </div>
      )}

      <main style={s.main}>

        {/* ── PHOTOS ── */}
        {tab === 'photos' && (
          <div>
            <h3 style={s.sectionTitle}>{t('upload_photos')}</h3>
            <UploadZone galleryId={id} onDone={() => { api.listPhotos(id).then(setPhotos); setNeedsRebuild(true); }} />

            {user?.studioRole === 'photographer' && photos.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <button style={s.readyBtn} onClick={handleNotifyReady}>
                  {t('photos_ready_btn')}
                </button>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: '#999' }}>
                  {t('access_notify_hint')}
                </p>
              </div>
            )}

            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:'1.5rem', marginBottom:'0.75rem' }}>
              <h3 style={{ ...s.sectionTitle, margin:0 }}>{t('photos_list_title', { n: photos.length })}</h3>
              <div style={{ marginLeft:'auto', display:'flex', gap:'0.35rem', alignItems:'center' }}>
                {reordering && <span style={{ fontSize:'0.75rem', color:'#888' }}>{t('saving')}</span>}
                <button
                  style={s.sortBtn}
                  title={sortAsc ? 'A→Z' : 'Z→A'}
                  onClick={() => { const next = !sortAsc; setSortAsc(next); sortPhotos(next ? 'asc' : 'desc'); }}
                >
                  <SortIcon asc={sortAsc} />
                </button>
              </div>
            </div>
            {photos.length === 0 && <p style={s.dim}>{t('no_photos')}</p>}
            <div style={s.photoGrid}>
              {photos.map((p, i) => (
                <div
                  key={p.file}
                  style={{ ...s.photoCard, opacity: dragIdx === i ? 0.5 : 1, cursor:'grab' }}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={e => onDragOver(e, i)}
                  onDragEnd={onDragEnd}
                >
                  <img
                    src={p.thumb
                      ? `${publicPath}/img/grid/${p.thumb}.webp`
                      : `/api/galleries/${id}/photos/${encodeURIComponent(p.file)}/preview`}
                    style={s.thumb} alt={p.file} />
                  <div style={s.photoName}>{p.file}</div>
                  {CAN_BUILD && <button style={s.deleteBtn} onClick={() => handleDeletePhoto(p.file)}>✕</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <form onSubmit={saveSettings} style={s.settingsForm}>
            <Row label={t('field_title')}>
              <input style={s.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </Row>
            <Row label={t('field_subtitle')}>
              <input style={s.input} value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} />
            </Row>
            <Row label={t('field_description')}>
              <textarea style={{ ...s.input, resize:'vertical', minHeight:64 }} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Row>
            <Row label={t('field_author')}>
              <input style={s.input} value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} />
            </Row>
            <Row label={t('field_author_email')}>
              <input style={s.input} type="email" value={form.authorEmail} onChange={e => setForm(f => ({ ...f, authorEmail: e.target.value }))} />
            </Row>

            {/* Advanced settings */}
            <button type="button" style={s.advToggle} onClick={() => setAdvOpen(o => !o)}>
              <span style={s.advArrow}>{advOpen ? '▾' : '▸'}</span>
              {t('advanced_settings')}
            </button>
            {advOpen && (
              <div style={s.advSection}>
                <Row label={t('field_date')}>
                  <div style={{ flex:1 }}>
                    <input style={s.input} type="date" value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                    {!form.date && gallery.dateRange?.from && (
                      <p style={s.fieldHint}>{t('auto_from_exif')} {gallery.dateRange.from}{gallery.dateRange.to !== gallery.dateRange.from ? ` – ${gallery.dateRange.to}` : ''}</p>
                    )}
                  </div>
                </Row>
                <Row label={t('field_location')}>
                  <input style={s.input} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </Row>
                <Row label={t('field_locale')}>
                  <select style={s.input} value={form.locale} onChange={e => setForm(f => ({ ...f, locale: e.target.value }))}>
                    {LOCALES.map(l => <option key={l}>{l}</option>)}
                  </select>
                </Row>
                <Row label={t('field_access')}>
                  <select style={s.input} value={form.access} onChange={e => setForm(f => ({ ...f, access: e.target.value }))}>
                    {ACCESS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </Row>
                {form.access === 'password' && (
                  <Row label={t('field_password')}>
                    <input style={s.input} type="password" placeholder="New password (leave blank to keep)"
                      value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </Row>
                )}
                <div style={{ marginBottom:'0.6rem' }}>
                  <label style={{ display:'block', fontSize:'0.85rem', color:'#555', marginBottom:'0.4rem' }}>{t('field_cover_photo')}</label>
                  {photos.length === 0
                    ? <p style={s.dim}>{t('upload_photos_first')}</p>
                    : <div style={s.coverGrid}>
                        {photos.map(p => (
                          <div
                            key={p.file}
                            onClick={() => setForm(f => ({ ...f, coverPhoto: p.file }))}
                            style={{ ...s.coverThumb, ...(form.coverPhoto === p.file ? s.coverThumbSelected : {}) }}
                          >
                            <img
                              src={p.thumb
                                ? `${publicPath}/img/grid/${p.thumb}.webp`
                                : `/api/galleries/${id}/photos/${encodeURIComponent(p.file)}/preview`}
                              style={s.coverThumbImg} alt={p.file} />
                            {form.coverPhoto === p.file && <div style={s.coverCheck}>✓</div>}
                          </div>
                        ))}
                      </div>}
                </div>
                <Row label={t('field_allow_dl_image')}>
                  <input type="checkbox" checked={form.allowDownloadImage} onChange={e => setForm(f => ({ ...f, allowDownloadImage: e.target.checked }))} />
                </Row>
                <Row label={t('field_allow_dl_gallery')}>
                  <input type="checkbox" checked={form.allowDownloadGallery} onChange={e => setForm(f => ({ ...f, allowDownloadGallery: e.target.checked }))} />
                </Row>
                {/* private field removed — access dropdown is canonical */}
              </div>
            )}

            <button style={s.primaryBtn} type="submit" disabled={saving}>
              {saving ? t('saving') : t('save_settings')}
            </button>

            {/* Danger Zone */}
            <button type="button" style={{ ...s.advToggle, marginTop:'1.5rem', color:'#dc2626' }} onClick={() => setDangerOpen(o => !o)}>
              <span style={s.advArrow}>{dangerOpen ? '▾' : '▸'}</span>
              {t('danger_zone')}
            </button>
            {dangerOpen && (
              <div style={{ ...s.advSection, borderColor:'#fca5a5' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', marginBottom:'1rem' }}>
                  <Row label={t('rename_slug')}>
                    <input
                      style={s.input}
                      value={newSlug}
                      onChange={e => setNewSlug(slugify(e.target.value) || e.target.value.toLowerCase())}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRenameSlug(e); } }}
                    />
                  </Row>
                  <p style={{ ...s.fieldHint, marginLeft: 216 }}>{t('rename_slug_hint')}</p>
                  <div style={{ marginLeft: 216 }}>
                    <button
                      type="button"
                      style={{ ...s.primaryBtn, background:'#dc2626' }}
                      disabled={renamingSlug || !newSlug || newSlug === gallery.slug}
                      onClick={handleRenameSlug}
                    >
                      {renamingSlug ? t('saving') : t('rename_slug_btn')}
                    </button>
                  </div>
                </div>
                <div>
                  <Row label={t('delete_gallery_btn')}>
                    <button type="button" style={{ ...s.primaryBtn, background:'#dc2626' }} onClick={handleDeleteGallery}>
                      {t('delete_gallery_btn')}
                    </button>
                  </Row>
                </div>
              </div>
            )}
          </form>
        )}

        {/* ── JOBS ── */}
        {tab === 'jobs' && (
          <div>
            <h3 style={s.sectionTitle}>{t('recent_builds')}</h3>
            {jobs.length === 0 && <p style={s.dim}>{t('no_builds')}</p>}
            <div style={s.jobList}>
              {jobs.map(j => (
                <Link key={j.id} to={`/jobs/${j.id}`} style={s.jobRow}>
                  <span style={{ ...s.jobStatus, color: STATUS_COLOR[j.status] || '#888' }}>{j.status}</span>
                  <span style={s.jobId}>{j.id.slice(-10)}</span>
                  <span style={s.jobDate}>{new Date(j.createdAt).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        {/* ── ACCESS ── */}
        {tab === 'access' && canManageAccess && (
          <div style={{ maxWidth: 620 }}>

            {/* A. Membres de la galerie */}
            <h3 style={s.sectionTitle}>{t('access_members_title')}</h3>
            <p style={s.sectionHint}>{t('access_members_hint')}</p>

            {/* Ajouter un photographe du studio */}
            {(() => {
              const available = studioMembers.filter(sm => sm.role === 'photographer' && !members.some(m => m.user?.id === sm.user.id));
              if (available.length === 0) return null;
              return (
                <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    style={{ ...s.input, flex: '1 1 180px' }}
                    value={addUserId}
                    onChange={e => setAddUserId(e.target.value)}
                  >
                    {available.map(sm => (
                      <option key={sm.user.id} value={sm.user.id}>
                        {sm.user.name || sm.user.email}
                      </option>
                    ))}
                  </select>
                  <button style={s.primaryBtn} type="submit" disabled={addingMember}>
                    {addingMember ? '…' : t('access_add_member_btn')}
                  </button>
                </form>
              );
            })()}

            {members.length === 0
              ? <p style={s.dim}>{t('access_no_members')}</p>
              : <div style={s.accessList}>
                  {members.map(m => (
                    <div key={m.user?.id} style={s.accessRow}>
                      <span style={s.accessEmail}>{m.user?.name || m.user?.email}</span>
                      <span style={{ fontSize: '0.8rem', color: '#666', flex: 'none' }}>{t('access_member_photographer_label')}</span>
                      <button style={s.accessDangerBtn} onClick={() => handleRemoveMember(m.user?.id)}>
                        {t('access_remove')}
                      </button>
                    </div>
                  ))}
                </div>
            }

            {/* B. Viewer tokens */}
            <h3 style={{ ...s.sectionTitle, marginTop: '1.5rem' }}>{t('access_tokens_title')}</h3>
            {viewerTokens.length === 0
              ? <p style={s.dim}>{t('access_no_tokens')}</p>
              : <div style={s.accessList}>
                  {viewerTokens.map(vt => (
                    <div key={vt.id} style={s.accessRow}>
                      <span style={s.accessEmail}>{vt.label || t('access_unnamed_token')}</span>
                      {vt.expires_at && (
                        <span style={s.accessMeta}>{t('access_expires', { date: new Date(vt.expires_at).toLocaleDateString() })}</span>
                      )}
                      <button style={s.accessBtn} onClick={() => copyTokenLink(vt.token)}>
                        {t('access_copy_link')}
                      </button>
                      <button style={s.accessDangerBtn} onClick={() => handleRevokeToken(vt.id)}>
                        {t('access_revoke')}
                      </button>
                    </div>
                  ))}
                </div>
            }
            <form onSubmit={handleCreateToken} style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                style={{ ...s.input, flex: '1 1 160px' }}
                placeholder={t('access_token_label_placeholder')}
                value={newTokenLabel}
                onChange={e => setNewTokenLabel(e.target.value)}
              />
              <input
                style={{ ...s.input, flex: '1 1 160px' }}
                type="date"
                title={t('access_token_expiry_label')}
                value={newTokenExpiry}
                onChange={e => setNewTokenExpiry(e.target.value)}
              />
              <button style={s.primaryBtn} type="submit" disabled={creatingToken}>
                {t('access_create_token')}
              </button>
            </form>

            {/* C. Invite a photographer to this gallery */}
            <h3 style={{ ...s.sectionTitle, marginTop: '1.5rem' }}>{t('access_invite_photographer_title')}</h3>
            <p style={s.sectionHint}>
              {t('access_invite_photographer_hint')}{' '}
              {t('access_invite_team_hint')} <a href="/admin/team" style={{ color: '#555' }}>{t('nav_team')}</a>.
            </p>
            <form onSubmit={handleSendInvite} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                style={{ ...s.input, flex: '1 1 200px' }}
                type="email"
                placeholder={t('access_invite_email_placeholder')}
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                required
              />
              <button style={s.primaryBtn} type="submit" disabled={sendingInvite}>
                {t('access_send_invite')}
              </button>
            </form>
            {inviteLink && (
              <div style={s.inviteLinkBox}>
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', color: '#555' }}>{t('access_invite_link_hint')}</p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <code style={s.inviteLinkCode}>{inviteLink}</code>
                  <button style={s.accessBtn} onClick={() => { navigator.clipboard.writeText(inviteLink); setToast(t('access_copied')); }}>
                    {t('access_copy_link')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── UPLOAD LINKS ── */}
        {tab === 'upload' && canManageAccess && (
          <div style={{ maxWidth: 620 }}>
            <h3 style={s.sectionTitle}>Photographer upload links</h3>
            <p style={s.sectionHint}>
              Send an upload link to a photographer. They can upload photos without an account.
              Uploaded photos land in the <strong>Inbox</strong> tab pending your review.
            </p>

            <form onSubmit={handleCreateUploadLink} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
              <input
                style={{ ...s.input, flex: '1 1 160px' }}
                placeholder="Label (e.g. photographer name)"
                value={newLinkLabel}
                onChange={e => setNewLinkLabel(e.target.value)}
              />
              <input
                style={{ ...s.input, flex: '1 1 140px' }}
                type="date"
                title="Expiry date (optional)"
                value={newLinkExpiry}
                onChange={e => setNewLinkExpiry(e.target.value)}
              />
              <button style={s.primaryBtn} type="submit" disabled={creatingLink}>
                {creatingLink ? '…' : 'Create link'}
              </button>
            </form>

            {newLinkUrl && (
              <div style={s.inviteLinkBox}>
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', color: '#555' }}>Share this link with the photographer:</p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <code style={s.inviteLinkCode}>{newLinkUrl}</code>
                  <button style={s.accessBtn} onClick={() => { navigator.clipboard.writeText(newLinkUrl); setToast(t('access_copied')); }}>
                    Copy
                  </button>
                </div>
              </div>
            )}

            {uploadLinks.length === 0
              ? <p style={s.dim}>No upload links yet.</p>
              : <div style={s.accessList}>
                  {uploadLinks.map(l => (
                    <div key={l.id} style={s.accessRow}>
                      <span style={s.accessEmail}>{l.label || '(no label)'}</span>
                      {l.expires_at && (
                        <span style={s.accessMeta}>expires {new Date(l.expires_at).toLocaleDateString()}</span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: l.active ? '#4ade80' : '#666' }}>
                        {l.active ? 'active' : 'revoked'}
                      </span>
                      {l.active && (
                        <button style={s.accessDangerBtn} onClick={() => handleRevokeUploadLink(l.id)}>
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── INBOX ── */}
        {tab === 'inbox' && canManageAccess && (
          <div style={{ maxWidth: 680 }}>
            <h3 style={s.sectionTitle}>Photo inbox</h3>
            <p style={s.sectionHint}>
              Photos uploaded by photographers via link appear here. Review and accept or reject them before building.
            </p>

            {!inbox
              ? <p style={s.dim}>Loading…</p>
              : inbox.photos.length === 0
                ? <p style={s.dim}>No pending photos.</p>
                : <>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: '#aaa' }}>
                        {inbox.counts.uploaded} pending · {inbox.counts.validated} validated · {inbox.counts.published} published
                      </span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                        <button style={s.primaryBtn} onClick={handleValidateAll} disabled={validating}>
                          {validating ? '…' : 'Accept all'}
                        </button>
                        <button style={{ ...s.primaryBtn, background: '#7f1d1d', borderColor: '#991b1b' }} onClick={handleRejectAll}>
                          Reject all
                        </button>
                      </div>
                    </div>
                    <div style={s.photoGrid}>
                      {inbox.photos.map(p => (
                        <div key={p.id} style={{ ...s.photoCard, cursor: 'default' }}>
                          <img
                            src={`/api/galleries/${id}/photos/${encodeURIComponent(p.filename)}/preview`}
                            style={s.thumb} alt={p.filename}
                          />
                          <div style={s.photoName}>{p.filename}</div>
                          {p.upload_link_label && (
                            <div style={{ fontSize: '0.7rem', color: '#666', padding: '0 0.4rem 0.2rem' }}>{p.upload_link_label}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
            }
          </div>
        )}

      </main>
      <Toast message={toast} onDone={() => setToast('')} />

      {/* Share upload link modal */}
      {shareModal && (
        <div style={s.modalOverlay} onClick={() => setShareModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#eee' }}>
              Upload link — {shareModal.label}
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#888' }}>
              Share this link with the photographer. They can upload without an account.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <code style={s.inviteLinkCode}>{shareModal.url}</code>
              <button style={s.accessBtn} onClick={() => {
                navigator.clipboard.writeText(shareModal.url);
                setToast(t('access_copied'));
              }}>Copy</button>
            </div>
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button style={s.primaryBtn} onClick={() => setShareModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortIcon({ asc }) {
  const widths = asc ? [14, 10, 6, 3] : [3, 6, 10, 14];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      {widths.map((w, i) => (
        <rect key={i} x={0} y={i * 3.5} width={w} height="2" rx="1" />
      ))}
    </svg>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:'1rem', marginBottom:'0.6rem' }}>
      <label style={{ width:200, fontSize:'0.85rem', color:'#555', flexShrink:0, paddingTop:'0.4rem' }}>{label}</label>
      {children}
    </div>
  );
}

const STATUS_COLOR = { done:'#16a34a', error:'#dc2626', running:'#ca8a04', queued:'#2563eb', pending:'#888' };

const s = {
  page:         { background:'#f8f8f8' },
  center:       { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#888' },
  header:       { background:'#fff', borderBottom:'1px solid #eee', padding:'0 1.5rem', height:52, display:'flex', alignItems:'center', gap:'1rem' },
  back:         { color:'#111', textDecoration:'none', fontSize:'0.875rem' },
  title:        { fontWeight:600, fontSize:'0.95rem', marginRight:'auto' },
  headerActions:{ display:'flex', gap:'0.5rem' },
  tabs:         { background:'#fff', borderBottom:'1px solid #eee', padding:'0 1.5rem', display:'flex', gap:'0.25rem' },
  tab:          { padding:'0.6rem 1rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.875rem', color:'#666', borderBottom:'2px solid transparent' },
  tabActive:    { color:'#111', borderBottom:'2px solid #111', fontWeight:600 },
  main:         { maxWidth:900, margin:'0 auto', padding:'1.5rem' },
  sectionTitle: { fontSize:'0.95rem', fontWeight:600, margin:'0 0 0.5rem' },
  sectionHint:  { fontSize:'0.78rem', color:'#999', margin:'0 0 0.75rem', lineHeight: 1.5 },
  photoGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:'0.75rem' },
  photoCard:    { position:'relative', background:'#fff', borderRadius:6, overflow:'hidden', boxShadow:'0 1px 4px #0001' },
  thumb:        { width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' },
  photoName:    { fontSize:'0.72rem', padding:'0.25rem 0.4rem', color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  deleteBtn:    { position:'absolute', top:4, right:4, background:'#000a', color:'#fff', border:'none', borderRadius:4, width:22, height:22, cursor:'pointer', fontSize:'0.75rem', display:'flex', alignItems:'center', justifyContent:'center' },
  settingsForm: { maxWidth:560 },
  input:        { flex:1, padding:'0.4rem 0.6rem', border:'1px solid #ddd', borderRadius:5, fontSize:'0.875rem', outline:'none' },
  primaryBtn:   { marginTop:'0.25rem', padding:'0.55rem 1.5rem', background:'#111', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' },
  readyBtn:     { padding:'0.55rem 1.25rem', background:'#16a34a', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' },
  outlineBtn:   { padding:'0.4rem 0.85rem', background:'none', border:'1px solid #ddd', borderRadius:5, cursor:'pointer', fontSize:'0.8rem' },
  viewBtn:      { padding:'0.4rem 0.85rem', background:'#16a34a', color:'#fff', border:'none', borderRadius:5, cursor:'pointer', fontSize:'0.8rem', textDecoration:'none', fontWeight:600 },
  coverGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(80px,1fr))', gap:'0.5rem', maxWidth:560 },
  coverThumb:   { position:'relative', cursor:'pointer', borderRadius:5, overflow:'hidden', border:'2px solid transparent', boxSizing:'border-box' },
  coverThumbSelected: { border:'2px solid #111' },
  coverThumbImg:{ width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' },
  coverCheck:   { position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.45)', color:'#fff', fontWeight:700, fontSize:'1.1rem' },
  sortBtn:      { padding:'4px 7px', background:'none', border:'1px solid #ddd', borderRadius:4, cursor:'pointer', display:'flex', alignItems:'center', color:'#555' },
  rebuildBanner:{ display:'flex', alignItems:'center', gap:'0.75rem', background:'#fffbeb', borderTop:'1px solid #fcd34d', borderBottom:'1px solid #fcd34d', padding:'0.6rem 1.5rem', fontSize:'0.85rem', color:'#92400e' },
  rebuildBtn:   { padding:'0.25rem 0.75rem', background:'#f59e0b', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600, fontSize:'0.8rem', whiteSpace:'nowrap' },
  advToggle:    { display:'flex', alignItems:'center', gap:'0.4rem', background:'none', border:'none', cursor:'pointer', fontSize:'0.85rem', color:'#555', fontWeight:600, padding:'0.5rem 0', marginBottom:'0.25rem', width:'100%', textAlign:'left' },
  advArrow:     { fontSize:'0.75rem', color:'#888' },
  advSection:   { borderLeft:'2px solid #eee', paddingLeft:'1rem', marginBottom:'0.75rem' },
  fieldHint:    { fontSize:'0.75rem', color:'#aaa', margin:'0.2rem 0 0' },
  dim:          { color:'#888', fontSize:'0.875rem' },
  jobList:      { display:'flex', flexDirection:'column', gap:'0.4rem' },
  jobRow:       { display:'flex', gap:'1rem', alignItems:'center', padding:'0.6rem 0.85rem', background:'#fff', borderRadius:6, textDecoration:'none', color:'#111', fontSize:'0.875rem', boxShadow:'0 1px 3px #0001' },
  jobStatus:    { fontWeight:600, width:70 },
  jobId:        { fontFamily:'monospace', color:'#888', fontSize:'0.8rem' },
  jobDate:      { color:'#888', fontSize:'0.8rem', marginLeft:'auto' },
  accessList:   { display:'flex', flexDirection:'column', gap:'0.4rem', marginBottom:'0.5rem' },
  accessRow:    { display:'flex', gap:'0.5rem', alignItems:'center', padding:'0.45rem 0.75rem', background:'#fff', borderRadius:6, boxShadow:'0 1px 3px #0001', flexWrap:'wrap' },
  accessEmail:  { flex:1, fontSize:'0.875rem', color:'#333', minWidth:120, fontWeight:500 },
  accessMeta:   { fontSize:'0.75rem', color:'#aaa', whiteSpace:'nowrap' },
  accessBtn:    { padding:'0.3rem 0.7rem', background:'none', border:'1px solid #ddd', borderRadius:4, cursor:'pointer', fontSize:'0.78rem', whiteSpace:'nowrap' },
  accessDangerBtn: { padding:'0.3rem 0.7rem', background:'none', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:4, cursor:'pointer', fontSize:'0.78rem', whiteSpace:'nowrap' },
  inviteLinkBox:{ marginTop:'0.75rem', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6, padding:'0.75rem 1rem' },
  inviteLinkCode:{ flex:1, fontSize:'0.78rem', fontFamily:'monospace', wordBreak:'break-all', color:'#15803d' },
  modalOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  modalBox:     { background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:10, padding:'1.5rem', width:'100%', maxWidth:480 },
};

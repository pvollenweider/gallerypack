// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { UploadZone } from '../../../components/UploadZone.jsx';
import { BuildLog } from '../../../components/BuildLog.jsx';
import { AdminLightbox } from '../../../components/AdminLightbox.jsx';
import GalleryPickerModal from '../../../components/GalleryPickerModal.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminToast, AdminBadge } from '../../../components/ui/index.js';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CAN_EDIT_ROLES = ['collaborator', 'admin', 'owner'];
const STATUS_BADGE   = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };

// ── Sortable photo card ──────────────────────────────────────────────────────

function SortablePhotoCard({
  photo,
  disabled,
  isSelected,
  isCover,
  isDraggedInGroup,
  photographers,
  thumbSize,
  aspectMode,
  canEdit,
  deleting,
  settingCover,
  t,
  onToggleSelect,
  onDelete,
  onSetCover,
  onEditDescription,
  onOpenLightbox,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.file, disabled });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={e => {
        if (e.target.closest('button')) return;
        onToggleSelect(e);
      }}
      onDoubleClick={e => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        onOpenLightbox();
      }}
      onContextMenu={e => { e.preventDefault(); onOpenLightbox(); }}
      title="Clic — sélectionner · Double-clic — aperçu plein écran"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        border: `2px solid ${isSelected ? '#3b82f6' : isCover ? '#eab308' : '#dee2e6'}`,
        borderRadius: 6,
        overflow: 'hidden',
        cursor: disabled ? 'default' : 'grab',
        opacity: isDragging || isDraggedInGroup ? 0.45 : 1,
        userSelect: 'none',
        touchAction: disabled ? 'auto' : 'none',
      }}
    >
      {/* Selection indicator */}
      <div style={{
        position: 'absolute', top: 4, left: 4, zIndex: 2,
        width: 18, height: 18, borderRadius: '50%',
        background: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.8)',
        border: `2px solid ${isSelected ? '#3b82f6' : '#9ca3af'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        {isSelected && <i className="fas fa-check" style={{ fontSize: '0.5rem', color: '#fff' }} />}
      </div>

      {(thumbSize === 'lg' ? (photo.thumbnail?.md ?? photo.thumbnail?.sm) : photo.thumbnail?.sm) ? (
        <img
          src={thumbSize === 'lg' ? (photo.thumbnail?.md ?? photo.thumbnail?.sm) : photo.thumbnail?.sm}
          alt={photo.file}
          style={aspectMode === 'natural'
            ? { width: '100%', aspectRatio: photo.exif?.width && photo.exif?.height ? `${photo.exif.width}/${photo.exif.height}` : '1/1', objectFit: 'contain', background: '#f3f4f6', display: 'block' }
            : { width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }
          }
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <div style={aspectMode === 'natural'
          ? { width: '100%', aspectRatio: photo.exif?.width && photo.exif?.height ? `${photo.exif.width}/${photo.exif.height}` : '1/1', background: 'linear-gradient(135deg,#e5e7eb,#d1d5db)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
          : { width: '100%', aspectRatio: '1/1', background: 'linear-gradient(135deg,#e5e7eb,#d1d5db)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        }>
          <i className="fas fa-image" style={{ fontSize: '1.5rem', color: '#9ca3af' }} />
        </div>
      )}
      <div
        style={{ padding: '0.25rem 0.4rem 0 0.4rem', fontSize: '0.7rem', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={photo.original_name || photo.file}
      >
        {photo.original_name || photo.file}
      </div>
      {photo.photographer_id && (
        <div style={{ padding: '0 0.4rem 0.2rem', fontSize: '0.65rem', color: '#2563eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <i className="fas fa-camera me-1" style={{ fontSize: '0.6rem' }} />
          {photographers.find(pg => pg.id === photo.photographer_id)?.name ?? '?'}
        </div>
      )}
      {canEdit && (
        <>
          {/* Cover photo toggle */}
          <button
            onClick={e => { e.stopPropagation(); onSetCover(); }}
            onPointerDown={e => e.stopPropagation()}
            disabled={settingCover === photo.file}
            title={isCover ? 'Image clé' : 'Définir comme image clé'}
            style={{
              position: 'absolute', top: 4, left: 28,
              background: isCover ? 'rgba(234,179,8,0.9)' : 'rgba(0,0,0,0.55)',
              border: 'none', color: '#fff', borderRadius: 4, width: 24, height: 24,
              cursor: isCover ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem',
              touchAction: 'auto',
            }}
          >
            {settingCover === photo.file
              ? <i className="fas fa-spinner fa-spin" />
              : <i className="fas fa-star" />}
          </button>
          {/* AI description */}
          <button
            onClick={e => { e.stopPropagation(); onEditDescription(); }}
            onPointerDown={e => e.stopPropagation()}
            title="Edit AI description"
            style={{
              position: 'absolute', top: 4, right: 32,
              background: photo.ai_description ? 'rgba(0,120,212,0.75)' : 'rgba(0,0,0,0.55)',
              border: 'none', color: '#fff', borderRadius: 4, width: 24, height: 24,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem',
              touchAction: 'auto',
            }}
          >
            <i className="fas fa-align-left" />
          </button>
          {/* Delete */}
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            onPointerDown={e => e.stopPropagation()}
            disabled={deleting === photo.file}
            title={t('delete')}
            style={{
              position: 'absolute', top: 4, right: 4,
              background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff',
              borderRadius: 4, width: 24, height: 24, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem',
              touchAction: 'auto',
            }}
          >
            <i className="fas fa-times" />
          </button>
        </>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function GalleryPhotosPage() {
  const t = useT();
  const { orgId, galleryId } = useParams();
  const { user } = useAuth();
  const canEdit = CAN_EDIT_ROLES.includes(user?.organizationRole) || user?.platformRole === 'superadmin';

  const [gallery,    setGallery]    = useState(null);
  const [photos,     setPhotos]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState('');
  const [reordering,   setReordering]   = useState(false);
  const [sortAsc,      setSortAsc]      = useState(true);
  const [dateSortAsc,  setDateSortAsc]  = useState(true);
  const [deleting,          setDeleting]          = useState(null);
  const [deletingSelected,  setDeletingSelected]  = useState(false);
  const [settingCover,      setSettingCover]      = useState(null);

  // Publish state
  const [building,    setBuilding]    = useState(false);
  const [buildError,  setBuildError]  = useState('');
  const [activeJobId, setActiveJobId] = useState(null);

  // AI bulk description
  const [bulkDescJobId,   setBulkDescJobId]   = useState(null);
  const [bulkDescRunning, setBulkDescRunning] = useState(false);

  // Thumbnail regen + EXIF
  const [reanalyzing,     setReanalyzing]     = useState(false);
  const [reanalyzeResult, setReanalyzeResult] = useState(null);

  // Disk sync (reconcile)
  const [reconciling,     setReconciling]     = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);

  // Photographers (for attribution toolbar + card badge)
  const [photographers, setPhotographers] = useState([]);
  const [assigning,     setAssigning]     = useState(false);
  const [filterPhotographerId, setFilterPhotographerId] = useState(null);

  // Maintenance dropdown
  const [showMaintMenu, setShowMaintMenu] = useState(false);
  const maintMenuRef = useRef(null);

  useEffect(() => {
    if (!showMaintMenu) return;
    function handleClickOutside(e) {
      if (maintMenuRef.current && !maintMenuRef.current.contains(e.target)) setShowMaintMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMaintMenu]);

  // Thumbnail size toggle
  const [thumbSize, setThumbSize] = useState('sm'); // 'sm' | 'lg'

  // Full-width layout toggle (persisted)
  const [fullWidth, setFullWidth] = useState(() => localStorage.getItem('photoPageFullWidth') === '1');

  // Aspect-ratio mode toggle (persisted)
  const [aspectMode, setAspectMode] = useState(
    () => localStorage.getItem('photoAspectMode') || 'square'
  );

  // Multi-select + drag state
  const [selected,     setSelected]     = useState(new Set()); // Set<photo.id>
  const [activeDragId, setActiveDragId] = useState(null);      // file of card being dragged

  // Bulk copy / move state (issue #465)
  const [pickerAction,      setPickerAction]      = useState(null);  // 'copy' | 'move' | null
  const [bulkActionRunning, setBulkActionRunning] = useState(false);

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // AI description panel
  const [selectedPhotoDesc,  setSelectedPhotoDesc]  = useState(null);
  const [descDraft,          setDescDraft]          = useState('');
  const [descGenerating,     setDescGenerating]     = useState(false);
  const [descSaving,         setDescSaving]         = useState(false);
  const [aiKeyMissing,       setAiKeyMissing]       = useState(false);
  const descPanelRef = useRef(null);

  const pollRef = useRef(null);

  // dnd-kit sensors — PointerSensor unifies mouse/touch/pen via PointerEvent API
  // (works on iOS 13+). onPointerDown stopPropagation on buttons reliably
  // prevents drag activation when tapping action buttons.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Photographers who have at least one photo in this gallery's current list
  const activePhotographers = photographers.filter(pg => photos.some(p => p.photographer_id === pg.id));
  const hasUnattributed     = photos.some(p => !p.photographer_id);

  const filteredPhotos = filterPhotographerId === null
    ? photos
    : filterPhotographerId === '__unassigned__'
      ? photos.filter(p => !p.photographer_id)
      : photos.filter(p => p.photographer_id === filterPhotographerId);

  function loadGallery() {
    return api.getGallery(galleryId).then(g => { setGallery(g); return g; });
  }

  function refreshPhotos() {
    return api.listPhotos(galleryId).then(p => { setPhotos(p); return p; });
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      api.listPhotos(galleryId).then(p => {
        setPhotos(p);
        if (!p.some(x => !x.thumbnail?.sm)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }).catch(() => {});
    }, 2000);
  }

  useEffect(() => {
    setError('');
    Promise.all([api.getGallery(galleryId), api.listPhotos(galleryId), api.listOrgPhotographers(orgId)])
      .then(([g, p, pgs]) => {
        setGallery(g);
        setPhotos(p);
        setPhotographers(pgs);
        if (p.some(x => !x.thumbnail?.sm)) startPolling();
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    return () => { clearInterval(pollRef.current); pollRef.current = null; };
  }, [galleryId]); // eslint-disable-line

  async function saveOrder(ordered) {
    setReordering(true);
    try {
      await api.reorderPhotos(galleryId, ordered.map(p => p.file));
    } catch (e) { setToast(e.message); }
    finally { setReordering(false); }
  }

  async function build(force = false) {
    setBuilding(true); setBuildError(''); setActiveJobId(null);
    try {
      const job = await api.triggerBuild(galleryId, force);
      if (job?.id) setActiveJobId(job.id);
      setTimeout(loadGallery, 1500);
    } catch (err) {
      setBuildError(err.message);
    } finally {
      setBuilding(false);
    }
  }

  async function handleGenerateAll(force = false) {
    setBulkDescRunning(true);
    setBulkDescJobId(null);
    try {
      const job = await api.generateAllDescriptions(galleryId, force);
      setBulkDescJobId(job.id);
    } catch (err) {
      if (err?.status === 402) {
        setToast('ANTHROPIC_API_KEY not configured on the server.');
      } else if (err?.status === 429) {
        setToast('A description generation job is already running.');
      } else {
        setToast(`${t('error')}: ${err.message}`);
      }
      setBulkDescRunning(false);
    }
  }

  async function reanalyze(force = false) {
    setReanalyzing(true); setReanalyzeResult(null); setReconcileResult(null);
    try {
      const r = await api.reanalyzePhotos(galleryId, force);
      setReanalyzeResult(r);
      refreshPhotos().then(p => { if (p.some(x => !x.thumbnail?.sm)) startPolling(); });
    } catch (err) {
      setToast(`${t('error')}: ${err.message}`);
    } finally {
      setReanalyzing(false);
    }
  }

  async function reconcile() {
    setReconciling(true); setReconcileResult(null); setReanalyzeResult(null);
    try {
      const r = await api.reconcilePhotos(galleryId);
      setReconcileResult(r);
      refreshPhotos().then(p => { if (p.some(x => !x.thumbnail?.sm)) startPolling(); });
    } catch (err) {
      setToast(`${t('error')}: ${err.message}`);
    } finally {
      setReconciling(false);
    }
  }

  async function handleDelete(filename) {
    if (!confirm(t('delete_photo_confirm', { file: filename }))) return;
    setDeleting(filename);
    try {
      await api.deletePhoto(galleryId, filename);
      setPhotos(p => p.filter(f => f.file !== filename));
      setSelected(prev => { const s = new Set(prev); s.delete(filename); return s; });
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setDeleting(null); }
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(t('gal_photos_delete_selected_confirm', { n: selected.size }))) return;
    setDeletingSelected(true);
    const filesToDelete = photos.filter(p => selected.has(p.id)).map(p => p.file);
    let errorCount = 0;
    for (const filename of filesToDelete) {
      try {
        await api.deletePhoto(galleryId, filename);
        setPhotos(prev => prev.filter(p => p.file !== filename));
      } catch {
        errorCount++;
      }
    }
    setSelected(new Set());
    setDeletingSelected(false);
    if (errorCount > 0) setToast(`${t('error')}: ${errorCount} photo(s) could not be deleted`);
  }

  async function setCover(filename) {
    setSettingCover(filename);
    try {
      await api.updateGallery(galleryId, { coverPhoto: filename });
      setGallery(g => ({ ...g, coverPhoto: filename }));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setSettingCover(null); }
  }

  async function sortPhotos(dir) {
    const sorted = [...photos].sort((a, b) => {
      const na = (a.original_name || a.file).toLowerCase();
      const nb = (b.original_name || b.file).toLowerCase();
      return dir === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na);
    });
    setPhotos(sorted);
    setSelected(new Set());
    await saveOrder(sorted);
  }

  async function sortPhotosByDate(dir) {
    const sorted = [...photos].sort((a, b) => {
      const da = a.exif?.date ? new Date(a.exif.date).getTime() : 0;
      const db = b.exif?.date ? new Date(b.exif.date).getTime() : 0;
      return dir === 'asc' ? da - db : db - da;
    });
    setPhotos(sorted);
    setSelected(new Set());
    await saveOrder(sorted);
  }

  // ── Selection helpers ───────────────────────────────────────────────────────

  function toggleSelect(id, e) {
    if (e?.shiftKey && selected.size > 0) {
      const ids = photos.map(p => p.id);
      const lastSelected = ids.findLast(i => selected.has(i));
      const start = Math.min(ids.indexOf(lastSelected), ids.indexOf(id));
      const end   = Math.max(ids.indexOf(lastSelected), ids.indexOf(id));
      setSelected(new Set([...selected, ...ids.slice(start, end + 1)]));
    } else if (e?.metaKey || e?.ctrlKey) {
      setSelected(prev => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
      });
    } else {
      setSelected(prev =>
        prev.size === 1 && prev.has(id) ? new Set() : new Set([id])
      );
    }
  }

  function clearSelection() { setSelected(new Set()); }
  function selectAll()      { setSelected(new Set(filteredPhotos.map(p => p.id))); }

  async function assignPhotographer(photographerId) {
    if (selected.size === 0) return;
    setAssigning(true);
    try {
      await api.bulkSetPhotographer(galleryId, {
        photoIds: [...selected],
        photographerId: photographerId || null,
      });
      await refreshPhotos();
      setSelected(new Set());
      setToast(t('changes_saved'));
    } catch (err) {
      setToast(`${t('error')}: ${err.message}`);
    } finally {
      setAssigning(false);
    }
  }

  // ── Bulk copy / move (issue #465) ──────────────────────────────────────────

  async function handleBulkCopy(targetGalleryId, targetGalleryTitle) {
    setBulkActionRunning(true);
    setPickerAction(null);
    try {
      const result = await api.copyPhotos(galleryId, [...selected], targetGalleryId);
      const msg = `${result.moved} photo(s) copied to "${targetGalleryTitle}"`;
      if (result.failed?.length) setToast(`${msg} (${result.failed.length} failed)`);
      else setToast(msg);
      clearSelection();
      refreshPhotos().catch(e => setToast(e.message));
    } catch (e) { setToast(e.message); }
    finally { setBulkActionRunning(false); }
  }

  async function handleBulkMove(targetGalleryId, targetGalleryTitle) {
    setBulkActionRunning(true);
    setPickerAction(null);
    try {
      const result = await api.movePhotos(galleryId, [...selected], targetGalleryId);
      const msg = `${result.moved} photo(s) moved to "${targetGalleryTitle}"`;
      if (result.failed?.length) setToast(`${msg} (${result.failed.length} failed)`);
      else setToast(msg);
      clearSelection();
      refreshPhotos().catch(e => setToast(e.message));
    } catch (e) { setToast(e.message); }
    finally { setBulkActionRunning(false); }
  }

  // ── Move selected to front / end ────────────────────────────────────────────

  async function moveSelectedTo(position) {
    if (selected.size === 0) return;
    const sel   = photos.filter(p => selected.has(p.id));
    const rest  = photos.filter(p => !selected.has(p.id));
    const next  = position === 'front' ? [...sel, ...rest] : [...rest, ...sel];
    setPhotos(next);
    await saveOrder(next);
  }

  function openPhotoDesc(photo) {
    setSelectedPhotoDesc(photo);
    setDescDraft(photo.ai_description || '');
    setAiKeyMissing(false);
    setTimeout(() => descPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function closePhotoDesc() {
    setSelectedPhotoDesc(null);
    setDescDraft('');
  }

  async function handleGenerateDesc() {
    if (!selectedPhotoDesc) return;
    setDescGenerating(true);
    try {
      const result = await api.generatePhotoDescription(galleryId, selectedPhotoDesc.id);
      setDescDraft(result.description);
      setPhotos(ps => ps.map(p => p.id === selectedPhotoDesc.id
        ? { ...p, ai_description: result.description }
        : p
      ));
      setSelectedPhotoDesc(prev => ({ ...prev, ai_description: result.description }));
    } catch (err) {
      if (err?.status === 402) {
        setAiKeyMissing(true);
      } else {
        setToast('AI generation failed. Please try again.');
      }
    } finally {
      setDescGenerating(false);
    }
  }

  async function handleSaveDesc() {
    if (!selectedPhotoDesc) return;
    setDescSaving(true);
    try {
      await api.updatePhotoDescription(galleryId, selectedPhotoDesc.id, descDraft.trim() || null);
      setPhotos(ps => ps.map(p => p.id === selectedPhotoDesc.id
        ? { ...p, ai_description: descDraft.trim() || null }
        : p
      ));
      setSelectedPhotoDesc(prev => ({ ...prev, ai_description: descDraft.trim() || null }));
      setToast('Description saved.');
    } catch {
      setToast('Failed to save description.');
    } finally {
      setDescSaving(false);
    }
  }

  // ── dnd-kit drag handlers ───────────────────────────────────────────────────

  function handleDragStart({ active }) {
    setActiveDragId(active.id);
  }

  function handleDragEnd({ active, over }) {
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const activePhoto = photos.find(p => p.file === active.id);
    if (!activePhoto) return;

    let next;
    if (selected.has(activePhoto.id) && selected.size > 1) {
      // Group drag: move all selected photos to the drop position
      const overPhoto = photos.find(p => p.file === over.id);
      const sel  = photos.filter(p => selected.has(p.id));
      const rest = photos.filter(p => !selected.has(p.id));
      let insertAt = rest.findIndex(p => p.id === overPhoto?.id);
      if (insertAt === -1) insertAt = rest.length;
      next = [...rest.slice(0, insertAt), ...sel, ...rest.slice(insertAt)];
    } else {
      const oldIndex = photos.findIndex(p => p.file === active.id);
      const newIndex = photos.findIndex(p => p.file === over.id);
      next = arrayMove(photos, oldIndex, newIndex);
    }

    setPhotos(next);
    saveOrder(next);
  }

  // ── Public gallery URL ──────────────────────────────────────────────────────

  function galleryPublicUrl(g) {
    if (!g || g.buildStatus !== 'done' || g.access === 'private') return null;
    if (g.distName) return `${window.location.origin}/${g.distName}/`;
    const projSlug = g.breadcrumb?.project?.slug;
    const p        = projSlug ? `/${projSlug}/${g.slug}/` : `/${g.slug}/`;
    return window.location.origin + p;
  }

  const publicUrl   = gallery ? galleryPublicUrl(gallery) : null;
  const buildStatus = gallery?.buildStatus;

  return (
    <AdminPage
      title={t('tab_photos')}
      maxWidth={fullWidth ? '100%' : '960px'}
      actions={
        <div className="d-flex gap-2 align-items-center flex-wrap">
          {reordering && <span className="text-muted" style={{ fontSize: '0.8rem' }}>{t('saving')}</span>}
          <AdminButton
            variant="outline-secondary"
            size="sm"
            icon={fullWidth ? 'fas fa-compress' : 'fas fa-expand'}
            title={fullWidth ? 'Collapse' : 'Expand to full width'}
            onClick={() => {
              const next = !fullWidth;
              setFullWidth(next);
              localStorage.setItem('photoPageFullWidth', next ? '1' : '0');
            }}
          />
          <AdminButton
            variant={aspectMode === 'natural' ? 'secondary' : 'outline-secondary'}
            size="sm"
            icon={aspectMode === 'square' ? 'fas fa-crop-alt' : 'fas fa-image'}
            title={aspectMode === 'square' ? 'Show natural proportions' : 'Show square thumbnails'}
            onClick={() => {
              const next = aspectMode === 'square' ? 'natural' : 'square';
              setAspectMode(next);
              localStorage.setItem('photoAspectMode', next);
            }}
          />
          <AdminButton
            variant="outline-secondary"
            size="sm"
            icon={`fas fa-sort-alpha-${sortAsc ? 'down' : 'up'}`}
            onClick={() => { const next = !sortAsc; setSortAsc(next); sortPhotos(next ? 'asc' : 'desc'); }}
          >
            {sortAsc ? t('gal_photos_sort_asc') : t('gal_photos_sort_desc')}
          </AdminButton>
          <AdminButton
            variant="outline-secondary"
            size="sm"
            icon="fas fa-calendar-alt"
            onClick={() => { const next = !dateSortAsc; setDateSortAsc(next); sortPhotosByDate(next ? 'asc' : 'desc'); }}
          >
            {dateSortAsc ? t('gal_photos_sort_date_asc') : t('gal_photos_sort_date_desc')}
          </AdminButton>
          <AdminButton
            size="sm"
            icon="fas fa-rocket"
            loading={building}
            loadingLabel={t('gal_publish_building')}
            disabled={loading}
            onClick={() => build(false)}
          >
            {t('gal_publish_title')}
          </AdminButton>
          {/* Maintenance dropdown */}
          <div ref={maintMenuRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-outline-secondary btn-sm"
              title={t('gal_maintenance') || 'Maintenance'}
              onClick={() => setShowMaintMenu(v => !v)}
            >
              <i className="fas fa-wrench" />
            </button>
            {showMaintMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: '#fff', border: '1px solid #dee2e6', borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 200,
                minWidth: 220, padding: '4px 0',
              }}>
                {[
                  { icon: 'fas fa-redo',        label: t('gal_publish_force'),   action: () => build(true),              disabled: building || loading },
                  { icon: 'fas fa-folder-open', label: t('gal_reconcile_title'), action: reconcile,                      disabled: loading, loading: reconciling },
                  { icon: 'fas fa-images',      label: t('gal_reanalyze_title'), action: () => reanalyze(false),         disabled: loading, loading: reanalyzing },
                  { icon: 'fas fa-sync-alt',    label: t('gal_reanalyze_force'), action: () => reanalyze(true),          disabled: reanalyzing || loading },
                  null,
                  { icon: 'fas fa-magic',       label: t('gal_ai_desc_bulk') || 'Generate AI descriptions', action: () => handleGenerateAll(false), disabled: loading || bulkDescRunning, loading: bulkDescRunning },
                  { icon: 'fas fa-redo',        label: t('gal_ai_desc_bulk_force') || 'Regenerate all AI descriptions',  action: () => handleGenerateAll(true),  disabled: loading || bulkDescRunning },
                ].map((item, i) => item === null
                  ? <div key={i} style={{ borderTop: '1px solid #f1f1f1', margin: '4px 0' }} />
                  : (
                    <button
                      key={i}
                      className="dropdown-item d-flex align-items-center gap-2"
                      style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                      disabled={item.disabled}
                      onClick={() => { item.action(); setShowMaintMenu(false); }}
                    >
                      <i className={item.loading ? 'fas fa-spinner fa-spin' : item.icon} style={{ width: 14, textAlign: 'center' }} />
                      {item.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      }
    >
      {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
      <AdminAlert message={error} />
      <AdminToast message={toast} onDone={() => setToast('')} />

      {!loading && gallery && (
        <>
          {/* Publish status bar */}
          <div className="d-flex align-items-center gap-3 mb-4 p-3 rounded"
            style={{ background: '#f8f9fa', border: '1px solid #dee2e6', flexWrap: 'wrap' }}>
            <div className="d-flex align-items-center gap-2">
              {buildStatus
                ? <AdminBadge color={STATUS_BADGE[buildStatus] || 'secondary'}>{buildStatus}</AdminBadge>
                : <span className="text-muted" style={{ fontSize: '0.85rem' }}>{t('gal_publish_never_built')}</span>
              }
              {gallery.builtAt && (
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {new Date(gallery.builtAt).toLocaleString()}
                </span>
              )}
            </div>
            {publicUrl && (
              <a href={publicUrl} target="_blank" rel="noreferrer"
                className="btn btn-sm btn-success">
                <i className="fas fa-external-link-alt me-1" />
                {t('view_gallery_btn')}
              </a>
            )}
            {gallery.lastJobId && buildStatus === 'error' && (
              <Link to={`/admin/jobs/${gallery.lastJobId}`} className="text-danger small">
                <i className="fas fa-exclamation-triangle me-1" />{t('gal_publish_view_logs')}
              </Link>
            )}
          </div>

          {buildError && <AdminAlert message={buildError} className="mb-3" />}

          {/* Maintenance results */}
          {reconcileResult && (
            <div className="d-flex align-items-start gap-2 mb-3 p-3 rounded"
              style={{ background: reconcileResult.missingFiles?.length > 0 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${reconcileResult.missingFiles?.length > 0 ? '#fde68a' : '#bbf7d0'}`, fontSize: '0.85rem' }}>
              <i className={`fas fa-${reconcileResult.missingFiles?.length > 0 ? 'exclamation-triangle text-warning' : 'check-circle text-success'} mt-1`} style={{ flexShrink: 0 }} />
              <div className="flex-grow-1">
                <strong>{t('gal_reconcile_title')}</strong>
                <span className="ms-2 text-muted">
                  {t('gal_reconcile_result', { added: reconcileResult.added, purged: reconcileResult.purged, total: reconcileResult.total })}
                </span>
                {reconcileResult.corruptFiles?.length > 0 && (
                  <div className="text-danger mt-1">
                    {t('gal_reconcile_corrupt', { n: reconcileResult.corruptFiles.length })}: {reconcileResult.corruptFiles.join(', ')}
                  </div>
                )}
                {reconcileResult.missingFiles?.length > 0 && (
                  <div className="text-warning mt-1">
                    {t('gal_reconcile_missing', { n: reconcileResult.missingFiles.length })}: {reconcileResult.missingFiles.join(', ')}
                  </div>
                )}
              </div>
              <button type="button" className="btn-close btn-close-sm ms-1" onClick={() => setReconcileResult(null)} />
            </div>
          )}

          {reanalyzeResult && (
            <div className="d-flex align-items-start gap-2 mb-3 p-3 rounded"
              style={{ background: reanalyzeResult.errors?.length > 0 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${reanalyzeResult.errors?.length > 0 ? '#fde68a' : '#bbf7d0'}`, fontSize: '0.85rem' }}>
              <i className={`fas fa-${reanalyzeResult.errors?.length > 0 ? 'exclamation-triangle text-warning' : 'check-circle text-success'} mt-1`} style={{ flexShrink: 0 }} />
              <div className="flex-grow-1">
                <strong>{t('gal_reanalyze_title')}</strong>
                <span className="ms-2 text-muted">
                  {t('gal_reanalyze_result', { thumbs: reanalyzeResult.thumbsGenerated, exif: reanalyzeResult.exifExtracted })}
                </span>
                {reanalyzeResult.deleted?.length > 0 && (
                  <div className="text-danger mt-1">
                    {t('gal_reconcile_corrupt', { n: reanalyzeResult.deleted.length })}: {reanalyzeResult.deleted.join(', ')}
                  </div>
                )}
                {reanalyzeResult.errors?.length > 0 && (
                  <div className="text-warning mt-1">
                    {reanalyzeResult.errors.length} {t('gal_reanalyze_errors')}: {reanalyzeResult.errors.slice(0, 3).join(' · ')}{reanalyzeResult.errors.length > 3 ? ' …' : ''}
                  </div>
                )}
              </div>
              <button type="button" className="btn-close btn-close-sm ms-1" onClick={() => setReanalyzeResult(null)} />
            </div>
          )}

          {activeJobId && (
            <div className="mb-4">
              <BuildLog
                jobId={activeJobId}
                onDone={() => { loadGallery(); setActiveJobId(null); }}
              />
              <div className="mt-2">
                <Link to={`/admin/jobs/${activeJobId}`} className="small text-muted">
                  <i className="fas fa-external-link-alt me-1" />{t('gal_publish_view_logs')}
                </Link>
              </div>
            </div>
          )}

          {bulkDescJobId && (
            <div className="mb-4">
              <BuildLog
                jobId={bulkDescJobId}
                onDone={() => { setBulkDescRunning(false); refreshPhotos(); }}
              />
            </div>
          )}

          {/* Upload zone — sticky so it stays visible while scrolling the photo grid */}
          <div style={{ position: 'sticky', top: '0.5rem', zIndex: 20, marginBottom: '1.5rem' }}>
            <AdminCard title={t('upload_photos')}>
              <UploadZone
                galleryId={galleryId}
                existingPhotos={photos}
                onDone={() => refreshPhotos().then(p => { if (p.some(x => !x.thumbnail?.sm)) startPolling(); })}
              />
            </AdminCard>
          </div>

          {/* Photo grid */}
          <AdminCard
            title={filterPhotographerId !== null
              ? t('photos_list_title', { n: filteredPhotos.length }) + ' / ' + photos.length
              : t('photos_list_title', { n: photos.length })}
            noPadding
            headerRight={
              photos.length > 0 && (
                <div className="d-flex align-items-center gap-2">
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                    title={thumbSize === 'sm' ? t('gal_photos_zoom_in') : t('gal_photos_zoom_out')}
                    onClick={() => setThumbSize(s => s === 'sm' ? 'lg' : 'sm')}
                  >
                    <i className={`fas fa-${thumbSize === 'sm' ? 'magnifying-glass-plus' : 'magnifying-glass-minus'}`} />
                  </button>
                  {selected.size > 0 ? (
                    <>
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                        {t('gal_photos_selected', { n: selected.size })}
                      </span>
                      {photographers.length > 0 && (
                        <select
                          className="form-select form-select-sm"
                          style={{ width: 'auto', fontSize: '0.75rem', padding: '2px 24px 2px 8px' }}
                          value=""
                          disabled={assigning}
                          onChange={e => {
                            const v = e.target.value;
                            if (v !== '') assignPhotographer(v === '__unassign__' ? null : v);
                          }}
                        >
                          <option value="" disabled>
                            {assigning ? '…' : `${t('pg_assign_to')}…`}
                          </option>
                          {photographers.map(pg => (
                            <option key={pg.id} value={pg.id}>{pg.name}</option>
                          ))}
                          <option value="__unassign__">{t('pg_unassign')}</option>
                        </select>
                      )}
                      {canEdit && (
                        <>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            disabled={bulkActionRunning}
                            onClick={() => setPickerAction('copy')}
                          >
                            <i className="fas fa-copy me-1" />{t('bulk_copy_to') || 'Copy to…'}
                          </button>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            disabled={bulkActionRunning}
                            onClick={() => setPickerAction('move')}
                          >
                            <i className="fas fa-arrow-right me-1" />{t('bulk_move_to') || 'Move to…'}
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            disabled={deletingSelected}
                            onClick={handleDeleteSelected}
                          >
                            {deletingSelected
                              ? <i className="fas fa-spinner fa-spin" />
                              : t('gal_photos_delete_selected', { n: selected.size })}
                          </button>
                        </>
                      )}
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                        onClick={clearSelection}
                      >
                        {t('pg_deselect_all')}
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                      onClick={selectAll}
                    >
                      {t('pg_select_all')}
                    </button>
                  )}
                </div>
              )
            }
          >
            {photos.length === 0 ? (
              <div className="text-center text-muted py-5">{t('no_photos')}</div>
            ) : (
              <>
                {(activePhotographers.length > 0 || hasUnattributed) && (
                  <div className="d-flex align-items-center gap-2 flex-wrap px-3 py-2" style={{ borderBottom: '1px solid #e5e7eb', fontSize: '0.8rem' }}>
                    <i className="fas fa-filter text-muted" title={t('pg_filter_by_photographer')} style={{ flexShrink: 0 }} />
                    {activePhotographers.map(pg => (
                      <button
                        key={pg.id}
                        type="button"
                        className={`btn btn-sm ${filterPhotographerId === pg.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                        style={{ fontSize: '0.75rem', padding: '1px 10px' }}
                        onClick={() => setFilterPhotographerId(prev => prev === pg.id ? null : pg.id)}
                      >
                        <i className="fas fa-camera me-1" style={{ fontSize: '0.65rem' }} />{pg.name}
                      </button>
                    ))}
                    {hasUnattributed && (
                      <button
                        type="button"
                        className={`btn btn-sm ${filterPhotographerId === '__unassigned__' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        style={{ fontSize: '0.75rem', padding: '1px 10px' }}
                        onClick={() => setFilterPhotographerId(prev => prev === '__unassigned__' ? null : '__unassigned__')}
                      >
                        <i className="fas fa-circle-question me-1" style={{ fontSize: '0.65rem' }} />{t('pg_filter_unassigned')}
                      </button>
                    )}
                  </div>
                )}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={filteredPhotos.map(p => p.file)}
                    strategy={rectSortingStrategy}
                  >
                    {aspectMode === 'natural' && (
                      <div style={{ padding: '0.4rem 1rem 0', fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <i className="fas fa-info-circle" />
                        Reordering disabled in natural view
                      </div>
                    )}
                    <div
                      className="photo-grid-auto"
                      style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize === 'lg' ? '240px' : '130px'}, 1fr))`, gap: '0.5rem', padding: '1rem' }}
                    >
                      {filteredPhotos.map((p, idx) => (
                        <SortablePhotoCard
                          key={p.file}
                          photo={p}
                          disabled={filterPhotographerId !== null || aspectMode === 'natural'}
                          isSelected={selected.has(p.id)}
                          isCover={gallery?.coverPhoto === p.file}
                          isDraggedInGroup={
                            activeDragId !== null &&
                            activeDragId !== p.file &&
                            selected.has(p.id) &&
                            selected.size > 1
                          }
                          photographers={photographers}
                          thumbSize={thumbSize}
                          aspectMode={aspectMode}
                          canEdit={canEdit}
                          deleting={deleting}
                          settingCover={settingCover}
                          t={t}
                          onToggleSelect={e => toggleSelect(p.id, e)}
                          onDelete={() => handleDelete(p.file)}
                          onSetCover={() => { if (gallery?.coverPhoto !== p.file) setCover(p.file); }}
                          onEditDescription={() => openPhotoDesc(p)}
                          onOpenLightbox={() => setLightboxIndex(idx)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}
          </AdminCard>

          {/* AI description panel */}
          {selectedPhotoDesc && canEdit && (
            <div ref={descPanelRef} style={{ marginTop: '1.5rem' }}>
            <AdminCard
              title={<><i className="fas fa-align-left me-2" />Description — {selectedPhotoDesc.file}</>}
              headerRight={
                <button className="btn btn-tool" type="button" onClick={closePhotoDesc}>
                  <i className="fas fa-times" />
                </button>
              }
            >
              <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.5rem' }}>
                Used as <code>alt</code> text and lightbox caption in the built gallery.
              </p>
              <textarea
                style={{ width: '100%', minHeight: 80, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', padding: '0.4rem', border: '1px solid #ccc', borderRadius: 4 }}
                value={descDraft}
                onChange={e => setDescDraft(e.target.value)}
                placeholder="No description yet. Click Generate to create one with AI."
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                <AdminButton
                  variant="outline-secondary"
                  size="sm"
                  icon={descGenerating ? 'fas fa-spinner fa-spin' : 'fas fa-magic'}
                  loading={descGenerating}
                  loadingLabel="Generating…"
                  disabled={descGenerating || aiKeyMissing}
                  title={aiKeyMissing ? 'Set ANTHROPIC_API_KEY to enable AI generation' : undefined}
                  onClick={handleGenerateDesc}
                >
                  {selectedPhotoDesc.ai_description ? 'Regenerate' : 'Generate with AI'}
                </AdminButton>
                {aiKeyMissing && (
                  <span style={{ fontSize: '0.78rem', color: '#c00' }}>
                    ANTHROPIC_API_KEY not configured on the server.
                  </span>
                )}
                <AdminButton
                  size="sm"
                  style={{ marginLeft: 'auto' }}
                  loading={descSaving}
                  loadingLabel="Saving…"
                  onClick={handleSaveDesc}
                >
                  Save
                </AdminButton>
              </div>
            </AdminCard>
            </div>
          )}
        </>
      )}
      {pickerAction && (
        <GalleryPickerModal
          title={pickerAction === 'copy' ? (t('bulk_copy_to') || 'Copy to gallery') : (t('bulk_move_to') || 'Move to gallery')}
          orgId={orgId}
          currentGalleryId={galleryId}
          onSelect={(targetId, targetTitle) =>
            pickerAction === 'copy'
              ? handleBulkCopy(targetId, targetTitle)
              : handleBulkMove(targetId, targetTitle)
          }
          onClose={() => setPickerAction(null)}
        />
      )}
      {lightboxIndex !== null && (
        <AdminLightbox
          photos={filteredPhotos}
          initialIndex={lightboxIndex}
          selected={selected}
          onToggleSelect={id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onClose={() => setLightboxIndex(null)}
          photographers={photographers}
          galleryId={galleryId}
        />
      )}
    </AdminPage>
  );
}

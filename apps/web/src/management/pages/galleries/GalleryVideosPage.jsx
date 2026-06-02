// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminBadge, AdminInput, AdminToast } from '../../../components/ui/index.js';
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
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Status badge config ───────────────────────────────────────────────────────
const STATUS_COLOR = {
  pending:     'warning',
  transcoding: 'primary',
  ready:       'success',
  error:       'danger',
};

function formatDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Sortable video row ────────────────────────────────────────────────────────
function SortableVideoRow({ video, onDelete, onRetranscode, deleting, retriggering, t }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id });

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <td style={{ color: '#aaa', paddingLeft: '1rem', cursor: 'grab', width: '32px' }}
        {...attributes} {...listeners}>
        <i className="fas fa-grip-vertical" />
      </td>
      <td>
        <div className="fw-semibold">{video.title || video.slug}</div>
        <div><code className="text-muted" style={{ fontSize: '0.72rem' }}>{video.slug}</code></div>
      </td>
      <td>
        <AdminBadge color={STATUS_COLOR[video.status] || 'secondary'}>
          {video.status}
        </AdminBadge>
        {video.error_message && (
          <div className="text-danger" style={{ fontSize: '0.75rem', maxWidth: '200px' }}
            title={video.error_message}>
            {video.error_message.slice(0, 60)}{video.error_message.length > 60 ? '…' : ''}
          </div>
        )}
      </td>
      <td className="text-muted" style={{ fontSize: '0.85rem' }}>
        {formatDuration(video.duration_sec)}
      </td>
      <td className="text-end">
        <div className="d-flex gap-1 justify-content-end">
          {video.status === 'error' && (
            <AdminButton
              variant="outline-warning"
              size="sm"
              loading={retriggering === video.id}
              onClick={() => onRetranscode(video.id)}
              title="Retranscode"
            >
              <i className="fas fa-redo" />
            </AdminButton>
          )}
          <AdminButton
            variant="outline-danger"
            size="sm"
            loading={deleting === video.id}
            onClick={() => onDelete(video.id)}
            title={t('delete') || 'Delete'}
          >
            <i className="fas fa-trash" />
          </AdminButton>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GalleryVideosPage() {
  const t = useT();
  const { orgId, projectId, galleryId } = useParams();
  const [tab, setTab] = useState('videos');

  // ── Videos tab state ──────────────────────────────────────────────────────
  const [videos,      setVideos]      = useState([]);
  const [loadingVids, setLoadingVids] = useState(true);
  const [vidError,    setVidError]    = useState('');
  const [toast,       setToast]       = useState('');
  const [deleting,    setDeleting]    = useState(null);
  const [retriggering, setRetriggering] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // null | 0..1
  const [uploading,   setUploading]   = useState(false);
  const fileInputRef = useRef(null);
  const pollRef      = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadVideos = useCallback(async () => {
    try {
      const rows = await api.listVideos(galleryId);
      setVideos(rows);
      setVidError('');
    } catch (err) {
      setVidError(err.message);
    } finally {
      setLoadingVids(false);
    }
  }, [galleryId]);

  // Initial load
  useEffect(() => { loadVideos(); }, [loadVideos]);

  // Poll while any video is transcoding
  useEffect(() => {
    const hasActive = videos.some(v => v.status === 'transcoding' || v.status === 'pending');
    if (hasActive) {
      pollRef.current = setTimeout(() => { loadVideos(); }, 3000);
    } else {
      clearTimeout(pollRef.current);
    }
    return () => clearTimeout(pollRef.current);
  }, [videos, loadVideos]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setUploadProgress(0);
    setVidError('');
    try {
      const video = await api.uploadVideoFile(galleryId, file, (p) => setUploadProgress(p));
      setVideos(prev => [...prev, video]);
      setToast('Vidéo ajoutée — transcodage en cours...');
    } catch (err) {
      setVidError(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleDelete(videoId) {
    if (!window.confirm('Supprimer cette vidéo ?')) return;
    setDeleting(videoId);
    try {
      await api.deleteVideo(galleryId, videoId);
      setVideos(prev => prev.filter(v => v.id !== videoId));
      setToast('Vidéo supprimée.');
    } catch (err) {
      setVidError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  async function handleRetranscode(videoId) {
    setRetriggering(videoId);
    try {
      const updated = await api.retranscodeVideo(galleryId, videoId);
      setVideos(prev => prev.map(v => v.id === videoId ? updated : v));
      setToast('Transcodage relancé.');
    } catch (err) {
      setVidError(err.message);
    } finally {
      setRetriggering(null);
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = videos.findIndex(v => v.id === active.id);
    const newIdx = videos.findIndex(v => v.id === over.id);
    const reordered = arrayMove(videos, oldIdx, newIdx);
    setVideos(reordered);
    try {
      await api.reorderVideos(galleryId, reordered.map(v => v.id));
    } catch (err) {
      setVidError('Reorder failed: ' + err.message);
    }
  }

  // ── Access tab state ───────────────────────────────────────────────────────
  const [tokens,       setTokens]       = useState([]);
  const [loadingTokens,setLoadingTokens]= useState(false);
  const [tokenErr,     setTokenErr]     = useState('');
  const [newLabel,     setNewLabel]     = useState('');
  const [creatingToken,setCreatingToken]= useState(false);
  const [revokingId,   setRevokingId]   = useState(null);
  const [accessReqs,   setAccessReqs]   = useState([]);
  const [loadingReqs,  setLoadingReqs]  = useState(false);
  const [copied,       setCopied]       = useState(false);

  const enrollLink = `${window.location.origin}/enroll/${galleryId}`;

  async function loadAccess() {
    setLoadingTokens(true);
    setLoadingReqs(true);
    setTokenErr('');
    try {
      const [toks, reqs] = await Promise.all([
        api.getViewerTokens(galleryId),
        api.listAccessRequests(galleryId).catch(() => []),
      ]);
      setTokens(toks);
      setAccessReqs(reqs);
    } catch (err) {
      setTokenErr(err.message);
    } finally {
      setLoadingTokens(false);
      setLoadingReqs(false);
    }
  }

  useEffect(() => {
    if (tab === 'access') loadAccess();
  }, [tab, galleryId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createToken(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setCreatingToken(true);
    setTokenErr('');
    try {
      const tok = await api.createViewerToken(galleryId, { label: newLabel.trim() });
      setTokens(prev => [tok, ...prev]);
      setNewLabel('');
    } catch (err) {
      setTokenErr(err.message);
    } finally {
      setCreatingToken(false);
    }
  }

  async function revokeToken(tokenId) {
    if (!window.confirm('Révoquer ce lien ?')) return;
    setRevokingId(tokenId);
    try {
      await api.deleteViewerToken(galleryId, tokenId);
      setTokens(prev => prev.filter(t => t.id !== tokenId));
    } catch (err) {
      setTokenErr(err.message);
    } finally {
      setRevokingId(null);
    }
  }

  function copyEnrollLink() {
    navigator.clipboard.writeText(enrollLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Stats tab state ────────────────────────────────────────────────────────
  const [stats,        setStats]        = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsErr,     setStatsErr]     = useState('');

  useEffect(() => {
    if (tab !== 'stats') return;
    setLoadingStats(true);
    setStatsErr('');
    api.getVideoStats(galleryId)
      .then(setStats)
      .catch(err => setStatsErr(err.message))
      .finally(() => setLoadingStats(false));
  }, [tab, galleryId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminPage title={t('gal_videos_title') || 'Vidéos'} maxWidth="100%">
      <AdminToast message={toast} onDone={() => setToast('')} />

      {/* Nav tabs */}
      <ul className="nav nav-tabs mb-3">
        {[
          { key: 'videos', icon: 'fa-film',    label: t('gal_tab_videos') || 'Vidéos' },
          { key: 'access', icon: 'fa-lock',    label: t('gal_tab_access') || 'Accès' },
          { key: 'stats',  icon: 'fa-chart-bar', label: t('gal_tab_stats') || 'Stats' },
        ].map(({ key, icon, label }) => (
          <li key={key} className="nav-item">
            <button
              className={`nav-link${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              <i className={`fas ${icon} me-1`} />{label}
            </button>
          </li>
        ))}
      </ul>

      {/* ── Tab: Videos ── */}
      {tab === 'videos' && (
        <div>
          <AdminAlert message={vidError} />

          {/* Legal disclaimer */}
          <div className="alert alert-warning d-flex align-items-start gap-2 py-2" role="alert">
            <i className="fas fa-exclamation-triangle mt-1 flex-shrink-0" />
            <span style={{ fontSize: '0.875rem' }}>
              Vous êtes responsable de disposer des droits nécessaires avant de publier cette vidéo.
            </span>
          </div>

          {/* Upload button */}
          <div className="mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,.mkv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <AdminButton
              icon="fas fa-upload"
              loading={uploading}
              loadingLabel="Upload en cours..."
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {t('gal_upload_video') || 'Ajouter une vidéo'}
            </AdminButton>

            {uploadProgress !== null && (
              <div className="mt-2">
                <div className="progress" style={{ height: '6px', maxWidth: '300px' }}>
                  <div
                    className="progress-bar"
                    role="progressbar"
                    style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                  />
                </div>
                <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                  {Math.round(uploadProgress * 100)}%
                </div>
              </div>
            )}
          </div>

          {/* Video list */}
          <AdminCard>
            {loadingVids ? (
              <div className="text-center py-4 text-muted">
                <i className="fas fa-spinner fa-spin fa-2x" />
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="fas fa-film fa-2x mb-3" style={{ display: 'block' }} />
                <p className="mb-0">{t('gal_no_videos') || 'Aucune vidéo. Commencez par en ajouter une.'}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={videos.map(v => v.id)} strategy={verticalListSortingStrategy}>
                    <table className="table table-hover mb-0">
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: '32px' }}></th>
                          <th>{t('proj_th_title') || 'Titre'}</th>
                          <th>{t('proj_th_status') || 'Statut'}</th>
                          <th>{t('gal_duration') || 'Durée'}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {videos.map(video => (
                          <SortableVideoRow
                            key={video.id}
                            video={video}
                            onDelete={handleDelete}
                            onRetranscode={handleRetranscode}
                            deleting={deleting}
                            retriggering={retriggering}
                            t={t}
                          />
                        ))}
                      </tbody>
                    </table>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </AdminCard>
        </div>
      )}

      {/* ── Tab: Access ── */}
      {tab === 'access' && (
        <div>
          <AdminAlert message={tokenErr} />

          {/* Enrollment link */}
          <AdminCard title={t('gal_enroll_link') || 'Lien d\'inscription'} className="mb-3">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <code style={{ wordBreak: 'break-all', flex: '1 1 auto' }}>{enrollLink}</code>
              <AdminButton
                variant={copied ? 'success' : 'outline-secondary'}
                size="sm"
                icon={`fas fa-${copied ? 'check' : 'copy'}`}
                onClick={copyEnrollLink}
              >
                {copied ? (t('copied') || 'Copié !') : (t('copy') || 'Copier')}
              </AdminButton>
            </div>
          </AdminCard>

          {/* Manual token creation */}
          <AdminCard title={t('gal_create_token') || 'Créer un lien d\'accès'} className="mb-3">
            <form onSubmit={createToken} className="d-flex gap-2 align-items-end flex-wrap">
              <AdminInput
                label={t('gal_token_label') || 'Libellé'}
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                required
                className="mb-0 flex-grow-1"
                placeholder="Ex: Famille Dupont"
              />
              <AdminButton type="submit" loading={creatingToken} loadingLabel={t('creating') || 'Création...'} icon="fas fa-plus">
                {t('create') || 'Créer'}
              </AdminButton>
            </form>
          </AdminCard>

          {/* Viewer tokens list */}
          <AdminCard title={t('gal_access_tokens') || 'Liens d\'accès'} className="mb-3">
            {loadingTokens ? (
              <div className="text-center py-3 text-muted"><i className="fas fa-spinner fa-spin" /></div>
            ) : tokens.length === 0 ? (
              <p className="text-muted mb-0">{t('gal_no_tokens') || 'Aucun lien d\'accès.'}</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>{t('gal_token_label') || 'Libellé'}</th>
                      <th>{t('created_at') || 'Créé le'}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map(tok => (
                      <tr key={tok.id}>
                        <td>{tok.label || <span className="text-muted">—</span>}</td>
                        <td className="text-muted" style={{ fontSize: '0.85rem' }}>{formatDate(tok.created_at)}</td>
                        <td className="text-end">
                          <AdminButton
                            variant="outline-danger"
                            size="sm"
                            loading={revokingId === tok.id}
                            onClick={() => revokeToken(tok.id)}
                          >
                            <i className="fas fa-ban me-1" />{t('revoke') || 'Révoquer'}
                          </AdminButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>

          {/* Access requests */}
          <AdminCard title={t('gal_access_requests') || 'Demandes d\'accès'}>
            {loadingReqs ? (
              <div className="text-center py-3 text-muted"><i className="fas fa-spinner fa-spin" /></div>
            ) : accessReqs.length === 0 ? (
              <p className="text-muted mb-0">{t('gal_no_access_requests') || 'Aucune demande d\'accès.'}</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Email</th>
                      <th>Statut</th>
                      <th>{t('created_at') || 'Demandé le'}</th>
                      <th>{t('gal_confirmed_at') || 'Confirmé le'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessReqs.map(r => (
                      <tr key={r.id}>
                        <td>{r.email}</td>
                        <td><AdminBadge color={r.status === 'confirmed' ? 'success' : 'warning'}>{r.status}</AdminBadge></td>
                        <td className="text-muted" style={{ fontSize: '0.85rem' }}>{formatDate(r.created_at)}</td>
                        <td className="text-muted" style={{ fontSize: '0.85rem' }}>{r.confirmed_at ? formatDate(r.confirmed_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>
        </div>
      )}

      {/* ── Tab: Stats ── */}
      {tab === 'stats' && (
        <div>
          <div className="alert alert-info d-flex align-items-start gap-2 py-2 mb-3" role="alert">
            <i className="fas fa-info-circle mt-1 flex-shrink-0" />
            <span style={{ fontSize: '0.875rem' }}>
              {stats?.disclaimer || "Estimation basée sur les liens d'accès, non nominative."}
            </span>
          </div>

          <AdminAlert message={statsErr} />

          {loadingStats ? (
            <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
          ) : stats ? (
            <>
              {/* Per-video stats */}
              <AdminCard title={t('gal_stats_per_video') || 'Statistiques par vidéo'} className="mb-3">
                {stats.videos?.length === 0 ? (
                  <p className="text-muted mb-0">{t('gal_no_videos') || 'Aucune vidéo.'}</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>{t('proj_th_title') || 'Titre'}</th>
                          <th>{t('gal_duration') || 'Durée'}</th>
                          <th>{t('gal_stats_sessions') || 'Sessions (plays)'}</th>
                          <th>{t('gal_stats_max_pos') || 'Position max'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.videos?.map(v => (
                          <tr key={v.id}>
                            <td>{v.title || v.slug}</td>
                            <td className="text-muted">{formatDuration(v.duration_sec)}</td>
                            <td>{v.total_plays ?? 0}</td>
                            <td className="text-muted">{formatDuration(v.max_position_reached)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminCard>

              {/* Per-token stats */}
              <AdminCard title={t('gal_stats_per_token') || 'Statistiques par lien d\'accès'}>
                {stats.tokens?.length === 0 ? (
                  <p className="text-muted mb-0">{t('gal_no_tokens') || 'Aucun lien d\'accès.'}</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>{t('gal_token_label') || 'Libellé'}</th>
                          <th>{t('gal_stats_sessions') || 'Sessions (plays)'}</th>
                          <th>{t('gal_stats_max_pos') || 'Position max'}</th>
                          <th>{t('gal_stats_last_view') || 'Dernière vue'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.tokens?.map(tok => (
                          <tr key={tok.token_id}>
                            <td>{tok.label || <span className="text-muted">—</span>}</td>
                            <td>{tok.session_count ?? 0}</td>
                            <td className="text-muted">{formatDuration(tok.max_position_reached)}</td>
                            <td className="text-muted" style={{ fontSize: '0.85rem' }}>{tok.last_view_at ? formatDate(tok.last_view_at) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminCard>
            </>
          ) : null}
        </div>
      )}
    </AdminPage>
  );
}

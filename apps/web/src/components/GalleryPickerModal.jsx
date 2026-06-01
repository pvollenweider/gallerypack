// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api.js';
import AdminModal from './ui/AdminModal.jsx';

/**
 * GalleryPickerModal — pick a destination gallery from the current org.
 *
 * @param {string}   title              - Modal heading
 * @param {string}   orgId              - Org whose projects/galleries to list
 * @param {string}   currentGalleryId   - Excluded from the list
 * @param {function} onSelect           - (galleryId, galleryTitle) => void
 * @param {function} onClose            - () => void
 */
export default function GalleryPickerModal({ title, orgId, currentGalleryId, onSelect, onClose }) {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.listProjects(orgId)
      .then(async (projs) => {
        const withGalleries = await Promise.all(
          projs.map(async (proj) => {
            try {
              const galleries = await api.getProjectGalleries(proj.id);
              return { ...proj, galleries };
            } catch {
              return { ...proj, galleries: [] };
            }
          })
        );
        setProjects(withGalleries);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .map(proj => ({
        ...proj,
        galleries: (proj.galleries || []).filter(g =>
          g.id !== currentGalleryId &&
          (!q || g.title?.toLowerCase().includes(q) || proj.name?.toLowerCase().includes(q))
        ),
      }))
      .filter(proj => proj.galleries.length > 0);
  }, [projects, search, currentGalleryId]);

  const totalCount = filtered.reduce((sum, p) => sum + p.galleries.length, 0);

  return (
    <AdminModal open onClose={onClose} title={title} size="md" footer={false}>
      <div style={{ marginBottom: '0.75rem' }}>
        <input
          type="search"
          className="form-control form-control-sm"
          placeholder="Search galleries…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {loading && (
        <div className="text-center py-4 text-muted">
          <i className="fas fa-spinner fa-spin me-2" />Loading galleries…
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-danger py-2" style={{ fontSize: '0.85rem' }}>{error}</div>
      )}

      {!loading && !error && totalCount === 0 && (
        <div className="text-center py-4 text-muted" style={{ fontSize: '0.9rem' }}>
          No galleries found.
        </div>
      )}

      {!loading && !error && totalCount > 0 && (
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {filtered.map(proj => (
            <div key={proj.id} style={{ marginBottom: '0.25rem' }}>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#6c757d',
                  padding: '0.5rem 0.25rem 0.2rem',
                }}
              >
                {proj.name}
              </div>
              {proj.galleries.map(g => (
                <button
                  key={g.id}
                  type="button"
                  className="btn btn-light w-100 text-start"
                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem', borderRadius: 4, marginBottom: 2 }}
                  onClick={() => { onSelect(g.id, g.title); onClose(); }}
                >
                  <i className="fas fa-images me-2 text-muted" style={{ fontSize: '0.75rem' }} />
                  {g.title || g.slug}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="modal-footer px-0 pb-0 pt-3">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </AdminModal>
  );
}

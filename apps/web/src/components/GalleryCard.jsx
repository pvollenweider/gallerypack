import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../lib/I18nContext.jsx';
import { formatSize } from '../lib/i18n.js';

const STATUS_COLOR = {
  done:     '#16a34a',
  updated:  '#f97316',
  building: '#ca8a04',
  error:    '#dc2626',
  draft:    '#9ca3af',
  pending:  '#6b7280',
  queued:   '#2563eb',
};

// Format a date range (from/to as YYYY-MM-DD) into a compact human label
function formatDateRange(dateRange, fallback) {
  const src = dateRange || (fallback ? { from: fallback, to: fallback } : null);
  if (!src) return null;

  const parse = s => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
    if (/^\d{4}-\d{2}$/.test(s))       return new Date(s + '-01T12:00:00');
    return null;
  };

  const from = parse(src.from);
  const to   = parse(src.to);
  if (!from) return fallback || null;

  const sameDay   = from.toISOString().slice(0, 10) === (to || from).toISOString().slice(0, 10);
  const sameMonth = from.getFullYear() === (to || from).getFullYear() &&
                    from.getMonth()    === (to || from).getMonth();
  const sameYear  = from.getFullYear() === (to || from).getFullYear();

  const monthYear  = d => d.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
  const dayMonth   = d => d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });
  const shortMonth = d => d.toLocaleDateString('fr-CH', { month: 'short', year: 'numeric' });

  if (sameDay)   return dayMonth(from);
  if (sameMonth) return monthYear(from);
  if (sameYear)  return `${from.toLocaleDateString('fr-CH', { month: 'long' })} – ${monthYear(to)}`;
  return `${shortMonth(from)} – ${shortMonth(to)}`;
}

export function GalleryCard({ gallery, onBuild, onDelete }) {
  const navigate    = useNavigate();
  const t           = useT();
  const badgeStatus = gallery.needsRebuild && gallery.buildStatus === 'done'
    ? 'updated'
    : gallery.buildStatus === 'pending'
    ? 'draft'
    : gallery.buildStatus;
  const color     = STATUS_COLOR[badgeStatus] || '#6b7280';
  const dateLabel = formatDateRange(gallery.dateRange, gallery.date);
  const [hovered, setHovered] = useState(false);

  const photoLabel = gallery.photoCount === 1
    ? t('photos_count', { n: 1 })
    : t('photos_count_plural', { n: gallery.photoCount || 0 });
  const sizeLabel = formatSize(gallery.diskSize);

  return (
    <div
      style={{ ...s.card, ...(hovered ? s.cardHover : {}) }}
      onClick={() => navigate(`/galleries/${gallery.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={s.cover}>
        {gallery.firstPhoto
          ? <img src={`/api/galleries/${gallery.id}/photos/${encodeURIComponent(gallery.firstPhoto)}/preview`} style={s.img} alt="" />
          : <div style={s.placeholder}>📷</div>}
      </div>
      <div style={s.body}>
        <h3 style={s.title}>{gallery.title || gallery.slug}</h3>
        {dateLabel && <p style={s.meta}>{dateLabel}</p>}
        <p style={s.meta}>{photoLabel}{sizeLabel ? ` · ${sizeLabel}` : ''}</p>
        <div style={s.footer}>
          <div style={s.badges}>
            <span style={{ ...s.badge, background: color }}>{t(`status_${badgeStatus}`) || badgeStatus}</span>
            {gallery.private && (
              <span style={{ ...s.badge, background: '#6b7280' }} title={t('private_indicator')}>🔒</span>
            )}
            {gallery.access === 'password' && (
              <span style={{ ...s.badge, background: '#7c3aed' }} title={t('password_indicator')}>🔑</span>
            )}
          </div>
          <div style={s.actions} onClick={e => e.stopPropagation()}>
            {gallery.buildStatus === 'done' && (
              <a href={`/${gallery.slug}/`} target="_blank" rel="noreferrer" style={s.viewBtn} title={t('view_gallery')}>↗</a>
            )}
            <button style={s.btn} onClick={() => onBuild(gallery.id)} title={t('build_action')}>▶</button>
            <button style={{ ...s.btn, color: '#dc2626' }} onClick={() => onDelete(gallery.id)} title={t('delete')}>✕</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  card:        { background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.2s' },
  cardHover:   { boxShadow: '0 8px 28px rgba(0,0,0,0.13)', transform: 'translateY(-2px)' },
  cover:       { height: 160, background: '#f4f4f4', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  img:         { width: '100%', height: '100%', objectFit: 'cover' },
  placeholder: { fontSize: '2.5rem', color: '#ccc' },
  body:        { padding: '0.75rem 1rem 0.85rem' },
  title:       { margin: '0 0 0.15rem', fontSize: '0.95rem', fontWeight: 600 },
  meta:        { margin: '0 0 0.35rem', fontSize: '0.78rem', color: '#888' },
  footer:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' },
  badges:      { display: 'flex', gap: '0.25rem', flexWrap: 'wrap' },
  badge:       { fontSize: '0.72rem', fontWeight: 600, color: '#fff', padding: '2px 7px', borderRadius: 99 },
  actions:     { display: 'flex', gap: '0.35rem' },
  btn:         { background: 'none', border: '1px solid #ddd', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: '0.8rem' },
  viewBtn:     { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 600 },
};

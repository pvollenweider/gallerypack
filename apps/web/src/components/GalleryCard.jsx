// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLocale } from '../lib/I18nContext.jsx';
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

// SVG icons (16×16 viewBox, stroke-based)
const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="10" height="8" rx="1.5"/>
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>
  </svg>
);
const KeyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5.5" cy="8" r="3.5"/>
    <path d="M9 8h5.5M12.5 8v2M11 8v1.5"/>
  </svg>
);

// Format a date range (from/to as YYYY-MM-DD) into a compact human label
function formatDateRange(dateRange, fallback, locale = 'en') {
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
  const sameMonth = from.getFullYear() === (to || from).getFullYear() && from.getMonth() === (to || from).getMonth();
  const sameYear  = from.getFullYear() === (to || from).getFullYear();
  const monthYear  = d => d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const dayMonth   = d => d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const shortMonth = d => d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  if (sameDay)   return dayMonth(from);
  if (sameMonth) return monthYear(from);
  if (sameYear)  return `${from.toLocaleDateString(locale, { month: 'long' })} – ${monthYear(to)}`;
  return `${shortMonth(from)} – ${shortMonth(to)}`;
}

export function GalleryCard({ gallery, onBuild, onDelete, canBuild = true }) {
  const navigate    = useNavigate();
  const t           = useT();
  const { locale }  = useLocale();
  const badgeStatus = gallery.needsRebuild && gallery.buildStatus === 'done'
    ? 'updated'
    : gallery.buildStatus === 'pending'
    ? 'draft'
    : gallery.buildStatus;
  const color     = STATUS_COLOR[badgeStatus] || '#6b7280';
  const dateLabel = formatDateRange(gallery.dateRange, gallery.date, locale);
  const [hovered, setHovered] = useState(false);

  const photoLabel = gallery.photoCount === 1
    ? t('photos_count', { n: 1 })
    : t('photos_count_plural', { n: gallery.photoCount || 0 });
  const sizeLabel = formatSize(gallery.diskSize);

  const isUpToDate = gallery.buildStatus === 'done' && !gallery.needsRebuild;

  return (
    <div
      style={{ ...s.card, ...(hovered ? s.cardHover : {}) }}
      onClick={() => navigate(`/galleries/${gallery.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Cover image with overlaid status icons */}
      <div style={s.cover}>
        {gallery.coverThumbnailUrl
          ? <img src={gallery.coverThumbnailUrl} style={s.img} alt="" loading="lazy" decoding="async" />
          : gallery.firstPhoto
          ? <img src={`/api/galleries/${gallery.id}/photos/${encodeURIComponent(gallery.firstPhoto)}/preview`} style={s.img} alt="" loading="lazy" decoding="async" />
          : <div style={s.placeholder}><i className="fas fa-image" /></div>}

        {/* Top-right corner badges on the image */}
        {gallery.access !== 'public' && (
          <div style={s.imgBadges}>
            {gallery.access === 'private' && (
              <span style={s.imgBadge} title={t('private_indicator')}><LockIcon /></span>
            )}
            {gallery.access === 'password' && (
              <span style={s.imgBadge} title={t('password_indicator')}><KeyIcon /></span>
            )}
          </div>
        )}
      </div>

      <div style={s.body}>
        <h3 style={s.title}>{gallery.title || gallery.slug}</h3>
        {dateLabel && <p style={s.meta}>{dateLabel}</p>}
        <p style={s.meta}>{photoLabel}{sizeLabel ? ` · ${sizeLabel}` : ''}</p>
        <div style={s.footer}>
          {/* Status badge — single, consistent style */}
          <span style={{ ...s.badge, background: color }}>{t(`status_${badgeStatus}`) || badgeStatus}</span>

          <div style={s.actions} onClick={e => e.stopPropagation()}>
            {gallery.buildStatus === 'done' && (
              <a href={`/${gallery.slug}/`} target="_blank" rel="noreferrer" style={s.viewBtn} title={t('view_gallery')}><i className="fas fa-external-link-alt" /></a>
            )}
            {canBuild && (
              <button
                style={{ ...s.btn, ...(isUpToDate ? s.btnDisabled : {}) }}
                onClick={() => onBuild(gallery.id)}
                disabled={isUpToDate}
                title={isUpToDate ? t('already_published') : t('build_action')}
              ><i className="fas fa-play" /></button>
            )}
            <button style={{ ...s.btn, color: '#dc2626' }} onClick={() => onDelete(gallery.id)} title={t('delete')}><i className="fas fa-times" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  card:        { background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.2s' },
  cardHover:   { boxShadow: '0 8px 28px rgba(0,0,0,0.13)', transform: 'translateY(-2px)' },
  cover:       { position: 'relative', height: 160, background: '#f4f4f4', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  img:         { width: '100%', height: '100%', objectFit: 'cover' },
  placeholder: { fontSize: '2.5rem', color: '#ccc' },
  imgBadges:   { position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 },
  imgBadge:    { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', borderRadius: '50%', color: '#fff' },
  body:        { padding: '0.75rem 1rem 0.85rem' },
  title:       { margin: '0 0 0.15rem', fontSize: '0.95rem', fontWeight: 600 },
  meta:        { margin: '0 0 0.35rem', fontSize: '0.78rem', color: '#888' },
  footer:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' },
  badge:       { fontSize: '0.72rem', fontWeight: 600, color: '#fff', padding: '2px 8px', borderRadius: 99 },
  actions:     { display: 'flex', gap: '0.35rem' },
  btn:         { background: 'none', border: '1px solid #ddd', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: '0.8rem' },
  btnDisabled: { opacity: 0.35, cursor: 'default' },
  viewBtn:     { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 600 },
};

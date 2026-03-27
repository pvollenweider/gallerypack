// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Chart,
  BubbleController,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminCard, AdminAlert, AdminLoader } from '../../../components/ui/index.js';

Chart.register(BubbleController, LinearScale, LogarithmicScale, PointElement, Tooltip, Legend);

/**
 * Build n log-space bins covering [10, 400] mm.
 * Each photo in rawPhotos = { filename, mm, lens }.
 * Returns bins sorted by midMm, only non-empty ones.
 */
function computeDynamicBins(rawPhotos, n) {
  const LOG_MIN = Math.log(10);
  const LOG_MAX = Math.log(400);
  const step = (LOG_MAX - LOG_MIN) / n;

  const bins = Array.from({ length: n }, (_, i) => {
    const lo  = Math.exp(LOG_MIN + i * step);
    const hi  = i === n - 1 ? Infinity : Math.exp(LOG_MIN + (i + 1) * step);
    const mid = Math.exp(LOG_MIN + (i + 0.5) * step);
    const loR = Math.round(lo);
    const hiR = hi === Infinity ? null : Math.round(hi) - 1;
    const label = hi === Infinity ? `> ${loR} mm` : `${loR}–${hiR} mm`;
    // HSL gradient: blue (220°) → red (0°)
    const hue = Math.round(220 - (i / Math.max(n - 1, 1)) * 220);
    return { key: `bin_${i}`, label, midMm: mid, lo, hi, color: `hsl(${hue}, 75%, 52%)`, photos: [], count: 0 };
  });

  for (const photo of rawPhotos) {
    for (const bin of bins) {
      if (photo.mm >= bin.lo && (bin.hi === Infinity || photo.mm < bin.hi)) {
        bin.photos.push(photo);
        bin.count++;
        break;
      }
    }
  }

  return bins.filter(b => b.count > 0);
}

/** mm representative for each server-side dominant key */
const DOMINANT_MM = {
  ultra_wide: 14, wide: 24, wide_std: 32, normal: 43,
  portrait: 68, short_tele: 110, tele: 168, super_tele: 270,
};

// ---------------------------------------------------------------------------
// FocalBubbleChart
// ---------------------------------------------------------------------------
function FocalBubbleChart({ bins, selectedKey, onBinClick }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const binsRef   = useRef(bins);
  binsRef.current = bins;

  useEffect(() => {
    if (!canvasRef.current || !bins.length) return;

    const maxCount = Math.max(...bins.map(b => b.count));
    function r(count) { return 10 + Math.sqrt(count / maxCount) * 38; }

    const datasets = bins.map(bin => {
      const isSelected = bin.key === selectedKey;
      return {
        label: bin.label,
        data: [{ x: bin.midMm, y: 1, r: r(bin.count), count: bin.count, key: bin.key }],
        backgroundColor: bin.color + (isSelected ? 'ff' : 'b0'),
        borderColor:     bin.color,
        borderWidth:     isSelected ? 3 : 2,
        hoverBackgroundColor: bin.color + 'e0',
      };
    });

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bubble',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        onClick: (_evt, elements) => {
          if (!elements.length) { onBinClick(null); return; }
          const key = binsRef.current[elements[0].datasetIndex]?.key ?? null;
          onBinClick(key);
        },
        scales: {
          x: {
            type: 'logarithmic',
            min: 8,
            max: 450,
            grid: { color: '#e5e7eb' },
            border: { display: false },
            title: { display: true, text: 'Focal length (mm, 35mm eq.)', color: '#6b7280', font: { size: 11 } },
            ticks: { color: '#6b7280', font: { size: 11 }, maxTicksLimit: 8, callback: v => `${v}mm` },
          },
          y: { display: false, min: 0, max: 2 },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: ctx => ctx[0].dataset.label,
              label: ctx => ` ${ctx.raw.count} photos — click to browse`,
            },
          },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [bins, selectedKey]);

  return (
    <div style={{ position: 'relative', height: 200, cursor: 'pointer' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoLightbox — keyboard (← → Esc) + click backdrop to close
// ---------------------------------------------------------------------------
function PhotoLightbox({ photos, index, galleryId, onClose, onPrev, onNext }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  onPrev();
      if (e.key === 'ArrowRight') onNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  if (index === null) return null;

  const photo = photos[index];
  const filename = photo.filename;
  const src = photo.thumbnail?.md ?? `/api/galleries/${galleryId}/photos/${encodeURIComponent(filename)}/preview`;
  const total = photos.length;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Prev */}
      <button
        onClick={e => { e.stopPropagation(); onPrev(); }}
        style={navBtn('left')}
        aria-label="Previous"
        disabled={index === 0}
      >
        <i className="fas fa-chevron-left" />
      </button>

      {/* Image */}
      <img
        key={filename}
        src={src}
        alt={filename}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '88vw', maxHeight: '84vh',
          objectFit: 'contain',
          borderRadius: 4,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          display: 'block',
        }}
      />

      {/* Next */}
      <button
        onClick={e => { e.stopPropagation(); onNext(); }}
        style={navBtn('right')}
        aria-label="Next"
        disabled={index === total - 1}
      >
        <i className="fas fa-chevron-right" />
      </button>

      {/* Counter + filename — top center */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.8)', fontSize: '0.82rem', textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <span>{index + 1} / {total}</span>
        <span style={{ marginLeft: 12, opacity: 0.5 }}>{filename}</span>
      </div>

      {/* Focal + lens info — bottom center */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', textAlign: 'center',
        pointerEvents: 'none',
        display: 'flex', gap: '1rem', alignItems: 'center',
      }}>
        {photo.mm && (
          <span>
            <i className="fas fa-expand-arrows-alt" style={{ marginRight: 5, opacity: 0.6 }} />
            {photo.mm} mm (35mm eq.)
          </span>
        )}
        {photo.lens && (
          <span style={{ opacity: 0.8 }}>
            <i className="fas fa-camera" style={{ marginRight: 5, opacity: 0.6 }} />
            {photo.lens}
          </span>
        )}
      </div>

      {/* Close — top right */}
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        style={{
          position: 'absolute', top: 12, right: 16,
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
          fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
        }}
        aria-label="Close"
      >
        <i className="fas fa-times" />
      </button>
    </div>
  );
}

function navBtn(side) {
  return {
    position: 'absolute', [side]: 16, top: '50%', transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
    width: 48, height: 48, color: '#fff', fontSize: '1.1rem',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
    zIndex: 1,
  };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function GalleryInsightsPage() {
  const t = useT();
  const { galleryId } = useParams();

  const [stats,         setStats]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [precision,     setPrecision]     = useState(6);
  const [selectedKey,   setSelectedKey]   = useState(null);
  const [lightboxIdx,   setLightboxIdx]   = useState(null);
  const [lightboxPhotos, setLightboxPhotos] = useState([]);

  const openLightbox  = useCallback((photos, idx) => { setLightboxPhotos(photos); setLightboxIdx(idx); }, []);
  const closeLightbox = useCallback(() => setLightboxIdx(null), []);
  const prevPhoto     = useCallback(() => setLightboxIdx(i => Math.max(0, i - 1)), []);
  const nextPhoto     = useCallback(() => setLightboxIdx(i => Math.min(lightboxPhotos.length - 1, i + 1)), [lightboxPhotos.length]);

  useEffect(() => {
    api.getFocalStats(galleryId)
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [galleryId]);

  // Reset selection when precision changes
  useEffect(() => { setSelectedKey(null); }, [precision]);

  const activeBins = useMemo(() => {
    if (!stats?.photos) return [];
    return computeDynamicBins(stats.photos, precision);
  }, [stats, precision]);

  if (loading) return <AdminLoader label={t('insights_focal_loading')} />;
  if (error)   return <AdminAlert message={error} className="m-3" />;

  const { total, withData, dominant } = stats;
  const isEmpty = total === 0;
  const noExif  = withData === 0 && total > 0;
  const missing = total - withData;
  const pct     = total > 0 ? Math.round((withData / total) * 100) : 0;

  // Resolve dominant label from active bins using the server-provided key
  const dominantBin = dominant ? activeBins.find(b => {
    const mm = DOMINANT_MM[dominant];
    return mm !== undefined && mm >= b.lo && (b.hi === Infinity || mm < b.hi);
  }) : null;

  return (
    <div className="p-3">
      <PhotoLightbox
        photos={lightboxPhotos}
        index={lightboxIdx}
        galleryId={galleryId}
        onClose={closeLightbox}
        onPrev={prevPhoto}
        onNext={nextPhoto}
      />

      <h4 className="mb-3">{t('insights_focal_section')}</h4>

      {/* Auto-insights summary cards */}
      {stats?.insights && (stats.insights.focal || stats.insights.wideTele) && (
        <div className="mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
          {[
            { key: 'focal',    icon: '🔭', insight: stats.insights.focal },
            { key: 'wideTele', icon: '↔️', insight: stats.insights.wideTele },
          ].filter(c => c.insight).map(({ key, icon, insight }) => (
            <div key={key} className="card border-0 shadow-sm" style={{ background: 'var(--bs-tertiary-bg, #f8f9fa)' }}>
              <div className="card-body p-3">
                <div className="fw-semibold mb-1" style={{ fontSize: '0.9rem' }}>
                  <span className="me-2">{icon}</span>{insight.headline}
                </div>
                <div className="text-muted" style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>{insight.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isEmpty && <AdminAlert variant="secondary" message={t('insights_focal_not_built')} />}
      {!isEmpty && noExif && <AdminAlert variant="warning" message={t('insights_focal_no_data')} />}

      {!isEmpty && !noExif && (
        <>
          {/* KPI row */}
          <div className="d-flex gap-3 mb-4 flex-wrap">
            <div className="card px-4 py-3 text-center" style={{ minWidth: 110 }}>
              <div className="fs-3 fw-bold text-primary">{pct}%</div>
              <div className="text-muted small">focal data</div>
            </div>
            <div className="card px-4 py-3 text-center" style={{ minWidth: 110 }}>
              <div className="fs-3 fw-bold text-secondary">{withData}</div>
              <div className="text-muted small">photos analysed</div>
            </div>
            {dominantBin && (
              <div className="card px-4 py-3 text-center" style={{ minWidth: 140 }}>
                <div className="fw-semibold" style={{ color: dominantBin.color }}>{dominantBin.label}</div>
                <div className="text-muted small">{t('insights_focal_dominant')}</div>
              </div>
            )}
          </div>

          {/* Precision slider */}
          <div className="d-flex align-items-center gap-3 mb-3">
            <label className="text-muted small mb-0" style={{ whiteSpace: 'nowrap' }}>
              {t('insights_precision') || 'Precision'}
            </label>
            <input
              type="range"
              min={2}
              max={12}
              value={precision}
              onChange={e => setPrecision(Number(e.target.value))}
              className="form-range"
              style={{ flex: 1, maxWidth: 200 }}
            />
            <span className="text-muted small" style={{ minWidth: 60 }}>
              {activeBins.length} {activeBins.length === 1 ? 'range' : 'ranges'}
            </span>
          </div>

          {/* Bubble chart */}
          <AdminCard className="mb-3">
            <FocalBubbleChart
              bins={activeBins}
              selectedKey={selectedKey}
              onBinClick={key => setSelectedKey(prev => prev === key ? null : key)}
            />
          </AdminCard>

          {/* Photo thumbnails for selected bin */}
          {selectedKey && (() => {
            const bin = activeBins.find(b => b.key === selectedKey);
            if (!bin) return null;
            return (
              <AdminCard
                className="mb-3"
                title={bin.label}
                headerRight={
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setSelectedKey(null)}
                  />
                }
              >
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                  gap: '0.5rem',
                }}>
                  {bin.photos.map((photo, idx) => (
                    <div
                      key={photo.filename}
                      title={`${photo.filename}${photo.lens ? ` — ${photo.lens}` : ''}`}
                      onClick={() => openLightbox(bin.photos, idx)}
                      style={{ borderRadius: 4, overflow: 'hidden', aspectRatio: '1', background: '#f3f4f6', cursor: 'pointer' }}
                    >
                      <img
                        src={photo.thumbnail?.sm ?? `/api/galleries/${galleryId}/photos/${encodeURIComponent(photo.filename)}/preview`}
                        alt={photo.filename}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.15s' }}
                        loading="lazy"
                        decoding="async"
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
                        onMouseLeave={e => e.currentTarget.style.transform = ''}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-muted small mb-0 mt-2">{bin.count} photo{bin.count > 1 ? 's' : ''}</p>
              </AdminCard>
            );
          })()}

          {/* Legend table */}
          <AdminCard>
            <table className="table table-sm mb-0">
              <tbody>
                {[...activeBins].sort((a, b) => a.midMm - b.midMm).map(bin => {
                  const share = withData > 0 ? Math.round((bin.count / withData) * 100) : 0;
                  return (
                    <tr
                      key={bin.key}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedKey(prev => prev === bin.key ? null : bin.key)}
                    >
                      <td style={{ width: 12, padding: '6px 8px' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: bin.color }} />
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{bin.label}</td>
                      <td className="text-muted text-end" style={{ fontSize: '0.85rem', width: 60 }}>{bin.count}</td>
                      <td style={{ width: 80 }}>
                        <div className="progress" style={{ height: 6 }}>
                          <div className="progress-bar" role="progressbar"
                            style={{ width: `${share}%`, background: bin.color }} />
                        </div>
                      </td>
                      <td className="text-muted text-end" style={{ fontSize: '0.75rem', width: 40 }}>{share}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminCard>

          {missing > 0 && (
            <p className="text-muted small mt-2">
              {t('insights_focal_missing_hint').replace('{missing}', missing)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

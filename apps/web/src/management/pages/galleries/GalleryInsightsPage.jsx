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

// ── Dynamic log-space binning (focal tab) ─────────────────────────────────────

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
    const hue = Math.round(220 - (i / Math.max(n - 1, 1)) * 220);
    return { key: `bin_${i}`, label, midMm: mid, lo, hi, color: `hsl(${hue}, 75%, 52%)`, photos: [], count: 0 };
  });
  for (const photo of rawPhotos) {
    for (const bin of bins) {
      if (photo.mm >= bin.lo && (bin.hi === Infinity || photo.mm < bin.hi)) {
        bin.photos.push(photo); bin.count++; break;
      }
    }
  }
  return bins.filter(b => b.count > 0);
}

const DOMINANT_MM = {
  ultra_wide: 14, wide: 24, wide_std: 32, normal: 43,
  portrait: 68, short_tele: 110, tele: 168, super_tele: 270,
};

// ── FocalBubbleChart ──────────────────────────────────────────────────────────

function FocalBubbleChart({ bins, selectedKey, onBinClick, browseLabel = 'click to browse' }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const binsRef   = useRef(bins);
  binsRef.current = bins;

  useEffect(() => {
    if (!canvasRef.current || !bins.length) return;
    const maxCount = Math.max(...bins.map(b => b.count));
    function r(count) { return 10 + Math.sqrt(count / maxCount) * 38; }
    // Convert hsl(h,s,l) → hsla(h,s,l,alpha) for valid CSS
    const withAlpha = (hsl, a) => hsl.replace(/^hsl\(/, 'hsla(').replace(/\)$/, `, ${a})`);
    const datasets = bins.map(bin => {
      const isSelected = bin.key === selectedKey;
      return {
        label: bin.label,
        data: [{ x: bin.midMm, y: 1, r: r(bin.count), count: bin.count, key: bin.key }],
        backgroundColor:      withAlpha(bin.color, isSelected ? 1 : 0.69),
        borderColor:          bin.color,
        borderWidth:          isSelected ? 3 : 2,
        hoverBackgroundColor: withAlpha(bin.color, 0.88),
      };
    });
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bubble',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        onClick: (_evt, elements) => {
          if (!elements.length) { onBinClick(null); return; }
          const key = binsRef.current[elements[0].datasetIndex]?.key ?? null;
          onBinClick(key);
        },
        scales: {
          x: {
            type: 'logarithmic', min: 8, max: 450,
            grid: { color: '#e5e7eb' }, border: { display: false },
            title: { display: true, text: 'Focal length (mm, 35mm eq.)', color: '#6b7280', font: { size: 11 } },
            ticks: { color: '#6b7280', font: { size: 11 }, maxTicksLimit: 8, callback: v => `${v}mm` },
          },
          y: { display: false, min: 0, max: 2 },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: ctx => ctx[0].dataset.label,
            label: ctx => ` ${ctx.raw.count} photos — ${browseLabel}`,
          }},
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

// ── CategoryChart — horizontal bars for discrete metrics ─────────────────────

function CategoryChart({ items, color = '#6366f1', withData, total, selectedLabel, onItemClick, t }) {
  if (!items || items.length === 0) return (
    <p className="text-muted small mb-0">{t('insights_no_data')}</p>
  );
  const maxCount = Math.max(...items.map(i => i.count));
  const coverage = total > 0 ? Math.round((withData / total) * 100) : 0;
  const coverageText = t('insights_photos_coverage')
    .replace('{withData}', withData).replace('{total}', total).replace('{pct}', coverage);
  return (
    <div>
      <p className="text-muted small mb-3">{coverageText}</p>
      {items.map((item, idx) => {
        const barPct = maxCount > 0 ? Math.round((item.count / maxCount) * 100) : 0;
        const isOther = item.label === 'Other';
        const isSelected = item.label === selectedLabel;
        const hasPhotos = onItemClick && !isOther && item.photos?.length > 0;
        return (
          <div key={item.label} className="mb-2"
            onClick={hasPhotos ? () => onItemClick(isSelected ? null : item) : undefined}
            style={{ cursor: hasPhotos ? 'pointer' : 'default' }}>
            <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.82rem' }}>
              <span className={isOther ? 'text-muted' : (isSelected ? 'fw-semibold' : '')} style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%',
                color: isSelected ? color : undefined,
              }} title={item.label}>{item.label}</span>
              <span className="text-muted ms-2" style={{ flexShrink: 0 }}>{item.count} ({item.pct}%)</span>
            </div>
            <div className="progress" style={{ height: isSelected ? 10 : 8 }}>
              <div
                className="progress-bar"
                role="progressbar"
                style={{
                  width: `${barPct}%`,
                  background: isOther ? '#9ca3af' : color,
                  opacity: isSelected ? 1 : (0.85 + (idx === 0 ? 0.15 : 0)),
                }}
                aria-valuenow={barPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── PhotoLightbox ─────────────────────────────────────────────────────────────

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
  const photo    = photos[index];
  const filename = photo.filename;
  const src      = photo.thumbnail?.md ?? `/api/galleries/${galleryId}/photos/${encodeURIComponent(filename)}/preview`;
  const total    = photos.length;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <button onClick={e => { e.stopPropagation(); onPrev(); }} style={navBtn('left')}
        aria-label="Previous" disabled={index === 0}>
        <i className="fas fa-chevron-left" />
      </button>
      <img key={filename} src={src} alt={filename} onClick={e => e.stopPropagation()} style={{
        maxWidth: '88vw', maxHeight: '84vh', objectFit: 'contain',
        borderRadius: 4, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', display: 'block',
      }} />
      <button onClick={e => { e.stopPropagation(); onNext(); }} style={navBtn('right')}
        aria-label="Next" disabled={index === total - 1}>
        <i className="fas fa-chevron-right" />
      </button>
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.8)', fontSize: '0.82rem', textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <span>{index + 1} / {total}</span>
        <span style={{ marginLeft: 12, opacity: 0.5 }}>{filename}</span>
      </div>
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem',
        display: 'flex', gap: '1rem', alignItems: 'center', pointerEvents: 'none',
      }}>
        {photo.mm           && <span><i className="fas fa-expand-arrows-alt" style={{ marginRight: 5, opacity: 0.6 }} />{photo.mm} mm (35mm eq.)</span>}
        {photo.lens         && <span style={{ opacity: 0.8 }}><i className="fas fa-camera-retro" style={{ marginRight: 5, opacity: 0.6 }} />{photo.lens}</span>}
        {photo.camera       && <span style={{ opacity: 0.8 }}><i className="fas fa-camera" style={{ marginRight: 5, opacity: 0.6 }} />{photo.camera}</span>}
        {photo.photographer && <span style={{ opacity: 0.8 }}><i className="fas fa-user" style={{ marginRight: 5, opacity: 0.6 }} />{photo.photographer}</span>}
      </div>
      <button onClick={e => { e.stopPropagation(); onClose(); }} style={{
        position: 'absolute', top: 12, right: 16,
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
        fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
      }} aria-label="Close">
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
    transition: 'background 0.15s', zIndex: 1,
  };
}

// ── Auto-insight cards ────────────────────────────────────────────────────────

const INSIGHT_META = [
  { key: 'focal',    icon: '🔭', label: 'Focal length' },
  { key: 'wideTele', icon: '↔️', label: 'Wide / tele balance' },
  { key: 'aperture', icon: '🎯', label: 'Aperture' },
  { key: 'shutter',  icon: '⚡',  label: 'Shutter speed' },
  { key: 'iso',      icon: '🔆',  label: 'ISO sensitivity' },
  { key: 'lens',     icon: '📷',  label: 'Lens' },
];

function InsightCards({ insights }) {
  const cards = INSIGHT_META.map(m => ({ ...m, insight: insights?.[m.key] })).filter(c => c.insight);
  if (!cards.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: '0.75rem' }}>
      {cards.map(({ key, icon, insight }) => (
        <div key={key} className="card border-0 shadow-sm" style={{ background: 'var(--bs-tertiary-bg, #f8f9fa)' }}>
          <div className="card-body p-3">
            <div className="fw-semibold mb-1" style={{ fontSize: '0.9rem' }}>
              <span className="me-2" aria-hidden="true">{icon}</span>{insight.headline}
            </div>
            <div className="text-muted" style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>{insight.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'summary',  labelKey: 'insights_tab_summary',  icon: 'fas fa-lightbulb' },
  { id: 'focal',    labelKey: 'insights_tab_focal',    icon: 'fas fa-expand-arrows-alt' },
  { id: 'lens',     labelKey: 'insights_tab_lens',     icon: 'fas fa-camera' },
  { id: 'aperture', labelKey: 'insights_tab_aperture', icon: 'fas fa-circle-notch' },
  { id: 'shutter',  labelKey: 'insights_tab_shutter',  icon: 'fas fa-bolt' },
  { id: 'iso',      labelKey: 'insights_tab_iso',      icon: 'fas fa-sun' },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GalleryInsightsPage() {
  const t = useT();
  const { galleryId } = useParams();

  const [insights,      setInsights]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [activeTab,     setActiveTab]     = useState('focal');
  const [precision,     setPrecision]     = useState(6);
  const [selectedKey,   setSelectedKey]   = useState(null);
  const [lightboxIdx,   setLightboxIdx]   = useState(null);
  const [lightboxPhotos, setLightboxPhotos] = useState([]);
  const [selectedCatItem, setSelectedCatItem] = useState(null);

  const openLightbox  = useCallback((photos, idx) => { setLightboxPhotos(photos); setLightboxIdx(idx); }, []);
  const closeLightbox = useCallback(() => setLightboxIdx(null), []);
  const prevPhoto     = useCallback(() => setLightboxIdx(i => Math.max(0, i - 1)), []);
  const nextPhoto     = useCallback(() => setLightboxIdx(i => Math.min(lightboxPhotos.length - 1, i + 1)), [lightboxPhotos.length]);

  useEffect(() => {
    // Try new unified endpoint first, fall back to focal-stats
    api.getGalleryInsights(galleryId)
      .then(setInsights)
      .catch(() => api.getFocalStats(galleryId).then(d => setInsights({ focal: d, insights: d.insights })))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [galleryId]);

  useEffect(() => { setSelectedKey(null); setSelectedCatItem(null); }, [precision, activeTab]);

  const focalData = insights?.focal ?? null;
  const activeBins = useMemo(() => {
    if (!focalData?.photos) return [];
    return computeDynamicBins(focalData.photos, precision);
  }, [focalData, precision]);

  if (loading) return <AdminLoader label={t('insights_focal_loading')} />;
  if (error)   return <AdminAlert message={error} className="m-3" />;

  const total    = focalData?.total ?? 0;
  const withData = focalData?.withData ?? 0;
  const dominant = focalData?.dominant ?? null;
  const isEmpty  = total === 0;
  const noExif   = withData === 0 && total > 0;
  const missing  = total - withData;
  const pct      = total > 0 ? Math.round((withData / total) * 100) : 0;

  const dominantBin = dominant ? activeBins.find(b => {
    const mm = DOMINANT_MM[dominant];
    return mm !== undefined && mm >= b.lo && (b.hi === Infinity || mm < b.hi);
  }) : null;

  // Check if V1 data (lens/aperture/etc.) is available
  const hasFullInsights = !!(insights?.lens || insights?.aperture);

  return (
    <div className="p-3">
      <PhotoLightbox
        photos={lightboxPhotos} index={lightboxIdx} galleryId={galleryId}
        onClose={closeLightbox} onPrev={prevPhoto} onNext={nextPhoto}
      />

      <h4 className="mb-3">{t('insights_focal_section')}</h4>

      {/* Tab bar */}
      <ul className="nav nav-tabs mb-3" style={{ overflowX: 'auto', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
        {TABS.filter(tab => tab.id === 'summary' || tab.id === 'focal' || hasFullInsights).map(tab => (
          <li key={tab.id} className="nav-item" style={{ flexShrink: 0 }}>
            <button
              className={`nav-link${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              style={{ whiteSpace: 'nowrap' }}
            >
              <i className={`${tab.icon} me-1`} style={{ fontSize: '0.8rem' }} />
              {t(tab.labelKey)}
            </button>
          </li>
        ))}
      </ul>

      {isEmpty && <AdminAlert variant="secondary" message={t('insights_focal_not_built')} />}
      {!isEmpty && noExif && activeTab !== 'summary' && <AdminAlert variant="warning" message={t('insights_focal_no_data')} />}

      {/* Summary tab */}
      {activeTab === 'summary' && (
        <div>
          {isEmpty
            ? <AdminAlert variant="secondary" message={t('insights_focal_not_built')} />
            : insights?.insights && Object.values(insights.insights).some(Boolean)
              ? <InsightCards insights={insights.insights} />
              : <AdminAlert variant="secondary" message={t('insights_not_enough_data')} />
          }
        </div>
      )}

      {/* Focal tab */}
      {activeTab === 'focal' && !isEmpty && !noExif && (
        <>
          <div className="d-flex gap-3 mb-4 flex-wrap">
            <div className="card px-4 py-3 text-center" style={{ minWidth: 110 }}>
              <div className="fs-3 fw-bold text-primary">{pct}%</div>
              <div className="text-muted small">{t('insights_focal_data_label')}</div>
            </div>
            <div className="card px-4 py-3 text-center" style={{ minWidth: 110 }}>
              <div className="fs-3 fw-bold text-secondary">{withData}</div>
              <div className="text-muted small">{t('insights_photos_analysed')}</div>
            </div>
            {dominantBin && (
              <div className="card px-4 py-3 text-center" style={{ minWidth: 140 }}>
                <div className="fw-semibold" style={{ color: dominantBin.color }}>{dominantBin.label}</div>
                <div className="text-muted small">{t('insights_focal_dominant')}</div>
              </div>
            )}
          </div>
          <div className="d-flex align-items-center gap-3 mb-3">
            <label className="text-muted small mb-0" style={{ whiteSpace: 'nowrap' }}>
              {t('insights_precision') || 'Precision'}
            </label>
            <input type="range" min={2} max={12} value={precision}
              onChange={e => setPrecision(Number(e.target.value))}
              className="form-range" style={{ flex: 1, maxWidth: 200 }} />
            <span className="text-muted small" style={{ minWidth: 60 }}>
              {activeBins.length} {activeBins.length === 1 ? t('insights_range_singular') : t('insights_ranges_plural')}
            </span>
          </div>
          <AdminCard className="mb-3">
            <FocalBubbleChart bins={activeBins} selectedKey={selectedKey}
              browseLabel={t('insights_click_browse')}
              onBinClick={key => setSelectedKey(prev => prev === key ? null : key)} />
          </AdminCard>
          {selectedKey && (() => {
            const bin = activeBins.find(b => b.key === selectedKey);
            if (!bin) return null;
            return (
              <AdminCard className="mb-3" title={bin.label}
                headerRight={<button type="button" className="btn-close" aria-label="Close" onClick={() => setSelectedKey(null)} />}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.5rem' }}>
                  {bin.photos.map((photo, idx) => (
                    <div key={photo.filename}
                      title={`${photo.filename}${photo.lens ? ` — ${photo.lens}` : ''}`}
                      onClick={() => openLightbox(bin.photos, idx)}
                      style={{ borderRadius: 4, overflow: 'hidden', aspectRatio: '1', background: '#f3f4f6', cursor: 'pointer' }}>
                      <img
                        src={photo.thumbnail?.sm ?? `/api/galleries/${galleryId}/photos/${encodeURIComponent(photo.filename)}/preview`}
                        alt={photo.filename}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.15s' }}
                        loading="lazy" decoding="async"
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
                        onMouseLeave={e => e.currentTarget.style.transform = ''} />
                    </div>
                  ))}
                </div>
                <p className="text-muted small mb-0 mt-2">{bin.count} photo{bin.count > 1 ? 's' : ''}</p>
              </AdminCard>
            );
          })()}
          <AdminCard>
            <table className="table table-sm mb-0">
              <tbody>
                {[...activeBins].sort((a, b) => a.midMm - b.midMm).map(bin => {
                  const share = withData > 0 ? Math.round((bin.count / withData) * 100) : 0;
                  return (
                    <tr key={bin.key} style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedKey(prev => prev === bin.key ? null : bin.key)}>
                      <td style={{ width: 12, padding: '6px 8px' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: bin.color }} />
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{bin.label}</td>
                      <td className="text-muted text-end" style={{ fontSize: '0.85rem', width: 60 }}>{bin.count}</td>
                      <td style={{ width: 80 }}>
                        <div className="progress" style={{ height: 6 }}>
                          <div className="progress-bar" role="progressbar" style={{ width: `${share}%`, background: bin.color }} />
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

      {/* Lens / Aperture / Shutter / ISO tabs — CategoryChart */}
      {['lens', 'aperture', 'shutter', 'iso'].includes(activeTab) && !isEmpty && (() => {
        const metric = insights?.[activeTab];
        if (!metric) return <AdminAlert variant="secondary" message={t('insights_data_not_available')} />;
        if (metric.withData === 0) return <AdminAlert variant="warning" message={t('insights_no_data')} />;

        const COLORS = { lens: '#8b5cf6', aperture: '#0ea5e9', shutter: '#f59e0b', iso: '#10b981' };
        const SUBTITLE_KEYS = {
          lens:     'insights_lens_subtitle',
          aperture: 'insights_aperture_subtitle',
          shutter:  'insights_shutter_subtitle',
          iso:      'insights_iso_subtitle',
        };

        return (
          <>
            <AdminCard title={t(SUBTITLE_KEYS[activeTab])}>
              <CategoryChart
                items={metric.items}
                color={COLORS[activeTab]}
                withData={metric.withData}
                total={metric.total}
                selectedLabel={selectedCatItem?.label ?? null}
                onItemClick={setSelectedCatItem}
                t={t}
              />
            </AdminCard>
            {selectedCatItem?.photos?.length > 0 && (
              <AdminCard className="mb-3" title={selectedCatItem.label}
                headerRight={<button type="button" className="btn-close" aria-label="Close" onClick={() => setSelectedCatItem(null)} />}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.5rem' }}>
                  {selectedCatItem.photos.map((photo, idx) => (
                    <div key={photo.filename}
                      title={photo.filename}
                      onClick={() => openLightbox(selectedCatItem.photos, idx)}
                      style={{ borderRadius: 4, overflow: 'hidden', aspectRatio: '1', background: '#f3f4f6', cursor: 'pointer' }}>
                      <img
                        src={photo.thumbnail?.sm ?? `/api/galleries/${galleryId}/photos/${encodeURIComponent(photo.filename)}/preview`}
                        alt={photo.filename}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.15s' }}
                        loading="lazy" decoding="async"
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
                        onMouseLeave={e => e.currentTarget.style.transform = ''} />
                    </div>
                  ))}
                </div>
                <p className="text-muted small mb-0 mt-2">{selectedCatItem.photos.length} photo{selectedCatItem.photos.length > 1 ? 's' : ''}</p>
              </AdminCard>
            )}
          </>
        );
      })()}
    </div>
  );
}

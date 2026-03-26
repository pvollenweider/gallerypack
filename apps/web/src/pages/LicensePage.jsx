// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

const FEATURE_LABELS = {
  multi_organization: 'Multiple organizations',
  custom_domain:      'Custom domain',
  white_label:        'White-label branding',
  api_access:         'API access',
};
const LIMIT_LABELS = {
  organization_limit: 'Organizations',
  gallery_limit:      'Galleries per organization',
  storage_gb:         'Storage (GB)',
  collaborator_limit: 'Collaborators per organization',
};

export default function LicensePage() {
  const t = useT();
  const [info,      setInfo]      = useState(null);
  const [error,     setError]     = useState('');
  const [pasting,   setPasting]   = useState(false);
  const [json,      setJson]      = useState('');
  const [installing,setInstalling]= useState(false);
  const [installMsg,setInstallMsg]= useState(null); // { ok, text }

  useEffect(() => { load(); }, []);

  async function load() {
    try { setInfo(await api.getPlatformLicense()); }
    catch (e) { setError(e.message); }
  }

  async function handleInstall(e) {
    e.preventDefault();
    setInstalling(true);
    setInstallMsg(null);
    try {
      const res = await api.installPlatformLicense(json.trim());
      setInfo(res.license);
      setJson('');
      setPasting(false);
      setInstallMsg({ ok: true, text: t('license_install_success') });
    } catch (err) {
      setInstallMsg({ ok: false, text: err.message });
    } finally {
      setInstalling(false);
    }
  }

  if (error) return <div style={s.page}><p style={{ color: '#c00', padding: '2rem' }}>{error}</p></div>;
  if (!info)  return <div style={s.page}><p style={s.dim}>Loading…</p></div>;

  const isLicensed = info.source === 'license';
  const isExpired  = info.source === 'expired';
  const isFree     = !isLicensed && !isExpired;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <Link to="/" style={s.back}>← {t('back')}</Link>
        <h1 style={s.title}>{t('license_page_title')}</h1>
      </div>

      {installMsg && (
        <div style={{ ...s.notice, ...(installMsg.ok ? s.noticeGreen : s.noticeRed) }}>
          {installMsg.ok ? '✓ ' : '✗ '}{installMsg.text}
        </div>
      )}

      <div style={s.card}>
        {/* Status badge */}
        <div style={{ ...s.statusBadge, ...(isLicensed ? s.badgeValid : isExpired ? s.badgeExpired : s.badgeFree) }}>
          {isLicensed ? t('license_status_valid') : isExpired ? t('license_status_expired') : t('license_status_free')}
        </div>

        {/* Free / expired notice */}
        {(isFree || isExpired) && (
          <div style={s.freeNotice}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {isExpired ? t('license_expired_heading') : t('license_free_heading')}
            </p>
            {info.error && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#c00' }}>{info.error}</p>}
          </div>
        )}

        {/* Licensee */}
        {info.licensee && (
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('license_licensee')}</div>
            <div style={s.row}><span style={s.label}>{t('license_name')}</span><span>{info.licensee.name}</span></div>
            <div style={s.row}><span style={s.label}>{t('license_email')}</span><span>{info.licensee.email}</span></div>
          </div>
        )}

        {/* Dates */}
        {(info.issued_at || info.expires_at !== undefined) && (
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('license_validity')}</div>
            {info.issued_at && (
              <div style={s.row}>
                <span style={s.label}>{t('license_issued_at')}</span>
                <span>{new Date(info.issued_at).toLocaleDateString()}</span>
              </div>
            )}
            <div style={s.row}>
              <span style={s.label}>{t('license_expires_at')}</span>
              <span>{info.expires_at ? new Date(info.expires_at).toLocaleDateString() : t('license_never')}</span>
            </div>
          </div>
        )}

        {/* Features */}
        <div style={s.section}>
          <div style={s.sectionTitle}>{t('license_features')}</div>
          {(info.features?.length ?? 0) === 0 ? (
            <p style={s.dim}>{t('license_no_features')}</p>
          ) : (
            <div style={s.chips}>
              {info.features.map(f => <span key={f} style={s.chip}>{FEATURE_LABELS[f] ?? f}</span>)}
            </div>
          )}
        </div>

        {/* Limits */}
        {Object.keys(info.limits ?? {}).length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('license_limits')}</div>
            <table style={s.table}>
              <tbody>
                {Object.entries(info.limits).map(([k, v]) => (
                  <tr key={k}>
                    <td style={s.tdLabel}>{LIMIT_LABELS[k] ?? k}</td>
                    <td style={s.tdValue}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Install / update license ─────────────────────────────────────── */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={s.sectionTitle} >{isLicensed ? t('license_update_title') : t('license_install_title')}</div>
          {!pasting && (
            <button style={s.outlineBtn} onClick={() => setPasting(true)}>
              {isLicensed ? t('license_update_btn') : t('license_install_btn')}
            </button>
          )}
        </div>

        {!pasting && (isFree || isExpired) && (
          <p style={{ ...s.dim, marginTop: '0.75rem' }}>{t('license_install_hint')}</p>
        )}

        {pasting && (
          <form onSubmit={handleInstall} style={{ marginTop: '0.75rem' }}>
            <textarea
              style={s.textarea}
              rows={10}
              placeholder={'{\n  "payload": { ... },\n  "signature": "..."\n}'}
              value={json}
              onChange={e => setJson(e.target.value)}
              autoFocus
              spellCheck={false}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button style={s.primaryBtn} type="submit" disabled={!json.trim() || installing}>
                {installing ? t('license_installing') : t('license_apply_btn')}
              </button>
              <button style={s.outlineBtn} type="button" onClick={() => { setPasting(false); setJson(''); setInstallMsg(null); }}>
                {t('cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const s = {
  page:         { maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem' },
  header:       { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' },
  back:         { color: '#888', textDecoration: 'none', fontSize: '0.875rem' },
  title:        { margin: 0, fontSize: '1.3rem', fontWeight: 700 },
  notice:       { padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.875rem', marginBottom: '1rem', border: '1px solid' },
  noticeGreen:  { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' },
  noticeRed:    { background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' },
  card:         { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  statusBadge:  { alignSelf: 'flex-start', display: 'inline-block', padding: '0.3rem 0.9rem', borderRadius: 99, fontWeight: 700, fontSize: '0.8rem', marginBottom: '1rem' },
  badgeValid:   { background: '#dcfce7', color: '#166534' },
  badgeExpired: { background: '#fef9c3', color: '#713f12' },
  badgeFree:    { background: '#f3f4f6', color: '#374151' },
  freeNotice:   { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.875rem 1rem', marginBottom: '0.75rem' },
  section:      { borderTop: '1px solid #f0f0f0', paddingTop: '0.875rem', marginTop: '0.875rem' },
  sectionTitle: { fontSize: '0.75rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' },
  row:          { display: 'flex', gap: '0.75rem', marginBottom: '0.25rem', fontSize: '0.9rem' },
  label:        { color: '#888', minWidth: 110 },
  chips:        { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  chip:         { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 99, padding: '0.2rem 0.7rem', fontSize: '0.8rem', fontWeight: 500 },
  table:        { width: '100%', borderCollapse: 'collapse' },
  tdLabel:      { padding: '0.2rem 0', fontSize: '0.875rem', color: '#555', width: '60%' },
  tdValue:      { padding: '0.2rem 0', fontSize: '0.875rem', fontWeight: 600 },
  textarea:     { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #ddd', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', background: '#fafafa', outline: 'none', resize: 'vertical', lineHeight: 1.6 },
  primaryBtn:   { padding: '0.5rem 1.25rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' },
  outlineBtn:   { padding: '0.45rem 1rem', background: 'none', color: '#555', border: '1px solid #ddd', borderRadius: 6, fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem' },
  dim:          { color: '#aaa', fontSize: '0.875rem' },
};

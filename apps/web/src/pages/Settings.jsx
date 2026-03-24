import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';
import { Toast } from '../components/Toast.jsx';

const LOCALES = ['fr','en','de','es','it','pt'];
const ACCESS  = ['public','private','password'];

export default function Settings() {
  const t = useT();
  const [form,   setForm]   = useState({
    siteTitle: '',
    defaultAuthor: '', defaultAuthorEmail: '',
    defaultLocale: 'fr', defaultAccess: 'public',
    defaultAllowDownloadImage: true, defaultAllowDownloadGallery: false, defaultPrivate: false,
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpFrom: '', smtpSecure: false,
  });
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState('');
  const [smtpTesting,  setSmtpTesting]  = useState(false);
  const [smtpResult,   setSmtpResult]   = useState(null); // { ok, message }

  useEffect(() => {
    api.getSettings().then(s => {
      setForm({
        siteTitle:                   s.siteTitle                   || '',
        defaultAuthor:               s.defaultAuthor               || '',
        defaultAuthorEmail:          s.defaultAuthorEmail          || '',
        defaultLocale:               s.defaultLocale               || 'fr',
        defaultAccess:               s.defaultAccess               || 'public',
        defaultAllowDownloadImage:   s.defaultAllowDownloadImage   !== false,
        defaultAllowDownloadGallery: !!s.defaultAllowDownloadGallery,
        defaultPrivate:              !!s.defaultPrivate,
        smtpHost:    s.smtpHost    || '',
        smtpPort:    s.smtpPort    || 587,
        smtpUser:    s.smtpUser    || '',
        smtpPass:    '',
        smtpFrom:    s.smtpFrom    || '',
        smtpSecure:  !!s.smtpSecure,
      });
      setSmtpPassSet(!!s.smtpPassSet);
    }).catch(() => {});
  }, []);

  async function handleSmtpTest() {
    setSmtpTesting(true);
    setSmtpResult(null);
    try {
      const r = await api.smtpTest();
      setSmtpResult({ ok: true, message: `Test email sent to ${r.to}` });
    } catch (err) {
      setSmtpResult({ ok: false, message: err.message });
    } finally {
      setSmtpTesting(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveSettings(form);
      setToast('Settings saved');
    } catch (err) { setToast(`Error: ${err.message}`); }
    finally { setSaving(false); }
  }

  const set = key => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [key]: val }));
  };

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>{t('back_to_galleries')}</Link>
        <span style={s.title}>{t('global_settings')}</span>
      </header>
      <main style={s.main}>
        <form onSubmit={handleSave} style={s.form}>

          <Section label={t('section_site')}>
            <Row label={t('field_site_title')}>
              <input style={s.input} value={form.siteTitle} placeholder="GalleryPack"
                onChange={set('siteTitle')} />
            </Row>
            <p style={s.hint}>{t('site_title_hint')}</p>
          </Section>

          <Section label={t('section_photographer')}>
            <Row label={t('field_author_name')}>
              <input style={s.input} value={form.defaultAuthor} placeholder="Your name"
                onChange={set('defaultAuthor')} />
            </Row>
            <Row label={t('field_author_email')}>
              <input style={s.input} type="email" value={form.defaultAuthorEmail} placeholder="you@example.com"
                onChange={set('defaultAuthorEmail')} />
            </Row>
          </Section>

          <Section label={t('section_gallery_defaults')}>
            <Row label={t('field_language')}>
              <select style={s.input} value={form.defaultLocale} onChange={set('defaultLocale')}>
                {LOCALES.map(l => <option key={l}>{l}</option>)}
              </select>
            </Row>
            <Row label={t('field_access_default')}>
              <select style={s.input} value={form.defaultAccess} onChange={set('defaultAccess')}>
                {ACCESS.map(a => <option key={a}>{a}</option>)}
              </select>
            </Row>
            <Row label={t('field_allow_dl_image_default')}>
              <input type="checkbox" checked={form.defaultAllowDownloadImage}
                onChange={set('defaultAllowDownloadImage')} />
            </Row>
            <Row label={t('field_allow_dl_gallery_default')}>
              <input type="checkbox" checked={form.defaultAllowDownloadGallery}
                onChange={set('defaultAllowDownloadGallery')} />
            </Row>
            <Row label={t('field_private_default')}>
              <input type="checkbox" checked={form.defaultPrivate}
                onChange={set('defaultPrivate')} />
            </Row>
          </Section>

          <Section label="SMTP — Email">
            <Row label="Host">
              <input style={s.input} value={form.smtpHost} placeholder="smtp.example.com"
                onChange={set('smtpHost')} />
            </Row>
            <Row label="Port">
              <input style={{ ...s.input, maxWidth: 90 }} type="number" value={form.smtpPort}
                onChange={set('smtpPort')} />
            </Row>
            <Row label="User">
              <input style={s.input} value={form.smtpUser} placeholder="user@example.com"
                onChange={set('smtpUser')} autoComplete="off" />
            </Row>
            <Row label="Password">
              <input style={s.input} type="password" value={form.smtpPass}
                placeholder={smtpPassSet ? '••••••••  (leave blank to keep)' : 'Password'}
                onChange={set('smtpPass')} autoComplete="new-password" />
            </Row>
            <Row label="From address">
              <input style={s.input} value={form.smtpFrom} placeholder="GalleryPack <noreply@example.com>"
                onChange={set('smtpFrom')} />
            </Row>
            <Row label="TLS / SSL">
              <input type="checkbox" checked={form.smtpSecure}
                onChange={set('smtpSecure')} />
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Enable for port 465</span>
            </Row>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', marginLeft: 216 }}>
              <button type="button" style={s.testBtn} onClick={handleSmtpTest} disabled={smtpTesting}>
                {smtpTesting ? 'Sending…' : 'Send test email'}
              </button>
              {smtpResult && (
                <span style={{ fontSize: '0.82rem', color: smtpResult.ok ? '#059669' : '#dc2626' }}>
                  {smtpResult.ok ? '✓ ' : '✗ '}{smtpResult.message}
                </span>
              )}
            </div>
          </Section>

          <button style={s.btn} type="submit" disabled={saving}>
            {saving ? t('saving') : t('save_settings_btn')}
          </button>
        </form>
      </main>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={s.section}>
      <h3 style={s.sectionLabel}>{label}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
      <label style={{ width: 200, fontSize: '0.85rem', color: '#555', flexShrink: 0 }}>{label}</label>
      {children}
    </div>
  );
}

const s = {
  page:         { minHeight: '100vh', background: '#f8f8f8' },
  header:       { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', gap: '1rem' },
  back:         { color: '#111', textDecoration: 'none', fontSize: '0.875rem' },
  title:        { fontWeight: 600, fontSize: '0.95rem' },
  main:         { maxWidth: 600, margin: '0 auto', padding: '1.5rem' },
  form:         { display: 'flex', flexDirection: 'column', gap: '0' },
  section:      { marginBottom: '1.75rem' },
  sectionLabel: { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aaa', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid #eee' },
  input:        { flex: 1, padding: '0.4rem 0.6rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.875rem', outline: 'none' },
  hint:         { fontSize: '0.8rem', color: '#999', marginBottom: '0.5rem', marginLeft: 216 },
  btn:          { marginTop: '0.25rem', padding: '0.55rem 1.5rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', alignSelf: 'flex-start' },
  testBtn:      { padding: '0.35rem 0.9rem', background: '#fff', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.82rem', cursor: 'pointer', color: '#555' },
};

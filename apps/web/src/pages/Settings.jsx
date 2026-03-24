import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT, useLocale } from '../lib/I18nContext.jsx';
import { useAuth } from '../lib/auth.jsx';
import { Toast } from '../components/Toast.jsx';

const LOCALES = ['fr','en','de','es','it','pt'];
const ACCESS  = ['public','private','password'];

export default function Settings() {
  const t = useT();
  const { user, setUser } = useAuth();
  const isAdmin = ['admin', 'owner'].includes(user?.studioRole);

  if (!isAdmin) return <ProfilePage user={user} setUser={setUser} />;

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
      setSmtpResult({ ok: true, message: t('smtp_test_ok', { to: r.to }) });
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
      setToast(t('settings_saved'));
    } catch (err) { setToast(t('settings_error', { msg: err.message })); }
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
              <input style={s.input} value={form.defaultAuthor} placeholder={t('profile_name_placeholder')}
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

          <Section label={t('section_smtp')}>
            <Row label={t('smtp_host')}>
              <input style={s.input} value={form.smtpHost} placeholder="smtp.example.com"
                onChange={set('smtpHost')} />
            </Row>
            <Row label={t('smtp_port')}>
              <input style={{ ...s.input, maxWidth: 90 }} type="number" value={form.smtpPort}
                onChange={set('smtpPort')} />
            </Row>
            <Row label={t('smtp_user')}>
              <input style={s.input} value={form.smtpUser} placeholder="user@example.com"
                onChange={set('smtpUser')} autoComplete="off" />
            </Row>
            <Row label={t('smtp_password')}>
              <input style={s.input} type="password" value={form.smtpPass}
                placeholder={smtpPassSet ? t('smtp_password_set') : t('smtp_password')}
                onChange={set('smtpPass')} autoComplete="new-password" />
            </Row>
            <Row label={t('smtp_from')}>
              <input style={s.input} value={form.smtpFrom} placeholder="GalleryPack <noreply@example.com>"
                onChange={set('smtpFrom')} />
            </Row>
            <Row label={t('smtp_tls')}>
              <input type="checkbox" checked={form.smtpSecure}
                onChange={set('smtpSecure')} />
              <span style={{ fontSize: '0.8rem', color: '#888' }}>{t('smtp_tls_hint')}</span>
            </Row>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', marginLeft: 216 }}>
              <button type="button" style={s.testBtn} onClick={handleSmtpTest} disabled={smtpTesting}>
                {smtpTesting ? t('sending') : t('smtp_test_btn')}
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

const UI_LOCALES = ['fr', 'en', 'de', 'es', 'it', 'pt'];

function ProfilePage({ user, setUser }) {
  const t = useT();
  const { setLocale } = useLocale();
  const [name,      setName]      = useState(user?.name || '');
  const [locale,    setLocaleSt]  = useState(user?.locale || '');
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState('');
  const [galleries, setGalleries] = useState(null);

  const [curPwd,    setCurPwd]    = useState('');
  const [newPwd,    setNewPwd]    = useState('');
  const [newPwd2,   setNewPwd2]   = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    api.myGalleries().then(setGalleries).catch(() => setGalleries([]));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateMe({ name, locale: locale || null });
      setUser(updated);
      if (locale) setLocale(locale);
      setToast(t('profile_saved'));
    } catch (err) { setToast(t('settings_error', { msg: err.message })); }
    finally { setSaving(false); }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (newPwd !== newPwd2) { setToast(t('profile_passwords_mismatch')); return; }
    setPwdSaving(true);
    try {
      await api.changePassword(curPwd, newPwd);
      setCurPwd(''); setNewPwd(''); setNewPwd2('');
      setToast(t('profile_password_updated'));
    } catch (err) { setToast(t('settings_error', { msg: err.message })); }
    finally { setPwdSaving(false); }
  }

  const STUDIO_ROLE_LABEL = {
    photographer: t('role_photographer'), editor: t('role_editor'),
    admin: t('role_admin'), owner: t('role_owner'),
  };
  const STUDIO_ROLE_DESC = {
    photographer: t('role_photographer_desc'), editor: t('role_editor_desc'),
    admin: t('role_admin_desc'), owner: t('role_owner_desc'),
  };
  const GALLERY_ROLE_LABEL = {
    contributor: t('gallery_role_contributor'), editor: t('gallery_role_editor'),
    viewer: t('gallery_role_viewer'),
  };
  const GALLERY_ROLE_DESC = {
    contributor: t('gallery_role_contributor_desc'), editor: t('gallery_role_editor_desc'),
    viewer: t('gallery_role_viewer_desc'),
  };

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>{t('back_to_galleries')}</Link>
        <span style={s.title}>{t('profile_title')}</span>
      </header>
      <main style={s.main}>

        <form onSubmit={handleSave} style={s.form}>
          <Section label={t('profile_section_identity')}>
            <Row label={t('profile_name')}>
              <input style={s.input} value={name} placeholder={t('profile_name_placeholder')}
                onChange={e => setName(e.target.value)} />
            </Row>
            <Row label={t('profile_email_label')}>
              <span style={{ fontSize: '0.875rem', color: '#555' }}>{user?.email}</span>
            </Row>
            <Row label={t('profile_role')}>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111' }}>
                  {STUDIO_ROLE_LABEL[user?.studioRole] || user?.studioRole}
                </span>
                <div style={{ fontSize: '0.78rem', color: '#888', marginTop: '0.15rem' }}>
                  {STUDIO_ROLE_DESC[user?.studioRole]}
                </div>
              </div>
            </Row>
          </Section>

          <Section label={t('profile_section_language')}>
            <Row label={t('profile_language_label')}>
              <select style={{ ...s.input, maxWidth: 180 }} value={locale} onChange={e => setLocaleSt(e.target.value)}>
                <option value="">— {t('field_language')} —</option>
                {UI_LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Row>
            <p style={{ ...s.hint, marginLeft: 0 }}>{t('profile_language_desc')}</p>
          </Section>

          <button style={s.btn} type="submit" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
        </form>

        <form onSubmit={handlePasswordChange} style={{ ...s.form, marginTop: '2rem' }}>
          <Section label={t('profile_section_password')}>
            <Row label={t('profile_current_password')}>
              <input style={s.input} type="password" autoComplete="current-password"
                value={curPwd} onChange={e => setCurPwd(e.target.value)} required />
            </Row>
            <Row label={t('profile_new_password')}>
              <input style={s.input} type="password" autoComplete="new-password" minLength={8}
                value={newPwd} onChange={e => setNewPwd(e.target.value)} required />
            </Row>
            <Row label={t('profile_confirm_password')}>
              <input style={s.input} type="password" autoComplete="new-password" minLength={8}
                value={newPwd2} onChange={e => setNewPwd2(e.target.value)} required />
            </Row>
          </Section>
          <button style={s.btn} type="submit" disabled={pwdSaving}>
            {pwdSaving ? t('saving') : t('profile_change_password_btn')}
          </button>
        </form>

        {user?.studioRole === 'photographer' && <div style={{ marginTop: '2rem' }}>
          <Section label={t('profile_section_galleries')}>
            {galleries === null && <p style={{ color: '#888', fontSize: '0.875rem' }}>{t('loading')}</p>}
            {galleries && galleries.length === 0 && (
              <p style={{ color: '#888', fontSize: '0.875rem' }}>{t('profile_no_galleries')}</p>
            )}
            {galleries && galleries.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    <th style={th}>{t('profile_gallery_th')}</th>
                    <th style={{ ...th, width: 180 }}>{t('profile_access_th')}</th>
                  </tr>
                </thead>
                <tbody>
                  {galleries.map(g => (
                    <tr key={g.id}>
                      <td style={td}>{g.title} <span style={{ color: '#aaa' }}>/{g.slug}/</span></td>
                      <td style={td}>
                        <span style={badge(g.role)}>{GALLERY_ROLE_LABEL[g.role] || g.role}</span>
                        <div style={{ fontSize: '0.72rem', color: '#aaa', marginTop: '0.15rem' }}>
                          {GALLERY_ROLE_DESC[g.role]}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>}
      </main>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

const th = { textAlign: 'left', padding: '0.4rem 0.5rem', borderBottom: '1px solid #eee', color: '#888', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' };
const td = { padding: '0.5rem', borderBottom: '1px solid #f0f0f0' };
const badge = (role) => ({
  display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600,
  background: role === 'editor' ? '#dbeafe' : role === 'contributor' ? '#dcfce7' : '#f0f0f0',
  color:      role === 'editor' ? '#1d4ed8' : role === 'contributor' ? '#15803d' : '#555',
});

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

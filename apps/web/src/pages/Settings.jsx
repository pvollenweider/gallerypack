import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Toast } from '../components/Toast.jsx';

export default function Settings() {
  const [form,    setForm]    = useState({ siteTitle: '' });
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');

  useEffect(() => {
    api.getSettings().then(s => setForm({ siteTitle: s.siteTitle || '' })).catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveSettings(form);
      setToast('Settings saved');
    } catch (e) { setToast(`Error: ${e.message}`); }
    finally { setSaving(false); }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>← Galleries</Link>
        <span style={s.title}>Global settings</span>
      </header>
      <main style={s.main}>
        <form onSubmit={handleSave} style={s.form}>
          <Row label="Site title">
            <input
              style={s.input}
              value={form.siteTitle}
              placeholder="GalleryPack"
              onChange={e => setForm(f => ({ ...f, siteTitle: e.target.value }))}
            />
          </Row>
          <p style={s.hint}>Used as the main title in the public gallery listing and the admin header.</p>
          <button style={s.btn} type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </main>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
      <label style={{ width: 160, fontSize: '0.85rem', color: '#555', flexShrink: 0 }}>{label}</label>
      {children}
    </div>
  );
}

const s = {
  page:  { minHeight: '100vh', background: '#f8f8f8' },
  header:{ background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', gap: '1rem' },
  back:  { color: '#111', textDecoration: 'none', fontSize: '0.875rem' },
  title: { fontWeight: 600, fontSize: '0.95rem' },
  main:  { maxWidth: 560, margin: '0 auto', padding: '1.5rem' },
  form:  { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  input: { flex: 1, padding: '0.4rem 0.6rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.875rem', outline: 'none' },
  hint:  { fontSize: '0.8rem', color: '#999', marginBottom: '1rem', marginLeft: 176 },
  btn:   { marginTop: '0.5rem', padding: '0.55rem 1.5rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', alignSelf: 'flex-start' },
};

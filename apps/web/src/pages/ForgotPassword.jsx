import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

export default function ForgotPassword() {
  const t = useT();
  const [email,     setEmail]     = useState('');
  const [mode,      setMode]      = useState('magic'); // 'magic' | 'reset'
  const [sent,      setSent]      = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = mode === 'magic'
        ? await api.requestMagicLink(email)
        : await api.forgotPassword(email);
      setEmailSent(res.emailSent !== false);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>GalleryPack</h1>
        {sent ? (
          <>
            {emailSent ? (
              mode === 'magic' ? (
                <p style={s.sub}>{t('forgot_magic_sent', { email })}</p>
              ) : (
                <p style={s.sub}>{t('forgot_reset_sent', { email })}</p>
              )
            ) : (
              <p style={s.sub}>{t('forgot_no_smtp')}</p>
            )}
            <Link to="/login" style={s.link}>{t('back_to_login')}</Link>
          </>
        ) : (
          <>
            <div style={s.toggle}>
              <button
                style={{ ...s.toggleBtn, ...(mode === 'magic' ? s.toggleBtnActive : {}) }}
                onClick={() => setMode('magic')}
                type="button"
              >{t('forgot_mode_magic')}</button>
              <button
                style={{ ...s.toggleBtn, ...(mode === 'reset' ? s.toggleBtnActive : {}) }}
                onClick={() => setMode('reset')}
                type="button"
              >{t('forgot_mode_reset')}</button>
            </div>
            <p style={s.sub}>
              {mode === 'magic' ? t('forgot_magic_desc') : t('forgot_reset_desc')}
            </p>
            <form onSubmit={handleSubmit} style={s.form}>
              <input
                style={s.input}
                type="email" placeholder={t('login_email')} autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)} required
              />
              {error && <p style={s.error}>{error}</p>}
              <button style={s.btn} type="submit" disabled={loading}>
                {loading ? t('sending') : t('forgot_send')}
              </button>
            </form>
            <Link to="/login" style={s.link}>{t('back_to_login')}</Link>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page:           { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#f0f0f0' },
  card:           { background:'#fff', borderRadius:12, padding:'2.5rem 2rem', width:'100%', maxWidth:380, boxShadow:'0 2px 16px #0001' },
  title:          { margin:'0 0 1.5rem', fontSize:'1.4rem', fontWeight:700, textAlign:'center', letterSpacing:'-0.02em' },
  toggle:         { display:'flex', background:'#f3f3f3', borderRadius:8, padding:3, marginBottom:'1.25rem', gap:3 },
  toggleBtn:      { flex:1, padding:'0.4rem 0', border:'none', borderRadius:6, background:'none', cursor:'pointer', fontSize:'0.82rem', fontWeight:500, color:'#888' },
  toggleBtnActive:{ background:'#fff', color:'#111', boxShadow:'0 1px 3px #0002', fontWeight:600 },
  sub:            { margin:'0 0 1.25rem', fontSize:'0.875rem', color:'#555', lineHeight:1.5 },
  form:           { display:'flex', flexDirection:'column', gap:'0.75rem', marginBottom:'1rem' },
  input:          { padding:'0.6rem 0.75rem', border:'1px solid #ddd', borderRadius:6, fontSize:'0.95rem', outline:'none' },
  btn:            { padding:'0.65rem', background:'#111', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.95rem' },
  error:          { margin:0, color:'#c00', fontSize:'0.85rem' },
  link:           { fontSize:'0.85rem', color:'#888', textDecoration:'none' },
};

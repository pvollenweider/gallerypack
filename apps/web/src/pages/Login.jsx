import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const t = useT();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user?.role === 'photographer') {
        const galleries = await api.myGalleries().catch(() => []);
        navigate(galleries[0] ? `/galleries/${galleries[0].id}` : '/');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || t('login_failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>GalleryPack</h1>
        <form onSubmit={handleSubmit} style={s.form}>
          <input
            style={s.input}
            type="email" placeholder={t('login_email')} autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} required
          />
          <input
            style={s.input}
            type="password" placeholder={t('login_password')} autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} required
          />
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? t('login_signing_in') : t('login_sign_in')}
          </button>
        </form>
        <Link to="/forgot-password" style={s.forgot}>{t('login_forgot_password')}</Link>
      </div>
    </div>
  );
}

const s = {
  page:  { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#f0f0f0' },
  card:  { background:'#fff', borderRadius:12, padding:'2.5rem 2rem', width:'100%', maxWidth:360, boxShadow:'0 2px 16px #0001' },
  title: { margin:'0 0 1.5rem', fontSize:'1.4rem', fontWeight:700, textAlign:'center', letterSpacing:'-0.02em' },
  form:  { display:'flex', flexDirection:'column', gap:'0.75rem' },
  input: { padding:'0.6rem 0.75rem', border:'1px solid #ddd', borderRadius:6, fontSize:'0.95rem', outline:'none' },
  btn:   { padding:'0.65rem', background:'#111', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.95rem' },
  error:  { margin:0, color:'#c00', fontSize:'0.85rem' },
  forgot: { display:'block', marginTop:'1rem', textAlign:'center', fontSize:'0.85rem', color:'#888', textDecoration:'none' },
};

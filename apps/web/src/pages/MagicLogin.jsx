import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/I18nContext.jsx';

export default function MagicLogin() {
  const { token } = useParams();
  const navigate  = useNavigate();
  const { setUser } = useAuth();
  const t = useT();
  const [error, setError] = useState('');

  useEffect(() => {
    api.consumeMagicLink(token)
      .then(() => api.me())
      .then(u => { setUser(u); navigate('/', { replace: true }); })
      .catch(err => setError(err.message));
  }, [token]);

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>GalleryPack</h1>
        {error ? (
          <>
            <p style={s.error}>{error}</p>
            <a href="/login" style={s.link}>{t('back_to_login')}</a>
          </>
        ) : (
          <p style={s.sub}>{t('magic_loading')}</p>
        )}
      </div>
    </div>
  );
}

const s = {
  page:  { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#f0f0f0' },
  card:  { background:'#fff', borderRadius:12, padding:'2.5rem 2rem', width:'100%', maxWidth:360, boxShadow:'0 2px 16px #0001', textAlign:'center' },
  title: { margin:'0 0 1.5rem', fontSize:'1.4rem', fontWeight:700, letterSpacing:'-0.02em' },
  sub:   { margin:0, fontSize:'0.9rem', color:'#888' },
  error: { margin:'0 0 1rem', fontSize:'0.9rem', color:'#c00' },
  link:  { fontSize:'0.85rem', color:'#888', textDecoration:'none' },
};

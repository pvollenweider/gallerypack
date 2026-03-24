import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function AcceptInvite() {
  const { token }   = useParams();
  const navigate    = useNavigate();

  const [invite,    setInvite]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getInviteInfo(token)
      .then(setInvite)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== password2) { setError('Passwords do not match'); return; }
    if (password.length < 8)    { setError('Password must be at least 8 characters'); return; }
    setError('');
    setSubmitting(true);
    try {
      await api.acceptInvite(token, password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  if (loading) return <div style={s.center}>Loading…</div>;

  if (error && !invite) return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={s.logo}>GalleryPack</div>
        <p style={s.errorMsg}>{error}</p>
        <a href="/admin/" style={s.link}>Go to login</a>
      </div>
    </div>
  );

  if (invite?.alreadyAccepted) return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={s.logo}>GalleryPack</div>
        <p style={s.sub}>This invitation has already been accepted.</p>
        <a href="/admin/" style={s.link}>Go to login</a>
      </div>
    </div>
  );

  return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={s.logo}>GalleryPack</div>
        <h1 style={s.title}>You're invited</h1>
        <p style={s.sub}>
          You've been invited to join <strong>{invite?.studioName || 'a studio'}</strong> as{' '}
          <span style={{ ...s.roleBadge, background: ROLE_COLORS[invite?.role] + '18', color: ROLE_COLORS[invite?.role] }}>
            {invite?.role}
          </span>
        </p>
        <p style={s.email}>{invite?.email}</p>

        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>Choose a password</label>
          <input
            style={s.input}
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
          />
          <input
            style={s.input}
            type="password"
            placeholder="Confirm password"
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            required
          />
          {error && <p style={s.errorMsg}>{error}</p>}
          <button style={s.btn} type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create my account'}
          </button>
        </form>
      </div>
    </div>
  );
}

const ROLE_COLORS = { owner: '#7c3aed', admin: '#2563eb', editor: '#0891b2', photographer: '#059669' };

const s = {
  center:    { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f8' },
  card:      { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '2.5rem 2rem', width: '100%', maxWidth: 400, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' },
  logo:      { fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#111', marginBottom: '1.5rem' },
  title:     { fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#111' },
  sub:       { color: '#666', fontSize: '0.9rem', margin: '0 0 0.25rem', lineHeight: 1.5 },
  email:     { color: '#999', fontSize: '0.82rem', margin: '0 0 1.5rem' },
  roleBadge: { display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: 4, fontSize: '0.82rem', fontWeight: 600 },
  form:      { display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' },
  label:     { fontSize: '0.8rem', fontWeight: 600, color: '#555' },
  input:     { padding: '0.55rem 0.75rem', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.9rem', outline: 'none' },
  btn:       { padding: '0.65rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', marginTop: '0.25rem' },
  errorMsg:  { color: '#dc2626', fontSize: '0.82rem', margin: 0 },
  link:      { color: '#555', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-block', marginTop: '1rem' },
};

// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/I18nContext.jsx';
import LoginLayout from '../components/LoginLayout.jsx';

// States: loading → valid | invalid → (on click) logging_in → done
export default function MagicLogin() {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const { setUser } = useAuth();
  const t           = useT();

  const [state,  setState]  = useState('loading'); // loading | valid | invalid | logging_in
  const [email,  setEmail]  = useState('');
  const [error,  setError]  = useState('');

  // On mount: validate token (GET — no side effects, safe for mail scanners)
  useEffect(() => {
    api.checkMagicLink(token)
      .then(({ email: e }) => { setEmail(e || ''); setState('valid'); })
      .catch(err => { setError(err.message); setState('invalid'); });
  }, [token]);

  // On button click: consume token (POST — creates session)
  async function handleLogin() {
    setState('logging_in');
    try {
      await api.consumeMagicLink(token);
      const u = await api.me();
      setUser(u);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setState('invalid');
    }
  }

  return (
    <LoginLayout>
      <div className="text-center">
        {state === 'loading' && (
          <p className="text-muted">
            <i className="fas fa-spinner fa-spin me-1" />{t('loading')}
          </p>
        )}

        {state === 'valid' && (
          <>
            {email && <p className="text-muted mb-3">{email}</p>}
            <button className="btn btn-primary w-100" onClick={handleLogin}>
              {t('magic_confirm_btn')}
            </button>
          </>
        )}

        {state === 'logging_in' && (
          <p className="text-muted">
            <i className="fas fa-spinner fa-spin me-1" />{t('magic_loading')}
          </p>
        )}

        {state === 'invalid' && (
          <>
            <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
              {error}
            </div>
            <p className="mb-0">
              <Link to="/forgot-password" className="text-muted" style={{ fontSize: '0.875rem' }}>
                {t('magic_request_new')}
              </Link>
            </p>
          </>
        )}
      </div>
    </LoginLayout>
  );
}

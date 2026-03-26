// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';

const INITIAL = { smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpFrom: '', smtpSecure: false };

export default function SmtpPage() {
  const [form,    setForm]    = useState(INITIAL);
  const [passSet, setPassSet] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved,   setSaved]   = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getSettings().then(s => {
      setPassSet(!!s.smtpPassSet);
      setForm({
        smtpHost:   s.smtpHost   || '',
        smtpPort:   s.smtpPort   || 587,
        smtpUser:   s.smtpUser   || '',
        smtpPass:   '',
        smtpFrom:   s.smtpFrom   || '',
        smtpSecure: !!s.smtpSecure,
      });
    }).catch(() => {});
  }, []);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.saveSettings(form);
      setSaved('Settings saved.');
      setPassSet(!!form.smtpPass || passSet);
      setForm(f => ({ ...f, smtpPass: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testEmail() {
    setTesting(true); setTestMsg(''); setError('');
    try {
      const r = await api.smtpTest();
      setTestMsg(`Test email sent to ${r.to}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6"><h1 className="m-0">SMTP</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-7">

              <form onSubmit={save}>
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Server</h3></div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-sm-8 mb-3">
                        <label className="form-label">Host</label>
                        <input className="form-control" value={form.smtpHost} onChange={set('smtpHost')} placeholder="smtp.example.com" />
                      </div>
                      <div className="col-sm-4 mb-3">
                        <label className="form-label">Port</label>
                        <input className="form-control" type="number" value={form.smtpPort} onChange={set('smtpPort')} />
                      </div>
                    </div>
                    <div className="mb-3">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id="smtpSecure"
                          checked={form.smtpSecure} onChange={set('smtpSecure')} />
                        <label className="form-check-label" htmlFor="smtpSecure">Use TLS / SSL</label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3 className="card-title">Credentials</h3></div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label">Username</label>
                      <input className="form-control" value={form.smtpUser} onChange={set('smtpUser')} placeholder="user@example.com" autoComplete="off" />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">
                        Password
                        {passSet && <span className="badge bg-secondary ms-2" style={{ fontSize: '0.7rem' }}>saved — leave blank to keep</span>}
                      </label>
                      <input className="form-control" type="password" value={form.smtpPass} onChange={set('smtpPass')}
                        placeholder={passSet ? '••••••••' : 'Enter password'} autoComplete="new-password" />
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3 className="card-title">Sender</h3></div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label">From address</label>
                      <input className="form-control" value={form.smtpFrom} onChange={set('smtpFrom')} placeholder="noreply@example.com" />
                      <div className="form-text">Displayed as the sender in outbound emails. Defaults to username if blank.</div>
                    </div>
                  </div>
                </div>

                {saved  && <div className="alert alert-success">{saved}</div>}
                {testMsg && <div className="alert alert-info">{testMsg}</div>}
                {error  && <div className="alert alert-danger">{error}</div>}

                <div className="d-flex gap-2 mb-4">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? <><i className="fas fa-spinner fa-spin me-1" />Saving…</> : 'Save'}
                  </button>
                  <button type="button" className="btn btn-outline-secondary" onClick={testEmail} disabled={testing || saving}>
                    {testing ? <><i className="fas fa-spinner fa-spin me-1" />Sending…</> : <><i className="fas fa-paper-plane me-1" />Test email</>}
                  </button>
                </div>
              </form>

            </div>

            <div className="col-lg-5">
              <div className="card bg-light">
                <div className="card-body">
                  <h6 className="text-muted mb-2"><i className="fas fa-info-circle me-1" />Notes</h6>
                  <ul className="mb-0 ps-3" style={{ fontSize: '0.85rem' }}>
                    <li>Common ports: 587 (STARTTLS), 465 (SSL), 25 (plain)</li>
                    <li>Use TLS for port 465; leave off for port 587 (STARTTLS is negotiated automatically)</li>
                    <li>Test email is sent to your own account address</li>
                    <li>Password is stored encrypted and never returned by the API</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

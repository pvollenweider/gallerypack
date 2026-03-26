// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminInput, AdminSwitch, AdminAlert } from '../../../components/ui/index.js';

const INITIAL = { smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpFrom: '', smtpSecure: false };

export default function SmtpPage() {
  const t = useT();
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
      setSaved(t('settings_saved'));
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
      setTestMsg(t('smtp_test_ok', { to: r.to }));
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <AdminPage title={t('smtp_page_title')}>
      <div className="row">
        <div className="col-lg-7">

          <form onSubmit={save}>
            <AdminCard title={t('smtp_server_section')}>
              <div className="row">
                <div className="col-sm-8">
                  <AdminInput
                    label={t('smtp_host')}
                    value={form.smtpHost}
                    onChange={set('smtpHost')}
                    placeholder={t('smtp_host_placeholder')}
                  />
                </div>
                <div className="col-sm-4">
                  <AdminInput
                    label={t('smtp_port')}
                    type="number"
                    value={form.smtpPort}
                    onChange={set('smtpPort')}
                  />
                </div>
              </div>
              <AdminSwitch
                label={t('smtp_tls_label')}
                checked={form.smtpSecure}
                onChange={set('smtpSecure')}
              />
            </AdminCard>

            <AdminCard title={t('smtp_credentials_section')}>
              <AdminInput
                label={t('smtp_username_label')}
                value={form.smtpUser}
                onChange={set('smtpUser')}
                placeholder={t('smtp_username_placeholder')}
                autoComplete="off"
              />
              <AdminInput
                label={t('smtp_password')}
                labelRight={passSet ? <span className="badge bg-secondary" style={{ fontSize: '0.7rem' }}>{t('smtp_password_set')}</span> : null}
                type="password"
                value={form.smtpPass}
                onChange={set('smtpPass')}
                placeholder={passSet ? '••••••••' : t('smtp_password_enter')}
                autoComplete="new-password"
                hint={t('smtp_hint_password')}
              />
            </AdminCard>

            <AdminCard title={t('smtp_sender_section')}>
              <AdminInput
                label={t('smtp_from')}
                value={form.smtpFrom}
                onChange={set('smtpFrom')}
                placeholder={t('smtp_from_placeholder')}
                hint={t('smtp_from_hint')}
              />
            </AdminCard>

            <AdminAlert variant="success" message={saved} />
            <AdminAlert variant="info" message={testMsg} />
            <AdminAlert message={error} />

            <div className="d-flex gap-2 mb-4">
              <AdminButton type="submit" loading={saving} loadingLabel={t('saving')}>
                {t('save')}
              </AdminButton>
              <AdminButton
                variant="outline-secondary"
                onClick={testEmail}
                disabled={testing || saving}
                loading={testing}
                loadingLabel={t('sending')}
                icon="fas fa-paper-plane"
              >
                {t('smtp_test_action')}
              </AdminButton>
            </div>
          </form>

        </div>

        <div className="col-lg-5">
          <div className="card bg-light">
            <div className="card-body">
              <h6 className="text-muted mb-2"><i className="fas fa-info-circle me-1" />Notes</h6>
              <ul className="mb-0 ps-3" style={{ fontSize: '0.85rem' }}>
                <li>{t('smtp_hint_ports')}</li>
                <li>{t('smtp_hint_tls')}</li>
                <li>{t('smtp_hint_test')}</li>
                <li>{t('smtp_hint_password')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}

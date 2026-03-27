// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminToast } from '../../../components/ui/index.js';

export default function GalleryInboxPage() {
  const t = useT();
  const { galleryId } = useParams();
  const [inbox,       setInbox]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [validating,  setValidating]  = useState(false);
  const [rejecting,   setRejecting]   = useState(false);
  const [error,       setError]       = useState('');
  const [toast,       setToast]       = useState('');

  function load() {
    setLoading(true);
    api.listInbox(galleryId)
      .then(setInbox)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [galleryId]);

  async function handleValidateAll() {
    setValidating(true);
    try {
      await api.validatePhotos(galleryId, { all: true });
      await load();
      setToast(t('settings_saved'));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setValidating(false); }
  }

  async function handleRejectAll() {
    if (!confirm(t('inbox_reject_all_confirm'))) return;
    setRejecting(true);
    try {
      await api.rejectPhotos(galleryId, { all: true });
      await load();
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setRejecting(false); }
  }

  const pending = inbox?.photos?.filter(p => p.status === 'pending') ?? [];
  const accepted = inbox?.photos?.filter(p => p.status === 'accepted') ?? [];

  return (
    <AdminPage
      title={t('tab_inbox')}
      actions={
        pending.length > 0 && (
          <div className="d-flex gap-2">
            <AdminButton
              size="sm"
              icon="fas fa-check-double"
              loading={validating}
              loadingLabel={t('saving')}
              onClick={handleValidateAll}
            >
              {t('inbox_validate_all')}
            </AdminButton>
            <AdminButton
              variant="outline-danger"
              size="sm"
              icon="fas fa-trash"
              loading={rejecting}
              onClick={handleRejectAll}
            >
              {t('inbox_reject_all')}
            </AdminButton>
          </div>
        )
      }
    >
      {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
      <AdminAlert message={error} />
      <AdminToast message={toast} onDone={() => setToast('')} />

      {!loading && inbox && (
        <>
          {pending.length === 0 && accepted.length === 0 && (
            <div className="text-center text-muted py-5">
              <i className="fas fa-inbox fa-2x mb-3 d-block" />
              {t('inbox_empty')}
            </div>
          )}

          {pending.length > 0 && (
            <AdminCard
              title={<><i className="fas fa-clock text-warning me-2" />{t('inbox_pending')} ({pending.length})</>}
              noPadding
              className="mb-4"
            >
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr>
                    <th>{t('inbox_th_file')}</th>
                    <th>{t('inbox_th_photographer')}</th>
                    <th>{t('inbox_th_date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(p => (
                    <tr key={p.file}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.file}</td>
                      <td className="text-muted" style={{ fontSize: '0.85rem' }}>{p.photographerName || '—'}</td>
                      <td className="text-muted" style={{ fontSize: '0.85rem' }}>
                        {p.uploadedAt ? new Date(p.uploadedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminCard>
          )}

          {accepted.length > 0 && (
            <AdminCard
              title={<><i className="fas fa-check text-success me-2" />{t('inbox_accepted')} ({accepted.length})</>}
              noPadding
            >
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr>
                    <th>{t('inbox_th_file')}</th>
                    <th>{t('inbox_th_photographer')}</th>
                    <th>{t('inbox_th_date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {accepted.map(p => (
                    <tr key={p.file}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.file}</td>
                      <td className="text-muted" style={{ fontSize: '0.85rem' }}>{p.photographerName || '—'}</td>
                      <td className="text-muted" style={{ fontSize: '0.85rem' }}>
                        {p.uploadedAt ? new Date(p.uploadedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminCard>
          )}
        </>
      )}
    </AdminPage>
  );
}

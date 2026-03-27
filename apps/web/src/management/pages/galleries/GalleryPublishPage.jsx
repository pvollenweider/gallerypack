// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminBadge, AdminAlert } from '../../../components/ui/index.js';

const STATUS_BADGE = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };

export default function GalleryPublishPage() {
  const t = useT();
  const { galleryId } = useParams();
  const [gallery,  setGallery]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState('');
  const [error,    setError]    = useState('');

  function load() {
    setLoading(true);
    api.getGallery(galleryId)
      .then(setGallery)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [galleryId]);

  async function build(force = false) {
    setBuilding(true); setBuildMsg(''); setError('');
    try {
      const job = await api.triggerBuild(galleryId, force);
      setBuildMsg(job?.id ? t('build_queued_job', { id: job.id }) : t('build_queued'));
      setTimeout(load, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBuilding(false);
    }
  }

  const status = gallery?.buildStatus;

  return (
    <AdminPage
      title={t('gal_publish_title')}
      actions={<>
        <AdminButton
          size="sm"
          icon="fas fa-rocket"
          loading={building}
          loadingLabel={t('gal_publish_building')}
          disabled={loading}
          onClick={() => build(false)}
        >
          {t('gal_publish_title')}
        </AdminButton>
        <AdminButton
          variant="outline-secondary"
          size="sm"
          icon="fas fa-redo"
          disabled={building || loading}
          onClick={() => build(true)}
          title={t('gal_publish_force')}
        >
          {t('gal_publish_force')}
        </AdminButton>
      </>}
    >
      {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
      <AdminAlert message={error} />
      <AdminAlert variant="info" message={buildMsg} className="py-2" />

      {gallery && (
        <div className="row">
          <div className="col-lg-7">
            <AdminCard title={t('gal_publish_status_section')} noPadding>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr>
                      <th style={{ width: 140 }}>{t('proj_th_status')}</th>
                      <td>
                        {status
                          ? <AdminBadge color={STATUS_BADGE[status] || 'secondary'}>{status}</AdminBadge>
                          : <span className="text-muted">{t('gal_publish_never_built')}</span>
                        }
                      </td>
                    </tr>
                    {gallery.buildDate && (
                      <tr>
                        <th>{t('gal_publish_last_build')}</th>
                        <td>{new Date(gallery.buildDate).toLocaleString()}</td>
                      </tr>
                    )}
                    {gallery.lastJobId && (
                      <tr>
                        <th>{t('gal_publish_last_job')}</th>
                        <td>
                          <Link to={`/admin/jobs/${gallery.lastJobId}`} className="font-monospace" style={{ fontSize: '0.85rem' }}>
                            {gallery.lastJobId} <i className="fas fa-arrow-right ms-1" />
                          </Link>
                        </td>
                      </tr>
                    )}
                    {gallery.baseUrl && (
                      <tr>
                        <th>{t('gal_publish_url')}</th>
                        <td>
                          <a href={gallery.baseUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem' }}>
                            {gallery.baseUrl} <i className="fas fa-external-link-alt ms-1" />
                          </a>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </AdminCard>

            {status === 'error' && (
              <AdminAlert message={
                <>
                  <i className="fas fa-exclamation-triangle me-2" />
                  {t('gal_publish_failed')}
                  {gallery.lastJobId && (
                    <> <Link to={`/admin/jobs/${gallery.lastJobId}`}>{t('gal_publish_view_logs')}</Link></>
                  )}
                </>
              } />
            )}

          </div>
        </div>
      )}
    </AdminPage>
  );
}

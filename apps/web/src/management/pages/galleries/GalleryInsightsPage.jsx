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
import { AdminCard, AdminAlert } from '../../../components/ui/index.js';

/** Map bin keys to i18n keys */
const BIN_LABEL_KEY = {
  ultra_wide:  'insights_bin_ultra_wide',
  wide:        'insights_bin_wide',
  wide_std:    'insights_bin_wide_std',
  normal:      'insights_bin_normal',
  portrait:    'insights_bin_portrait',
  short_tele:  'insights_bin_short_tele',
  tele:        'insights_bin_tele',
  super_tele:  'insights_bin_super_tele',
};

/** Simple horizontal bar, width = pct % of withData */
function FocalBar({ count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="progress" style={{ height: 18 }}>
      <div
        className="progress-bar bg-primary"
        role="progressbar"
        style={{ width: `${pct}%` }}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

export default function GalleryInsightsPage() {
  const t = useT();
  const { galleryId } = useParams();

  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getFocalStats(galleryId)
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [galleryId]);

  if (loading) return <p className="text-muted p-3">{t('insights_focal_loading')}</p>;
  if (error)   return <AdminAlert message={error} className="m-3" />;

  const { total, withData, bins, dominant } = stats;

  const isEmpty  = total === 0;
  const noExif   = withData === 0 && total > 0;
  const missing  = total - withData;
  const maxCount = bins.length > 0 ? bins[0].count : 0;
  const pct      = total > 0 ? Math.round((withData / total) * 100) : 0;

  return (
    <div className="p-3">
      <h4 className="mb-3">{t('insights_focal_section')}</h4>

      {isEmpty && (
        <AdminAlert variant="secondary" message={t('insights_focal_not_built')} />
      )}

      {!isEmpty && noExif && (
        <AdminAlert variant="warning" message={t('insights_focal_no_data')} />
      )}

      {!isEmpty && !noExif && (
        <>
          {/* Coverage summary */}
          <div className="d-flex gap-4 mb-3 flex-wrap">
            <div className="card text-center px-4 py-2">
              <div className="fs-4 fw-bold text-primary">{pct}%</div>
              <div className="text-muted small">{t('insights_focal_coverage').replace('{pct}', pct)}</div>
            </div>
            {dominant && (
              <div className="card text-center px-4 py-2">
                <div className="fs-6 fw-semibold text-success">{t(BIN_LABEL_KEY[dominant])}</div>
                <div className="text-muted small">{t('insights_focal_dominant')}</div>
              </div>
            )}
          </div>

          {/* Histogram */}
          <AdminCard className="mb-3">
            <table className="table table-sm mb-0">
              <tbody>
                {bins.map(bin => (
                  <tr key={bin.key}>
                    <td style={{ width: '35%', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                      {t(BIN_LABEL_KEY[bin.key]) || bin.label}
                    </td>
                    <td style={{ width: '50%' }}>
                      <FocalBar count={bin.count} max={maxCount} />
                    </td>
                    <td style={{ width: '15%', textAlign: 'right', fontSize: '0.85rem' }} className="text-muted">
                      {bin.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminCard>

          {/* Missing data warning */}
          {missing > 0 && (
            <p className="text-muted small">
              {t('insights_focal_missing_hint').replace('{missing}', missing)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

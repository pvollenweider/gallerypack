// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminBadge } from '../../../components/ui/index.js';

export default function ProjectAccessPage() {
  const t = useT();
  const [orgDefaults, setOrgDefaults] = useState(null);

  useEffect(() => {
    api.getSettings().then(setOrgDefaults).catch(() => {});
  }, []);

  return (
    <AdminPage title={t('proj_access_title')} maxWidth="100%">
      <div className="row">
        <div className="col-lg-7">
          <AdminCard title={t('org_access_type_label')}>
            <div className="d-flex align-items-center gap-2 mb-3">
              <span className="badge bg-light text-dark border">
                {t('proj_access_inherited')}
              </span>
              {orgDefaults && (
                <AdminBadge color="secondary">{orgDefaults.defaultAccess || 'public'}</AdminBadge>
              )}
            </div>
            <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
              {t('proj_access_v2_note')}
            </p>
          </AdminCard>
        </div>
      </div>
    </AdminPage>
  );
}

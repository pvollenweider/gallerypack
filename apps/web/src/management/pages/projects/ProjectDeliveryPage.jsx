// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';

export default function ProjectDeliveryPage() {
  const [orgDefaults, setOrgDefaults] = useState(null);

  useEffect(() => {
    api.getSettings().then(setOrgDefaults).catch(() => {});
  }, []);

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2"><div className="col-sm-6"><h1 className="m-0">Delivery</h1></div></div>
        </div>
      </div>
      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header"><h3 className="card-title">Download policy</h3></div>
                <div className="card-body">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <span className="badge bg-light text-dark border">Inherited from organization</span>
                    {orgDefaults && (
                      <>
                        <span className="badge bg-secondary">
                          Photo download: {orgDefaults.defaultAllowDownloadImage !== false ? 'allowed' : 'disabled'}
                        </span>
                        <span className="badge bg-secondary">
                          ZIP download: {orgDefaults.defaultAllowDownloadGallery ? 'allowed' : 'disabled'}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                    Project-level delivery override — V2. Individual galleries can already override download settings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

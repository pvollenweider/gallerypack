// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * Temporary placeholder for pages not yet implemented.
 * Replaced sprint by sprint as real pages are built.
 */
export default function PlaceholderPage({ title, description }) {
  return (
    <div className="app-content-header">
      <div className="container-fluid">
        <div className="row mb-2">
          <div className="col-sm-6">
            <h1 className="m-0">{title}</h1>
          </div>
        </div>
      </div>
      <div className="app-content-body">
        <div className="container-fluid pt-3">
          <div className="card">
            <div className="card-body text-center py-5">
              <i className="fas fa-hammer fa-2x text-muted mb-3" style={{ display: 'block' }} />
              <p className="text-muted mb-1">
                {description ?? 'This page is being built.'}
              </p>
              <small className="text-muted">Coming in a future sprint.</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

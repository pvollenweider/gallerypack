// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminPage — standard page wrapper.
 *
 * @param {string}    title    - Page heading
 * @param {ReactNode} actions  - Optional right-side action buttons
 * @param {ReactNode} children - Page body content
 * @param {string}    [maxWidth='960px'] - Content column max-width
 */
export default function AdminPage({ title, actions, children, maxWidth = '960px' }) {
  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0" style={{ fontSize: '1.1rem', fontWeight: 600 }}>{title}</h1>
            </div>
            {actions && (
              <div className="col-sm-6 d-flex justify-content-sm-end justify-content-start gap-2 flex-wrap mt-2 mt-sm-0">
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid" style={{ maxWidth }}>
          {children}
        </div>
      </div>
    </>
  );
}

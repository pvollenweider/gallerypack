// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/lib/api.js — typed API client
const BASE = '/api';

async function req(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status });
  }
  return res.json();
}

export const api = {
  // Auth
  login:           (email, password) => req('POST',  '/auth/login', { email, password }),
  logout:          ()                => req('POST',  '/auth/logout'),
  me:              ()                => req('GET',   '/auth/me'),
  updateMe:        (data)            => req('PATCH', '/auth/me', data),
  changePassword:  (currentPassword, newPassword) => req('PATCH', '/auth/me', { currentPassword, newPassword }),
  myGalleries:     ()                => req('GET',   '/auth/me/galleries'),
  forgotPassword:  (email)           => req('POST',  '/auth/forgot', { email }),
  requestMagicLink: (email)          => req('POST', '/auth/magic', { email }),
  checkMagicLink:   (token)          => req('GET',  `/auth/magic/${token}`),   // validate without consuming
  consumeMagicLink: (token)          => req('POST', `/auth/magic/${token}`),   // consume — call only on user click
  checkResetToken: (token)           => req('GET',   `/auth/reset/${token}`),
  resetPassword:   (token, password) => req('POST',  `/auth/reset/${token}`, { password }),
  adminResetLink:  (userId)          => req('POST',  '/auth/admin/reset-link', { userId }),

  // Galleries
  listGalleries:   ()          => req('GET',    '/galleries'),
  getGallery:      (id)        => req('GET',    `/galleries/${id}`),
  createGallery:   (data)      => req('POST',   '/galleries', data),
  updateGallery:   (id, data)  => req('PATCH',  `/galleries/${id}`, data),
  deleteGallery:   (id)        => req('DELETE', `/galleries/${id}`),
  renameSlug:      (id, slug)  => req('POST',   `/galleries/${id}/rename`, { slug }),

  // Photos
  listPhotos:  (galleryId)           => req('GET',    `/galleries/${galleryId}/photos`),
  deletePhoto: (galleryId, filename) => req('DELETE', `/galleries/${galleryId}/photos/${encodeURIComponent(filename)}`),
  reorderPhotos:  (galleryId, order)  => req('PUT',    `/galleries/${galleryId}/photos/order`, { order }),
  uploadDone:     (galleryId)         => req('POST',   `/galleries/${galleryId}/photos/upload-done`),
  listInbox:      (galleryId)         => req('GET',    `/galleries/${galleryId}/photos/inbox`),
  validatePhotos: (galleryId, data)   => req('POST',   `/galleries/${galleryId}/photos/validate`, data),
  rejectPhotos:   (galleryId, data)   => req('POST',   `/galleries/${galleryId}/photos/reject`, data),

  // Upload links (photographer access)
  listUploadLinks:   (galleryId)         => req('GET',    `/galleries/${galleryId}/upload-links`),
  createUploadLink:  (galleryId, data)   => req('POST',   `/galleries/${galleryId}/upload-links`, data),
  revokeUploadLink:  (galleryId, linkId) => req('DELETE', `/galleries/${galleryId}/upload-links/${linkId}`),

  // Settings
  getSettings:    ()     => req('GET',   '/settings'),
  saveSettings:   (data) => req('PATCH', '/settings', data),
  smtpTest:       ()     => req('POST',  '/settings/smtp-test'),
  getMyStudio:    ()     => req('GET',   '/settings/studio'),
  updateMyStudio: (data) => req('PATCH', '/settings/studio', data),

  // Photographer ready notification
  notifyReady: (galleryId) => req('POST', `/galleries/${galleryId}/notify-ready`),

  // Focal stats (Insights tab — legacy, kept for backwards compat)
  getFocalStats: (galleryId) => req('GET', `/galleries/${galleryId}/focal-stats`),

  // Unified EXIF analytics (V1 — all 5 metrics)
  getGalleryInsights: (galleryId) => req('GET', `/galleries/${galleryId}/insights`),

  // Personal upload tokens
  listTokens:   ()                       => req('GET',    '/tokens'),
  createToken:  (data)                   => req('POST',   '/tokens', data),
  revokeToken:  (tokenId)                => req('DELETE', `/tokens/${tokenId}`),

  // Jobs
  triggerBuild:   (galleryId, force = false) => req('POST', `/galleries/${galleryId}/build`, { force }),
  listJobs:       (galleryId)               => req('GET',  `/galleries/${galleryId}/jobs`),
  getJob:         (jobId)                   => req('GET',  `/jobs/${jobId}`),
  listActiveJobs: ()                        => req('GET',  `/jobs`),

  // Gallery members
  getGalleryMembers:  (id)                      => req('GET',    `/galleries/${id}/members`),
  putGalleryMember:   (galleryId, userId, role)  => req('PUT',    `/galleries/${galleryId}/members/${userId}`, { role }),
  deleteGalleryMember:(galleryId, userId)        => req('DELETE', `/galleries/${galleryId}/members/${userId}`),

  // Viewer tokens
  getViewerTokens:   (id)         => req('GET',    `/galleries/${id}/viewer-tokens`),
  createViewerToken: (id, data)   => req('POST',   `/galleries/${id}/viewer-tokens`, data),
  deleteViewerToken: (galleryId, tokenId) => req('DELETE', `/galleries/${galleryId}/viewer-tokens/${tokenId}`),

  // Studio members
  listStudioMembers:   ()              => req('GET',    `/studios/members`),
  getStudioMember:     (userId)        => req('GET',    `/studios/members/${userId}`),
  updateStudioMember:  (userId, role)  => req('PUT',    `/studios/members/${userId}`, { role }),
  removeStudioMember:  (userId)        => req('DELETE', `/studios/members/${userId}`),

  // Invitations
  createInvitation: (data)            => req('POST',   `/invitations`, data),
  getInvitations:   ()                => req('GET',    `/invitations`),
  deleteInvitation: (id)              => req('DELETE', `/invitations/${id}`),
  getInviteInfo:    (token)           => req('GET',    `/invitations/accept/${token}`),
  acceptInvite:     (token, password) => req('POST',   `/invitations/accept/${token}`, { password }),

  // Projects
  listProjects:        (orgId)     => req('GET',    orgId ? `/projects?orgId=${orgId}` : '/projects'),
  getProject:          (id)        => req('GET',    `/projects/${id}`),
  createProject:       (data)      => req('POST',   '/projects', data),
  updateProject:       (id, data)  => req('PATCH',  `/projects/${id}`, data),
  deleteProject:       (id)        => req('DELETE', `/projects/${id}`),
  getProjectGalleries:    (projectId)       => req('GET',  `/projects/${projectId}/galleries`),
  createProjectGallery:   (projectId, data) => req('POST', `/projects/${projectId}/galleries`, data),
  reorderProjectGalleries: (projectId, order) => req('POST', `/projects/${projectId}/galleries/reorder`, { order }),
  reorderOrgProjects:      (orgId, order)     => req('POST', `/organizations/${orgId}/projects/reorder`, { order }),
  buildAllProjectGalleries:(projectId)      => req('POST', `/projects/${projectId}/galleries/build-all`),
  buildAllStudioGalleries: ()               => req('POST', `/studios/build-all`),
  prerenderAll:            ()               => req('POST', `/studios/prerender`),
  prerenderOrg:            (orgId)          => req('POST', `/organizations/${orgId}/prerender`),

  // Dashboard
  getDashboard: () => req('GET', '/dashboard'),

  // Inspector (superadmin)
  inspectorSearch:          (q)                    => req('GET',    `/inspector/search?q=${encodeURIComponent(q)}`),
  inspectorGallery:         (id)                   => req('GET',    `/inspector/galleries/${id}`),
  inspectorRebuild:         (id)                   => req('POST',   `/inspector/galleries/${id}/rebuild`),
  inspectorSetActive:       (id, active)            => req('PATCH',  `/inspector/galleries/${id}`, { active }),
  inspectorRevokeUploadLink:(galleryId, linkId)     => req('DELETE', `/inspector/galleries/${galleryId}/upload-links/${linkId}`),
  inspectorRevokeToken:     (galleryId, tokenId)    => req('DELETE', `/inspector/galleries/${galleryId}/viewer-tokens/${tokenId}`),
  inspectorPhoto:           (id)                   => req('GET',    `/inspector/photos/${id}`),
  inspectorStudios:         ()                     => req('GET',    `/inspector/studios`),
  inspectorStudio:          (id)                   => req('GET',    `/inspector/studios/${id}`),
  inspectorProject:         (id)                   => req('GET',    `/inspector/projects/${id}`),
  inspectorUsers:           ()                     => req('GET',    `/inspector/users`),
  inspectorUser:            (id)                   => req('GET',    `/inspector/users/${id}`),
  inspectorAuditLog:        (params)               => req('GET',    `/inspector/audit-log?${new URLSearchParams(params)}`),
  inspectorDashboard:       ()                     => req('GET',    `/inspector/dashboard`),
  inspectorAnomalies:       (params = {})          => req('GET',    `/inspector/anomalies?${new URLSearchParams(params)}`),

  // Photographers (issue #133)
  listPhotographers:        (galleryId)               => req('GET',    `/galleries/${galleryId}/photographers`),
  listActivePhotographers:  (galleryId)               => req('GET',    `/galleries/${galleryId}/photographers/active`),
  createPhotographer:   (galleryId, data)          => req('POST',   `/galleries/${galleryId}/photographers`, data),
  updatePhotographer:   (galleryId, pgId, data)    => req('PATCH',  `/galleries/${galleryId}/photographers/${pgId}`, data),
  deletePhotographer:   (galleryId, pgId)          => req('DELETE', `/galleries/${galleryId}/photographers/${pgId}`),
  setPhotoPhotographer: (galleryId, photoId, data) => req('PATCH',  `/galleries/${galleryId}/photos/${photoId}`, data),
  bulkSetPhotographer:  (galleryId, data)          => req('PATCH',  `/galleries/${galleryId}/photos/bulk-attribute`, data),

  // Organizations (Sprint 22 canonical API)
  listOrganizations:        ()            => req('GET',    '/organizations'),
  getOrganization:          (id)          => req('GET',    `/organizations/${id}`),
  createOrganization:       (data)        => req('POST',   '/organizations', data),
  updateOrganization:       (id, data)    => req('PATCH',  `/organizations/${id}`, data),
  deleteOrganization:       (id)          => req('DELETE', `/organizations/${id}`),
  listOrgMembers:           (id)          => req('GET',    `/organizations/${id}/members`),
  upsertOrgMember:          (id, userId, role) => req('PUT', `/organizations/${id}/members/${userId}`, { role }),
  removeOrgMember:          (id, userId)  => req('DELETE', `/organizations/${id}/members/${userId}`),
  listOrgPhotographers:     (id)          => req('GET',    `/organizations/${id}/photographers`),
  toggleOrgPhotographer:    (id, userId)  => req('PATCH',  `/organizations/${id}/members/${userId}/photographer`),
  createOrgMember:          (id, data)    => req('POST',   `/organizations/${id}/members/create`, data),
  updateOrgMember:          (id, userId, data) => req('PATCH', `/organizations/${id}/members/${userId}`, data),
  listOrgDomains:           (id)          => req('GET',    `/organizations/${id}/domains`),
  addOrgDomain:             (id, domain, isPrimary) => req('POST', `/organizations/${id}/domains`, { domain, isPrimary }),
  removeOrgDomain:          (id, domain)  => req('DELETE', `/organizations/${id}/domains/${encodeURIComponent(domain)}`),

  // Platform (superadmin)
  listPlatformStudios:  ()            => req('GET',    '/platform/studios'),
  createPlatformStudio: (data)        => req('POST',   '/platform/studios', data),
  updatePlatformStudio: (id, data)    => req('PATCH',  `/platform/studios/${id}`, data),
  deletePlatformStudio: (id)          => req('DELETE', `/platform/studios/${id}`),
  setDefaultStudio:     (id)          => req('POST',   `/platform/studios/${id}/set-default`),
  switchStudio:         (studioId)    => req('POST',   `/platform/switch/${studioId}`),
  exitStudioSwitch:     ()            => req('DELETE', '/platform/switch'),
  listPlatformUsers:    ()            => req('GET',    '/platform/users'),
  updatePlatformUser:   (id, data)    => req('PATCH',  `/platform/users/${id}`, data),
  getPlatformLicense:   ()            => req('GET',    '/platform/license'),
  getPlatformLicenseUsage: ()         => req('GET',    '/platform/license/usage'),
  installPlatformLicense: (licenseJson) => req('POST', '/platform/license', { licenseJson }),

  // Gallery maintenance
  flushGalleryDist:       (id)         => req('DELETE', `/galleries/${id}/dist`),
  stripDistOriginals:     (id)         => req('DELETE', `/galleries/${id}/dist/originals`),
  reconcilePhotos:        (id)         => req('POST',   `/galleries/${id}/photos/reconcile`),
  deduplicatePhotos:      (id, dryRun = true) => req('POST', `/galleries/${id}/photos/deduplicate?dry_run=${dryRun}`),
  reanalyzeStatus:        (id)         => req('GET',    `/galleries/${id}/photos/reanalyze`),
  reanalyzePhotos:        (id, force)  => req('POST',   `/galleries/${id}/photos/reanalyze`, force ? { force: true } : undefined),

  // Upload (multipart — handled separately)
  uploadPhotos(galleryId, files, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      for (const f of files) fd.append('photos', f);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/galleries/${galleryId}/photos`);
      xhr.withCredentials = true;
      if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded / e.total);
      xhr.onload  = () => {
        if (xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          let msg = xhr.responseText;
          try { msg = JSON.parse(xhr.responseText)?.error || msg; } catch {}
          const err = new Error(msg);
          err.httpStatus = xhr.status;
          reject(err);
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(fd);
    });
  },

  // Public token-based upload (no auth)
  getUploadInfo(token) {
    return fetch(`/upload/${token}`).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Invalid link'))));
  },
  uploadPhotosViaToken(token, files, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      for (const f of files) fd.append('photos', f);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/upload/${token}/photos`);
      if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded / e.total);
      xhr.onload  = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.responseText));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(fd);
    });
  },

  // Upload a single file via token (for per-file queue with individual progress)
  uploadOneViaToken(token, file, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('photos', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/upload/${token}/photos`);
      if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded / e.total);
      xhr.onload  = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.responseText));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(fd);
    });
  },
};

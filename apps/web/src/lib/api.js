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

  // Settings
  getSettings:  ()     => req('GET',   '/settings'),
  saveSettings: (data) => req('PATCH', '/settings', data),
  smtpTest:     ()     => req('POST',  '/settings/smtp-test'),

  // Photographer ready notification
  notifyReady: (galleryId) => req('POST', `/galleries/${galleryId}/notify-ready`),

  // Jobs
  triggerBuild: (galleryId, force = false) => req('POST', `/galleries/${galleryId}/build`, { force }),
  listJobs:     (galleryId)               => req('GET',  `/galleries/${galleryId}/jobs`),
  getJob:       (jobId)                   => req('GET',  `/jobs/${jobId}`),

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
  listProjects:   ()          => req('GET',    '/projects'),
  getProject:     (id)        => req('GET',    `/projects/${id}`),
  createProject:  (data)      => req('POST',   '/projects', data),
  updateProject:  (id, data)  => req('PATCH',  `/projects/${id}`, data),
  deleteProject:  (id)        => req('DELETE', `/projects/${id}`),

  // Platform (superadmin)
  listPlatformStudios:  ()            => req('GET',    '/platform/studios'),
  createPlatformStudio: (data)        => req('POST',   '/platform/studios', data),
  updatePlatformStudio: (id, data)    => req('PATCH',  `/platform/studios/${id}`, data),
  deletePlatformStudio: (id)          => req('DELETE', `/platform/studios/${id}`),
  listPlatformUsers:    ()            => req('GET',    '/platform/users'),
  updatePlatformUser:   (id, data)    => req('PATCH',  `/platform/users/${id}`, data),

  // Upload (multipart — handled separately)
  uploadPhotos(galleryId, files, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      for (const f of files) fd.append('photos', f);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/galleries/${galleryId}/photos`);
      xhr.withCredentials = true;
      if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded / e.total);
      xhr.onload  = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.responseText));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(fd);
    });
  },
};

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
  login:   (email, password) => req('POST', '/auth/login', { email, password }),
  logout:  ()                => req('POST', '/auth/logout'),
  me:      ()                => req('GET',  '/auth/me'),

  // Galleries
  listGalleries:   ()          => req('GET',    '/galleries'),
  getGallery:      (id)        => req('GET',    `/galleries/${id}`),
  createGallery:   (data)      => req('POST',   '/galleries', data),
  updateGallery:   (id, data)  => req('PATCH',  `/galleries/${id}`, data),
  deleteGallery:   (id)        => req('DELETE', `/galleries/${id}`),

  // Photos
  listPhotos:  (galleryId)           => req('GET',    `/galleries/${galleryId}/photos`),
  deletePhoto: (galleryId, filename) => req('DELETE', `/galleries/${galleryId}/photos/${encodeURIComponent(filename)}`),
  reorderPhotos: (galleryId, order)  => req('PUT',    `/galleries/${galleryId}/photos/order`, { order }),

  // Settings
  getSettings:  ()     => req('GET',   '/settings'),
  saveSettings: (data) => req('PATCH', '/settings', data),

  // Jobs
  triggerBuild: (galleryId, force = false) => req('POST', `/galleries/${galleryId}/build`, { force }),
  listJobs:     (galleryId)               => req('GET',  `/galleries/${galleryId}/jobs`),
  getJob:       (jobId)                   => req('GET',  `/jobs/${jobId}`),

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

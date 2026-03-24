# GalleryPack SaaS — API Reference

Base URL: `/api`

All authenticated routes require an `sid` session cookie (set after `POST /api/auth/login`).

---

## Authentication

### `POST /api/auth/login`

```json
{ "email": "admin@example.com", "password": "your-password" }
```

Response `200`:

```json
{ "user": { "id": "...", "email": "admin@example.com", "role": "admin", "studioId": "..." } }
```

Sets an `sid` HTTP-only session cookie.

---

### `POST /api/auth/logout`

Clears the session cookie. Response `200`: `{ "ok": true }`

---

### `GET /api/auth/me`

Returns the current authenticated user or `401`.

---

## Galleries

All gallery routes require authentication (`requireAdmin`).

### `GET /api/galleries`

List all galleries for the authenticated studio, ordered by creation date descending.

---

### `POST /api/galleries`

Create a gallery.

```json
{
  "slug": "summer-2025",
  "title": "Summer 2025",
  "locale": "fr",
  "access": "public"
}
```

Required: `slug`. Returns `409` if slug already exists in the studio.

---

### `GET /api/galleries/:id`

Get a single gallery. Response includes:

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Gallery description |
| `photoCount` | number | Number of source photos |
| `diskSize` | number | Total disk usage in bytes (source + built) |
| `needsRebuild` | boolean | True if photos have changed since the last build |
| `dateRange` | object \| null | `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" }` — resolved from EXIF |

---

### `PATCH /api/galleries/:id`

Update gallery fields. Accepts any subset of:

| Field | Type | Notes |
|-------|------|-------|
| `title` | string | |
| `subtitle` | string | |
| `author` | string | |
| `authorEmail` | string | |
| `date` | string | `YYYY-MM-DD` |
| `location` | string | |
| `locale` | string | `fr` \| `en` \| `de` \| `es` \| `it` \| `pt` |
| `access` | string | `public` \| `private` \| `password` |
| `password` | string | Stored as scrypt hash; plain text discarded |
| `coverPhoto` | string | Original filename |
| `allowDownloadImage` | boolean | |
| `allowDownloadGallery` | boolean | |
| `private` | boolean | |

---

### `POST /api/galleries/:id/rename`

Rename a gallery's slug. Moves the source photo folder and built output folder on disk to match the new slug.

```json
{ "slug": "new-slug" }
```

Returns `409` if the new slug is already taken. Returns `{ "ok": true, "slug": "new-slug" }` on success.

---

### `DELETE /api/galleries/:id`

Delete a gallery. Returns `{ "ok": true }`.

---

## Photos

### `GET /api/galleries/:id/photos`

List photos for a gallery. Returns array of:

```json
[
  { "file": "DSC01234.jpg", "size": 8291234, "mtime": 1740000000000, "thumb": "dsc01234" }
]
```

`thumb` is the processed filename stem (without extension) — use `/<slug>/img/grid/<thumb>.webp` to display thumbnails.

---

### `POST /api/galleries/:id/photos`

Upload photos. Multipart form, field name `photos`.

- Max 200 files per request
- Max 200 MB per file
- Max 500 photos per gallery (returns `422` if exceeded)
- Accepted formats: `.jpg`, `.jpeg`, `.png`, `.tiff`, `.tif`, `.heic`, `.heif`, `.avif`
- Rate limit: 100 requests/min per IP

Response `201`:

```json
{ "uploaded": 3, "files": [{ "file": "DSC01234.jpg", "size": 8291234 }] }
```

---

### `DELETE /api/galleries/:id/photos/:filename`

Delete a single photo. Returns `{ "ok": true }`.

---

### `PUT /api/galleries/:id/photos/order`

Reorder photos. Pass the desired order as an array of filenames:

```json
{ "order": ["DSC00100.jpg", "DSC00200.jpg", "DSC00050.jpg"] }
```

---

## Builds

### `POST /api/galleries/:id/build`

Enqueue a build. Returns `429` if a build is already in progress for this studio.

```json
{ "force": false }
```

Response `202`:

```json
{
  "id": "01j9abc...",
  "galleryId": "...",
  "status": "queued",
  "createdAt": 1740000000000
}
```

---

### `GET /api/galleries/:id/jobs`

List the last 20 build jobs for a gallery, newest first.

---

### `GET /api/jobs/:jobId`

Get a single job.

---

### `GET /api/jobs/:jobId/stream`

**SSE** — live build log stream.

Events:

| Event name | Payload | Description |
|------------|---------|-------------|
| `log` | `{ seq, data, ts }` | A single log line from the build |
| `done` | `{ seq, data, ts }` | Build succeeded — `data` is a JSON string with `{ photoCount, distName, durationMs }` |
| `error` | `{ seq, data, ts }` | Build failed — `data` is the error message |
| `close` | `{ status, errorMsg }` | Stream closing — `status` is `done` or `error` |

The stream closes automatically when the job reaches a terminal state.

---

## Gallery access (public routes — no auth required)

### `POST /api/galleries/:id/verify-password`

Verify a viewer password. Sets a `viewer_<id>` HTTP-only cookie (24h).

```json
{ "password": "maple-cloud-42" }
```

Returns `401` on wrong password, `400` if the gallery is not password-protected.

---

### `GET /api/galleries/:id/view`

Return public gallery data if authorized.

- `access=public` → always returns gallery data
- `access=password` → requires valid `viewer_<id>` cookie; returns `401 { requiresPassword: true }` otherwise
- `access=private` → returns `403`

---

## Invites

### `POST /api/invites`

Create an invite link. Requires authentication.

```json
{
  "galleryId": "optional-gallery-id",
  "email":     "photographer@example.com",
  "label":     "Wedding — Smith & Jones",
  "expiresIn": 604800000,
  "singleUse": false
}
```

If `email` is provided and `EMAIL_PROVIDER=smtp`, an invite email is sent automatically.

Response `201` — includes `token` (64-char hex) for constructing the upload URL:

```
/invite/<token>
```

---

### `GET /api/invites`

List all invites for the authenticated studio. Requires authentication.

---

### `GET /api/invites/:token`

Validate an invite token. **Public route** — used by the photographer upload page.

Returns:

```json
{
  "id": "...",
  "galleryId": "...",
  "email": "photographer@example.com",
  "label": "Wedding — Smith & Jones"
}
```

Error responses:

| Status | Body | Cause |
|--------|------|-------|
| `404` | `Invite not found` | Token doesn't exist |
| `410` | `Invite has expired` | Past `expires_at` |
| `410` | `Invite has been revoked` | `revoked_at` is set |
| `410` | `Invite has already been used` | `single_use=true` and already used |

For single-use invites, the invite is marked as used on this request.

---

### `POST /api/invites/:id/revoke`

Revoke an invite. Requires authentication. Returns `{ "ok": true }`.

---

## Settings

### `PATCH /api/settings`

Update global studio settings. Requires authentication. Accepts any subset of:

| Field | Type | Description |
|-------|------|-------------|
| `defaultAuthor` | string | Default author name for new galleries |
| `defaultAuthorEmail` | string | Default author email for new galleries |
| `defaultLocale` | string | Default locale for new galleries (`fr` \| `en` \| `de`) |
| `defaultAccess` | string | Default access mode for new galleries (`public` \| `private` \| `password`) |
| `defaultAllowDownloadImage` | boolean | Default per-photo download setting for new galleries |
| `defaultAllowDownloadGallery` | boolean | Default ZIP download setting for new galleries |
| `defaultPrivate` | boolean | Default private flag for new galleries |

Returns the updated settings object.

---

## Public routes

### `GET /api/public/galleries`

Return all galleries visible on the public landing page (non-private galleries). No authentication required.

Each gallery in the response includes:

| Field | Type | Description |
|-------|------|-------------|
| `photoCount` | number | Number of photos in the gallery |
| `description` | string | Gallery description |
| `dateRange` | object \| null | `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" }` |

---

## Health

### `GET /api/health`

System healthcheck. No authentication required.

```json
{
  "ok": true,
  "version": "0.0.1",
  "db": "connected",
  "storage": "ok",
  "worker": "idle"
}
```

Returns HTTP `200` when healthy, `503` when degraded.

---

## Error format

All errors return JSON:

```json
{ "error": "Human-readable message" }
```

Common status codes:

| Code | Meaning |
|------|---------|
| `400` | Bad request — missing or invalid parameter |
| `401` | Not authenticated |
| `403` | Authenticated but not authorized |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate slug) |
| `410` | Gone (revoked/expired invite) |
| `422` | Unprocessable (e.g. photo quota exceeded) |
| `429` | Rate limited or concurrent build already running |
| `503` | Service degraded (health check) |

# GalleryPack SaaS — API Reference

Base URL: `/api`

All authenticated routes require a `session` HTTP-only cookie (set after `POST /api/auth/login`).

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

Sets a `session` HTTP-only cookie.

---

### `POST /api/auth/logout`

Clears the session cookie. Response `200`: `{ "ok": true }`

---

### `GET /api/auth/me`

Returns the current authenticated user or `401`.

```json
{ "id": "...", "email": "admin@example.com", "role": "admin", "name": "Jane Smith", "studioId": "...", "studioRole": "owner" }
```

---

### `PATCH /api/auth/me`

Update own display name.

```json
{ "name": "Jane Smith" }
```

---

### `GET /api/auth/me/galleries`

List galleries the current user has explicit gallery access to.

---

## Galleries

All gallery routes require authentication, scoped to the user's studio.

### `GET /api/galleries`

List all galleries, ordered by creation date descending.

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

### `DELETE /api/galleries/:id`

Delete a gallery. Returns `{ "ok": true }`.

---

### `POST /api/galleries/:id/rename`

Rename a gallery's slug. Moves the source photo folder and built output folder on disk.

```json
{ "slug": "new-slug" }
```

Returns `409` if the new slug is already taken. Returns `{ "ok": true, "slug": "new-slug" }` on success.

---

## Photos

Photo routes are role-checked. Studio `photographer` can only upload to galleries where they have `contributor` or `editor` gallery access. Studio `editor`+ can upload anywhere.

### `GET /api/galleries/:id/photos`

List photos for a gallery. Returns array of:

```json
[
  { "file": "DSC01234.jpg", "size": 8291234, "mtime": 1740000000000, "thumb": "dsc01234" }
]
```

`thumb` is the processed filename stem — use `/<slug>/img/grid/<thumb>.webp` to display thumbnails.

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

Reorder photos. Requires `contributor` or `editor` gallery role (or studio `editor`+).

```json
{ "order": ["DSC00100.jpg", "DSC00200.jpg", "DSC00050.jpg"] }
```

---

### `POST /api/galleries/:id/photos/upload-done`

Notify gallery editors and studio editors/admins/owners that upload is complete. Sends an email if SMTP is configured.

---

## Builds

### `POST /api/galleries/:id/build`

Enqueue a build. Requires studio `editor`+ role. Returns `429` if a build is already in progress for this studio.

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

## Gallery access control

### `GET /api/galleries/:id/members`

List gallery members.

```json
[{ "user_id": "...", "email": "jane@example.com", "role": "contributor" }]
```

---

### `PUT /api/galleries/:id/members/:userId`

Add or update a gallery member's role (upsert).

```json
{ "role": "contributor" }
```

Valid roles: `viewer`, `contributor`, `editor`.

---

### `DELETE /api/galleries/:id/members/:userId`

Remove a gallery member.

---

### `GET /api/galleries/:id/viewer-tokens`

List viewer tokens for the gallery.

---

### `POST /api/galleries/:id/viewer-tokens`

Create a viewer token.

```json
{ "label": "Client preview", "expiresAt": "2025-12-31T23:59:59Z" }
```

Both fields are optional.

---

### `DELETE /api/galleries/:id/viewer-tokens/:tokenId`

Revoke a viewer token.

---

### `POST /api/galleries/:id/verify-password`

**Public route** — Verify a viewer password. Sets a `viewer_<id>` HTTP-only cookie (24h).

```json
{ "password": "maple-cloud-42" }
```

Returns `401` on wrong password, `400` if the gallery is not password-protected.

---

### `GET /api/galleries/:id/view`

**Public route** — Return public gallery data if authorized.

- `access=public` → always returns gallery data
- `access=password` → requires valid `viewer_<id>` cookie; returns `401 { requiresPassword: true }` otherwise
- `access=private` → returns `403`

---

## Studio members

### `GET /api/studios/members`

List all studio members. Each entry includes a `galleries` array of their gallery accesses.

Requires `admin` or `owner` studio role.

---

### `PUT /api/studios/members/:userId`

Update a studio member's studio role.

```json
{ "role": "editor" }
```

Valid roles: `photographer`, `editor`, `admin`, `owner`.

---

### `DELETE /api/studios/members/:userId`

Remove a member from the studio.

---

## Invitations

Replaces the old `/api/invites` system. Studio invitations let you onboard new users by email; they accept the invite and set a password.

### `POST /api/invitations`

Create a studio invitation. Requires `admin` or `owner` studio role. Sends an invitation email automatically if SMTP is configured; the invite link is returned either way.

```json
{ "email": "photographer@example.com", "role": "photographer" }
```

Response `201` — includes `token` for constructing the accept URL: `/api/invitations/accept/<token>`

---

### `GET /api/invitations`

List pending (not yet accepted) invitations. Requires `admin` or `owner`.

---

### `DELETE /api/invitations/:id`

Revoke a pending invitation. Requires `admin` or `owner`.

---

### `GET /api/invitations/accept/:token`

**Public route** — Fetch invitation details by token (email, studio role, studio name).

---

### `POST /api/invitations/accept/:token`

**Public route** — Accept an invitation. Creates the user account, sets studio membership, and opens a session.

```json
{ "password": "chosen-password" }
```

Sets a `session` cookie on success.

---

## Settings

Requires `admin` or `owner` studio role.

### `GET /api/settings`

Return current studio settings. `smtpPass` is never returned; instead `smtpPassSet: true/false` indicates whether a password is stored.

---

### `PATCH /api/settings`

Update studio settings. Accepts any subset of:

| Field | Type | Description |
|-------|------|-------------|
| `siteTitle` | string | Public site title |
| `defaultAuthor` | string | Default author name for new galleries |
| `defaultAuthorEmail` | string | Default author email for new galleries |
| `defaultLocale` | string | Default locale for new galleries (`fr` \| `en` \| `de`) |
| `defaultAccess` | string | Default access mode for new galleries |
| `defaultAllowDownloadImage` | boolean | Default per-photo download setting |
| `defaultAllowDownloadGallery` | boolean | Default ZIP download setting |
| `defaultPrivate` | boolean | Default private flag |
| `smtpHost` | string | SMTP server hostname |
| `smtpPort` | number | SMTP port (`587` or `465`) |
| `smtpUser` | string | SMTP login |
| `smtpPass` | string | SMTP password (stored securely, never returned) |
| `smtpFrom` | string | From address, e.g. `GalleryPack <noreply@example.com>` |
| `smtpSecure` | boolean | `true` for port 465 (SSL) |
| `baseUrl` | string | Public base URL used in email links |

Returns the updated settings object.

---

### `POST /api/settings/smtp-test`

Send a test email to the logged-in user's email address. Returns inline success or error.

---

## Public routes

### `GET /api/public/galleries`

Return all galleries visible on the public landing page (non-private galleries). No authentication required.

Each gallery includes:

| Field | Type | Description |
|-------|------|-------------|
| `photoCount` | number | Number of photos |
| `description` | string | Gallery description |
| `dateRange` | object \| null | `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" }` |

---

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

## Authorization summary

| Studio role | What they can do |
|-------------|-----------------|
| `photographer` | Read galleries they have gallery access to; upload/reorder in galleries with `contributor` or `editor` gallery role |
| `editor` | Upload anywhere, manage all galleries |
| `admin` | Everything `editor` can do + manage team members and settings |
| `owner` | Full access |

| Gallery role | What they can do |
|-------------|-----------------|
| `viewer` | Read-only access to a private gallery |
| `contributor` | Upload photos and reorder them |
| `editor` | Manage gallery settings and photos |

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

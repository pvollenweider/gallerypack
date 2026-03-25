# Access Modes — Static vs Application Layer

## How galleries are served

```
Browser → Caddy (proxy) → api:4000 (Express)
                    ↓
              /srv/galleries (= ./dist)
              static file server (read-only)
```

Caddy serves **only the `dist/` directory** as static files — the `src/` directory (original full-resolution photos) is **never mounted in Caddy** and is therefore inaccessible from the web.

---

## URL matrix

| URL pattern | Served by | Auth enforced? |
|-------------|-----------|---------------|
| `/api/*` | Express API | Yes (session cookie / viewer token) |
| `/admin*` | Express API (React SPA) | Yes (session cookie) |
| `/<slug>/` | Caddy static (from `dist/`) | **No** — see note below |
| `/<slug>/photos.json` | Caddy static (from `dist/`) | **No** |
| `/<slug>/*.jpg` (thumbnails) | Caddy static (from `dist/`) | **No** |

---

## Known limitation: password galleries are bypassed at the HTTP level

When a gallery has `access = 'password'`, the application layer (Express + React SPA) enforces a password prompt. However, once a gallery is built, its `dist/<slug>/` assets are served as plain static files by Caddy with **no HTTP-level authentication**.

This means:
- If an attacker knows the `<slug>` and guesses or discovers the asset filenames, they can download the images directly.
- The password protection only prevents casual browsing via the app UI.

### Current mitigation

- Thumbnail filenames are content-hash-based (not guessable by sequential enumeration).
- `photos.json` is a manifest with metadata; it does not contain the original full-res images (those live in `src/`, which is never served).
- The gallery slug is the only publicly known path component.

### Future options (ordered by complexity)

1. **Obfuscated `dist/` paths** — serve password galleries under a random, non-guessable prefix in `dist/` (e.g. `dist/<uuid>/`). Caddy serves them transparently; only the app knows the path. Low overhead, effective against casual guessing.
2. **Caddy `basic_auth`** — Caddy supports per-route HTTP basic auth. Could be configured per gallery via the Caddy API, but requires the API to manage Caddy config dynamically. Complex.
3. **S3 signed URLs** — store gallery assets in S3 with presigned URLs. Full access control per asset, cloud-only.
4. **Proxy all gallery assets through Express** — eliminates the bypass entirely but adds CPU/IO overhead for every image request.

**Status**: option 1 (obfuscated paths) is the recommended next step and will be addressed when issue #60 (gallery.id as system truth) is implemented — using `gallery.id` as the storage key rather than `slug` provides the same security property naturally.

---

## `src/` directory — original photos

The `src/<slug>/photos/` directory contains the original uploaded photos. It is:
- Mounted in the `api` and `worker` containers (read/write).
- **NOT mounted in the Caddy container** — not accessible via HTTP under any URL.
- Protected solely by filesystem permissions on the host.

No HTTP-level access to raw originals is possible in the current architecture.

---

## Manifest security note

`dist/<slug>/photos.json` is publicly accessible for public galleries and accessible without auth for password galleries (see bypass above). It contains:
- Processed thumbnail filenames
- EXIF metadata (date, camera model, GPS coordinates if present)

Consider stripping GPS EXIF from photos.json if location privacy is a concern. The raw EXIF is discarded during the build phase (not stored in `dist/`), but date/camera data is retained.

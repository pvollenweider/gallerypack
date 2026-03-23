# Privacy & access modes

SSGG supports three access modes, set per gallery in `gallery.config.json`.

## Public (default)

```json
{ "project": { "title": "My Gallery" } }
```

The gallery is listed in the site index and accessible at a predictable URL
(`/my-gallery/`). No access control.

## Private link (unguessable URL)

```json
{ "project": { "title": "My Gallery", "private": true } }
```

The output folder becomes a 16-char SHA-256 hash (e.g. `/a3f8c2d1e4b9f7a0/`).
The gallery is hidden from the site index. Anyone with the link can view it.

**Honest disclaimer:** this is security through obscurity. The URL is hard to
guess but not cryptographically protected. Do not use it for sensitive content
that must never be disclosed.

## Password protection (basic auth)

Not yet built into the generator. For now: configure `.htpasswd` / `auth_basic`
at the server level (Apache/Nginx) and point it at the gallery folder.
The next version will generate the necessary `.htaccess` / server config files.

## What is protected

When using a private link or server-level auth, ensure protection covers:
- `index.html`
- `data.js`
- `gallery.js`
- `img/` (all subfolders)
- `originals/` (if downloads are enabled)
- `photos.json`

Protecting only the HTML page while leaving images accessible defeats the purpose.

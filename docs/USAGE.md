# GalleryPack v2 — Usage Guide

## Admin Panel (`/admin`)

### Galleries tab

Lists all galleries with their build status. For each gallery:
- **Edit** — change title, language, access (public/password), photographer info, download options. Changes trigger an automatic rebuild.
- **Delete** — removes source files, built output, and the job from history.
- **Status badges:** Queued → Building → Done / Error

### Invite links tab

Invite links let photographers upload their own galleries without admin access.

**Creating an invite link:**
1. Click **+ New link**
2. Optionally fill in:
   - **Label** — your reference (e.g. "Wedding — Smith & Jones")
   - **Photographer name/email** — pre-fills the upload form
   - **Gallery title, location, date** — pre-fills gallery metadata
   - **Single delivery** — if checked, the link can only be used once
3. Click **Create link** — the link is copied to your clipboard automatically

If a photographer email is set, an email with the upload link is sent immediately (requires SMTP configuration).

**Statuses:**
- Unused — link created, not yet used
- Used N× — number of galleries created through this link

**Revoking:** Click **Revoke** to invalidate the link. Existing galleries are not affected.

### Settings tab

Configure:
- **App name** — displayed in emails
- **Admin email** — receives copies of all notifications
- **SMTP** — host, port, credentials, from address

---

## Creating a Gallery (Admin)

Go to `/new`:
1. Fill in gallery details (title, photographer, date, location, language, access)
2. Select photos (drag & drop or click)
3. Click **Build gallery**

You're redirected to the build log page. The gallery is ready within seconds to minutes depending on photo count.

---

## Photographer Upload Flow (`/upload/<token>`)

When a photographer receives an invite link:
1. They land on the upload page (pre-filled if the admin configured it)
2. Step 1: select photos (drag & drop, click, or from iPhone Photos library)
3. Step 2: fill in name, email, gallery title
4. Click **Create my gallery** — redirected to the build status page

After the build, the photographer receives an email (if SMTP configured) with:
- The gallery link
- A private management link (`/my-gallery/<id>?token=...`)

---

## Photographer Management (`/my-gallery/<id>?token=...`)

Accessible only via the private link (included in the post-build email).

Photographers can:
- **View status** — see if the gallery is ready, with a direct link
- **Add photos** — drag & drop more photos, triggers a rebuild
- **Remove photos** — click × on any photo, triggers a rebuild
- **Edit details** — change title and location, triggers a rebuild

---

## Gallery Viewer

Built galleries are accessible at `/<gallery-slug>/`.

Features:
- Masonry grid layout with responsive columns
- Click any photo — full-screen lightbox with EXIF info
- Thumbnail strip at the bottom of the lightbox
- Download individual photos (if enabled)
- Download full gallery as ZIP (if enabled)
- Slideshow autoplay
- Password gate (if access = password-protected)
- **Back to gallery list** link in the toolbar (unless `standalone: true`)

---

## Gallery Config Reference

Each gallery source folder (`src/<slug>/`) contains a `gallery.config.json`:

```json
{
  "project": {
    "name": "my-gallery",
    "title": "Summer in Paris",
    "author": "Jane Doe",
    "authorEmail": "jane@example.com",
    "date": "2025-07-15",
    "location": "Paris, France",
    "locale": "fr",
    "access": "password",
    "password": "my-secret",
    "allowDownloadImage": true,
    "allowDownloadGallery": true,
    "standalone": false,
    "autoplay": { "slideshowInterval": 5 }
  }
}
```

**Notes:**
- `location` from EXIF data takes priority over the config value during build
- `standalone: true` copies vendor/fonts into the gallery directory
- `date: "auto"` uses the earliest EXIF date from the photos

---

## CLI Commands

```bash
# Build a specific gallery
node build/index.js my-gallery-slug

# Build all galleries
node build/index.js --all

# Force rebuild (reconvert all images)
node build/index.js --force my-gallery-slug

# Start the server
node server/app.js
```

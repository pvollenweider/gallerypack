# GalleryPack v2 — Usage Guide

## Table of contents

1. [Admin Panel](#admin-panel)
   - [Galleries tab](#galleries-tab)
   - [Invite links tab](#invite-links-tab)
   - [Settings tab](#settings-tab)
2. [Creating a Gallery (Admin)](#creating-a-gallery-admin)
3. [Photographer Upload Flow](#photographer-upload-flow)
4. [Photographer Management Page](#photographer-management-page)
5. [Access Management](#access-management)
6. [Email Notifications](#email-notifications)
7. [Multi-language Support (i18n)](#multi-language-support-i18n)
8. [Gallery Viewer](#gallery-viewer)
9. [Gallery Config Reference](#gallery-config-reference)
10. [CLI Commands](#cli-commands)

---

## Admin Panel

Located at `/admin`. Protected by the `ADMIN_PASSWORD` environment variable.

### Galleries tab

Lists all galleries, sorted by most recent. Each card shows:

- **Title** and photographer name
- **Date** and gallery URL (once built)
- **Status badge** — Queued / Building / Done / Error

**Actions per gallery:**

| Button | Description |
|--------|-------------|
| **Edit** | Open the edit modal — change title, language, access mode, photographer info, download settings. All changes trigger an automatic rebuild. |
| **Send access link** | Re-send (or grant for the first time) the photographer management link. If the gallery has a photographer email, the link is sent by email. Otherwise it is copied to your clipboard. |
| **Revoke access** | Invalidate the current photographer management link. The photographer can no longer access `/my-gallery/<id>` with their old link. You can re-grant access at any time using **Send access link**. |
| **Delete** | Remove all source files, built output, and the job record. Irreversible. |

The gallery list auto-refreshes every 3 seconds while any gallery is building or queued.

---

### Invite links tab

Invite links let photographers upload their own gallery without admin access. You create a link, send it to the photographer, and they do the rest.

**Creating an invite link:**

1. Click **+ New link**
2. Fill in optionally:
   - **Label** — your internal reference (e.g. `Wedding — Smith & Jones`)
   - **Photographer name / email** — pre-fills the upload form and enables automatic email delivery
   - **Gallery title, location, date** — pre-fills gallery metadata
   - **Single delivery** — if checked, the link can only be used once (any further attempt is rejected with an error)
3. Click **Create link** — the upload URL is copied to your clipboard

If a photographer email was set, an email with the upload link is sent immediately (requires SMTP to be configured and enabled).

**Usage badges:**
- `Unused` — link exists but no gallery has been created through it
- `Used N×` — N galleries have been created through this link

**Copying:** Click **Copy** to copy the upload URL to your clipboard at any time.

**Revoking an invite link:**
Click **Revoke** to permanently invalidate the invite link. No new uploads can be made through it. As a side effect, the photographer management links for **all galleries created through that invite** are also invalidated (their tokens are rotated). This is useful if a link was accidentally shared with the wrong person.

> **Note:** Revoking an invite link does not delete existing galleries — it only prevents further uploads and cuts off management access. Use **Send access link** on each affected gallery to re-grant access to the right person.

---

### Settings tab

#### Application

| Field | Description |
|-------|-------------|
| **App name** | Displayed in the footer of outgoing emails (default: `GalleryPack`) |
| **Admin email** | Receives CC copies of all notification emails |

#### Email notifications (SMTP)

Toggle **Enable email notifications (SMTP)** to show/hide the SMTP fields.

| Field | Description |
|-------|-------------|
| **SMTP host** | e.g. `smtp.gmail.com`, `email-smtp.eu-west-1.amazonaws.com` |
| **Port** | `587` for STARTTLS (most providers), `465` for direct SSL |
| **Username** | SMTP login |
| **Password** | SMTP password (stored in `server/settings.json`, never exposed via the API) |
| **From address** | Sender address, e.g. `GalleryPack <noreply@your-domain.com>` |
| **Direct SSL/TLS** | Check only when using **port 465**. Leave unchecked for port 587. Checking this with port 587 causes an SSL handshake error. |

Use **Send test email** to verify your SMTP configuration — a test email is sent to the admin email address.

#### Interface

| Field | Description |
|-------|-------------|
| **Interface language** | Sets the language of the admin panel, upload page, and management page. Options: Auto (browser), English, Français, Deutsch, Italiano, Español, Português. Saved to `server/settings.json`. |

---

## Creating a Gallery (Admin)

Go to `/new` (password-protected by Basic Auth using `ADMIN_PASSWORD`):

1. Select photos — drag & drop or click to open the file picker
2. Fill in:
   - **Title** (required)
   - **Photographer name / email**
   - **Language** — gallery UI language (fr, en, de, it, es, pt)
   - **Location** — overridden by EXIF data if present
   - **Access** — Public or Password-protected
   - **Downloads** — enable/disable individual photo and full ZIP download
3. Click **Build gallery**

You are redirected to the build status page (`/status/<id>`). The gallery is typically ready within seconds to a few minutes depending on the number of photos.

After a successful build, emails are sent automatically (if SMTP is configured):
- Photographer email: gallery link + management link
- Admin email: CC copy

---

## Photographer Upload Flow

When a photographer receives an invite link (`/upload/<token>`):

1. **Step 1 — Photos:** Select photos by clicking or dragging. Preview grid appears immediately. Photos can be removed before submitting.
2. **Step 2 — Details:** Fill in name (required), email, gallery title, and optional advanced settings (language, location, access, download options).
3. Click **Create my gallery** — redirected to the build status page.

After the build, the photographer receives an email (if SMTP is configured) with:
- The public gallery link
- A **private management link** (`/my-gallery/<id>?token=...`) allowing them to add/remove photos and edit metadata

> **Single-delivery links:** If the invite was set to "single delivery", any second use of the link returns an error.

---

## Photographer Management Page

URL: `/my-gallery/<id>?token=<photographerToken>`

This is a private page accessible only via the management link. It is **not** password-protected by admin credentials — it relies solely on the token in the URL.

Photographers can:

| Action | Effect |
|--------|--------|
| **View status** | See whether the gallery is queued, building, ready, or errored. A direct link to the live gallery appears once ready. |
| **Add photos** | Drag & drop or click to add photos. Triggers an automatic rebuild. |
| **Remove photos** | Click × on any listed photo. Triggers an automatic rebuild. |
| **Edit title / location** | Click "Save & rebuild". Changes take effect after the rebuild. |

**Invalid link error:**

If the page shows "This management link is no longer valid. It may have been revoked by the administrator.", it means:
- An admin clicked **Revoke access** for this gallery, or
- The invite link used to create this gallery was revoked

Use the **Send access link** button in the admin panel to issue a new link.

---

## Access Management

GalleryPack uses per-gallery tokens to control photographer access. Each gallery has a `photographerToken` — a random string that is part of the management URL.

### Revoking access

Two ways to invalidate a photographer's management link:

1. **Per gallery:** Admin panel → Galleries tab → **Revoke access** button. Generates a new token; the old management URL stops working immediately.
2. **Via invite revocation:** Admin panel → Invite links tab → **Revoke**. All galleries created through that invite have their tokens rotated simultaneously.

### Re-granting access

After revoking, use **Send access link** on the gallery card:
- If the gallery has a photographer email → sends the new management link by email
- If no email → copies the new management link to your clipboard (to share manually)

The management link can be re-sent as many times as needed, regardless of whether access was previously revoked.

### Token lifecycle

| Event | Token effect |
|-------|-------------|
| Gallery created | Token generated and stored in `server/jobs.json` |
| Gallery built | Token included in the post-build notification email |
| Admin revokes access | Token rotated (old link stops working) |
| Invite revoked | Tokens rotated for all linked galleries |
| Admin sends access link | Token unchanged, current link re-sent/copied |

---

## Email Notifications

GalleryPack sends three types of emails (all require SMTP to be configured and enabled):

### 1. Invite created
Sent when an invite link is created with a photographer email pre-filled.

- **To:** photographer
- **Content:** upload link

### 2. Gallery ready
Sent after a successful build.

- **To:** photographer (if email was provided) + admin (CC)
- **Content:** public gallery link + private management link

### 3. Access link sent
Sent when an admin clicks **Send access link** for a gallery that has a photographer email.

- **To:** photographer
- **Content:** current management link (new URL if access was previously revoked)

> All emails fall back gracefully if SMTP is not configured — no error is thrown, the action simply proceeds without sending.

---

## Multi-language Support (i18n)

All user-facing pages (upload, photographer management, build status) and the admin panel are available in 6 languages: **English, Français, Deutsch, Italiano, Español, Português**.

### Locale priority

The language used on each page is determined in this order:

| Priority | Source | Applies to |
|----------|--------|------------|
| 1 | Gallery's `locale` field (from `gallery.config.json`) | Upload page, photographer management page |
| 2 | **Interface language** setting in admin Settings | Admin panel |
| 3 | Browser language (`navigator.language`) | All pages (fallback) |
| 4 | English | Final fallback |

### Setting the interface language

Go to `/admin` → **Settings** tab → **Interface** section → select a language from the **Interface language** dropdown → click **Save**. The admin panel re-renders immediately in the selected language.

### Gallery locale

The gallery locale is set in the **Edit** modal (Language field) or during gallery creation. It controls the language of the gallery viewer UI (dates, labels, etc.) and is also used to determine the upload page language when a photographer uses an invite link.

---

## Gallery Viewer

Built galleries are accessible at `/<gallery-slug>/`.

| Feature | Notes |
|---------|-------|
| Masonry grid | Responsive, adapts to screen width |
| Lightbox | Click any photo — full-screen view with EXIF overlay |
| Thumbnail strip | Scrollable strip at the bottom of the lightbox |
| Slideshow | Autoplay with configurable interval (`autoplay.slideshowInterval` in config) |
| Download photo | Per-image download button (if `allowDownloadImage: true`) |
| Download ZIP | Full gallery ZIP, assembled client-side via JSZip (if `allowDownloadGallery: true`) |
| Password gate | JavaScript gate; prompts for password before revealing the gallery |
| Gallery list | "Back to list" link in toolbar (not shown for standalone galleries) |

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

| Field | Default | Description |
|-------|---------|-------------|
| `name` | — | Slug (directory name, no spaces) |
| `title` | — | Display title |
| `author` | — | Photographer name |
| `authorEmail` | — | Photographer email (used in emails) |
| `date` | `"auto"` | Date string, or `"auto"` to use earliest EXIF date |
| `location` | — | Location string (overridden by EXIF if EXIF has GPS data) |
| `locale` | `"fr"` | Gallery UI language: `en`, `fr`, `de`, `it`, `es`, `pt` |
| `access` | (public) | `"password"` to enable password gate |
| `password` | — | Password for the gallery gate |
| `allowDownloadImage` | `true` | Show per-photo download buttons |
| `allowDownloadGallery` | `true` | Show full gallery ZIP download button |
| `standalone` | `false` | Copy vendor/font assets into the gallery directory |
| `autoplay.slideshowInterval` | `3` | Slideshow interval in seconds |

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

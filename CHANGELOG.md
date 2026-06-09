# Changelog

All notable changes to GalleryPack are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v1.9.1] - 2026-06-09

### Security
- Enforce org ownership check when serving gallery HTML in multi-tenant mode
- Isolate prerendered project pages per org (prevent cross-org HTML leakage)
- Scope public slug lookups to org

### Fixed
- Cross-org photo contamination: engine no longer appends files absent from `photo_order.json`
- `prerenderProject` called with correct `orgId` on gallery reorder and move
- Video cover upload URL in admin UI; cover thumbnail display in gallery list
- Project card width capped at 400 px — single-card layouts no longer stretch full-width

### Changed
- Watch-link emails (confirm + resend) now include gallery description

### CI
- Upgrade `react-router-dom` to 7.17.0 (high-severity CVEs)
- Add missing license header to `video-worker/test/transcoder.test.js`

---

## [v1.9.0] - 2026-06-03

### Added
- **Enrollment watch-link email** — cover thumbnail embedded in confirmation and resend emails
- **Per-video poster images** — auto-generated after transcode via FFmpeg frame extract; manual override supported
- **Poster thumbnails in admin** — per-video posters shown in video list and gallery detail
- **FFmpeg progress reporting** — `transcode_progress` + ETA shown in admin during transcode
- **`creator_1080p` / `creator_720p` transcode modes** — high-quality encode modes with in-memory cache for concurrent requests
- **Public video gallery** — no-token watch mode; project listing includes public video galleries
- **Access request delete** — delete endpoint + UI button (NLPD right-to-erasure)
- **View tracking** — endpoint and admin video stats dashboard
- **Enrollment flow** — double opt-in, `access_requests` table, viewer tokens
- **Token-protected HLS streaming** endpoint
- **Video upload and management** routes
- **Video gallery schema** migration (009)
- **Video worker** — FFmpeg transcoding worker (remux, single-encode, force-ABR modes)
- **docker-compose** — video-worker service + video volume

### Fixed
- Re-send watch link when confirmed user re-submits enrollment form
- Video gallery cover URL included correct gallery id for prerender
- Worker triggers `prerenderProject` when skipping video gallery build
- Video-cover endpoint served before auth middleware (public access)
- Video gallery public link points to `/watch/:slug`
- Video galleries skip photo build pipeline (`build_status=done` immediately)
- HTTP Range support (`acceptRanges`) for proper video streaming
- Express 5 wildcard param returns Array — unwrap to string in stream handler
- `ORDER BY` aggregate alias not supported in MariaDB — inline expression used
- Video.js 8 compatibility: replace `videojs.extend()` with ES6 class
- Orphaned transcoding jobs reset on worker startup; retranscode UI shown
- Path traversal guard, batched reorder, `gallery_id` scoping in photos API
- JSON syntax errors in 16 locale files
- `NOW()` instead of `Date.now()` for DATETIME columns
- Email update for org members (backend validation + UI)
- Named wildcard `*filepath` for path-to-regexp v8 compatibility

### Changed
- Sidebar routes video galleries to `/videos`, photo galleries to `/:slug`
- i18n: 18 locales updated with video gallery and maintenance keys

---

## [v1.8.0] - 2026-06-02

### Added
- **AI photo descriptions** — Claude Vision generates alt text and lightbox captions; bulk endpoint with force-regenerate; gallery context in prompt; 160-char caption limit
- **Geolocation from AI** — Claude extracts venue-level location; Nominatim geocodes to coordinates
- **AI captions toggle** — `ai_captions_visible` controls lightbox caption visibility per gallery
- **AI disclosure** — legal notice section shown in gallery when AI descriptions are present
- **Bulk copy/move photos** — gallery picker modal for moving/copying selections across galleries
- **Natural aspect-ratio grid toggle** — per-gallery toggle on photo management page
- **Full-width toggle** — button on photo management page
- **Double-click lightbox** — double-clicking a photo card opens admin lightbox
- **`photo_descriptions.json`** — builder writes AI alt text; engine reads and injects into `img alt` and lightbox caption
- **rclone Dropbox sync** — CronJob and manual Job for scheduled backup
- **64 unit tests** for AI description service

### Fixed
- Partial PATCH on gallery settings — only update fields present in request body
- Lightbox uses 800 px preview endpoint instead of 400 px thumbnail
- Gallery picker z-index above lightbox; remove duplicate `onClose`
- Preserve `ai_description` when copying photos
- N² scan, redundant DB writes, and `sort_order=0` issues in photos
- Security upgrades: uuid 11.1.0→11.1.1, postcss 8.5.8→8.5.14, nodemailer 8.0.4→8.0.7 (SMTP CRLF injection)
- Stale dist dir after rebuild; broken viewer token link; superadmin access
- Magic-login uses `<Link>` instead of `<a href>`; origin derived from request
- `getSettings` decoupled from critical data load to prevent cascade failure
- Dropbox OAuth callback moved before `requireAuth` middleware

### Changed
- Watermark: 3-way mode selector (none / photographer / forced) replaces toggle
- Maintenance buttons grouped in dropdown

---

## [v1.7.0] - 2026-04-05

### Added
- **Gallery modes** — four first-class modes (portfolio, client_preview, client_delivery, archive) each with a fixed policy (access, downloads, watermark). Central `resolveGalleryPolicy()` module is the single source of truth for all policy-derived fields across API and worker.
- **Gallery settings split** — identity fields (`/settings`) separated from diffusion & security (`/access`), including mode selector, access controls, downloads, watermark and client sharing tokens.
- **Move gallery between projects** — drag gallery to another project from the settings page.
- **Viewer token gate on static files** — private gallery HTML is now blocked at the Express layer; requires a valid `?vt=` token or cookie before serving `index.html`.
- **Comprehensive SEO** — Open Graph, Twitter Cards, JSON-LD (`ImageGallery`, `CollectionPage`, `WebSite`), canonical links and `noindex` for private galleries on every gallery and project page.
- **`GET /sitemap.xml`** — dynamic sitemap listing all public galleries and projects with `lastmod`.
- **`GET /robots.txt`** — auto-generated, points to sitemap.
- **Inspector: global rebuild buttons** — "Rebuild all" and "Rebuild watermarks" buttons in the inspector dashboard for platform-wide maintenance.
- **Inspector: unified activity log** (`/inspector/activity`) — cross-source feed aggregating builds, photo uploads, admin actions and emails for the last 30 days, with type filter and auto-refresh.
- **UX confirmation modals** — confirmation required before switching a gallery to public or enabling original downloads.
- **`scripts/backfill-gallery-modes.js`** — classifies existing galleries with `gallery_mode IS NULL` using a heuristic (dry-run by default, `--apply` to commit).
- **64 unit tests** for `resolveGalleryPolicy`, `validateModeConstraints`, `applyModeDefaults` and `GALLERY_MODES`.
- **Mode badge and public/token links** in the project gallery table.
- **7-level date formatting** for gallery and project cards.
- **Comprehensive mobile UX** improvements across all management interfaces.

### Changed
- Watermark is **locked by gallery mode** — portfolio/client_preview/client_delivery always enable watermark; archive always disables it.
- Watermark text auto-derived from photographer: primary user → guest photographer → per-photo attribution → gallery author. No title/slug fallback — no name means no watermark.
- Builder `galleryToProjectConfig()` now delegates to `resolveGalleryPolicy()` instead of duplicating mode logic.
- Gallery public URLs deduplicated — slug already includes project prefix, no double prepend.
- **K3s worker scaled** for production: 2 replicas, limits 8 CPU / 10 Gi RAM per pod, `SHARP_CONCURRENCY=6`, `NODE_OPTIONS=--max-old-space-size=7168`.
- Mode selector and access settings moved to dedicated `/access` page with rebuild warning banner.

### Fixed
- Gallery mode not saving — constraint validation was running before `applyModeDefaults`, causing false 400 errors.
- Watermark not applied for mode-based galleries — builder was only reading `config_json`, never checking `gallery_mode`.
- Wrong JOIN for photographer name in builder — `primary_photographer_id` is FK to `users`, not `photographers`.
- Duplicate project slug in gallery public URLs on project pages.
- Mobile `bar-meta` overflow on gallery toolbar.
- Project-gallery URL fallback now matches `dist_name` and preserves query string.

### Security
- Private gallery static files gated behind viewer token verification at the Express layer (not just JS-side).

---

## [v1.6.0] - 2026-02

### Added
- Resumable uploads via tus protocol (@uppy/tus + @tus/server)
- Resumable upload endpoint for public upload-link flow
- Structured JSON logging with Pino and Prometheus metrics
- BullMQ + Redis persistent queues for thumbnails and prerender
- Storage quotas, bandwidth throttling, Sentry integration, checksum verification
- Duplicate conflict resolution dialog (skip, rename, overwrite)
- Show original filename, sort photos by EXIF date, sticky upload zone
- Auto-remove completed photos from upload queue grid
- Photo attribution -- filter by photographer with legal mentions
- Team page -- add/edit members with bio and photographer flag
- Photographer-as-user refactor with bulk assign
- Gallery hero image, Markdown description, primary photographer
- Gallery photos maintenance UI -- reconcile and reanalyze with result display
- Platform team management, gallery description, collaborator access
- Gallery maintenance endpoint to bootstrap missing thumbnails

### Changed
- Pause prerender queue during uploads to prevent Sharp contention

### Fixed
- Cross-device move between Docker bind mounts (EXDEV)
- Adapt hooks and metadata to @tus/server v2 API
- Deduplicate uploads by original_name to prevent quota inflation
- Deduplicate existing photos with unique constraint to prevent race-condition duplicates
- Isolate Sharp in child process + use Buffer input to prevent SIGBUS on iOS Live Photos
- AdminToast component API fix (broken since rewrite)
- Legacy studio-only membership rows (organization_id IS NULL)
- Create member -- add existing user to org instead of blocking with 409
- Migration 029 -- drop FK by auto-generated name before column drop
- Thumbnail generation -- use toBuffer() to prevent 0-byte files on Sharp failure

---

## [v1.5.0] - 2026-01

### Added
- Multi-organization platform mode (PLATFORM_MODE=multi) with subdomain routing
- Superadmin role with organization management and context switching
- Organization CRUD with custom domains
- Platform admin panel (license, SMTP, branding, team management)
- K3s / Kubernetes deployment manifests
- Docker image build and push to GHCR via CI
- Comprehensive documentation refresh
- Gallery Photos Hub with reconcile and reanalyze
- Settings consolidation
- Navigation architecture overhaul
- Download control with Apache standalone protection
- Internationalized sidebar, insights, build log inline, photo drill-down
- Original photo download endpoint
- Invitation accept page with copyable invite links
- Team page for studio member management
- Access management UI and audit log
- Viewer tokens and unified access model
- Route authorization hardening and invitation system
- Gallery memberships and can() authorization engine
- Auth hardening and studio memberships

### Fixed
- Persist gallery distName after build for correct public URL on password galleries
- Remove duplicate localhost site block in Caddyfile
- Purge secrets from history, fix low-entropy password generator

---

## [v1.4.0] - 2025

### Added
- Hash filenames and needs_rebuild tracking
- Admin UX overhaul -- i18n, gallery filters, folder upload, slug auto-gen, description, danger zone
- Toast notifications, global settings page, footer, gallery card hover effect
- Smart date range from EXIF, rebuild banner, sort icon toggle
- Public landing page, gallery view link in card, photo sort and drag-and-drop reorder
- Photo preview endpoint, cover photo picker, date picker, instant thumbnails

### Fixed
- Caddy try_files for gallery directory requests
- Docker volume mounts for source and dist
- Boolean field conversion for SQLite binding

---

## [v1.3.0] - 2025

### Added
- GalleryPack rebrand (from SSGG)
- Cover images
- Interactive gallery selection in publish command
- Tests, utils module, manifest versioning, config validation
- Basic auth, delivery docs, npm run publish
- Fallbacks, build summary, safe deploy

---

## Earlier releases

### v1.1.2
- Reverse geocoding locale-aware via Accept-Language

### v1.1.1
- GPS Maps link in EXIF metadata panel

### v1.1.0
- Initial public release with static gallery generation

### v1.0.0
- Initial SSGG build system -- static gallery generator

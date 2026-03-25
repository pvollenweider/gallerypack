# GalleryPack Glossary

| Term | Definition |
|------|-----------|
| **Platform** | The top-level operator context. In single-tenant mode this is invisible; in multi-tenant mode the platform admin manages studios and billing. |
| **Studio** | A tenant. An independent organisational unit with its own galleries, members, settings, and (optionally) custom domain. Equivalent to a photography studio or agency account. |
| **Gallery** | A curated collection of photos belonging to one studio. Has a slug, access mode, and build artifacts. |
| **Photo** | A source image file living under `src/<gallery-slug>/`. |
| **Build** | The process of running the engine against a gallery's source photos to produce a static site under `dist/<gallery-slug>/`. |
| **Build job** | A queued or running build task. Tracked in `build_jobs` and streamed via SSE. |
| **Engine** | The `@gallerypack/engine` package. Takes source photos + project config → static HTML/CSS/JS gallery. |
| **Storage adapter** | `@gallerypack/shared/src/storage/` — abstraction over local filesystem or S3/R2. Used for reading/writing build artifacts. |
| **Slug** | A URL-safe identifier derived from a title or name. Used as the gallery's URL segment and as the `dist/<slug>/` folder name. |
| **Access mode** | One of `public`, `private`, `password`, `link`. Controls who can view a gallery. |
| **Viewer token** | A signed, short-lived token that grants read access to a private gallery. |
| **Magic link** | A one-time passwordless login link. 5-minute TTL. |
| **Invite** | A photographer upload link — grants photo upload access to a gallery without a full user account. |
| **Invitation** | A studio member invitation — grants a new user a role in a studio. Requires account creation via password. |
| **Studio role** | One of `owner`, `admin`, `collaborator`, `photographer`. Controls what a user can do within a studio. |
| **Gallery role** | One of `viewer`, `contributor`, `editor`. Controls what a studio member can do within a specific gallery. |
| **Platform role** | One of `platform_admin`, `platform_viewer`. Controls cross-studio operator access. |
| **ContextResolver** | Middleware that maps the inbound `Host` header → studio via `studio_domains` table. Attaches `req.studioId`. |
| **needs_rebuild** | A flag (`0`/`1`) on the `galleries` row. Set to `1` when gallery metadata changes; cleared after a successful build. |
| **distName** | The folder name under `dist/` produced by the engine. Always equals `gallery.slug`. |
| **PLATFORM_MODE** | Env var. `single` (default) = one studio, backwards-compat. `multi` = full multi-tenant routing. |
| **DATA_DIR** | Env var pointing to the directory containing the SQLite database (v1) or used for file uploads (v2). |

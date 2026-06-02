# GalleryPack

**Deliver photo galleries fast.**

GalleryPack is a SaaS platform for professional photographers to build and deliver static photo galleries. Photographers and admins manage content through a web admin panel; visitors see pure static HTML files served directly by Caddy -- no database or server is hit when someone views a gallery.

---

## Key features

- **Static gallery generation** -- photos are resized to optimized WebP, bundled into standalone HTML/CSS/JS sites
- **Multi-tenant** -- run a single installation for multiple organizations, each with its own domain or subdomain
- **Resumable uploads** -- tus-based chunked uploads with duplicate detection and conflict resolution
- **Watermarking** -- per-photographer or custom text watermark on full-size images; mode configurable per gallery (none / photographer name / forced text)
- **Role-based access control** -- four-level permission model (platform, organization, project, gallery)
- **Private galleries** -- password-protected or token-based access with revocable viewer tokens
- **Internationalization** -- admin UI available in 18 locales
- **S3 or local storage** -- works with AWS S3, Cloudflare R2, MinIO, or the local filesystem
- **Real-time build progress** -- SSE-streamed build logs with live progress bar
- **AI photo descriptions** -- Claude Vision generates alt text and lightbox captions per photo; bulk generation; AI-extracted geolocation with Nominatim geocoding
- **Photo insights** -- focal-length distribution, camera stats, and AI-generated lens insights
- **Advanced photo management** -- admin lightbox (double-click preview), natural aspect-ratio grid, bulk copy/move photos between galleries, full-width layout toggle
- **Invitation system** -- invite photographers by email with optional gallery assignment and copyable links

---

## Quick start

See [docs/install.md](docs/install.md) for full installation instructions.

```bash
cp .env.example .env
# Edit .env with your settings
docker compose -f docker-compose.saas.yml up -d
```

---

## Architecture overview

```
Upload --> Manage --> Build --> Static files --> Visitors
```

GalleryPack separates content management from delivery. The admin panel (React SPA) talks to an Express API backed by MariaDB. A background worker processes build jobs, calling the engine to resize images and generate static gallery sites. Caddy serves the built galleries as plain static files.

For the full architecture description, see [docs/how-it-works.md](docs/how-it-works.md).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| API server | Node.js, Express 5 |
| Admin UI | React, Vite, AdminLTE 4 |
| Database | MariaDB 11 |
| Job queue | BullMQ + Redis 7 |
| Image processing | Sharp (libvips) |
| Reverse proxy | Caddy 2 (automatic TLS) |
| Storage | Local filesystem or S3-compatible |

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/install.md](docs/install.md) | Installation and deployment |
| [docs/how-it-works.md](docs/how-it-works.md) | Architecture and core concepts |
| [docs/api.md](docs/api.md) | REST API reference |
| [docs/roles.md](docs/roles.md) | Roles and permissions |
| [docs/faq.md](docs/faq.md) | Frequently asked questions |
| [docs/README-dev.md](docs/README-dev.md) | Developer onboarding guide |
| [docs/README-ops.md](docs/README-ops.md) | Production operations guide |
| [docs/local-dev.md](docs/local-dev.md) | Local development with Docker |
| [docs/build.md](docs/build.md) | Image build and registry guide |
| [docs/k3s-deployment.md](docs/k3s-deployment.md) | K3s / Kubernetes deployment |
| [docs/storage-security.md](docs/storage-security.md) | Storage and security model |
| [docs/licensing.md](docs/licensing.md) | Licensing details |
| [docs/commercial-edition.md](docs/commercial-edition.md) | Commercial edition overview |
| [docs/open-source-edition.md](docs/open-source-edition.md) | Open source engine overview |

---

## License

GalleryPack is dual-licensed:

- **AGPL-3.0** -- `packages/engine/` and `packages/shared/` (open-source build engine and storage abstraction)
- **Proprietary** -- `apps/api/`, `apps/web/`, `workers/builder/` (platform components, source-available)

Use of the proprietary platform components in production requires a commercial license. Licenses available at **[gallerypack.app](https://www.gallerypack.app/)** — see [docs/licensing.md](docs/licensing.md) for full details.

---

Copyright (c) 2026 Philippe Vollenweider

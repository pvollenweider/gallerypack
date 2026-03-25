# Commercial Edition

The GalleryPack commercial platform includes all components required to run a complete, multi-tenant gallery hosting service.

## What is included

### `apps/api/` — Platform API server

Node.js / Express 5 REST API handling:
- Authentication (sessions, magic links, password reset)
- Studio, project, gallery, and photo management
- Role-based access control (platform / studio / project / gallery levels)
- Build job queue
- Invitation system (studio members, gallery collaborators)
- Viewer token generation for private galleries
- S3 or local storage integration

### `apps/web/` — Admin web application

React / Vite single-page application:
- Photographer and admin portal
- Gallery management, photo upload, build triggering
- Team and invitation management
- Multi-studio support for platform operators

### `workers/builder/` — Build job worker

Node.js worker process:
- Polls job queue and dequeues build jobs
- Delegates to the AGPL engine (`packages/engine/`)
- Handles retries, timeouts, and error reporting via SSE

## Licensing

Use of the commercial components requires a valid license agreement. The source code is available in this repository for inspection and auditing, but is not freely deployable or redistributable.

## Contact

To obtain a commercial license or discuss pricing:

- Open an issue at [github.com/pvollenweider/gallerypack](https://github.com/pvollenweider/gallerypack)
- Contact the maintainer via GitHub

A formal license agreement will be provided. Terms vary depending on use case (single studio, multi-tenant SaaS, OEM integration).

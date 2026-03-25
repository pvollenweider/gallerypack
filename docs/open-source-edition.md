# Open Source Edition (AGPL-3.0)

The open-source components of GalleryPack are released under the GNU Affero General Public License v3.0.

## What is included

### `packages/engine/`

The core gallery build engine. Given a list of photos and a configuration object, it:

- Resizes and optimizes images (via Sharp)
- Extracts EXIF metadata
- Generates static HTML files from templates
- Writes the complete gallery output to a destination directory

This is a pure library — it has no HTTP server, no database, no job queue. It can be used standalone.

### `packages/shared/`

Storage abstraction and shared utilities used by both the engine and the platform:

- `StorageAdapter` interface with local filesystem and S3 implementations
- Shared type definitions

## How to use the engine

```js
import { buildGallery } from '@gallerypack/engine';

await buildGallery({
  photos: [...],       // array of photo metadata
  outputDir: './dist/my-gallery',
  config: { title: 'My Gallery', ... },
});
```

See the engine source (`packages/engine/src/index.js`) for the full API.

## Intentional scope limitations

The open-source edition intentionally does not include:

- The web admin interface (`apps/web/`)
- The API server with user management and access control (`apps/api/`)
- The job queue worker (`workers/builder/`)
- The database schema and multi-tenant logic

These components are part of the commercial platform. The engine is designed to be useful standalone for developers who want to integrate gallery building into their own systems.

## AGPL obligations

If you use this engine to power a network service (a web application, a hosted tool, etc.), the AGPL requires you to make the complete source of your modified version available to users of that service.

This does not apply to internal use within your organization.

Full license: [`LICENSES/AGPL-3.0.txt`](../LICENSES/AGPL-3.0.txt)

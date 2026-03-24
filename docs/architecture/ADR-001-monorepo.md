# ADR-001: Monorepo structure

**Status:** Accepted
**Date:** 2026-03-24

## Context

GalleryPack is evolving from a single-user CLI tool into a hosted SaaS product. The codebase needs to accommodate:

- A reusable build engine (already extracted from the monolith)
- An API server for the admin panel and photographer portal
- A web frontend (SPA)
- A queue worker that runs builds asynchronously
- Shared types and storage abstractions

The question is whether to keep everything in a single repository or split into multiple repositories.

## Decision

Use a **npm workspaces monorepo** with the following structure:

```
packages/
  engine/      — core build logic (Sharp, HTML generation, EXIF)
  shared/      — types, storage interface, utilities
apps/
  api/         — Express HTTP server
  web/         — SPA frontend (Vite)
workers/
  builder/     — build queue consumer
```

The root `package.json` declares `"workspaces": ["packages/*", "apps/*", "workers/*"]`.

## Consequences

**Good:**
- Single `npm install` installs all packages
- Cross-package imports work without publishing to npm: `import { buildGallery } from '@gallerypack/engine'`
- Atomic commits across packages (e.g., adding a field to the engine and updating the API in one PR)
- Shared CI pipeline and tooling

**Neutral:**
- The existing CLI tooling (`build/`, `server/`) continues to live at the root until migrated; this creates a short-term overlap period
- `package.json` at the root gains a `workspaces` field alongside the existing CLI scripts

**Trade-offs considered:**
- Polyrepo: cleaner package boundaries but coordination overhead for cross-cutting changes; rejected for a team of 1-2
- Turborepo/Nx: richer build orchestration but adds tooling complexity; can be adopted later if build times become a problem

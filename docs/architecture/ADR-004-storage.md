# ADR-004: Storage interface

**Status:** Accepted
**Date:** 2026-03-24

## Context

Currently all files live on the local filesystem:
- Source photos: `src/<slug>/photos/`
- Built galleries: `dist/<slug>/`
- Upload staging: `server/public/upload/<token>/`

For SaaS (multi-tenant, potentially containerised), we need to support remote object storage (S3-compatible) without rewriting the engine.

## Decision

Introduce a **storage abstraction** in `packages/shared/src/storage/`:

```js
// interface
{
  read(path): Promise<Buffer>
  write(path, data): Promise<void>
  exists(path): Promise<boolean>
  list(prefix): Promise<string[]>
  delete(path): Promise<void>
  url(path): string   // public URL for serving
}
```

Two implementations:

| Adapter | When used |
|---------|-----------|
| `LocalStorage` | Self-hosted (CLI, Docker single-tenant) — wraps `fs/promises` |
| `S3Storage` | SaaS multi-tenant — wraps `@aws-sdk/client-s3` |

The engine receives a `storage` instance via dependency injection. The API and worker create the right adapter based on environment variables:

```
STORAGE_DRIVER=local   (default)
STORAGE_DRIVER=s3
S3_BUCKET, S3_REGION, S3_ENDPOINT (for S3-compatible providers like Cloudflare R2)
```

## Phase rollout

- **Phase 1:** Define the interface and `LocalStorage` only. Engine continues to use `fs` directly (migration comes in Phase 2 when engine is moved to `packages/engine`).
- **Phase 2:** Engine migrated; uses storage interface.
- **Phase 4:** `S3Storage` implemented for multi-tenant SaaS.

## Consequences

- Built galleries in SaaS mode are stored in S3; Apache can no longer serve them directly. A CDN (CloudFront / Cloudflare) sits in front of the bucket and serves static assets.
- The `.htaccess` Basic Auth approach only applies to self-hosted Apache deployments. SaaS uses token-based access checked by the API.
- `LocalStorage.url(path)` returns a path relative to the Express static root. `S3Storage.url(path)` returns the CDN URL.

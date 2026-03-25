# ADR-005 — Multi-Studio Architecture

**Status**: Accepted
**Date**: 2026-03-25
**Issues**: #65, #66, #67, #68, #69, #70, #71, #72, #73, #74, #75, #76, #77, #78

---

## Context

GalleryPack v1 was designed as a single-tenant SaaS: one SQLite database, one set of galleries, one admin user tree. Scaling to multiple independent studios (e.g. a hosting platform, agency resellers, or white-label deployments) requires:

- Isolated gallery namespaces per studio
- Per-domain routing to the correct studio
- A platform-level operator role above studio admins
- MySQL/MariaDB for concurrent multi-process write support (SQLite WAL is single-writer)

---

## Decision

### 1. Entity hierarchy

```
Platform
└── Studio          (tenant)
    └── Gallery     (photo collection, belongs to one studio)
        └── Photo
```

A **Studio** is the top-level billing/organisational unit. Each studio has its own slug, custom domain(s), members, and galleries. Galleries are scoped to exactly one studio and are never shared across studios.

There is no intermediate "Project" entity in v2. If project grouping is needed in the future it can be added as a `gallery_group` join table without breaking the core hierarchy.

### 2. Domain routing — `ContextResolverService`

Every inbound HTTP request is resolved to a studio via:

1. `studio_domains` table: `SELECT studio_id FROM studio_domains WHERE domain = ?` (exact match on `Host` header after stripping port)
2. Fallback: `studios.is_default = 1` row (used for single-tenant mode and local dev)

The resolved `studio_id` is attached to `req.studioId` by `middleware/studio.js` before any route handler runs.

In `PLATFORM_MODE=single` (legacy), if no domain match is found the default studio is used transparently. In `PLATFORM_MODE=multi` a missing domain match returns 404 immediately.

### 3. Role model

Two separate role scopes:

| Scope   | Roles                                         |
|---------|-----------------------------------------------|
| Platform| `platform_admin`, `platform_viewer`           |
| Studio  | `owner`, `admin`, `collaborator`, `photographer` |

Platform roles are stored in `platform_role_assignments`. Studio roles are stored in `studio_role_assignments` (replaces `studio_memberships`). Gallery-level roles (`viewer`, `contributor`, `editor`) remain unchanged in `gallery_memberships`.

`collaborator` replaces the old `editor` studio role (to avoid confusion with the gallery-level `editor` role).

### 4. Database: SQLite → MariaDB

| Concern              | SQLite                  | MariaDB                        |
|----------------------|-------------------------|-------------------------------|
| Concurrent writers   | WAL, 1 writer           | InnoDB, full MVCC              |
| Connection pooling   | Shared process          | `mysql2` pool                  |
| Transactions         | `db.transaction()`      | `pool.getConnection()` + SQL   |
| Driver API           | synchronous             | fully async / Promise          |
| Custom functions     | `db.function()`         | replaced with JS-side logic    |

**ID format**: all entity IDs remain short time-based hex strings (`genId()`) for readability in URLs and logs. Foreign key columns use `VARCHAR(32)`.

**Timestamp format**: all timestamps remain Unix milliseconds (`BIGINT`) for consistency with the existing API and engine.

### 5. Migration strategy

- A single baseline MariaDB migration (`001_baseline.sql`) consolidates all 21 SQLite migrations into one `CREATE TABLE IF NOT EXISTS` block.
- Subsequent migrations follow the same numbered file convention.
- The migration runner (`migrations/run.js`) is rewritten to use `mysql2/promise` and standard `CREATE TABLE IF NOT EXISTS _migrations` tracking.
- Data migration from SQLite to MariaDB is out of scope for this RFC (a separate `scripts/migrate-sqlite-to-mariadb.js` script will be provided).

### 6. Backwards compatibility in single-tenant mode

When `PLATFORM_MODE=single` (the default), the system behaves exactly as v1:
- Studio is auto-created from `ADMIN_EMAIL`/`ADMIN_PASSWORD` on first boot
- Domain resolution falls back to the single default studio
- All existing API routes and response shapes are unchanged

The `multi` mode is opt-in via `PLATFORM_MODE=multi`.

---

## Consequences

- All DB helper functions become `async` — all callers (routes, middleware, worker) must `await`
- `better-sqlite3` is removed from `apps/api`; `mysql2` is added
- A MariaDB service is added to `docker-compose.saas.yml`
- `studio_memberships` table is renamed to `studio_role_assignments` (migration handles this)
- New env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `PLATFORM_MODE`

---

## Alternatives considered

**Keep SQLite, add multi-studio on top**: Simpler but SQLite's single-writer limitation becomes a bottleneck under concurrent builds. Also, WAL-mode SQLite in Docker with shared volumes is unreliable across containers.

**PostgreSQL instead of MariaDB**: Either works well. MariaDB was chosen because the existing self-hosted photography market is predominantly LAMP-stack and many operators already have MariaDB available.

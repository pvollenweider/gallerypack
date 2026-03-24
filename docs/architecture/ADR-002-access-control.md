# ADR-002: Access control model

**Status:** Accepted
**Date:** 2026-03-24

## Context

GalleryPack SaaS needs to support multiple tenants (studios / photographers) each managing their own galleries. The access control model must cover:

1. **Studio admin** — full control over their account, galleries, invites, billing
2. **Photographer** — can upload to galleries they have been invited to; can view/manage their own deliveries
3. **Gallery viewer** — end client; accesses a specific gallery via a URL (public, private link, or password)

The current single-user model uses a single `ADMIN_PASSWORD` env var with express-session. This needs to evolve without breaking the hosted (single-tenant) deployment path.

## Decision

Use a **role-based, scoped token** model:

- **Sessions** (HTTP-only cookie) for admin/photographer interactive sessions, backed by a `sessions` table (or in-memory for single-tenant)
- **Invite tokens** (opaque random string, stored in `invites` table) for photographer upload access — already implemented; keep this pattern
- **Gallery access tokens** (opaque random string) for viewer access to private galleries — replaces the `.htpasswd` password approach for the hosted/SaaS path
- **API keys** (future, Phase 5) for programmatic access

Roles stored in a `users` table:

| Role | Scope |
|------|-------|
| `admin` | Full access to their `studio_id` |
| `photographer` | Access to galleries they are linked to via `gallery_photographers` join table |

For **single-tenant** (self-hosted), continue to support the `ADMIN_PASSWORD` env var — the API server creates a synthetic admin user from it at startup if no users exist in the DB.

## Consequences

- Gallery viewer access via password stays Apache `.htaccess` for self-hosted Option C deployments
- Gallery viewer access for SaaS uses token-in-URL (`?token=…`) checked server-side, consistent with the existing `private` link model
- No external auth provider required in Phase 1; can integrate OAuth (Phase 6) later
- `better-sqlite3` stores sessions for single-tenant; Redis or DB-backed sessions for multi-tenant (Phase 4)

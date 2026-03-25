# GalleryPack — Permission Model

> Source of truth for `apps/api/src/authorization/index.js`.
> Every route permission check must be traceable to this document.

---

## Roles

### Studio roles (global, per deployment)

| Role | Description |
|------|-------------|
| `photographer` | Can upload to assigned galleries only |
| `editor` | Can edit metadata and upload to any gallery |
| `admin` | Full control, can manage members |
| `owner` | Full control, can assign owner role |

Hierarchy (ascending): `photographer < editor < admin < owner`

### Gallery roles (per-gallery, for photographers)

| Role | Description |
|------|-------------|
| `contributor` | Can upload photos |
| `editor` | Can upload + edit metadata + trigger builds |

Gallery roles only apply to photographers. Collaborators (editor+) have implicit access to all galleries via their studio role.

---

## Decision: Option A — studio members read all galleries

**Any studio member can read any gallery in their studio**, regardless of gallery access mode (`public` / `private` / `password`).

Rationale: this is a single-studio deployment where all members work for the same studio. There is no inter-studio isolation at the gallery level. External viewers use viewer tokens.

This is a deliberate documented choice (see issue #53). To switch to Option B (explicit per-gallery access required), update `can('gallery', 'read')` in `authorization/index.js`.

---

## Permission matrix

| Action | owner | admin | editor | photographer | gallery editor | contributor | viewer token | public |
|--------|:-----:|:-----:|:------:|:------------:|:--------------:|:-----------:|:------------:|:------:|
| **Read gallery** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Edit gallery metadata** | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| **Delete gallery** | ✓ | ✓ | — | — | — | — | — | — |
| **Publish (trigger build)** | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| **Upload photo** | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — |
| **Delete photo** | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| **Notify ready** | ✓ | ✓ | ✓ | ✓ (if gallery member) | ✓ | ✓ | — | — |
| **Manage gallery access** | ✓ | ✓ | — | — | — | — | — | — |
| **Manage studio members** | ✓ | ✓ | — | — | — | — | — | — |
| **Studio settings** | ✓ | ✓ | — | — | — | — | — | — |

---

## Gallery access modes

| Mode | Who can view |
|------|-------------|
| `public` | Anyone (no auth required) |
| `private` | Studio members + gallery members + viewer token |
| `password` | Anyone with the correct password OR viewer token |

In all non-public cases, studio members always have access (Option A).

---

## Token types

| Token | Storage | TTL | Use |
|-------|---------|-----|-----|
| Session | DB — `sessions` | 30 days | Authenticated session cookie |
| Invitation | DB — `invitations` | 7 days | Onboard new studio members |
| Photographer invite | DB — `invites` | Configurable | Grant gallery upload access |
| Viewer token | DB — `viewer_tokens` | No TTL | Share a gallery link externally |
| Password reset | DB — `reset_tokens` | 2h | Reset a user's password |
| Magic link | DB — `magic_links` | 5 min, single-use | Passwordless login |

> **TODO (#54)**: all tokens should store a `token_hash` (SHA-256) in DB, not the raw token.
> The raw token only appears in the URL/email at creation time.

---

## Rules enforced in code

1. `requireAuth` — validates session cookie, attaches `req.userId`, `req.studioId`, `req.studioRole`
2. `requireStudioRole(minRole)` — rejects if caller's studio role is below threshold
3. `can(user, action, resource, context)` — fine-grained check with gallery/gallery-role context
4. All routes are single-studio: `req.studioId` is always the caller's own studio

See also: issue tracker milestone `v1.0 — Clean foundation`.

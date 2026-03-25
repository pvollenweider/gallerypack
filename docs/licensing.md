# Licensing

GalleryPack uses a dual-license model. The open-source engine components are released under AGPL-3.0; the platform applications are proprietary.

## Component breakdown

| Component | Path | License |
|---|---|---|
| Build engine | `packages/engine/` | AGPL-3.0 |
| Shared storage lib | `packages/shared/` | AGPL-3.0 |
| API server | `apps/api/` | Proprietary |
| Admin web app | `apps/web/` | Proprietary |
| Build worker | `workers/builder/` | Proprietary |
| Database migrations | `apps/api/src/db/migrations/` | Proprietary |

## What AGPL-3.0 means

The AGPL-3.0 is a copyleft license. Key implications:

- You can use, modify, and distribute the engine freely
- If you use the engine to provide a **network service** (including a self-hosted instance), you must make the complete source of your modified version available to users of that service, under the same license
- You cannot combine AGPL code with proprietary code in a way that bypasses this requirement

Full license text: [`LICENSES/AGPL-3.0.txt`](../LICENSES/AGPL-3.0.txt)

## What the proprietary license means

The platform components (`apps/`, `workers/`) are **source-available** — the code is visible in this repository for inspection and auditing — but they are **not freely deployable or redistributable**.

Use of these components requires a valid commercial license agreement.

## What you can and cannot do

### Allowed without a commercial license

- Use the AGPL engine in your own project (with AGPL obligations)
- Fork and modify `packages/engine/` or `packages/shared/` under AGPL
- Read the proprietary source code to audit or understand how it works
- Self-host for personal, non-commercial evaluation

### Requires a commercial license

- Running the full platform stack (`apps/api`, `apps/web`, `workers/builder`) in production
- Offering GalleryPack as a hosted service to others
- Integrating the proprietary components into another product
- Any commercial use of the platform components

## FAQ

**Can I self-host GalleryPack for my photography studio?**
Yes, but the platform components require a commercial license. Contact us to get one.

**Can I fork the engine and use it in my own project?**
Yes, under AGPL-3.0. Your project must also be released under AGPL-3.0 (or a compatible license) if you distribute it or provide it as a network service.

**Can I build a SaaS on top of GalleryPack?**
The engine (AGPL) can be used under its copyleft terms. Using the platform components requires a commercial license. Contact us.

**Can I contribute code?**
External contributions require a CLA to preserve the dual-licensing model. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Commercial licensing

For commercial license inquiries, open an issue or contact the maintainer via [GitHub](https://github.com/pvollenweider/gallerypack).

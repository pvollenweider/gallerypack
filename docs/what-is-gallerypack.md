# What GalleryPack is — and is not

> **TL;DR** — GalleryPack is a command-line build tool. You run a command, it produces a ready-to-deploy photo gallery. No cloud, no subscription, no backend.

---

## What GalleryPack is

**A build tool.** You run a command, it produces files. Nothing more.

**A static gallery generator.** The output is plain HTML + CSS + JavaScript + WebP images. It works on any web server, offline, on a USB drive, or as a ZIP sent to a client.

**A personal workflow tool.** Built to solve a real problem: sharing photo shoots with clients and friends without surrendering files to a cloud platform, without subscriptions, and without the overhead of a full CMS.

**A tool you own.** The output is yours. The files are yours. The URLs are yours. Nothing expires unless you take it down.

---

## What GalleryPack does well

- Produce a polished, client-ready gallery in under a minute
- Generate clean, predictable file names and folder structure
- Extract and display EXIF metadata automatically
- Reverse-geocode GPS coordinates to a readable location (no API key)
- Protect a gallery with a simple password (Apache basic auth)
- Generate a ready-to-send delivery message with URL and credentials
- Deploy to any static host — GitHub Pages, Apache, Nginx, S3, Netlify, Vercel
- Work entirely offline once built (no CDN calls at runtime)
- Handle large photos gracefully (4K-aware WebP conversion)

---

## What GalleryPack is not

**Not a platform.** There are no accounts, no dashboards, no subscriptions.

**Not a CMS.** You cannot edit metadata or reorder photos in a browser. You edit the config file and rebuild.

**Not Google Photos / iCloud / Pixieset.** Those are services with storage, sharing, printing, and collaboration features. GalleryPack only generates a viewer.

**Not a strong access-control system.** The `access: "password"` mode uses Apache basic auth — pragmatic, not cryptographic. The `private` (hashed URL) mode is security through obscurity. If you need truly private galleries, add server-level auth independently.

**Not a video gallery.** GalleryPack handles still images only.

---

## When to use GalleryPack

- You shoot photos professionally or as a hobby and want to share them without a third-party service
- You need a quick, clean delivery link for a client or colleague
- You want to archive a series with full metadata alongside the images
- You host your own server (Apache, Nginx) or use a static hosting service
- You want full control of the output — file names, structure, legal notice, download permissions
- You need multiple users to upload and manage galleries through a web interface (use the v2 SaaS stack)

## When not to use GalleryPack

- You need strong access control beyond basic auth
- You want a comment system, analytics, or client proofing workflow
- You need to share videos
- You want a SaaS product that handles hosting, storage, and delivery for you

---

## The philosophy

> Your photos, your server, your rules.

GalleryPack privileges **simplicity, predictability, and ownership** over features.
The tool should be smart enough that you never have to think — but transparent enough that you always understand what it did.

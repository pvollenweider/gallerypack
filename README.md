# GalleryPack

> Deliver photo galleries fast.

GalleryPack is a command-line build tool that turns a folder of photos into a clean, ready-to-share static gallery.

Drop your photos in a folder, run a single command, and generate a gallery you can publish anywhere, share as a link, or keep as a portable archive.

No accounts. No platform. Just your files, your hosting, your rules.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Live demo](https://img.shields.io/badge/Live%20demo-%E2%86%92%20View%20gallery-blue)](https://photos.vollenweider.org/gallerypack/)

**Live demo** — [photos.vollenweider.org/gallerypack/](https://photos.vollenweider.org/gallerypack/)

| Gallery | Access |
|---------|--------|
| [Summer in Zürich](https://photos.vollenweider.org/gallerypack/summer-zurich-2025/) | public |
| [Quelques spectacles et live](https://photos.vollenweider.org/gallerypack/quelques-spectacles-et-live/) | public |
| [Insectes](https://photos.vollenweider.org/gallerypack/insectes/) | 🔒 password — user: `gallery` / pwd: `bzz-bzz` |

---

## ✨ Why GalleryPack

- ⚡ **Fast builds** — generate a full gallery in seconds to minutes
- 🔗 **Easy to share** — send a simple link to clients or friends
- 🌍 **Works anywhere** — deploy on Apache, Nginx, GitHub Pages, S3, Netlify…
- 🔒 **Optional protection** — password (Apache) or private unguessable link
- 📦 **Self-contained output** — no backend, no runtime dependencies
- 📴 **Offline-ready** — works without internet once built

---

## 🎯 Use cases

- Send a photo shoot to a client with a clean, shareable link
- Publish an event gallery in minutes
- Deliver photos without relying on Google Photos, iCloud, or Pixieset
- Archive a project with full metadata and download permissions
- Share photos with full control over files, hosting, and URLs

---

## ⚡ Quick start

```bash
# 1. Clone and install
git clone https://github.com/pvollenweider/gallerypack.git
cd gallerypack
npm install

# 2. Create a gallery
npm run new-gallery my-shoot
# → creates src/my-shoot/photos/ and a pre-filled gallery.config.json

# 3. Drop your photos into src/my-shoot/photos/

# 4. Build
npm run build my-shoot

# 5. Preview
npm run serve
# → open http://localhost:3000/my-shoot/

# 6. Publish  (requires publish.config.json — see docs/reference.md)
npm run publish -- my-shoot
# → patches .htaccess, uploads, writes DELIVERY.md with the live URL

# 7. Send to your client
#    → copy-paste the contents of dist/my-shoot/DELIVERY.md
```

The output in `dist/my-shoot/` is ready to deploy anywhere.

---

## 📦 What you get

- **Responsive grid** — 3-column layout with big/small tiles, square-cropped
- **Full-screen lightbox** — keyboard navigation, touch swipe, fullscreen
- **Slideshow** — auto-advance with progress bar, configurable interval
- **EXIF overlay** — camera, lens, aperture, shutter, ISO, GPS location
- **Download** — individual photo or full gallery ZIP (configurable)
- **Legal notice** — auto-generated in your locale (fr / en / de / es / it / pt)
- **Delivery message** — `DELIVERY.md` ready to copy-paste and send to your client

---

## 🔐 Access & sharing

Three modes — choose based on your needs:

- **Public** — simple, predictable URL, listed in the site index
- **Private link** — unguessable hashed URL, hidden from index, no password prompt
- **Password protected** — Apache basic auth, lock icon shown in site index

> Password protection requires Apache. Use `private: true` on GitHub Pages or Netlify.

See [docs/privacy-access.md](docs/privacy-access.md) for the full comparison.

---

## 🧠 How it works

GalleryPack is a **build tool**, not a hosting service.

- **Input** — your photos in `src/<name>/photos/`
- **Output** — a static gallery in `dist/<name>/`
- **Hosting** — your choice (Apache, GitHub Pages, S3, anywhere)

It does not touch your originals, upload anything without your command, or require a running server.

---

## ⚙️ Configuration

`gallery.config.json` is optional — smart defaults apply automatically.
When you need it, the full config looks like this:

```json
{
  "project": {
    "title":  "My Gallery",
    "author": "Your Name",
    "date":   "2025-06-01",
    "locale": "en",
    "access": "public"
  }
}
```

Common scenarios:

```json
// Client delivery with password
{ "project": { "access": "password", "allowDownloadGallery": true } }

// Public portfolio, no download
{ "project": { "access": "public", "allowDownloadImage": false, "allowDownloadGallery": false } }

// Private preview link (no password prompt)
{ "project": { "private": true } }
```

See [docs/reference.md](docs/reference.md) for all fields.

---

## 🚀 Build & publish commands

| Command | Description |
|---------|-------------|
| `npm run build <name>` | Incremental build (skips existing WebP) |
| `npm run build:all` | Build all galleries + site index |
| `npm run build:clean` | Wipe `dist/` and rebuild from scratch |
| `npm run build:force` | Force-reconvert all images |
| `npm run new-gallery <slug>` | Create gallery scaffold |
| `npm run new-gallery:wizard` | Interactive wizard with all options |
| `npm run serve` | Local preview at http://localhost:3000 |
| `npm run publish -- <name>` | Upload one gallery via rsync |
| `npm run publish -- --all` | Upload all galleries |
| `npm run deploy` | Deploy `dist/` to GitHub Pages |
| `npm run test` | Run invariant tests |
| `npm run clean` | Wipe `dist/` without rebuilding |

---

## 📚 Documentation

| Page | Contents |
|------|----------|
| [docs/reference.md](docs/reference.md) | All configuration fields and options |
| [docs/what-is-gallerypack.md](docs/what-is-gallerypack.md) | What GalleryPack is, what it is not |
| [docs/privacy-access.md](docs/privacy-access.md) | Public / private / password modes |
| [docs/output-structure.md](docs/output-structure.md) | What's in `dist/` and why |
| [docs/naming-convention.md](docs/naming-convention.md) | How output files are named |
| [docs/faq.md](docs/faq.md) | Common questions |
| [docs/roadmap.md](docs/roadmap.md) | v1 scope, known debt, what comes next |

---

## 💡 Philosophy

> Your photos, your server, your rules.

GalleryPack prioritises **simplicity, predictability, and ownership** over features.
Smart enough that you never have to think. Transparent enough that you always understand what it did.

---

## 📄 License

MIT — [Philippe Vollenweider](https://github.com/pvollenweider)

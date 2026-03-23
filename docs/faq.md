# FAQ

**Can I use SSGG without a web server?**
Yes. Built galleries open directly from a file system (`file://`). Note that ZIP
download requires a browser context (it uses the Web Crypto API).

**Does it work offline after build?**
Yes. All assets (fonts, vendor JS/CSS, images) are local. No CDN calls at runtime.

**Can I protect a gallery with a password?**
Not yet built-in. Use server-level basic auth (Apache `.htpasswd`, Nginx
`auth_basic`) in the meantime. See [docs/privacy-access.md](privacy-access.md).

**Does it support multiple galleries?**
Yes. Each gallery is independent under `src/<name>/`. Run `npm run build:all`
to build all of them and generate a shared index page.

**Can visitors download the original photos?**
Configurable per gallery via `allowDownloadImage` and `allowDownloadGallery`.
When enabled, source copies are placed in `dist/<slug>/originals/`.

**Does it work on GitHub Pages / Netlify / Vercel / Apache / Nginx / S3?**
Yes — it's plain static files. Any host that serves HTML works.

**How is it different from iCloud Photos / Google Photos / Pixieset?**
SSGG is not a platform. It's a build tool. You own the files, the hosting, and
the URLs. Nothing expires, nothing is tracked, no account required.

**What image formats are supported as input?**
JPG, PNG, TIFF, HEIC/HEIF, AVIF. Output is always WebP.

**Does the GPS reverse geocoding require an API key?**
No. It uses the free Nominatim / OpenStreetMap API. Results are cached in
`photos.json` so subsequent builds are fully offline.

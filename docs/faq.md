# FAQ

---

**Is GalleryPack good for photographers?**
Yes — that's the primary use case. You shoot, you drop photos in a folder, you build, you send a link. No platform account, no upload queue, no subscription. The gallery looks professional out of the box.

**Can I send this directly to a client?**
Yes. Build the gallery, run `npm run publish`, and copy-paste the contents of `DELIVERY.md` — it's a ready-to-send message with the URL, credentials if applicable, and usage instructions. Your client gets a clean gallery link, not a cloud service signup.

**How fast is it compared to cloud services like Pixieset or Google Photos?**
For the build: a typical shoot of 20–30 photos builds in under 10 seconds (WebP conversion + EXIF extraction). First build takes longer if fonts need downloading. Subsequent builds are incremental — only new photos are processed.
For the upload: depends on your connection and photo count. No platform-side queue, no transcoding waiting room.

**Can I use GalleryPack without a web server?**
Yes. Galleries open directly from the filesystem (`file://`). ZIP download requires a browser context (Web Crypto API), but browsing and downloading individual photos works locally.

**Does it work offline after build?**
Yes. All assets (fonts, vendor JS/CSS, images) are local. No CDN calls at runtime.

**I just want to try it — what's the fastest path?**
```bash
npm run setup:example   # generates sample photos
npm run build:all       # builds all galleries + site index
npm run serve           # open http://localhost:3000
```

**Can I protect a gallery with a password?**
Yes — set `access: "password"` in `gallery.config.json`. GalleryPack generates `.htaccess` + `.htpasswd` for Apache basic auth. Run `npm run publish` to upload with the correct absolute path pre-filled. See [privacy-access.md](privacy-access.md).

**Does it support multiple galleries?**
Yes. Each gallery is a subfolder of `src/`. Run `npm run build:all` to build all of them and generate a shared index page at `dist/index.html`.

**I have no gallery.config.json — will the build crash?**
No. GalleryPack applies smart defaults: title from folder name, date from EXIF (or today), locale `fr`. A hint suggests running `npm run new-gallery <name>` to create a proper config.

**Can visitors download the original photos?**
Configurable via `allowDownloadImage` (single photo) and `allowDownloadGallery` (full ZIP).
Set either to `false` to disable. When enabled, source copies are placed in `dist/<slug>/originals/`.

**What image formats are supported as input?**
JPG, JPEG, PNG, TIFF, HEIC/HEIF, AVIF. All output is WebP.

**My iPhone photos have no GPS — why?**
iOS strips GPS metadata when sharing via AirDrop or iCloud Photos with "Remove location data" enabled. Transfer via USB or disable the stripping option in iOS Settings → Privacy → Location Services. GalleryPack can only use GPS data that is present in the files.

**Does GPS reverse geocoding require an API key?**
No. GalleryPack uses the free Nominatim/OpenStreetMap API with no registration. Results are cached in `photos.json` — subsequent builds are fully offline and never call the API again.

**How does date: "auto" work?**
GalleryPack reads `DateTimeOriginal` from every photo's EXIF, picks the earliest, and uses it as the gallery date. If no EXIF dates are found, the field is left empty.

**The country name shows in multiple languages (e.g. "Schweiz/Suisse/Svizzera/...").**
This happens when the GPS reverse geocoding returns a multilingual OSM name instead of a locale-specific one. GalleryPack uses `Intl.DisplayNames` with the gallery locale to resolve the country name correctly — e.g. `"Suisse"` for `locale: "fr"`, `"Switzerland"` for `locale: "en"`. If you still see this, check that your `locale` field is set in `gallery.config.json`.

**Can I see at a glance which galleries are password-protected?**
Yes. The site index (`dist/index.html`) shows a small lock icon on the card of every gallery with `access: "password"`. Public galleries have no icon.

**I built a password-protected gallery but its cover image shows in the site index — is that a security leak?**
By design, the cover thumbnail is copied outside the protected zone (to `dist/covers/`) so the site index can display it without an auth prompt. Only the cover thumbnail is exposed; all other images, the HTML, and the ZIP remain fully protected behind `.htaccess`.

**Can I deploy to GitHub Pages / Netlify / Vercel / S3?**
Yes — it's plain static files. Any host that serves HTML works. Run `npm run deploy` for GitHub Pages (uses a safe isolated git worktree).

**Does password protection work on GitHub Pages?**
No. `.htaccess` is an Apache feature — GitHub Pages (and Netlify/Vercel) ignore it. Use `private: true` (unguessable URL) for light privacy on those hosts, or serve from Apache/Nginx for real password protection. See [privacy-access.md](privacy-access.md).

**What is the difference between `npm run deploy` and `npm run publish`?**
`deploy` pushes `dist/` to GitHub Pages (git-based, free). `publish` uploads to your own server via rsync — it also updates `DELIVERY.md` with the live URL and prints the delivery message.

**How do I share a gallery with a client?**
Build → publish → send the content of `DELIVERY.md` (it's a ready-to-send message with URL, credentials if applicable, and usage instructions).

**Can I add a custom legal notice?**
Yes. Add `legal.html` and/or `legal.txt` in `src/<gallery>/`. Tokens like `{{AUTHOR}}` and `{{YEAR}}` are replaced at build time. If absent, the built-in template for the gallery locale is used.

**How is this different from iCloud Photos / Google Photos / Pixieset?**
Those are services — storage, sharing, printing, subscriptions. GalleryPack is a build tool. You own the output, the hosting, and the URLs. Nothing expires, nothing is tracked. See [what-is-gallerypack.md](what-is-gallerypack.md).

**How do I rotate the password on a protected gallery?**
Change or remove the `password` field in `gallery.config.json`, rebuild, and re-publish. A new `.htpasswd` is generated from scratch each time.

**How do I change which photo appears as the cover in the site index?**
The first photo in alphabetical order from `src/<gallery>/photos/` is used as the cover. Rename your preferred photo so it sorts first (e.g. prefix it with `00_`).

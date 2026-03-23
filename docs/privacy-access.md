# Privacy & access modes

SSGG offers three access modes. Choose based on your actual security needs.

---

## Public (default)

No configuration needed.

```json
{ "project": { "title": "My Gallery" } }
```

- Listed in the site index
- Accessible at a predictable URL (`/my-gallery/`)
- No credentials required

---

## Private link (unguessable URL)

```json
{ "project": { "title": "My Gallery", "private": true } }
```

- Output folder becomes a 16-char SHA-256 hash (e.g. `/a3f8c2d1e4b9f7a0/`)
- Hidden from the site index
- Same config always produces the same hash — change `title`, `author`, or `date` to rotate

**Honest disclaimer:** This is security through obscurity. The URL is practically impossible to guess, but it is not cryptographically enforced. Anyone with the link can view the gallery.

Use this for: casual privacy, client previews, galleries you don't want indexed.
Don't use this for: sensitive content, legal/contractual confidentiality.

---

## Password protection (`access: "password"`)

Generates `.htaccess` + `.htpasswd` files for Apache basic auth.

```json
{
  "project": {
    "title": "My Gallery",
    "access": "password"
  }
}
```

With a manual password:
```json
{
  "project": {
    "title": "My Gallery",
    "access": "password",
    "password": "sunflower-delta-58"
  }
}
```

### What happens at build time

- A memorable password is auto-generated if none is set (e.g. `ruby-coral-30`)
- `.htaccess` is written to `dist/<slug>/`
- `.htpasswd` is written to `dist/<slug>/`
- The password is shown in the terminal `🔒 Password: ruby-coral-30`
- The password is saved in `build-summary.json` and `DELIVERY.md`

### What happens at publish time (`npm run publish`)

- `__HTPASSWD_PATH__` in `.htaccess` is automatically replaced with the real absolute server path (e.g. `/var/www/html/galleries/my-gallery/.htpasswd`)
- Files are uploaded via rsync

### Password format

Auto-generated passwords follow the pattern `word-word-NN` (e.g. `amber-cloud-42`).
They are memorable enough to dictate by phone, and reasonably hard to brute-force.

### What is protected

The `.htaccess` covers all content in the folder:
- `index.html`
- `data.js`, `gallery.js`
- `img/` (all WebP files)
- `originals/` (source copies)
- `photos.json`, `build-summary.json`
- ZIP downloads

### Server requirements

- Apache with `mod_authn_file` and `AllowOverride AuthConfig` (standard on most shared hosting)
- The gallery must be served from a directory where `.htaccess` is honoured

### Changing the password

Re-run the build with a new `password` field (or remove it to auto-generate). Then re-publish. The `.htpasswd` is regenerated from scratch each time.

---

## What to protect

When using any access restriction, ensure it covers **all assets** — not just the HTML page. Protecting only `index.html` while leaving `img/` accessible defeats the purpose.

SSGG's `.htaccess` covers everything by default.

---

## Comparison

| Mode | URL | Indexed | Credential | Server-side |
|------|-----|---------|------------|-------------|
| Public | predictable | yes | none | no |
| Private link | hash | no | link only | no |
| Password | predictable | optional | username + password | Apache only |

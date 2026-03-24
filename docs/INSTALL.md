# GalleryPack — Installation Guide

## Overview

GalleryPack has two usage modes:

| Mode | Description | Install option |
|------|-------------|----------------|
| **CLI** | Build locally, deploy static files anywhere | [Option A — CLI](#option-a--cli-local-build) |
| **Hosted** | Web server with admin panel + photographer upload | [Option B — Docker dev](#option-b--docker-development) · [Option C — Apache+Docker prod](#option-c--apachedocker-production-recommended) · [Option D — Nginx](#option-d--nginx-reverse-proxy) · [Option E — Native Node.js](#option-e--native-nodejs) |

---

## Requirements

- **Node.js 20+** (or Docker — hides all dependencies)
- **RAM:** ~500 MB minimum (Sharp image processing is memory-intensive)
- **Disk:** allow 3× raw photo size for WebP thumbnails + originals

---

## Option A — CLI (local build)

No server needed. Run the build tool on your machine, copy `dist/` to any web host.

### 1. Install

```bash
git clone https://github.com/pvollenweider/gallerypack.git
cd gallerypack
npm install
```

### 2. Create a gallery

```bash
npm run new-gallery my-shoot
# Drop photos into src/my-shoot/photos/
# Edit src/my-shoot/gallery.config.json if needed
```

### 3. Build

```bash
npm run build my-shoot        # incremental
npm run build:force my-shoot  # force re-encode all images
npm run build:all             # build every gallery + site index
```

### 4. Preview

```bash
npm run serve
# → http://localhost:3000/my-shoot/
```

### 5. Deploy

**Option 5a — rsync** (requires `publish.config.json`):

```bash
# publish.config.json
{
  "remote":     "user@yourserver.com",
  "remotePath": "/var/www/html/galleries",
  "baseUrl":    "https://photos.example.com"
}

npm run publish        # one gallery (interactive)
npm run publish:all    # all galleries
```

**Option 5b — FTP / cPanel** (Apache hosting):

```bash
# Patch .htaccess files and create a zip
npm run export -- --apache-path=/var/www/html/galleries
npm run export:zip   # also creates dist-export.zip

# Upload dist-export.zip via cPanel File Manager or FTP, then extract
```

**Option 5c — GitHub Pages / Netlify / S3**:

```bash
npm run deploy        # GitHub Pages (gh-pages branch)
# Or just copy dist/ to any static host
```

---

## Option B — Docker (development)

The simplest way to run the hosted server locally or on a VPS where Node.js handles all routes.

### 1. Configure

Edit `docker-compose.yml`:

```yaml
environment:
  BASE_URL:       "http://localhost:3000"   # or https://your-domain.com
  ADMIN_PASSWORD: "your-secure-password"
  SESSION_SECRET: "$(openssl rand -hex 32)"
```

### 2. Start

```bash
docker compose up -d
docker compose logs -f
```

### 3. Access

| URL | Description |
|-----|-------------|
| `http://localhost:3000/admin` | Admin panel |
| `http://localhost:3000/upload/<token>` | Photographer upload |
| `http://localhost:3000/my-gallery/<id>?token=…` | Photographer management |
| `http://localhost:3000/status/<id>` | Build progress |

---

## Option C — Apache + Docker (production, recommended)

Best for production: Apache serves static galleries directly (fast, HTTP/2, brotli, `.htaccess` auth), Docker handles admin/upload/api.

```
Internet → Apache :443
  ├── /                dist/ statique  (Apache direct — rapide)
  ├── /admin           ┐
  ├── /api/            │ ProxyPass → Docker Node.js :3000
  ├── /upload/         │ (127.0.0.1 only, not public)
  ├── /my-gallery/     │
  ├── /status/         ┘
  └── /js/
```

### 1. Prerequisites

```bash
apt install apache2 docker.io docker-compose-plugin certbot python3-certbot-apache
a2enmod proxy proxy_http rewrite headers ssl expires brotli http2
```

### 2. Configure environment

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

| Variable | Example | Description |
|----------|---------|-------------|
| `ADMIN_PASSWORD` | `my-password` | Admin panel password |
| `SESSION_SECRET` | _(openssl rand -hex 32)_ | Random 32-char secret |
| `BASE_URL` | `https://photos.example.com` | Public HTTPS URL |
| `GALLERY_APACHE_PATH` | `/var/www/galleries/dist` | Apache DocumentRoot — used to generate correct `AuthUserFile` in `.htaccess` for password-protected galleries |

### 3. Start the container

```bash
docker compose -f deploy/docker-compose.prod.yml up -d
```

The Node.js port (3000) is bound to `127.0.0.1` only — Apache is the only entry point from outside.

### 4. Configure Apache

Copy and adapt the provided VirtualHost (already configured for `photos.vollenweider.org` as reference):

```bash
cp deploy/apache-vhost.conf /etc/apache2/sites-available/mygalleries.conf
# Edit: replace domain and DocumentRoot path
nano /etc/apache2/sites-available/mygalleries.conf

a2ensite mygalleries
apache2ctl configtest
systemctl reload apache2
```

The VirtualHost includes:
- HTTP → HTTPS redirect
- HTTP/2 (`Protocols h2 http/1.1`)
- Security headers (HSTS, CSP, X-Frame-Options, COOP)
- Cache-Control + Expires for static assets (1 year immutable for images/fonts)
- Brotli + Deflate compression
- `AllowOverride AuthConfig` for `.htaccess` Basic Auth
- ProxyPass for all GalleryPack dynamic routes
- SSE stream with `flushpackets=on` (live build log)

### 5. SSL

```bash
certbot --apache -d photos.example.com
systemctl reload apache2
```

Certbot fills in the `SSLCertificateFile` / `SSLCertificateKeyFile` directives automatically.

### 6. DocumentRoot

Apache's `DocumentRoot` must point to GalleryPack's `dist/` on the host.
The Docker container mounts the same path via the volume in `deploy/docker-compose.prod.yml`:

```yaml
volumes:
  - ../dist:/app/dist   # host path ↔ container path
```

Make sure the `DocumentRoot` in the Apache vhost matches the absolute host path to `dist/`.

### Password-protected galleries

When `GALLERY_APACHE_PATH` is set, each rebuild writes a ready-to-use `.htaccess`:

```apache
AuthType Basic
AuthName "My Gallery"
AuthUserFile /var/www/galleries/dist/my-gallery/.htpasswd
Require valid-user
```

Apache enforces this natively — all assets (images, JS, JSON) are server-side protected.

---

## Option D — Nginx reverse proxy

Nginx proxies all routes to Node.js. Simpler than the Apache hybrid but no native `.htaccess` auth.

### 1. Install

```bash
apt install nginx certbot python3-certbot-nginx
```

### 2. Create config

`/etc/nginx/sites-available/gallerypack`:

```nginx
server {
    listen 80;
    server_name photos.example.com;

    client_max_body_size 2G;      # large photo batches
    proxy_read_timeout    600s;   # long builds
    proxy_connect_timeout 600s;
    proxy_send_timeout    600s;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Required for SSE (live build log) — disable buffering
        proxy_buffering  off;
        proxy_cache      off;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/gallerypack /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d photos.example.com
```

---

## Option E — Native Node.js

No Docker. Run directly on the host.

### 1. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs libvips-dev libheif-dev libwebp-dev
```

### 2. Install dependencies

```bash
git clone https://github.com/pvollenweider/gallerypack.git /opt/gallerypack
cd /opt/gallerypack
npm ci --omit=dev
npm rebuild sharp
```

### 3. systemd service

`/etc/systemd/system/gallerypack.service`:

```ini
[Unit]
Description=GalleryPack
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/gallerypack
ExecStart=/usr/bin/node server/app.js
Restart=on-failure
RestartSec=5
Environment=PORT=3000
Environment=BASE_URL=https://photos.example.com
Environment=ADMIN_PASSWORD=your-password
Environment=SESSION_SECRET=your-32char-secret
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now gallerypack
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `BASE_URL` | `http://localhost:3000` | Public URL (used in links and emails) |
| `ADMIN_PASSWORD` | — | Admin panel password (required in prod) |
| `SESSION_SECRET` | Random | Signs admin session tokens (set a fixed value in prod) |
| `GALLERY_APACHE_PATH` | — | Apache DocumentRoot — activates correct `.htaccess` generation |

---

## Data persistence

| Path | Contents | Backup |
|------|----------|--------|
| `src/` | Source photos + `gallery.config.json` | Yes |
| `dist/` | Built galleries | Optional (can rebuild) |
| `server/data/jobs.json` | Build job history | Optional |
| `server/data/invites.json` | Invite links | Yes |
| `server/data/settings.json` | App settings (SMTP, etc.) | Yes |

Backup command:

```bash
tar czf gallerypack-backup-$(date +%Y%m%d).tar.gz \
    src/ server/data/
```

---

## SMTP email notifications

Configure in the admin panel → **Settings** → SMTP section, or via `server/data/settings.json`.

GalleryPack sends emails when:
- A gallery build completes — photographer + admin receive the gallery and management links
- An invite link is created with a photographer email — photographer receives the upload link
- Admin manually re-sends access from a gallery card

| Setting | Example |
|---------|---------|
| SMTP host | `smtp.gmail.com` |
| Port | `587` (STARTTLS) or `465` (SSL) |
| Username | `your@gmail.com` |
| Password | 16-char App Password (Gmail 2FA required) |
| From | `GalleryPack <noreply@photos.example.com>` |

> Port 587 = STARTTLS (leave "Direct SSL/TLS" **unchecked**).
> Port 465 = direct SSL (check "Direct SSL/TLS").

---

## Updating GalleryPack

```bash
git pull

# Docker (dev)
docker compose up -d --build

# Docker (prod)
docker compose -f deploy/docker-compose.prod.yml up -d --build

# Native
npm ci --omit=dev && npm rebuild sharp
systemctl restart gallerypack
```

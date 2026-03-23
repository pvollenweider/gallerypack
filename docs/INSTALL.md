# GalleryPack v2 — Installation Guide

## Overview

GalleryPack is a self-hosted photo gallery platform. It converts folders of photos into polished static galleries, served by a lightweight Node.js server.

**Features:**
- Web upload interface for photographers
- Invite link system (send a link, photographer uploads)
- Admin panel (gallery management, invite links, SMTP settings)
- Photographer management interface (add/remove photos, edit metadata)
- Email notifications via SMTP
- Password-protected galleries
- Mobile-friendly upload (including iPhone Photos library)

---

## Requirements

- **Node.js 20+** (or Docker — recommended)
- **~500 MB RAM** (sharp image processing is memory-intensive)
- **Storage:** depends on photo volume (allow 3× raw photo size for thumbnails)

---

## Option A — Docker (recommended)

Docker is the easiest way to run GalleryPack with no dependency issues.

### 1. Clone the repository

```bash
git clone https://github.com/your-repo/gallerypack.git
cd gallerypack
```

### 2. Configure environment

Edit `docker-compose.yml` and set your values:

```yaml
environment:
  PORT:           "3000"
  BASE_URL:       "https://your-domain.com"   # no trailing slash
  ADMIN_PASSWORD: "your-secure-password"
  SESSION_SECRET: "a-long-random-string-32-chars-min"
```

Generate a good SESSION_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start the container

```bash
docker compose up -d
```

### 4. Verify it's running

```bash
docker compose logs -f
```

You should see:
```
✓  GalleryPack v2 server
   http://localhost:3000/
```

### 5. Access the admin panel

Go to `http://your-server:3000/admin` and log in with your `ADMIN_PASSWORD`.

---

## Option B — Native Node.js (VPS without Docker)

### 1. Install Node.js 20

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20 && nvm use 20
```

### 2. Install system dependencies (for sharp/HEIC support)

```bash
# Ubuntu/Debian
sudo apt-get install -y libvips-dev libheif-dev libwebp-dev
```

### 3. Clone and install

```bash
git clone https://github.com/your-repo/gallerypack.git
cd gallerypack
npm ci --omit=dev
npm rebuild sharp
```

### 4. Configure environment

Create a `.env` file or set environment variables in your shell / systemd unit:

```bash
export PORT=3000
export BASE_URL="https://your-domain.com"
export ADMIN_PASSWORD="your-secure-password"
export SESSION_SECRET="a-long-random-string"
```

Or create a `.env` file and load it with a process manager (see below).

### 5. Start the server

```bash
node server/app.js
```

### 6. Run as a systemd service (recommended for production)

Create `/etc/systemd/system/gallerypack.service`:

```ini
[Unit]
Description=GalleryPack v2
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/gallerypack
ExecStart=/usr/bin/node server/app.js
Restart=on-failure
RestartSec=5

Environment=PORT=3000
Environment=BASE_URL=https://your-domain.com
Environment=ADMIN_PASSWORD=your-secure-password
Environment=SESSION_SECRET=your-session-secret
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gallerypack
sudo systemctl start gallerypack
sudo systemctl status gallerypack
```

---

## Nginx Reverse Proxy

Expose GalleryPack through Nginx with SSL termination.

### 1. Install Nginx and Certbot

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### 2. Create Nginx config

Create `/etc/nginx/sites-available/gallerypack`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Increase upload limit for large photo batches
    client_max_body_size 2G;

    # Increase timeouts for long builds
    proxy_read_timeout    600s;
    proxy_connect_timeout 600s;
    proxy_send_timeout    600s;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Required for SSE (build log streaming)
        proxy_buffering    off;
        proxy_cache        off;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/gallerypack /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Obtain SSL certificate

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot automatically updates the Nginx config for HTTPS and sets up auto-renewal.

### 4. Update BASE_URL

Update your `docker-compose.yml` or systemd service:

```
BASE_URL=https://your-domain.com
```

Then restart GalleryPack:

```bash
# Docker
docker compose up -d

# systemd
sudo systemctl restart gallerypack
```

---

## Updating GalleryPack

### Docker

```bash
git pull
docker compose down
docker compose up -d --build
```

### Native

```bash
git pull
npm ci --omit=dev
npm rebuild sharp
sudo systemctl restart gallerypack
```

---

## Data Persistence

GalleryPack stores data in these directories:

| Path | Contents | Backup? |
|------|----------|---------|
| `src/` | Gallery source photos + configs | Yes |
| `dist/` | Built static galleries | Optional (can rebuild) |
| `server/jobs.json` | Build job history | Optional |
| `server/invites.json` | Invite links | Yes |
| `server/settings.json` | SMTP and app settings | Yes |

With Docker, these are volume-mounted from the host:
```yaml
volumes:
  - ./src:/app/src
  - ./dist:/app/dist
  - ./server:/app/server
```

To back up:
```bash
tar czf gallerypack-backup-$(date +%Y%m%d).tar.gz src/ server/invites.json server/settings.json server/jobs.json
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP port |
| `BASE_URL` | Yes (prod) | `http://localhost:3000` | Public URL, used in links and emails |
| `ADMIN_PASSWORD` | Yes | — | Admin panel password |
| `SESSION_SECRET` | Yes (prod) | Random (lost on restart) | Signs admin session tokens |

---

## SMTP Email Notifications

GalleryPack can send emails when:
- A gallery is built — photographer + admin receive the gallery link and management URL
- An invite link is created with a photographer email — photographer receives the upload link

### Setup

1. Go to `/admin` → **Settings** tab
2. Fill in:
   - **Admin email** — receives copies of all notifications
   - **SMTP host** — e.g. `smtp.gmail.com`, `smtp.sendgrid.net`
   - **Port** — `587` (TLS/STARTTLS) or `465` (SSL)
   - **Username / Password** — your SMTP credentials
   - **From address** — e.g. `GalleryPack <noreply@your-domain.com>`
3. Click **Save**

### Gmail example

Use an App Password (requires 2FA on your Google account):
- Host: `smtp.gmail.com`
- Port: `587`
- Username: `your.email@gmail.com`
- Password: your 16-character App Password
- TLS: enabled

### Transactional email services (recommended for production)

Services like **Resend**, **Postmark**, **Mailgun**, or **SendGrid** offer better deliverability than direct SMTP:
- They provide SMTP credentials you can use directly
- Most have a free tier sufficient for low-volume use

---

## Password-Protected Galleries

Password protection uses a client-side gate in the gallery viewer.

**Note:** In Docker/Express deployments, the Apache `.htaccess` files generated by the build are not used. The JavaScript password gate in the gallery viewer is the active protection mechanism. Direct asset URLs (images) are not server-side protected in this mode.

For stronger asset protection in production, consider adding an Nginx `auth_basic` rule for specific gallery paths, or implement a custom Express middleware (see the source code).

---

## Notes

- **Gallery ZIP downloads** are generated client-side by the browser (JSZip). For large galleries, this may take a moment.
- **Standalone galleries** (`standalone: true` in `gallery.config.json`) bundle all vendor assets locally. Use this for galleries that will be exported or served independently.
- **Non-standalone galleries** (default for web-created galleries) share vendor assets from the `dist/` root.

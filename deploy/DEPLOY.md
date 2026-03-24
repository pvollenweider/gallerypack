# GalleryPack — Apache + Docker deployment

## Architecture

```
Internet  →  Apache :443 (photos.vollenweider.org)
               │
               ├── /                 dist/ statique  ← Apache sert directement
               ├── /admin            ┐
               ├── /api/             │  ProxyPass → Docker Node.js :3000
               ├── /upload/          │  (127.0.0.1 seulement, non exposé)
               ├── /my-gallery/      │
               ├── /status/          │
               └── /js/              ┘
```

- Apache sert `dist/` directement — HTTP/2, brotli, cache long terme, `.htaccess` Basic Auth
- Docker Node.js gère l'admin, les uploads, et le pipeline de build (Sharp/WebP)
- Le port 3000 est lié à `127.0.0.1` — inaccessible depuis l'extérieur

---

## Prérequis serveur

```bash
apt install apache2 docker.io docker-compose-plugin certbot python3-certbot-apache

a2enmod proxy proxy_http rewrite headers ssl expires brotli http2
```

---

## Installation

### 1. Cloner le projet

```bash
git clone https://github.com/youruser/gallerypack.git /path/to/gallerypack
cd /path/to/gallerypack
```

### 2. Créer l'environnement

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Variables obligatoires :

| Variable | Exemple | Description |
|---|---|---|
| `ADMIN_PASSWORD` | `monmotdepasse` | Mot de passe du panel admin |
| `SESSION_SECRET` | _(openssl rand -hex 32)_ | Secret pour les tokens de session |
| `BASE_URL` | `https://photos.vollenweider.org` | URL publique du site |
| `GALLERY_APACHE_PATH` | `/var/www/vhosts/photos.vollenweider.org/html` | DocumentRoot Apache (pour générer les `.htaccess`) |

### 3. Démarrer le container

```bash
docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml logs -f   # vérifier le démarrage
```

### 4. Configurer Apache

```bash
# Adapter le vhost à ton serveur (domain + paths sont déjà corrects pour vollenweider.org)
cp deploy/apache-vhost.conf /etc/apache2/sites-available/photos.vollenweider.org.conf

a2ensite photos.vollenweider.org
apache2ctl configtest
systemctl reload apache2
```

### 5. SSL avec Let's Encrypt

```bash
certbot --apache -d photos.vollenweider.org
systemctl reload apache2
```

Certbot met à jour automatiquement le vhost avec les directives SSL.

---

## DocumentRoot

Apache sert les galeries depuis `dist/` sur le disque hôte.
Le container Docker monte le même dossier :

```
Hôte :  /path/to/gallerypack/dist/   ←→  Container : /app/dist/
```

Le `DocumentRoot` du vhost doit pointer vers ce dossier :
```apache
DocumentRoot /path/to/gallerypack/dist
```

---

## Créer et rebuilder des galeries

Les builds tournent dans le container (où Node + Sharp sont installés) :

```bash
# Rebuilder une galerie depuis le shell
docker compose -f deploy/docker-compose.prod.yml exec gallerypack \
    node build/index.js grisons

# Rebuilder toutes les galeries
docker compose -f deploy/docker-compose.prod.yml exec gallerypack \
    node build/index.js --all
```

Ou directement depuis le **panel admin** → les builds sont déclenchés automatiquement.

---

## Galeries protégées par mot de passe

Quand `GALLERY_APACHE_PATH` est défini dans `deploy/.env`, le build génère des `.htaccess` avec le chemin absolu correct :

```apache
AuthUserFile /var/www/vhosts/photos.vollenweider.org/html/ma-galerie/.htpasswd
Require valid-user
```

Apache lit ces fichiers nativement grâce à `AllowOverride AuthConfig` dans le vhost.

---

## Commandes utiles

```bash
# Logs du container
docker compose -f deploy/docker-compose.prod.yml logs -f

# Redémarrer après une mise à jour du code
docker compose -f deploy/docker-compose.prod.yml up -d --build

# Shell dans le container
docker compose -f deploy/docker-compose.prod.yml exec gallerypack sh

# Tester le proxy Apache → Node
curl -I http://127.0.0.1:3000/api/galleries        # direct
curl -I https://photos.vollenweider.org/admin      # via Apache
```

---

## Mise à jour de GalleryPack

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

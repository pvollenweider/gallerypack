# Image Build & Registry Guide

GalleryPack publishes three Docker images to the GitHub Container Registry (GHCR):

| Image | Dockerfile |
|-------|-----------|
| `ghcr.io/pvollenweider/gallerypack-api` | `Dockerfile.api` |
| `ghcr.io/pvollenweider/gallerypack-worker` | `Dockerfile.worker` |
| `ghcr.io/pvollenweider/gallerypack-web` | `Dockerfile.web` |

---

## Tagging strategy

| Git event | Image tags applied |
|-----------|--------------------|
| Push to `main` | `:dev` |
| Tag `v*-alpha` | `:alpha`, `:vX.Y.Z-alpha` |
| Tag `v*-beta` | `:beta`, `:vX.Y.Z-beta` |
| Tag `v*` (release) | `:prod`, `:vX.Y.Z`, `:latest` |

---

## Automated builds (CI)

Every push to `main` and every git tag triggers `.github/workflows/docker.yml`, which:

1. Logs in to GHCR using `GITHUB_TOKEN`
2. Computes tags with `docker/metadata-action`
3. Builds all three images in parallel with `docker/build-push-action`
4. Caches layers via GitHub Actions cache (`type=gha`) for fast incremental builds

No manual action is required for routine builds.

---

## Manual local build

```bash
# Build individual images
make build-api       # → gallerypack-api:dev
make build-worker    # → gallerypack-worker:dev
make build-web       # → gallerypack-web:dev

# Or directly with docker
docker build -f Dockerfile.api    -t ghcr.io/pvollenweider/gallerypack-api:dev .
docker build -f Dockerfile.worker -t ghcr.io/pvollenweider/gallerypack-worker:dev .
docker build -f Dockerfile.web    -t ghcr.io/pvollenweider/gallerypack-web:dev .
```

---

## Promoting a release

```bash
# Create and push a release tag (triggers CI → :prod + :vX.Y.Z + :latest)
git tag v1.4.0
git push origin v1.4.0

# Alpha / beta pre-releases
git tag v1.5.0-alpha
git push origin v1.5.0-alpha
```

CI will build and push the correctly tagged images automatically.

---

## Pulling images

```bash
# Latest production release
docker pull ghcr.io/pvollenweider/gallerypack-api:latest

# Specific version
docker pull ghcr.io/pvollenweider/gallerypack-api:v1.4.0

# Development (latest main commit)
docker pull ghcr.io/pvollenweider/gallerypack-api:dev
```

You may need to authenticate first:
```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

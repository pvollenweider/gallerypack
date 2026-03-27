# K3s Deployment Guide

## Prerequisites

- A running K3s cluster (`curl -sfL https://get.k3s.io | sh -`)
- `kubectl` configured to point at the cluster
- Images published to GHCR (see [build.md](build.md))

---

## 1. Create secrets

Secrets are **never committed** to the repository. Create them from your `.env` file:

```bash
kubectl create secret generic gallerypack-app-secrets \
  --from-literal=SESSION_SECRET=$(grep SESSION_SECRET .env | cut -d= -f2) \
  --from-literal=VIEWER_TOKEN_SECRET=$(grep VIEWER_TOKEN_SECRET .env | cut -d= -f2) \
  --from-literal=DB_PASS=$(grep ^DB_PASS .env | cut -d= -f2) \
  --from-literal=DB_ROOT_PASSWORD=$(grep DB_ROOT_PASSWORD .env | cut -d= -f2) \
  --from-literal=ADMIN_PASSWORD=$(grep ADMIN_PASSWORD .env | cut -d= -f2)
```

Or use [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) for GitOps:
```bash
cp k8s/secrets.yml.example k8s/secrets.yml
# Edit k8s/secrets.yml with real values
kubeseal --format yaml < k8s/secrets.yml > k8s/sealed-secrets.yml
kubectl apply -f k8s/sealed-secrets.yml
```

---

## 2. Apply manifests

```bash
kubectl apply -f k8s/storage.yml      # PersistentVolumeClaims
kubectl apply -f k8s/config.yml       # Caddyfile ConfigMap
kubectl apply -f k8s/deployments.yml  # StatefulSet, Deployments, Services
```

---

## 3. Set your domain

Before applying `deployments.yml`, update the `DOMAIN` env var in the proxy Deployment:

```yaml
# k8s/deployments.yml — gallerypack-proxy → env
- name: DOMAIN
  value: "photos.yourdomain.com"
```

Or patch it after applying:
```bash
kubectl set env deployment/gallerypack-proxy DOMAIN=photos.yourdomain.com
```

---

## 4. Verify the deployment

```bash
# Watch all pods come up
kubectl get pods -w

# Check logs
kubectl logs -f deployment/gallerypack-api
kubectl logs -f deployment/gallerypack-worker

# Check the LoadBalancer service for external IP
kubectl get svc gallerypack-proxy
```

---

## 5. DNS configuration

Point your domain's A record at the external IP of `gallerypack-proxy`:
```
photos.yourdomain.com → <EXTERNAL-IP>
```

Caddy will automatically provision a TLS certificate via Let's Encrypt once DNS propagates.

---

## Upgrading

To deploy a new image version:

```bash
# Point to new image tag
kubectl set image deployment/gallerypack-api api=ghcr.io/pvollenweider/gallerypack-api:v1.5.0
kubectl set image deployment/gallerypack-worker worker=ghcr.io/pvollenweider/gallerypack-worker:v1.5.0

# Or update deployments.yml and re-apply
kubectl apply -f k8s/deployments.yml
```

---

## Accessing the admin panel

Once deployed, the admin panel is at `https://your-domain/admin`.

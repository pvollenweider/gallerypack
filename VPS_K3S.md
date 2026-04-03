# K3s — Installation & Configuration

## Architecture

```
VPS (Ubuntu 24.04)
└── K3s (single node)
    ├── Traefik        — ingress controller (inclus)
    ├── cert-manager   — certificats SSL Let's Encrypt
    ├── CoreDNS        — DNS interne (inclus)
    └── containerd     — runtime (inclus)
```

---

## 1. Prérequis système

```bash
# Vérifier cgroup v2 (requis par K3s — Ubuntu 24.04 l'a par défaut)
stat -fc %T /sys/fs/cgroup/
# doit retourner "cgroup2fs"

# Vérifier la RAM disponible (K3s recommande 1GB min)
free -h
```

---

## 2. Installer K3s

```bash
curl -sfL https://get.k3s.io | sh -
```

K3s installe automatiquement : `k3s`, `kubectl`, `crictl`, `containerd`, Traefik, CoreDNS.

Vérifier que le cluster est up :

```bash
sudo kubectl get nodes
# NAME     STATUS   ROLES                  AGE   VERSION
# vol8     Ready    control-plane,master   ...   v1.x.x
```

---

## 3. Accès kubectl sans sudo

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
chmod 600 ~/.kube/config

# Tester
kubectl get nodes
```

---

## 4. Accès kubectl depuis ton Mac (optionnel mais pratique)

Sur le VPS, récupérer le kubeconfig :

```bash
sudo cat /etc/rancher/k3s/k3s.yaml
```

Sur ton Mac, créer `~/.kube/config` avec ce contenu, puis remplacer :

```
server: https://127.0.0.1:6443
```

par :

```
server: https://<IP_VPS>:6443
```

Ouvrir le port dans UFW :

```bash
sudo ufw allow 6443/tcp   # API Kubernetes
```

Tester depuis le Mac :

```bash
kubectl get nodes
```

---

## 5. Installer cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

Attendre que les pods soient ready (~1 min) :

```bash
kubectl -n cert-manager get pods
# cert-manager-...           Running
# cert-manager-cainjector-.. Running
# cert-manager-webhook-...   Running
```

---

## 6. Configurer Let's Encrypt (avec wildcard `*.gallerypack.app`)

Le wildcard nécessite DNS-01 via l'API Gandi LiveDNS.

### 6a. Installer le webhook Gandi pour cert-manager

```bash
helm repo add cert-manager-webhook-gandi https://bwolf.github.io/cert-manager-webhook-gandi
helm repo update
helm install cert-manager-webhook-gandi cert-manager-webhook-gandi/cert-manager-webhook-gandi \
  --namespace cert-manager \
  --set logLevel=2
```

### 6b. Créer le secret Gandi API

Dans `k8s/create-secrets.sh`, remplis `GANDI_API_KEY` puis :

```bash
bash k8s/create-secrets.sh
```

Ou manuellement :
```bash
kubectl create secret generic gandi-api-key \
  --namespace cert-manager \
  --from-literal=api-token="<TA_CLE_API_GANDI>"
```

### 6c. Créer le ClusterIssuer avec DNS-01

Créer `/home/pol/k8s/cluster-issuer.yaml` :

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: philippe@vollenweider.org
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      # HTTP-01 pour les domaines non-wildcard
      - http01:
          ingress:
            ingressClassName: traefik
        selector:
          dnsNames:
            - gallerypack.app
            - www.gallerypack.app
      # DNS-01 pour le wildcard *.gallerypack.app
      - dns01:
          webhook:
            groupName: acme.bwolf.me
            solverName: gandi
            config:
              apiKeySecretRef:
                name: gandi-api-key
                key: api-token
        selector:
          dnsNames:
            - "*.gallerypack.app"
```

```bash
kubectl apply -f ~/k8s/cluster-issuer.yaml
kubectl get clusterissuer
# NAME               READY   AGE
# letsencrypt-prod   True    ...
```

### 6d. Émettre le certificat wildcard

```bash
kubectl apply -f k8s/gallerypack/08-wildcard-cert.yaml

# Suivre l'émission (peut prendre 1-2 min)
kubectl describe certificate gallerypack-wildcard-tls -n gallerypack
kubectl get certificaterequest -n gallerypack
```

### 6e. Appliquer l'ingress mis à jour

```bash
kubectl apply -f k8s/gallerypack/06-ingress.yaml
```

---

## 7. Namespaces

```bash
kubectl create namespace gallerypack
kubectl create namespace monitoring    # pour plus tard si besoin
```

---

## 8. Vérification globale

```bash
kubectl get nodes
kubectl get pods -A
kubectl get svc -A
```

Tout doit être `Running` ou `Completed`. Les services Traefik doivent avoir une `EXTERNAL-IP`.

---

## 9. Structure des manifestes (convention)

```
~/k8s/
├── cluster-issuer.yaml       # Let's Encrypt (déjà créé)
├── gallerypack/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── secrets.yaml
└── ...autres apps
```

---

## Commandes utiles

```bash
# Statut général
kubectl get all -n gallerypack

# Logs d'un pod
kubectl logs -n gallerypack <pod-name> -f

# Décrire un pod (debug)
kubectl describe pod -n gallerypack <pod-name>

# Voir les certificats
kubectl get certificate -A

# Voir les ingress
kubectl get ingress -A

# Redémarrer un déploiement
kubectl rollout restart deployment/<name> -n gallerypack
```

# VPS — Installation & Sécurisation

## 1. Première connexion

Sur les images Ubuntu préconfigurées (OVH, Hetzner, etc.), l'utilisateur par défaut est `ubuntu` :

```bash
ssh ubuntu@<IP_VPS>
```

> Si l'hébergeur utilise `root` directement, remplace `ubuntu` par `root`.

---

## 2. Mise à jour du système

```bash
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban unattended-upgrades
```

---

## 3. Créer un utilisateur non-root

```bash
adduser pol
usermod -aG sudo pol
```

Copier la clé SSH vers le nouvel utilisateur :

```bash
rsync --archive --chown=pol:pol ~/.ssh /home/pol
```

Tester dans un **nouveau terminal** avant de fermer la session ubuntu :

```bash
ssh pol@<IP_VPS>
sudo whoami   # doit retourner "root"
```

---

## 4. Sécuriser SSH

Éditer `/etc/ssh/sshd_config` :

```
# Port 2222                  # optionnel — réduit le bruit des bots, pas indispensable
PermitRootLogin no           # désactiver root login
PasswordAuthentication no    # clé SSH uniquement
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
X11Forwarding no
AllowUsers pol
```

> **Port custom (optionnel)** : changer le port réduit les tentatives de bots dans les logs,
> mais n'apporte pas de vraie sécurité. Avec Fail2Ban + auth par clé, le port 22 est largement suffisant.
> Si tu le changes, remplace `22` par ton port dans les étapes UFW et Fail2Ban ci-dessous.

Redémarrer SSH :

```bash
systemctl restart ssh   # Ubuntu : "ssh" et non "sshd"
```

---

## 5. Firewall (UFW)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH (ou ton port custom si changé)
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw enable
ufw status verbose
```

---

## 6. Fail2Ban

Configuration de base dans `/etc/fail2ban/jail.local` :

```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled  = true
port     = ssh    # remplacer par ton port custom si changé
logpath  = /var/log/auth.log
```

```bash
systemctl enable fail2ban
systemctl start fail2ban
fail2ban-client status sshd
```

---

## 7. Mises à jour automatiques de sécurité

```bash
dpkg-reconfigure --priority=low unattended-upgrades
```

Vérifier `/etc/apt/apt.conf.d/50unattended-upgrades` — s'assurer que la ligne suivante est active :

```
"${distro_id}:${distro_codename}-security";
```

---

## 8. Durcissement du système

### Désactiver IPv6 (optionnel)

Dans `/etc/sysctl.conf` :

```
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
```

```bash
sysctl -p
```

### Limiter les connexions SSH simultanées

Dans `/etc/security/limits.conf` :

```
pol soft nproc 100
pol hard nproc 150
```

### Désactiver les services inutiles

```bash
systemctl list-units --type=service --state=running
systemctl disable --now <service_inutile>
```

---

## 9. Clé SSH — génération côté local (si pas encore fait)

```bash
ssh-keygen -t ed25519 -C "pol@gallerypack"
ssh-copy-id pol@<IP_VPS>
```

---

## 10. Checklist finale

- [ ] Connexion SSH avec clé uniquement (root login désactivé)
- [ ] Root login désactivé
- [ ] UFW actif avec les bons ports
- [ ] Fail2Ban actif
- [ ] Mises à jour automatiques activées
- [ ] Aucun service inutile actif
- [ ] Snapshot/backup VPS configuré chez l'hébergeur

---

## Commandes utiles

```bash
# Voir les tentatives de connexion bloquées
fail2ban-client status sshd

# Voir les connexions actives
ss -tulnp

# Surveiller les logs auth
tail -f /var/log/auth.log

# Statut du firewall
ufw status numbered
```

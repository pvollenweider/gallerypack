#!/usr/bin/env bash
# Copyright (c) 2026 Philippe Vollenweider
#
# This file is part of the GalleryPack commercial platform.
# This source code is proprietary and confidential.
# Use, reproduction, or distribution requires a valid commercial license.
# Unauthorized use is strictly prohibited.
#
# GalleryPack — backup script
# Usage: ./backup.sh
# Creates a timestamped backup in ./backups/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$SCRIPT_DIR/backups/$TIMESTAMP"
ENV_FILE="$SCRIPT_DIR/.env"

# Load env vars
set -a; source "$ENV_FILE"; set +a

mkdir -p "$BACKUP_DIR"

echo "=== GalleryPack backup — $TIMESTAMP ==="

# 1. Database dump
echo "→ Dumping database..."
docker compose -f "$SCRIPT_DIR/docker-compose.saas.yml" exec -T db \
  mariadb-dump -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  > "$BACKUP_DIR/db.sql"
gzip "$BACKUP_DIR/db.sql"
echo "  ✓ db.sql.gz ($(du -sh "$BACKUP_DIR/db.sql.gz" | cut -f1))"

# 2. Original photos (irreplaceable)
echo "→ Archiving original photos..."
tar -czf "$BACKUP_DIR/photos_private.tar.gz" -C "$SCRIPT_DIR/data" private
echo "  ✓ photos_private.tar.gz ($(du -sh "$BACKUP_DIR/photos_private.tar.gz" | cut -f1))"

# 3. App data (license, etc.)
echo "→ Archiving app data..."
tar -czf "$BACKUP_DIR/app.tar.gz" -C "$SCRIPT_DIR/data" app
echo "  ✓ app.tar.gz ($(du -sh "$BACKUP_DIR/app.tar.gz" | cut -f1))"

echo ""
echo "Backup complete: $BACKUP_DIR"
echo "Total size: $(du -sh "$BACKUP_DIR" | cut -f1)"

# Keep only the 10 most recent backups
echo ""
echo "→ Pruning old backups (keeping last 10)..."
ls -1dt "$SCRIPT_DIR/backups"/20* 2>/dev/null | tail -n +11 | xargs -r rm -rf
echo "  ✓ Done"

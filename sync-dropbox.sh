#!/usr/bin/env bash
# Copyright (c) 2026 Philippe Vollenweider
#
# This file is part of the GalleryPack commercial platform.
# This source code is proprietary and confidential.
# Use, reproduction, or distribution requires a valid commercial license.
# Unauthorized use is strictly prohibited.
#
# GalleryPack — Dropbox sync via rclone
#
# Usage:
#   ./sync-dropbox.sh                # full sync (scheduled or manual)
#   ./sync-dropbox.sh --check-trigger  # run only if a UI trigger file exists (for frequent cron)
#   ./sync-dropbox.sh --db-only      # DB dump + sync only
#   ./sync-dropbox.sh --dry-run      # show what would be transferred, nothing sent
#
# Synology Task Scheduler — recommended setup:
#   Job A  (daily,   03:00): /volume1/docker/gallerypack/sync-dropbox.sh
#   Job B  (every 5 min):    /volume1/docker/gallerypack/sync-dropbox.sh --check-trigger
#
# The admin UI writes data/internal/.sync-trigger to request an on-demand sync.
# Job B picks it up within 5 minutes. Job A runs the nightly scheduled sync.
#
# State files (in data/internal/, readable by the API container via shared volume):
#   .sync-status.json   ← last run state (running/success/error + timestamps)
#   .sync-trigger       ← created by the UI; consumed and deleted on pickup
#   .sync-log           ← full run log, appended each run

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
set -a; source "$ENV_FILE"; set +a

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.synology.yml}"

# Host-side path to the data directory (private/ public/ internal/).
# Use DATA_DIR in .env to override (e.g. /volume1/docker/gallerypack/data).
# Do NOT use STORAGE_ROOT here — that variable holds the in-container path.
DATA_ROOT="${DATA_DIR:-$SCRIPT_DIR/data}"

DROPBOX_REMOTE="${DROPBOX_REMOTE:-dropbox}"
DROPBOX_ROOT="${DROPBOX_PATH:-gallerypack}"

RCLONE_IMAGE="rclone/rclone:latest"
# Prefer rclone.conf saved via the admin UI (in the shared volume) over
# the one at the project root so the full setup can be done without SSH.
RCLONE_CONF_INTERNAL="$DATA_ROOT/internal/rclone.conf"
if [[ -f "$RCLONE_CONF_INTERNAL" ]]; then
  RCLONE_CONF="$RCLONE_CONF_INTERNAL"
else
  RCLONE_CONF="$SCRIPT_DIR/rclone.conf"
fi

DB_DUMP_DIR="$DATA_ROOT/internal/db-dumps"
DB_RETENTION_DAYS="${DB_RETENTION_DAYS:-7}"

# State files shared with the API container via the internal/ volume
STATUS_FILE="$DATA_ROOT/internal/.sync-status.json"
TRIGGER_FILE="$DATA_ROOT/internal/.sync-trigger"
LOG_FILE="$DATA_ROOT/internal/.sync-log"
SYNC_CONFIG="$DATA_ROOT/internal/sync-config.json"
MAX_LOG_LINES=2000

TRANSFERS="${RCLONE_TRANSFERS:-4}"
CHECKERS="${RCLONE_CHECKERS:-8}"
BWLIMIT="${RCLONE_BWLIMIT:-0}"

# Override with UI-saved config (sync-config.json) if present
if command -v python3 &>/dev/null && [[ -f "$SYNC_CONFIG" ]]; then
  _cfg() { python3 -c "import json,sys; d=json.load(open('$SYNC_CONFIG')); print(d.get('$1','$2'))" 2>/dev/null || echo "$2"; }
  DROPBOX_REMOTE="$(_cfg remote "$DROPBOX_REMOTE")"
  DROPBOX_ROOT="$(_cfg remotePath "$DROPBOX_ROOT")"
  BWLIMIT="$(_cfg bwlimit "$BWLIMIT")"
  DB_RETENTION_DAYS="$(_cfg dbRetentionDays "$DB_RETENTION_DAYS")"
  SYNC_PRIVATE="$(_cfg syncPrivate True)"
  SYNC_PUBLIC="$(_cfg syncPublic True)"
  SYNC_INTERNAL="$(_cfg syncInternal True)"
else
  SYNC_PRIVATE="True"
  SYNC_PUBLIC="True"
  SYNC_INTERNAL="True"
fi

# ── Parse args ────────────────────────────────────────────────────────────────

CHECK_TRIGGER=false
DB_ONLY=false
DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --check-trigger) CHECK_TRIGGER=true ;;
    --db-only)       DB_ONLY=true ;;
    --dry-run)       DRY_RUN=true ;;
  esac
done

# ── Trigger check (early exit for frequent cron) ──────────────────────────────

if $CHECK_TRIGGER; then
  if [[ ! -f "$TRIGGER_FILE" ]]; then
    exit 0   # no trigger → nothing to do
  fi
  # Consume trigger before proceeding so concurrent cron runs are harmless
  rm -f "$TRIGGER_FILE"
  TRIGGER_SOURCE="ui"
else
  TRIGGER_SOURCE="scheduled"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

mkdir -p "$DB_DUMP_DIR" "$(dirname "$LOG_FILE")"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

trim_log() {
  if [[ -f "$LOG_FILE" ]]; then
    local n; n=$(wc -l < "$LOG_FILE")
    if (( n > MAX_LOG_LINES )); then
      tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
  fi
}

write_status() {
  local state="$1" error="${2:-null}"
  local now; now=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  if [[ "$state" == "running" ]]; then
    cat > "$STATUS_FILE" <<EOF
{"state":"running","started_at":"$now","finished_at":null,"error":null,"trigger":"$TRIGGER_SOURCE"}
EOF
  else
    cat > "$STATUS_FILE" <<EOF
{"state":"$state","started_at":"$START_TIME","finished_at":"$now","error":$error,"trigger":"$TRIGGER_SOURCE"}
EOF
  fi
}

rclone_run() {
  local dry_flag=""
  $DRY_RUN && dry_flag="--dry-run"
  docker run --rm \
    --network host \
    -v "$RCLONE_CONF:/config/rclone/rclone.conf:ro" \
    -v "$DATA_ROOT:/data:ro" \
    -v "$DB_DUMP_DIR:/db-dumps:ro" \
    "$RCLONE_IMAGE" \
    "$@" $dry_flag \
    --transfers="$TRANSFERS" \
    --checkers="$CHECKERS" \
    --bwlimit="$BWLIMIT" \
    --log-level=INFO \
    --stats=0
}

# ── Sanity checks ─────────────────────────────────────────────────────────────

[[ -f "$RCLONE_CONF" ]] || { log "ERROR: rclone.conf not found at $RCLONE_CONF"; exit 1; }
[[ -d "$DATA_ROOT"   ]] || { log "ERROR: DATA_ROOT not found: $DATA_ROOT"; exit 1; }

trim_log

$DRY_RUN && log "=== DRY RUN — nothing will be transferred ==="

log "=== GalleryPack → Dropbox sync started (trigger: $TRIGGER_SOURCE) ==="

START_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
write_status "running"

# Trap errors → write error status
on_error() {
  local msg="Sync failed at line $1"
  log "ERROR: $msg"
  write_status "error" "\"$msg\""
  exit 1
}
trap 'on_error $LINENO' ERR

# ── 1. DB dump ────────────────────────────────────────────────────────────────

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="$DB_DUMP_DIR/${TIMESTAMP}.sql.gz"

log "→ Dumping database (${DB_NAME:-gallerypack})..."
if ! $DRY_RUN; then
  docker compose -f "$SCRIPT_DIR/$COMPOSE_FILE" exec -T db \
    mariadb-dump -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" \
    | gzip > "$DUMP_FILE"
  log "  ✓ $(du -sh "$DUMP_FILE" | cut -f1)"
  # Prune old dumps
  find "$DB_DUMP_DIR" -name "*.sql.gz" -mtime +"$DB_RETENTION_DAYS" -delete
  log "  ✓ DB dumps retained: $(find "$DB_DUMP_DIR" -name '*.sql.gz' | wc -l | tr -d ' ') file(s)"
else
  log "  (dry-run) skipping DB dump"
fi

log "→ Syncing DB dumps to Dropbox..."
rclone_run sync /db-dumps "${DROPBOX_REMOTE}:${DROPBOX_ROOT}/db" 2>>"$LOG_FILE"
log "  ✓ DB synced"

$DB_ONLY && { write_status "success"; log "=== --db-only complete ==="; exit 0; }

# ── 2. private/ — originals ───────────────────────────────────────────────────

if [[ "$SYNC_PRIVATE" != "False" ]]; then
  log "→ Syncing private/ (originals)..."
  rclone_run sync /data/private "${DROPBOX_REMOTE}:${DROPBOX_ROOT}/private" 2>>"$LOG_FILE"
  log "  ✓ private/ synced"
else
  log "  (skipped) private/ — disabled in config"
fi

# ── 3. public/ — built galleries ─────────────────────────────────────────────

if [[ "$SYNC_PUBLIC" != "False" ]]; then
  log "→ Syncing public/ (built galleries)..."
  rclone_run sync /data/public "${DROPBOX_REMOTE}:${DROPBOX_ROOT}/public" 2>>"$LOG_FILE"
  log "  ✓ public/ synced"
else
  log "  (skipped) public/ — disabled in config"
fi

# ── 4. internal/ — thumbnails + cache (skip tus upload sessions) ─────────────

if [[ "$SYNC_INTERNAL" != "False" ]]; then
  log "→ Syncing internal/ (thumbnails + cache, excluding tus/ and state files)..."
  rclone_run sync /data/internal "${DROPBOX_REMOTE}:${DROPBOX_ROOT}/internal" \
    --exclude "tus/**" \
    --exclude ".sync-*" \
    --exclude "sync-config.json" \
    --exclude "rclone.conf" \
    2>>"$LOG_FILE"
  log "  ✓ internal/ synced"
else
  log "  (skipped) internal/ — disabled in config"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

write_status "success"
log "=== Sync complete ==="

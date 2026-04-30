#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/rollback-prod.sh snapshot_YYYY-MM-DD_HHMMSS"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  source ".env"
  set +a
fi

SNAPSHOT_NAME="$1"

echo "[rollback] restauration du snapshot $SNAPSHOT_NAME"
pm2 stop police-konoha || true
node scripts/restore-backup.js --snapshot "$SNAPSHOT_NAME" --force

echo "[rollback] redemarrage PM2"
pm2 restart police-konoha
pm2 restart police-backup

echo "[rollback] verification health"
curl -fsS "http://127.0.0.1:${PORT:-3000}/health"

echo "[rollback] termine"

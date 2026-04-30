#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  source ".env"
  set +a
fi

echo "[deploy] installation des dependances"
npm install

echo "[deploy] verification de l'encodage front"
npm run front:encoding:check

echo "[deploy] execution des tests"
npm test

echo "[deploy] verification des sauvegardes"
npm run backup:verify

echo "[deploy] demarrage / reload PM2"
if pm2 describe police-konoha >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --env production
else
  pm2 start ecosystem.config.js --env production
fi

pm2 save

echo "[deploy] verification health"
curl -fsS "http://127.0.0.1:${PORT:-3000}/health"

echo "[deploy] termine"

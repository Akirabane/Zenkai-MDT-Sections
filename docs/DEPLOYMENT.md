# Deployment & Operations

## Prerequisites

- Node.js 22 LTS
- PM2 installed globally
- NGINX in reverse proxy in front of the Node app
- A `.env` file present at the project root

## Recommended `.env`

See [`.env.example`](/C:/Users/Akirabane/Desktop/Police%20Zenkai/.env.example) and define at least:

- `NODE_ENV=production`
- `PORT=3000`
- `STATUS_PORT=3010`
- `JWT_SECRET=...`
- `POLICE_SECRET=...`
- `JUSTICE_ACCOUNT_PASSWORD=...`
- `CORS_ORIGIN=https://zenkai-police.tech`
- `SQLITE_PATH=./DB/police.db`
- `LOG_LEVEL=info`
- `TRUST_PROXY=true`
- `BACKUP_INTERVAL_MINUTES=30`
- `BACKUP_MAX_SNAPSHOTS=10`
- `STATUS_MONITORED_SERVICES=police-status,police-konoha,data-guard,police-backup`

## PM2

The recommended PM2 entrypoint is [ecosystem.config.js](/C:/Users/Akirabane/Desktop/Police%20Zenkai/ecosystem.config.js).

Start:

```bash
pm2 start ecosystem.config.js --env production
pm2 save
```

Reload after deploy:

```bash
pm2 reload ecosystem.config.js --env production
pm2 save
```

PM2 redemarre deja un process qui crash. Si tu veux aussi qu un service arrete ou tombe soit relance par le VPS lui-meme, installe le watchdog systemd fourni par [(pm2-watchdog.sh) scripts/pm2-watchdog.sh](/C:/Users/Akirabane/Desktop/Police%20Zenkai/scripts/pm2-watchdog.sh) et [(pm2-watchdog.service) scripts/pm2-watchdog.service](/C:/Users/Akirabane/Desktop/Police%20Zenkai/scripts/pm2-watchdog.service).

Le watchdog est volontairement prudent:

- il ne relance que les services PM2 en etat `stopped` ou `errored`
- il ignore `online`, `launching`, `unknown` et `missing`
- il applique un cooldown anti-boucle de 15 secondes par service avant une nouvelle tentative

Installation recommandee:

```bash
chmod +x /var/www/html/scripts/pm2-watchdog.sh
cp /var/www/html/scripts/pm2-watchdog.service /etc/systemd/system/pm2-watchdog.service
systemctl daemon-reload
systemctl enable --now pm2-watchdog.service
systemctl status pm2-watchdog.service
```

Si tu modifies la liste des services dans le fichier systemd, garde bien les espaces entre guillemets:

```ini
Environment="PM2_WATCHDOG_SERVICES=police-status police-konoha data-guard police-backup"
```

Sinon `systemd` ignore une partie de la ligne et le watchdog ne surveille pas tous les services.

Logs du watchdog:

```bash
journalctl -u pm2-watchdog.service -f
```

## Health & Smoke Checks

Health endpoint:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3010/health
```

Encoding check:

```bash
npm run front:encoding:check
```

Test suite:

```bash
npm test
```

Backup verification:

```bash
npm run backup:verify
```

## Deploy Flow

Manual deploy:

```bash
npm install
npm run front:encoding:check
npm run backup:verify
pm2 reload ecosystem.config.js --env production
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3010/api/status-monitor/heartbeat
```

Scripted deploy:

```bash
bash scripts/deploy-prod.sh
```

## Rollback

List available snapshots:

```bash
ls DB/backups
```

Restore one snapshot:

```bash
node scripts/restore-backup.js --snapshot snapshot_YYYY-MM-DD_HHMMSS --force
pm2 restart police-konoha
pm2 restart police-backup
pm2 restart police-status
```

Or use the helper:

```bash
bash scripts/rollback-prod.sh snapshot_YYYY-MM-DD_HHMMSS
```

Each restore automatically creates a safety copy in `DB/backups/restore-preflight_*`.

## NGINX

Recommended reverse proxy baseline:

```nginx
server {
    server_name zenkai-police.tech;

    location = /Status_Systeme.html {
        proxy_pass http://127.0.0.1:3010/Status_Systeme.html;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /CSS/status-systeme.css {
        proxy_pass http://127.0.0.1:3010/CSS/status-systeme.css;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /JS/status-systeme.js {
        proxy_pass http://127.0.0.1:3010/JS/status-systeme.js;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /favicon.svg {
        proxy_pass http://127.0.0.1:3010/favicon.svg;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ^~ /api/status-monitor/ {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

    location = /health {
        proxy_pass http://127.0.0.1:3000/health;
        allow 127.0.0.1;
        deny all;
    }

    location = /status-health {
        proxy_pass http://127.0.0.1:3010/health;
        allow 127.0.0.1;
        deny all;
    }
}
```

## Backups

Automatic snapshots are managed by [backup.js](/C:/Users/Akirabane/Desktop/Police%20Zenkai/JS/backup.js).

Each snapshot contains:

- `police.db`
- optional SQLite sidecar files (`police.db-wal`, `police.db-shm`)
- `data.json`
- `users.json`
- `codepenal.json`
- `manifest.json`

Useful commands:

```bash
npm run backup
npm run backup:verify
npm run db:export
```

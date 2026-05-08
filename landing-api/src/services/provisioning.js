const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE = process.env.MDT_SOURCE || '/var/www/html';
const INSTANCES_DIR = process.env.MDT_INSTANCES_DIR || '/var/www/instances';
const SERVER_IP = process.env.SERVER_IP || '51.77.59.56';

function allocatePort(db) {
  const used = db.prepare('SELECT port FROM instances').all().map(r => r.port);
  let port = 3100;
  while (used.includes(port)) port++;
  return port;
}

function generateEnv(instance) {
  const theme = typeof instance.theme === 'string' ? JSON.parse(instance.theme) : instance.theme;
  const sections = typeof instance.sections === 'string' ? JSON.parse(instance.sections) : instance.sections;
  const categories = typeof instance.categories === 'string' ? JSON.parse(instance.categories) : instance.categories;
  const discordEvents = typeof instance.discord_events === 'string' ? JSON.parse(instance.discord_events) : (instance.discord_events || []);

  return [
    `PORT=${instance.port}`,
    `NODE_ENV=production`,
    `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`,
    `ENABLED_SECTIONS=${sections.join(',')}`,
    `THEME_PRIMARY=${theme.primary}`,
    `THEME_ACCENT=${theme.accent}`,
    `THEME_DARK=${theme.dark}`,
    `THEME_BORDER=${theme.border || theme.primary}`,
    `CUSTOM_CATEGORIES=${categories.join(',')}`,
    instance.discord_webhook ? `DISCORD_WEBHOOK=${instance.discord_webhook}` : '',
    instance.discord_webhook ? `DISCORD_EVENTS=${discordEvents.join(',')}` : '',
  ].filter(Boolean).join('\n');
}

const KONOHA_DEFAULTS = {
  primary: '#2e7d32', accent: '#76c442', dark: '#081508', border: '#2a5e1e',
  primaryRgb: '46,125,50', accentRgb: '118,196,66', darkRgb: '8,21,8',
};

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

function patchTheme(dir, theme) {
  const d = KONOHA_DEFAULTS;
  const map = [
    [d.dark, theme.dark],
    [d.primary, theme.primary],
    [d.accent, theme.accent],
    [d.border, theme.border],
    [d.primaryRgb, hexToRgb(theme.primary)],
    [d.accentRgb, hexToRgb(theme.accent)],
    [d.darkRgb, hexToRgb(theme.dark)],
  ];

  const exts = ['html','css','js'];
  const globs = exts.map(e => `"${dir}/vues/**/*.${e}"`).join(' ');

  for (const [from, to] of map) {
    if (from === to) continue;
    const escaped_from = from.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
    try {
      execSync(`find "${dir}/vues" -type f \\( -name "*.html" -o -name "*.css" -o -name "*.js" \\) -exec sed -i 's/${escaped_from}/${to}/g' {} +`, { stdio: 'pipe' });
    } catch {}
  }
}

function generateNginxConf(instance) {
  const domain = `${instance.subdomain}.zenkai-police.tech`;
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    root /var/www/instances/${instance.id}/vues;
    index index.html;

    client_max_body_size 16m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header X-Robots-Tag "noindex, nofollow" always;

    location = /.env { return 404; }
    location = /.db  { return 404; }
    location ^~ /DB/      { return 404; }
    location ^~ /uploads/ { return 404; }

    location ~ ^/(save|auth|admin|presence|api)(/.*)?$ {
        proxy_pass http://127.0.0.1:${instance.port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
`;
}

function provision(instance, db) {
  const instanceDir = path.join(INSTANCES_DIR, instance.id);
  const nginxConf = `/etc/nginx/sites-available/${instance.subdomain}.zenkai-police.tech`;
  const envPath = `/etc/zenkai-${instance.id}/.env`;
  const pm2Name = `mdt-${instance.id}`;

  fs.mkdirSync(instanceDir, { recursive: true });
  fs.mkdirSync(path.dirname(envPath), { recursive: true });

  const theme = typeof instance.theme === 'object' ? instance.theme : JSON.parse(instance.theme || '{}');

  // 1. Copier le codebase
  execSync(`rsync -a --exclude='.env' --exclude='node_modules' --exclude='DB' --exclude='uploads' --exclude='*.db' ${SOURCE}/ ${instanceDir}/`);

  // 2. Patcher les couleurs CSS dans les fichiers copiés
  patchTheme(instanceDir, theme);

  // 3. Installer les dépendances
  execSync(`cd ${instanceDir} && npm install --omit=dev`, { stdio: 'pipe' });

  // 3. Créer le dossier uploads et DB
  fs.mkdirSync(path.join(instanceDir, 'uploads'), { recursive: true });
  fs.mkdirSync(`/var/lib/zenkai-${instance.id}/data`, { recursive: true });

  // 4. Générer le .env
  const envContent = generateEnv(instance) + `\nDB_PATH=/var/lib/zenkai-${instance.id}/data/police.db\n`;
  fs.writeFileSync(envPath, envContent, { mode: 0o600 });

  // 5. Générer le vhost nginx
  const nginxContent = generateNginxConf(instance);
  fs.writeFileSync(nginxConf, nginxContent);
  execSync(`ln -sf ${nginxConf} /etc/nginx/sites-enabled/${instance.subdomain}.zenkai-police.tech 2>/dev/null || true`);
  execSync('nginx -t && nginx -s reload');

  // 6. Générer un ecosystem.config.js et démarrer via PM2
  const ecosystemContent = `module.exports = {
  apps: [{
    name: '${pm2Name}',
    script: '${instanceDir}/src/server.js',
    env: { ENV_FILE: '${envPath}', NODE_ENV: 'production' },
    restart_delay: 3000,
    max_restarts: 5,
  }]
};`;
  const ecoPath = `${instanceDir}/ecosystem.instance.config.js`;
  fs.writeFileSync(ecoPath, ecosystemContent);
  execSync(`pm2 start ${ecoPath}`, { stdio: 'pipe' });
  execSync('pm2 save');

  // 7. Mettre à jour le statut en DB
  db.prepare('UPDATE instances SET status = ?, dir = ?, nginx_conf = ? WHERE id = ?')
    .run('running', instanceDir, nginxConf, instance.id);

  return {
    pm2Name,
    instanceDir,
    nginxConf,
    domain: `${instance.subdomain}.zenkai-police.tech`,
    serverIp: SERVER_IP,
  };
}

function runCertbot(instance) {
  const domain = `${instance.subdomain}.zenkai-police.tech`;
  execSync(`certbot --nginx -d ${domain} --non-interactive --agree-tos -m admin@zenkai-police.tech --redirect`, { stdio: 'pipe' });
}

function stopInstance(pm2Name, db, id) {
  try { execSync(`pm2 stop ${pm2Name}`); } catch {}
  db.prepare('UPDATE instances SET status = ? WHERE id = ?').run('stopped', id);
}

function deleteInstance(instance, db) {
  const pm2Name = `mdt-${instance.id}`;
  try { execSync(`pm2 delete ${pm2Name}`); } catch {}
  try { execSync(`rm -f /etc/nginx/sites-enabled/${instance.subdomain}.zenkai-police.tech`); } catch {}
  try { execSync(`rm -f /etc/nginx/sites-available/${instance.subdomain}.zenkai-police.tech`); } catch {}
  try { execSync('nginx -s reload'); } catch {}
  try { execSync(`rm -rf /var/www/instances/${instance.id}`); } catch {}
  try { execSync(`rm -rf /var/lib/zenkai-${instance.id}`); } catch {}
  try { execSync(`rm -rf /etc/zenkai-${instance.id}`); } catch {}
  db.prepare('DELETE FROM instances WHERE id = ?').run(instance.id);
}

module.exports = { allocatePort, provision, runCertbot, stopInstance, deleteInstance };

module.exports = {
  apps: [
    {
      name: 'police-konoha',
      cwd: __dirname,
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env_production: {
        NODE_ENV: 'production',
        ENV_FILE: '/etc/zenkai-police/.env',
        DATA_DIR: '/var/lib/zenkai-police/data',
        UPLOADS_DIR: '/var/lib/zenkai-police/uploads',
        SQLITE_PATH: '/var/lib/zenkai-police/data/police.db'
      }
    },
    {
      name: 'police-backup',
      cwd: __dirname,
      script: 'scripts/backup.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env_production: {
        NODE_ENV: 'production',
        ENV_FILE: '/etc/zenkai-police/.env',
        DATA_DIR: '/var/lib/zenkai-police/data',
        UPLOADS_DIR: '/var/lib/zenkai-police/uploads',
        SQLITE_PATH: '/var/lib/zenkai-police/data/police.db'
      }
    },
    {
      name: 'police-status',
      cwd: __dirname,
      script: 'src/status-server.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env_production: {
        NODE_ENV: 'production',
        ENV_FILE: '/etc/zenkai-police/.env',
        DATA_DIR: '/var/lib/zenkai-police/data',
        UPLOADS_DIR: '/var/lib/zenkai-police/uploads',
        SQLITE_PATH: '/var/lib/zenkai-police/data/police.db'
      }
    }
  ]
};

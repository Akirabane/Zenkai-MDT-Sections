# Technical Overview

## Runtime

- Frontend: static HTML/CSS with inline browser-side JavaScript
- Backend: Express in [src](/C:/Users/Akirabane/Desktop/Police%20Zenkai/src)
- Database: SQLite at `DB/police.db`
- Process manager: PM2
- Reverse proxy: NGINX

## Main folders

- [src/app.js](/C:/Users/Akirabane/Desktop/Police%20Zenkai/src/app.js): Express app, middleware, static serving
- [src/server.js](/C:/Users/Akirabane/Desktop/Police%20Zenkai/src/server.js): process bootstrap
- [src/routes](/C:/Users/Akirabane/Desktop/Police%20Zenkai/src/routes): API endpoints split by domain
- [src/repositories](/C:/Users/Akirabane/Desktop/Police%20Zenkai/src/repositories): SQLite access layer
- [src/services](/C:/Users/Akirabane/Desktop/Police%20Zenkai/src/services): auth, reset scheduler, presence logic
- [src/utils](/C:/Users/Akirabane/Desktop/Police%20Zenkai/src/utils): logging and backup helpers
- [JS/backup.js](/C:/Users/Akirabane/Desktop/Police%20Zenkai/JS/backup.js): periodic snapshot worker
- [scripts](/C:/Users/Akirabane/Desktop/Police%20Zenkai/scripts): deploy, restore, export, checks
- [DB](/C:/Users/Akirabane/Desktop/Police%20Zenkai/DB): live SQLite database and snapshot folders

## Data flow

1. Static HTML pages call backend endpoints with `fetch`.
2. Express routes validate payloads and authorize the request.
3. Repositories read or write SQLite.
4. The backup worker snapshots the database and legacy JSON files.

## Authentication

- Registration requires `POLICE_SECRET`
- Login returns a JWT signed with `JWT_SECRET`
- Token invalidation is handled with `token_version`
- Permissions are normalized into `READ`, `UPDATE`, `ADMIN`

## Legacy compatibility

The first bootstrap can import:

- `DB/data.json`
- `DB/users.json`
- `codepenal.json`

The live source of truth is now SQLite. The JSON files are kept only for migration safety and backup compatibility until you decide to remove them.

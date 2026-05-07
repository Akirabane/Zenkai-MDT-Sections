# Zenkai MDT — Mobile Data Terminal

Application web de gestion opérationnelle pour les forces de l'ordre des villages de **Konoha** et **Suna** dans un cadre de roleplay Naruto.

---

## Instances

| Instance | Village | Port | Base de données |
|----------|---------|------|-----------------|
| `police-konoha` | Konoha | 3000 | `/var/lib/zenkai-police/data/police.db` |
| `police-suna` | Suna | 3001 | `/var/lib/zenkai-suna/data/police.db` |

Les deux instances partagent le même codebase et tournent via PM2.

---

## Stack technique

- **Runtime** — Node.js 18+
- **Framework** — Express.js
- **Base de données** — SQLite via `better-sqlite3`
- **Authentification** — JWT avec invalidation par `tokenVersion`
- **Hashage** — PBKDF2-SHA512
- **Validation** — Zod
- **Process manager** — PM2
- **Frontend** — HTML / CSS / JavaScript vanilla
- **CI** — GitHub Actions (lint + chargement app + tests)

---

## Architecture

Le MDT repose sur un **Core** générique et des **Sections** modulaires. Le Core ne dépend jamais d'une section — les sections s'y branchent via `loadSections()` dans `app.js`.

```
src/
├── core/                   Modules génériques — jamais couplés à une section
│   ├── db/                 SQLite (schema, migrations, bootstrap)
│   ├── middleware/         Auth JWT, validation, rate limiting global
│   ├── repositories/       users, history, notifications, serviceSessions...
│   ├── routes/             auth, presence, notifications
│   ├── services/           auth, passwords, presence, login-rate-limit...
│   └── utils/              logger, normalize, network, backups
├── sections/
│   ├── police/             Section police complète (Konoha & Suna)
│   │   ├── index.js        Manifest — déclare les routes de la section
│   │   ├── db/             Bootstrap Code Pénal, migrations, seeding lexique
│   │   ├── routes/         admin, casier, complaints, dri, history,
│   │   │                   investigations, loginHall, public, registre,
│   │   │                   service, status, auth-capabilities...
│   │   ├── repositories/
│   │   └── services/
│   └── _template/          Template pour créer une nouvelle section
├── app.js                  Express — charge les sections via loadSections()
├── server.js               Point d'entrée, bootstrap DB + sections
└── status-server.js        Serveur de monitoring
vues/                       Frontend complet (HTML, CSS, JS navigateur, assets)
scripts/                    Utilitaires Node.js (backup, restore, export)
tests/                      Tests unitaires Node.js (node:test)
docs/
└── SECTIONS.md             Guide complet pour créer une nouvelle section
ecosystem.config.js         Configuration PM2
```

### Ajouter une section

```bash
cp -r src/sections/_template src/sections/medical
# Suivre docs/SECTIONS.md — 5 étapes
```

---

## Fonctionnalités

- **Authentification & permissions** — système de rôles (GUEST, READ, UPDATE, ADMIN, JUSTICE) avec grades police
- **Dashboard** — statistiques de service, présences, historique d'activité
- **Casier judiciaire** — création, gestion, publication Discord automatique
- **Plaintes** — dépôt, gestion, regroupement par accusé dans un même thread Discord
- **DRI** — enquêtes, artefacts, fiches ninja, gestion externe
- **Registre police** — membres, grades, historique des promotions
- **Service** — pointage entrée/sortie, sessions de service
- **Backoffice admin** — gestion des utilisateurs, audit log, réinitialisation
- **Status système** — monitoring temps réel de l'instance

---

## Installation

### Variables d'environnement

Les `.env` ne sont pas dans le repo, ils sont stockés sur le serveur :

- Konoha : `/etc/zenkai-police/.env`
- Suna : `/etc/zenkai-suna/.env`

Variables requises :

```env
PORT=3000
JWT_SECRET=...
DB_PATH=...
DISCORD_WEBHOOK_URL=...
DISCORD_PLAINTES_WEBHOOK_URL=...   # Konoha uniquement
```

### Démarrage

```bash
npm install
pm2 start ecosystem.config.js --env production
```

### Vérification rapide avant reload

```bash
node -e "require('./src/app')"
npm test
pm2 reload ecosystem.config.js
```

---

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm test` | Lancer les tests unitaires |
| `npm run backup` | Exporter les données en JSON |
| `npm run backup:verify` | Vérifier l'intégrité des backups |
| `npm run backup:restore` | Restaurer depuis un backup |
| `npm run pm2:start` | Démarrer via PM2 |
| `npm run pm2:reload` | Rechargement sans interruption |

---

## Contribuer — Gitflow

```
main      → production (protégée, PR obligatoire)
develop   → intégration (protégée, PR + CI obligatoires)
feature/* → créées depuis develop, mergées dans develop
```

Le CI vérifie à chaque push sur `develop` et `main` :
1. `node -e "require('./src/app')"` — chargement sans erreur
2. `node --test` — suite de tests

---

## Sécurité

- `.env` et bases de données SQLite exclus du repo
- Mots de passe hashés en PBKDF2-SHA512
- Tokens JWT invalidés côté serveur via `tokenVersion`
- Uploads utilisateurs exclus du versioning

---

## Licence

Projet privé — usage interne roleplay. Non destiné à une distribution publique.

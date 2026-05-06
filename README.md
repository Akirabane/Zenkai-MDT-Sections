# Zenkai MDT — Mobile Data Terminal

Application web de gestion opérationnelle pour les forces de l'ordre des villages de **Konoha** et **Suna** dans un cadre de roleplay Naruto.

---

## Aperçu

Le Zenkai MDT est un système d'information policier complet permettant la gestion des membres, casiers judiciaires, plaintes, enquêtes DRI, présences en service et bien plus. Il tourne en deux instances indépendantes — une par village — partageant le même codebase backend.

| Instance | Village | Port |
|----------|---------|------|
| `police-konoha` | Konoha | 3000 |
| `police-suna` | Suna | 3001 |

---

## Stack technique

- **Runtime** — Node.js
- **Framework** — Express.js
- **Base de données** — SQLite via `better-sqlite3`
- **Authentification** — JWT avec invalidation par `tokenVersion`
- **Hashage** — PBKDF2-SHA512
- **Validation** — Zod
- **Process manager** — PM2
- **Frontend** — HTML / CSS / JavaScript vanilla
- **Intégrations** — Webhooks Discord (plaintes, casiers)

---

## Fonctionnalités

- **Authentification & permissions** — système de rôles hiérarchisés (GUEST, READ, UPDATE, ADMIN, JUSTICE) avec grades police
- **Dashboard** — statistiques de service, présences, historique d'activité
- **Casier judiciaire** — création, gestion, publication Discord automatique
- **Plaintes** — dépôt, gestion, regroupement par accusé dans un même thread Discord
- **DRI (Division de Renseignement Interne)** — enquêtes, artefacts, fiches ninja, gestion externe
- **Registre police** — liste des membres, grades, historique des promotions
- **Service** — pointage entrée/sortie, sessions de service
- **Backoffice admin** — gestion des utilisateurs, audit log, réinitialisation
- **API REST** — documentée via OpenAPI (`/api-docs`)
- **Status système** — monitoring temps réel de l'instance

---

## Structure du projet

```
├── src/
│   ├── app.js                  # Application Express
│   ├── server.js               # Point d'entrée principal
│   ├── status-server.js        # Serveur de monitoring
│   ├── config/                 # Variables d'environnement, OpenAPI
│   ├── db/                     # Schéma SQLite, migrations, bootstrap
│   ├── middleware/             # Auth JWT, validation Zod
│   ├── repositories/           # Accès base de données
│   ├── routes/                 # Routes API REST
│   ├── services/               # Logique métier
│   ├── utils/                  # Backups, logger, normalisation
│   └── validation/             # Schémas Zod
├── CSS/                        # Styles frontend
├── JS/                         # Scripts frontend
├── scripts/                    # Utilitaires serveur (backup, deploy, restore)
├── tests/                      # Tests unitaires Node.js
├── docs/                       # Architecture & déploiement
└── ecosystem.config.js         # Configuration PM2
```

---

## Installation

### Prérequis

- Node.js 18+
- PM2 (`npm install -g pm2`)

### Configuration

Les variables d'environnement ne sont **pas** dans le repo. Elles sont stockées sur le serveur dans des fichiers dédiés :

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

---

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm start` | Démarrer le serveur principal |
| `npm run backup` | Exporter les données en JSON |
| `npm run backup:verify` | Vérifier l'intégrité des backups |
| `npm run backup:restore` | Restaurer depuis un backup |
| `npm run db:export` | Export SQLite complet |
| `npm test` | Lancer les tests unitaires |
| `npm run pm2:start` | Démarrer via PM2 |
| `npm run pm2:reload` | Rechargement sans interruption |

---

## Sécurité

- Les fichiers `.env` et la base de données SQLite sont exclus du repo
- Les mots de passe sont hashés en PBKDF2-SHA512
- Les tokens JWT sont invalidés côté serveur via `tokenVersion`
- Les uploads utilisateurs sont exclus du versioning

---

## Licence

Projet privé — usage interne roleplay. Non destiné à une distribution publique.

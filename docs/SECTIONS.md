# Zenkai MDT — Créer une nouvelle section

## Architecture

Le MDT est construit sur un **Core** générique et des **Sections** modulaires.
Chaque section est isolée dans `src/sections/<nom>/` et se déclare elle-même via un `index.js`.

```
src/
├── core/               Base commune (auth, users, présence, notifications...)
└── sections/
    ├── police/         Section police (Konoha & Suna)
    ├── _template/      Template de départ — copier pour créer une section
    └── <ta-section>/   Ta nouvelle section
```

---

## Créer une section en 5 étapes

### 1. Copier le template

```bash
cp -r src/sections/_template src/sections/medical
```

### 2. Remplir le manifest `index.js`

```js
// src/sections/medical/index.js
const dossiersRoute = require('./routes/dossiers');
const prescriptionsRoute = require('./routes/prescriptions');

module.exports = {
  name: 'medical',
  displayName: 'Service Médical',
  routes: [
    dossiersRoute,
    prescriptionsRoute
  ]
};
```

### 3. Déclarer tes tables SQLite

Préfixe toutes tes tables avec le nom de la section pour éviter les conflits.

```js
// src/sections/medical/db/schema.js
function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS medical_dossiers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      patient    TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
module.exports = { createTables };
```

Puis branche ce schéma dans `src/core/db/bootstrap.js` :

```js
const { createTables: createMedicalTables } = require('../../sections/medical/db/schema');
// ...
createMedicalTables(db);
```

### 4. Créer tes routes

```js
// src/sections/medical/routes/dossiers.js
const express = require('express');
const { authRequired } = require('../../../core/middleware/auth');
const dossiersRepo = require('../repositories/dossiers');

const router = express.Router();

router.get('/api/v1/medical/dossiers', authRequired, (req, res) => {
  return res.json(dossiersRepo.findAll());
});

module.exports = router;
```

### 5. Brancher la section dans `app.js`

```js
// src/app.js
const policeSection = require('./sections/police');
const medicalSection = require('./sections/medical');

// ...
loadSections(app, [policeSection, medicalSection]);
```

---

## Conventions

| Règle | Exemple |
|-------|---------|
| Tables préfixées par le nom de section | `medical_dossiers`, `medical_prescriptions` |
| Routes préfixées par `/api/v1/<section>/` | `/api/v1/medical/dossiers` |
| Imports core depuis `../../../core/` | `require('../../../core/middleware/auth')` |
| Imports internes relatifs | `require('../repositories/dossiers')` |
| Permissions spécifiques dans `services/permissions.js` | `canViewDossiers(user)` |

---

## Imports core disponibles

```js
// Auth & sécurité
require('../../../core/middleware/auth')     // authRequired, adminRequired
require('../../../core/middleware/validate') // validate(schema)
require('../../../core/services/auth')       // issueAuthPayload, revokeUserTokens
require('../../../core/services/passwords')  // makePassword, verifyPassword

// Données
require('../../../core/db')                          // instance SQLite
require('../../../core/repositories/users')          // findById, findByPseudo
require('../../../core/repositories/history')        // logEvent
require('../../../core/repositories/notifications')  // createNotification

// Utilitaires
require('../../../core/utils/logger')    // logger.info / warn / error
require('../../../core/utils/normalize') // normalizeText
require('../../../core/utils/backups')   // listSnapshots
require('../../../config/env')           // variables d'environnement
```

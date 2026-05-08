require('dotenv').config({ path: '/etc/zenkai-landing/.env' });

const app = require('./app');
const { getDb } = require('./db');

const PORT = process.env.PORT || 3005;

getDb();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[landing-api] démarré sur le port ${PORT}`);
});

const env = require('./config/env');
const db = require('./core/db');
const { bootstrapPoliceSection } = require('./sections/police/db/bootstrap');
bootstrapPoliceSection(db, env);

const app = require('./app');
const { startResetScheduler } = require('./sections/police/services/reset');
const { startRegistrySyncScheduler } = require('./sections/police/services/registry-sync');
const { installProcessHooks, markStart } = require('./core/services/runtime-status');
const logger = require('./core/utils/logger');

startResetScheduler();
startRegistrySyncScheduler();

const server = app.listen(env.port, () => {
  logger.info('Police Militaire de Konoha demarree', {
    port: env.port,
    sqlite: env.dbPath,
    environment: env.nodeEnv
  });
  markStart({
    port: env.port,
    sqlite: env.dbPath,
    environment: env.nodeEnv
  });
});

installProcessHooks(server);

const admin = require('./routes/admin');
const authCapabilities = require('./routes/auth-capabilities');
const casier = require('./routes/casier');
const complaints = require('./routes/complaints');
const dri = require('./routes/dri');
const history = require('./routes/history');
const investigations = require('./routes/investigations');
const loginHall = require('./routes/loginHall');
const publicRoutes = require('./routes/public');
const registre = require('./routes/registre');
const service = require('./routes/service');
const statusPublic = require('./routes/status-public');
const status = require('./routes/status');

module.exports = {
  name: 'police',
  routes: [
    publicRoutes,
    statusPublic,
    loginHall,
    authCapabilities,
    service,
    admin,
    registre,
    casier,
    complaints,
    dri,
    investigations,
    history,
    status
  ]
};

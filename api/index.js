/**
 * Entry serverless da Vercel: reutiliza o app Express do servidor local.
 * Rotas /api/* são reescritas para este handler (vercel.json).
 */
module.exports = require('../server');

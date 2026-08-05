const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

// Rate limiting global e específico para endpoints caros (IA paga / spawn de processos).
// O global pula as rotas específicas para não contar a requisição duas vezes.
const isHeavyRoute = (req) =>
  req.originalUrl.startsWith('/api/ai') || req.originalUrl.startsWith('/api/agent-runs');

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isHeavyRoute
});
app.use('/api', globalLimiter);

app.use('/api/ai', rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use('/api/agent-runs', rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

// CORS opcional para deploys com o client em outra origem (ex.: CORS_ORIGIN=https://qa.exemplo.com)
const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (CORS_ORIGIN) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

// Token de acesso opcional (APP_TOKEN no env): se definido, exige header x-app-token
const APP_TOKEN = process.env.APP_TOKEN;
if (APP_TOKEN) {
  app.use('/api', (req, res, next) => {
    if (req.headers['x-app-token'] === APP_TOKEN) return next();
    res.status(401).json({ error: 'Acesso negado: token inválido.' });
  });
}

const routes = {
  '/api/projects': require('./routes/projects'),
  '/api/tasks': require('./routes/tasks'),
  '/api/requirements': require('./routes/requirements'),
  '/api/strategies': require('./routes/strategies'),
  '/api/scenarios': require('./routes/scenarios'),
  '/api/test-cases': require('./routes/testcases'),
  '/api/executions': require('./routes/executions'),
  '/api/bugs': require('./routes/bugs'),
  '/api/regressions': require('./routes/regressions'),
  '/api/automations': require('./routes/automations'),
  '/api/releases': require('./routes/releases'),
  '/api/dashboard': require('./routes/dashboard'),
  '/api/settings': require('./routes/settings'),
  '/api/ai': require('./routes/ai'),
  '/api/agent-runs': require('./routes/agentRuns')
};
for (const [prefix, factory] of Object.entries(routes)) {
  app.use(prefix, factory(db));
}

// 404 JSON para APIs desconhecidas
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Middleware de erro global: sempre responde JSON
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  }
  console.error('[erro]', req.method, req.originalUrl, err?.message || err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`QA Studio API rodando em http://localhost:${PORT}`));

// Graceful shutdown: encerra jobs do agent, fecha o server e o banco de forma limpa.
function shutdown(signal) {
  console.log(`\n[${signal}] Encerrando servidor...`);
  try {
    require('./routes/agentRuns').killAll();
  } catch { /* módulo sem jobs ativos */ }
  server.close(() => {
    try { db.close(); } catch { /* já fechado */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

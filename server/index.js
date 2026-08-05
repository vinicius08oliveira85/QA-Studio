const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const db = require('./db');

const app = express();
app.use(express.json());

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

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`QA Studio API rodando em http://localhost:${PORT}`));

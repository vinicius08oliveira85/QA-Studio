const express = require('express');

const EXPORT_VERSION = 1;

// Tabelas cujo escopo é o projeto (têm project_id), na ordem de importação (pais antes dos filhos).
const PROJECT_TABLES = [
  'tasks',
  'requirements',
  'test_strategies',
  'test_scenarios',
  'test_cases',
  'executions',
  'bugs',
  'regression_runs',
  'automations',
  'releases'
];

// Tabelas filhas (sem project_id): filtradas pelos ids da tabela-pai do projeto exportado.
const CHILD_TABLES = {
  business_rules: { parent: 'requirements', fk: 'requirement_id' },
  test_mass: { parent: 'test_cases', fk: 'test_case_id' },
  execution_steps: { parent: 'executions', fk: 'execution_id' },
  bug_retests: { parent: 'bugs', fk: 'bug_id' },
  regression_run_cases: { parent: 'regression_runs', fk: 'run_id' },
  release_requirements: { parent: 'releases', fk: 'release_id' }
};

// Exporta o projeto e todos os dados vinculados. A chave Gemini (settings) nunca é exportada.
function exportProject(db, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;

  const data = {
    app: 'qa-studio',
    type: 'project-export',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    project
  };

  // As linhas mantêm o `id` original: ele documenta as referências entre tabelas no arquivo
  // (ex.: business_rules.requirement_id) e é usado pelo importador no mapa de remapeamento.
  const parentIds = {};
  for (const table of PROJECT_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY id`).all(projectId);
    data[table] = rows;
    parentIds[table] = rows.map((r) => r.id);
  }

  for (const [table, cfg] of Object.entries(CHILD_TABLES)) {
    const ids = parentIds[cfg.parent] || [];
    if (!ids.length) {
      data[table] = [];
      continue;
    }
    const marks = ids.map(() => '?').join(',');
    data[table] = db
      .prepare(`SELECT * FROM ${table} WHERE ${cfg.fk} IN (${marks}) ORDER BY id`)
      .all(...ids);
  }

  return data;
}

// Importa um export, criando um projeto NOVO e remapeando todos os ids. Tudo roda dentro
// de uma transação: qualquer falha desfaz tudo (nenhuma gravação parcial).
function importProject(db, payload) {
  const invalid = (msg) => {
    const err = new Error(msg);
    err.status = 400;
    return err;
  };

  if (!payload || payload.app !== 'qa-studio' || payload.type !== 'project-export') {
    throw invalid('Arquivo de backup inválido (assinatura ausente).');
  }
  if (Number(payload.version) !== EXPORT_VERSION) {
    throw invalid(`Versão de backup não suportada: ${payload.version}.`);
  }
  if (!payload.project || !payload.project.name || !Array.isArray(payload.tasks)) {
    throw invalid('Backup sem projeto válido.');
  }

  const maps = {
    projects: {}, tasks: {}, requirements: {}, test_strategies: {}, test_scenarios: {},
    test_cases: {}, executions: {}, bugs: {}, regression_runs: {}, automations: {}, releases: {}
  };
  const remap = (table, id) => (id == null || id === '' ? null : maps[table]?.[id] ?? null);

  // Insere uma linha usando apenas colunas existentes na tabela (PRAGMA table_info — nomes
  // nunca vêm do arquivo). Colunas de FK são sobrescritas pelos valores remapeados; o resto
  // é copiado do backup com valores parametrizados.
  const insertRow = (table, row, overrides = {}) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    const values = {};
    for (const col of cols) {
      if (col === 'id') continue;
      if (col in overrides) { values[col] = overrides[col]; continue; }
      if (row[col] !== undefined && row[col] !== null) values[col] = row[col];
    }
    const keys = Object.keys(values);
    if (!keys.length) return null;
    const r = db
      .prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
      .run(...keys.map((k) => values[k]));
    return Number(r.lastInsertRowid);
  };

  db.tx(() => {
    const newPid = insertRow('projects', payload.project);
    maps.projects[payload.project.id] = newPid;

    for (const row of payload.tasks || []) {
      const id = insertRow('tasks', row, { project_id: newPid });
      if (id) maps.tasks[row.id] = id;
    }
    for (const row of payload.requirements || []) {
      const id = insertRow('requirements', row, { project_id: newPid, task_id: remap('tasks', row.task_id) });
      if (id) maps.requirements[row.id] = id;
    }
    for (const row of payload.test_strategies || []) {
      const id = insertRow('test_strategies', row, {
        project_id: newPid,
        task_id: remap('tasks', row.task_id),
        requirement_id: remap('requirements', row.requirement_id)
      });
      if (id) maps.test_strategies[row.id] = id;
    }
    for (const row of payload.test_scenarios || []) {
      const id = insertRow('test_scenarios', row, {
        project_id: newPid,
        task_id: remap('tasks', row.task_id),
        requirement_id: remap('requirements', row.requirement_id)
      });
      if (id) maps.test_scenarios[row.id] = id;
    }
    for (const row of payload.test_cases || []) {
      const id = insertRow('test_cases', row, {
        project_id: newPid,
        task_id: remap('tasks', row.task_id),
        scenario_id: remap('test_scenarios', row.scenario_id),
        requirement_id: remap('requirements', row.requirement_id),
        strategy_id: remap('test_strategies', row.strategy_id)
      });
      if (id) maps.test_cases[row.id] = id;
    }
    for (const row of payload.executions || []) {
      const id = insertRow('executions', row, {
        project_id: newPid,
        task_id: remap('tasks', row.task_id),
        test_case_id: remap('test_cases', row.test_case_id)
      });
      if (id) maps.executions[row.id] = id;
    }
    for (const row of payload.bugs || []) {
      const id = insertRow('bugs', row, {
        project_id: newPid,
        task_id: remap('tasks', row.task_id),
        execution_id: remap('executions', row.execution_id),
        test_case_id: remap('test_cases', row.test_case_id),
        requirement_id: remap('requirements', row.requirement_id)
      });
      if (id) maps.bugs[row.id] = id;
    }
    for (const row of payload.regression_runs || []) {
      const id = insertRow('regression_runs', row, { project_id: newPid });
      if (id) maps.regression_runs[row.id] = id;
    }
    for (const row of payload.automations || []) {
      const id = insertRow('automations', row, {
        project_id: newPid,
        test_case_id: remap('test_cases', row.test_case_id)
      });
      if (id) maps.automations[row.id] = id;
    }
    for (const row of payload.releases || []) {
      const id = insertRow('releases', row, { project_id: newPid });
      if (id) maps.releases[row.id] = id;
    }

    for (const row of payload.business_rules || []) {
      insertRow('business_rules', row, { requirement_id: remap('requirements', row.requirement_id) });
    }
    for (const row of payload.test_mass || []) {
      insertRow('test_mass', row, { test_case_id: remap('test_cases', row.test_case_id) });
    }
    for (const row of payload.execution_steps || []) {
      insertRow('execution_steps', row, { execution_id: remap('executions', row.execution_id) });
    }
    for (const row of payload.bug_retests || []) {
      insertRow('bug_retests', row, {
        bug_id: remap('bugs', row.bug_id),
        execution_id: remap('executions', row.execution_id)
      });
    }
    for (const row of payload.regression_run_cases || []) {
      insertRow('regression_run_cases', row, {
        run_id: remap('regression_runs', row.run_id),
        test_case_id: remap('test_cases', row.test_case_id)
      });
    }
    for (const row of payload.release_requirements || []) {
      insertRow('release_requirements', row, {
        release_id: remap('releases', row.release_id),
        requirement_id: remap('requirements', row.requirement_id)
      });
    }
  });

  return {
    id: maps.projects[payload.project.id],
    name: payload.project.name,
    counts: {
      tasks: (payload.tasks || []).length,
      requirements: (payload.requirements || []).length,
      cases: (payload.test_cases || []).length,
      executions: (payload.executions || []).length,
      bugs: (payload.bugs || []).length
    }
  };
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/projects/:id/export', (req, res) => {
    const data = exportProject(db, req.params.id);
    if (!data) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(data);
  });

  router.post('/import', (req, res) => {
    try {
      const result = importProject(db, req.body);
      res.status(201).json(result);
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message });
      console.error('[backup] import:', err.message || err);
      res.status(500).json({ error: 'Falha ao importar o backup. Nenhum dado foi alterado (transação revertida).' });
    }
  });

  return router;
};

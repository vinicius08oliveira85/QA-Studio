-- QA Studio - Schema do banco SQLite
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------
-- Projetos (contexto raiz)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  system      TEXT DEFAULT '',
  status      TEXT DEFAULT 'Ativo',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------
-- 1. Análise de Requisitos e Planejamento
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requirements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority    TEXT DEFAULT 'Média',      -- Alta | Média | Baixa
  status      TEXT DEFAULT 'Ativo',       -- Ativo | Em Análise | Homologado | Cancelado
  module      TEXT DEFAULT '',
  source      TEXT DEFAULT 'manual',       -- manual | ia
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, code)
);

CREATE TABLE IF NOT EXISTS business_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  rule           TEXT NOT NULL,
  category       TEXT DEFAULT 'Regra de Negócio',
  source         TEXT DEFAULT 'manual',       -- manual | ia
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_strategies (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  description    TEXT DEFAULT '',
  approach       TEXT DEFAULT '',   -- abordagem geral
  risk_scope     TEXT DEFAULT '',   -- riscos / escopo
  entry_criteria TEXT DEFAULT '',
  exit_criteria  TEXT DEFAULT '',
  status         TEXT DEFAULT 'Ativo',   -- Ativo | Arquivo
  source         TEXT DEFAULT 'manual',  -- manual | ia
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------
-- 2. Criação de Casos de Teste (Design)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_scenarios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  description    TEXT DEFAULT '',
  preconditions  TEXT DEFAULT '',
  source         TEXT DEFAULT 'manual',       -- manual | ia
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_cases (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scenario_id        INTEGER REFERENCES test_scenarios(id) ON DELETE SET NULL,
  requirement_id     INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  strategy_id        INTEGER REFERENCES test_strategies(id) ON DELETE SET NULL,
  code               TEXT NOT NULL,
  title              TEXT NOT NULL,
  priority           TEXT DEFAULT 'Média',          -- Alta | Média | Baixa
  type               TEXT DEFAULT 'Funcional',       -- Funcional | API | Fumaça | Regressão
  execution_mode     TEXT DEFAULT 'Manual',          -- Manual | Automatizado
  status             TEXT DEFAULT 'Pronto',          -- Rascunho | Pronto | Executado
  preconditions      TEXT DEFAULT '',
  steps               TEXT DEFAULT '[]',              -- JSON: [{order, action, expected}]
  regression_relevant INTEGER DEFAULT 0,             -- marca para regressão
  automated           INTEGER DEFAULT 0,              -- automatizado?
  automation_tool     TEXT DEFAULT '',
  source              TEXT DEFAULT 'manual',          -- manual | ia
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, code)
);

CREATE TABLE IF NOT EXISTS test_mass (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  data         TEXT DEFAULT '',      -- massa (texto/json)
  purpose      TEXT DEFAULT '',
  source       TEXT DEFAULT 'manual',       -- manual | ia
  created_at   TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------
-- 3. Execução e Validação
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS executions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id  INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  execution_date TEXT DEFAULT (datetime('now')),
  environment   TEXT DEFAULT 'Homologação',
  tester        TEXT DEFAULT 'QA',
  result        TEXT DEFAULT 'Pendente',     -- Pendente | Passou | Falhou | Bloqueado | Não Executado
  actual_result TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS execution_steps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  step_order   INTEGER,
  action       TEXT DEFAULT '',
  expected     TEXT DEFAULT '',
  actual       TEXT DEFAULT '',
  result       TEXT DEFAULT 'Passou'        -- Passou | Falhou | Não Executado
);

-- ---------------------------------------------------------------
-- 4. Reporte e Acompanhamento de Bugs
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bugs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  execution_id       INTEGER REFERENCES executions(id) ON DELETE SET NULL,
  test_case_id       INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
  requirement_id     INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  code               TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT DEFAULT '',
  severity           TEXT DEFAULT 'Média',       -- Blocker | Alta | Média | Baixa
  priority           TEXT DEFAULT 'Média',
  status             TEXT DEFAULT 'Aberto',       -- Aberto | Em Correção | Corrigido | Rejeitado | Fechado
  steps_to_reproduce TEXT DEFAULT '',
  expected_result    TEXT DEFAULT '',
  actual_result      TEXT DEFAULT '',
  environment        TEXT DEFAULT '',
  attachment_path    TEXT DEFAULT '',
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bug_retests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_id       INTEGER NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  execution_id INTEGER REFERENCES executions(id) ON DELETE SET NULL,
  retest_date  TEXT DEFAULT (datetime('now')),
  result       TEXT DEFAULT 'Pendente',      -- Passou | Falhou | Não Reproduzido
  notes        TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------
-- 5. Teste de Regressão e Fechamento
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regression_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  start_date   TEXT DEFAULT (datetime('now')),
  status       TEXT DEFAULT 'Em Andamento',   -- Em Andamento | Concluída | Cancelada
  environment  TEXT DEFAULT 'Homologação',
  notes        TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regression_run_cases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       INTEGER NOT NULL REFERENCES regression_runs(id) ON DELETE CASCADE,
  test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  result       TEXT DEFAULT 'Pendente',       -- Pendente | Passou | Falhou | Bloqueado
  notes        TEXT DEFAULT '',
  UNIQUE(run_id, test_case_id)
);

CREATE TABLE IF NOT EXISTS automations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  tool         TEXT DEFAULT '',
  frequency    TEXT DEFAULT '',
  owner        TEXT DEFAULT '',
  status       TEXT DEFAULT 'Sugerido',       -- Sugerido | Em Desenvolvimento | Implementado | Cancelado
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS releases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  version      TEXT DEFAULT '',
  release_date TEXT DEFAULT '',
  status       TEXT DEFAULT 'Em Homologação',  -- Em Homologação | Homologado | Liberado | Bloqueado
  notes        TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS release_requirements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id     INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  UNIQUE(release_id, requirement_id)
);

-- Configurações gerais (chave de IA, modelo, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

-- Índices de integração
CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_rules_req ON business_rules(requirement_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_project ON test_scenarios(project_id);
CREATE INDEX IF NOT EXISTS idx_cases_project ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_cases_requirement ON test_cases(requirement_id);
CREATE INDEX IF NOT EXISTS idx_mass_case ON test_mass(test_case_id);
CREATE INDEX IF NOT EXISTS idx_exec_case ON executions(test_case_id);
CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id);
CREATE INDEX IF NOT EXISTS idx_retests_bug ON bug_retests(bug_id);
CREATE INDEX IF NOT EXISTS idx_regcases_run ON regression_run_cases(run_id);
CREATE INDEX IF NOT EXISTS idx_release_req ON release_requirements(release_id);

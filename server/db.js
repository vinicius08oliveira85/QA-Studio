const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// Na Vercel o filesystem da função é efêmero; só /tmp é gravável.
const dataDir = process.env.QA_DB_PATH
  ? path.dirname(process.env.QA_DB_PATH)
  : process.env.VERCEL
    ? path.join('/tmp', 'qa-studio-data')
    : path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.QA_DB_PATH || path.join(dataDir, 'qa.db');

// Diretório de evidências (anexos de execuções). Viver junto do banco, criado sob demanda.
const attachmentsDir = path.join(dataDir, 'attachments');
if (!fs.existsSync(attachmentsDir)) fs.mkdirSync(attachmentsDir, { recursive: true });

const db = new DatabaseSync(dbPath);
console.log('[db] Banco SQLite em:', dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function hasColumn(table, name) {
  return tableColumns(table).some((c) => c.name === name);
}

// Migração leve: adiciona colunas novas a tabelas existentes de bancos antigos
const sourceTables = ['requirements', 'business_rules', 'test_scenarios', 'test_cases', 'test_mass', 'test_strategies'];
for (const table of sourceTables) {
  const cols = tableColumns(table);
  if (cols.length && !cols.some((c) => c.name === 'source')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN source TEXT DEFAULT 'manual'`);
  }
}
if (tableColumns('test_strategies').length && !hasColumn('test_strategies', 'requirement_id')) {
  db.exec('ALTER TABLE test_strategies ADD COLUMN requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL');
}

// Migração: attachment_path em executions (evidências de execução — bancos antigos)
if (tableColumns('executions').length && !hasColumn('executions', 'attachment_path')) {
  db.exec("ALTER TABLE executions ADD COLUMN attachment_path TEXT DEFAULT ''");
}

// Migração: task_id nas entidades do ciclo de testes (bancos antigos)
const TASK_SCOPED = ['requirements', 'test_strategies', 'test_scenarios', 'test_cases', 'executions', 'bugs'];
for (const table of TASK_SCOPED) {
  const cols = tableColumns(table);
  if (cols.length && !cols.some((c) => c.name === 'task_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE`);
  }
}

/**
 * Para cada projeto com artefatos sem task_id, cria TAR-001 "Tarefa migrada" e faz backfill.
 * Idempotente: só age onde task_id IS NULL.
 */
function migrateOrphanArtifactsToTasks() {
  const projects = db.prepare('SELECT id, name FROM projects').all();
  for (const project of projects) {
    const orphanCount = TASK_SCOPED.reduce((sum, table) => {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id = ? AND task_id IS NULL`).get(project.id);
      return sum + Number(row?.c || 0);
    }, 0);
    if (orphanCount === 0) continue;

    let task = db.prepare('SELECT id FROM tasks WHERE project_id = ? AND code = ?').get(project.id, 'TAR-001');
    if (!task) {
      const existing = db.prepare('SELECT id FROM tasks WHERE project_id = ? ORDER BY id LIMIT 1').get(project.id);
      if (existing) {
        task = existing;
      } else {
        const ins = db.prepare(
          `INSERT INTO tasks (project_id, code, title, description, status, priority)
           VALUES (?, 'TAR-001', ?, 'Tarefa criada automaticamente na migração dos dados existentes.', 'Em Andamento', 'Média')`
        ).run(project.id, `Tarefa migrada — ${project.name}`);
        task = { id: Number(ins.lastInsertRowid) };
      }
    }

    for (const table of TASK_SCOPED) {
      db.prepare(`UPDATE ${table} SET task_id = ? WHERE project_id = ? AND task_id IS NULL`).run(task.id, project.id);
    }
  }
}

migrateOrphanArtifactsToTasks();

// Índices de task_id (após migração, para bancos antigos e novos)
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_requirements_task ON requirements(task_id);
  CREATE INDEX IF NOT EXISTS idx_strategies_task ON test_strategies(task_id);
  CREATE INDEX IF NOT EXISTS idx_scenarios_task ON test_scenarios(task_id);
  CREATE INDEX IF NOT EXISTS idx_cases_task ON test_cases(task_id);
  CREATE INDEX IF NOT EXISTS idx_exec_task ON executions(task_id);
  CREATE INDEX IF NOT EXISTS idx_bugs_task ON bugs(task_id);
`);

/**
 * Move as páginas do WAL para o arquivo principal e trunca o -wal.
 * Sem isso os dados ficam só no data/qa.db-wal, e um encerramento abrupto
 * (ou um sync de nuvem que substitui os arquivos) descarta tudo.
 */
db.checkpoint = () => {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (err) {
    console.warn('[db] Falha no checkpoint do WAL:', err.message || err);
  }
};

db.checkpoint();

const checkpointMs = process.env.QA_DB_CHECKPOINT_MS === undefined
  ? 30_000
  : Number(process.env.QA_DB_CHECKPOINT_MS);
const checkpointTimer = checkpointMs > 0 ? setInterval(db.checkpoint, checkpointMs) : null;
checkpointTimer?.unref();

const closeRaw = db.close.bind(db);
db.close = () => {
  if (checkpointTimer) clearInterval(checkpointTimer);
  db.checkpoint();
  closeRaw();
};

db.nextCode = (table, prefix, projectId) => {
  const row = projectId
    ? db.prepare(`SELECT code FROM ${table} WHERE project_id = ? AND code LIKE ? ORDER BY code DESC LIMIT 1`).get(projectId, `${prefix}-%`)
    : db.prepare(`SELECT code FROM ${table} WHERE code LIKE ? ORDER BY code DESC LIMIT 1`).get(`${prefix}-%`);
  const last = row ? row.code : '';
  const m = last.match(/(\d+)\s*$/);
  const n = (m ? parseInt(m[1], 10) : 0) + 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
};

/** Executa fn dentro de uma transação; faz rollback em caso de erro. */
db.tx = (fn) => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

/** Resolve project_id a partir de task_id; lança se inválido. */
db.resolveTask = (taskId) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return null;
  return task;
};

/** Caminho absoluto do diretório de evidências. */
db.attachmentsDir = () => attachmentsDir;

module.exports = db;

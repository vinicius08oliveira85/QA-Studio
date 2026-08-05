const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'qa.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Migração leve: adiciona colunas novas a tabelas existentes de bancos antigos
const sourceTables = ['requirements', 'business_rules', 'test_scenarios', 'test_cases', 'test_mass', 'test_strategies'];
for (const table of sourceTables) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.length && !cols.some((c) => c.name === 'source')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN source TEXT DEFAULT 'manual'`);
  }
}
const stratCols = db.prepare('PRAGMA table_info(test_strategies)').all();
if (stratCols.length && !stratCols.some((c) => c.name === 'requirement_id')) {
  db.exec("ALTER TABLE test_strategies ADD COLUMN requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL");
}

db.nextCode = (table, prefix, projectId) => {
  const row = projectId
    ? db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id = ?`).get(projectId)
    : db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
  const n = Number(row?.c || 0) + 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
};

module.exports = db;

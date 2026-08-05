const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'qa.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

db.nextCode = (table, prefix, projectId) => {
  const row = projectId
    ? db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id = ?`).get(projectId)
    : db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
  const n = Number(row?.c || 0) + 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
};

module.exports = db;

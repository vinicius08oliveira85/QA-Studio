// Backup do banco SQLite via VACUUM INTO (snapshot consistente, inclui dados do WAL).
// Uso: node scripts/backup.js [destino]
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'qa.db');
if (!fs.existsSync(dbPath)) {
  console.error('Banco não encontrado em ' + dbPath);
  process.exit(1);
}

const dest = process.argv[2] || path.join(dataDir, `qa-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const destAbs = path.resolve(dest);
if (!destAbs.endsWith('.db')) {
  console.error('Destino do backup deve terminar em .db');
  process.exit(1);
}
fs.mkdirSync(path.dirname(destAbs), { recursive: true });

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  db.exec(`VACUUM INTO '${destAbs.replace(/'/g, "''")}'`);
} catch (err) {
  console.error('Falha ao criar backup:', err.message);
  process.exit(1);
} finally {
  db.close();
}
console.log('Backup criado em:', destAbs);

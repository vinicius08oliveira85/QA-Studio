const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    res.json(obj);
  });

  router.put('/', (req, res) => {
    const { geminiApiKey, geminiModel } = req.body || {};
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    if (geminiApiKey !== undefined) upsert.run('geminiApiKey', String(geminiApiKey));
    if (geminiModel !== undefined) upsert.run('geminiModel', String(geminiModel));
    res.json({ ok: true });
  });

  router.delete('/', (req, res) => {
    const { key } = req.query;
    if (key) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    res.json({ ok: true });
  });

  return router;
};

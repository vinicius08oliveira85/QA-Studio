const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  const getSetting = (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : '';
  };

  router.get('/', (req, res) => {
    const hasEnvKey = Boolean(process.env.GEMINI_API_KEY);
    res.json({
      geminiConfigured: hasEnvKey || Boolean(getSetting('geminiApiKey')),
      geminiModel: getSetting('geminiModel') || 'gemini-2.0-flash'
    });
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

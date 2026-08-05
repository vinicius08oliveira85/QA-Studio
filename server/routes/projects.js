const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM projects ORDER BY name').all());
  });

  router.post('/', (req, res) => {
    const { name, description = '', system = '' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare('INSERT INTO projects (name, description, system) VALUES (?,?,?)').run(name, description, system);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const { name, description, system, status } = req.body || {};
    db.prepare("UPDATE projects SET name=?, description=?, system=?, status=?, updated_at=datetime('now') WHERE id=?")
      .run(name, description, system, status, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};

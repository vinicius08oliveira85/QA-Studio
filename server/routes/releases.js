const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { projectId } = req.query;
    res.json(db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM release_requirements rr WHERE rr.release_id = r.id) AS requirements_count,
        (SELECT COUNT(*) FROM bugs b WHERE b.project_id = r.project_id AND b.status IN ('Aberto','Em Correção')) AS open_bugs
      FROM releases r WHERE r.project_id = ? ORDER BY r.created_at DESC
    `).all(projectId));
  });

  router.get('/:id', (req, res) => {
    const release = db.prepare('SELECT * FROM releases WHERE id=?').get(req.params.id);
    if (!release) return res.status(404).json({ error: 'Release não encontrada' });
    const requirements = db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) AS cases_count,
        (SELECT COUNT(*) FROM executions e JOIN test_cases tc2 ON tc2.id = e.test_case_id
           WHERE tc2.requirement_id = r.id) AS executions_count,
        (SELECT COUNT(*) FROM executions e JOIN test_cases tc3 ON tc3.id = e.test_case_id
           WHERE tc3.requirement_id = r.id AND e.result = 'Passou') AS passed_count,
        (SELECT COUNT(*) FROM bugs b WHERE b.requirement_id = r.id AND b.status IN ('Aberto','Em Correção')) AS open_bugs
      FROM release_requirements rr
      JOIN requirements r ON r.id = rr.requirement_id
      WHERE rr.release_id = ? ORDER BY r.code
    `).all(req.params.id);

    const stats = {
      totalRequirements: requirements.length,
      coveredRequirements: requirements.filter(r => r.cases_count > 0).length,
      totalExecutions: requirements.reduce((s, r) => s + r.executions_count, 0),
      passedExecutions: requirements.reduce((s, r) => s + r.passed_count, 0),
      openBugs: requirements.reduce((s, r) => s + r.open_bugs, 0)
    };
    stats.passRate = stats.totalExecutions ? Math.round((stats.passedExecutions / stats.totalExecutions) * 100) : 0;

    release.requirements = requirements;
    release.stats = stats;
    release.available_requirements = db.prepare(`
      SELECT * FROM requirements WHERE project_id = ? AND id NOT IN
        (SELECT requirement_id FROM release_requirements WHERE release_id = ?) ORDER BY code
    `).all(release.project_id, req.params.id);
    res.json(release);
  });

  router.post('/', (req, res) => {
    const { project_id, name, version = '', release_date = '', status = 'Em Homologação', notes = '' } = req.body || {};
    if (!project_id || !name) return res.status(400).json({ error: 'Projeto e nome são obrigatórios' });
    const r = db.prepare('INSERT INTO releases (project_id, name, version, release_date, status, notes) VALUES (?,?,?,?,?,?)')
      .run(project_id, name, version, release_date, status, notes);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const { name, version, release_date, status, notes } = req.body || {};
    db.prepare("UPDATE releases SET name=?, version=?, release_date=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?")
      .run(name, version, release_date, status, notes, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM releases WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/requirements', (req, res) => {
    const { requirement_id } = req.body || {};
    db.prepare('INSERT OR IGNORE INTO release_requirements (release_id, requirement_id) VALUES (?,?)')
      .run(req.params.id, requirement_id);
    res.json({ ok: true });
  });

  router.delete('/:id/requirements/:requirementId', (req, res) => {
    db.prepare('DELETE FROM release_requirements WHERE release_id=? AND requirement_id=?')
      .run(req.params.id, req.params.requirementId);
    res.json({ ok: true });
  });

  return router;
};

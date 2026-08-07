const express = require('express');
const path = require('node:path');
const { validateTaskOwnership } = require('../helpers');
const { saveAttachment, removeAttachment, removeFileByPath, resolveAttachment, isImage } = require('../attachments');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { projectId, taskId, testCaseId, result } = req.query;
    const params = [];
    let sql = `
      SELECT e.*,
        tc.code AS test_case_code, tc.title AS test_case_title, tc.type AS test_case_type, tc.execution_mode,
        r.code AS requirement_code, r.title AS requirement_title,
        (SELECT COUNT(*) FROM bugs b WHERE b.execution_id = e.id) AS bugs_count
      FROM executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      LEFT JOIN requirements r ON r.id = tc.requirement_id
      WHERE 1=1`;
    if (taskId) {
      sql += ' AND e.task_id = ?';
      params.push(taskId);
    } else if (projectId) {
      sql += ' AND e.project_id = ?';
      params.push(projectId);
    } else {
      return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
    }
    if (testCaseId) { sql += ' AND e.test_case_id = ?'; params.push(testCaseId); }
    if (result) { sql += ' AND e.result = ?'; params.push(result); }
    sql += ' ORDER BY e.execution_date DESC, e.id DESC';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`
      SELECT e.*, tc.code AS test_case_code, tc.title AS test_case_title, tc.steps AS test_case_steps,
        r.code AS requirement_code
      FROM executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      LEFT JOIN requirements r ON r.id = tc.requirement_id
      WHERE e.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Execução não encontrada' });
    row.steps = db.prepare('SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY step_order').all(req.params.id);
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { project_id, task_id, test_case_id, environment = 'Homologação', tester = 'QA',
      result = 'Passou', actual_result = '', notes = '', step_results = [] } = req.body || {};
    if (!test_case_id) return res.status(400).json({ error: 'Caso de teste é obrigatório' });

    const tc = db.prepare('SELECT * FROM test_cases WHERE id=?').get(test_case_id);
    if (!tc) return res.status(404).json({ error: 'Caso de teste não encontrado' });

    const resolvedTaskId = task_id || tc.task_id;
    const resolvedProjectId = project_id || tc.project_id;
    if (!resolvedTaskId) return res.status(400).json({ error: 'Tarefa é obrigatória' });

    const owned = validateTaskOwnership(db, resolvedTaskId, resolvedProjectId);
    if (owned.error) return res.status(owned.status).json({ error: owned.error });

    const r = db.tx(() => {
      const ins = db.prepare(
        `INSERT INTO executions (project_id, task_id, test_case_id, environment, tester, result, actual_result, notes) VALUES (?,?,?,?,?,?,?,?)`
      ).run(resolvedProjectId, resolvedTaskId, test_case_id, environment, tester, result, actual_result, notes);
      const execId = Number(ins.lastInsertRowid);

      let steps;
      try { steps = JSON.parse(tc?.steps || '[]'); } catch { steps = []; }
      const norm = (s) => ({ order: Number(s.order ?? s.step_order) || 0, action: s.action || '', expected: s.expected || '' });
      const map = {};
      for (const sr of step_results || []) map[Number(sr.step_order ?? sr.order)] = sr;
      const insStep = db.prepare(
        'INSERT INTO execution_steps (execution_id, step_order, action, expected, actual, result) VALUES (?,?,?,?,?,?)'
      );
      for (const raw of steps) {
        const s = norm(raw);
        const sr = map[s.order] || {};
        insStep.run(execId, s.order, s.action, s.expected, sr.actual || '', sr.result || 'Passou');
      }
      db.prepare("UPDATE test_cases SET status='Executado', updated_at=datetime('now') WHERE id=? AND status IN ('Pronto','Rascunho')").run(test_case_id);
      return execId;
    });
    res.status(201).json({ id: r });
  });

  router.put('/:id', (req, res) => {
    const { environment, tester, result, actual_result, notes, step_results = [] } = req.body || {};
    const row = db.prepare('SELECT id FROM executions WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Execução não encontrada' });
    db.prepare("UPDATE executions SET environment=?, tester=?, result=?, actual_result=?, notes=? WHERE id=?")
      .run(environment, tester, result, actual_result, notes, req.params.id);
    const upd = db.prepare('UPDATE execution_steps SET actual=?, result=? WHERE execution_id=? AND step_order=?');
    for (const sr of step_results || []) {
      upd.run(sr.actual || '', sr.result || 'Passou', req.params.id, Number(sr.step_order ?? sr.order));
    }
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare('SELECT id, attachment_path FROM executions WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Execução não encontrada' });
    const savedPath = row.attachment_path;
    db.prepare('DELETE FROM executions WHERE id=?').run(req.params.id);
    // Remove o arquivo de evidência depois de capturar o caminho (a linha já foi apagada).
    if (savedPath) removeFileByPath(db, savedPath);
    res.json({ ok: true });
  });

  /**
   * Upload de evidência (screenshot/anexo) para uma execução.
   * Recebe JSON: { filename, data } — data em base64 (sem prefixo data:).
   * Grava em data/attachments/<executionId>-<hash>.<ext> e guarda o caminho.
   */
  router.post('/:id/attachment', (req, res) => {
    const row = db.prepare('SELECT id FROM executions WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Execução não encontrada' });
    const { filename = '', data = '' } = req.body || {};
    const out = saveAttachment(db, 'executions', req.params.id, filename, data);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json({ ok: true, attachment_path: out.attachment_path });
  });

  /** Download da evidência (inline para imagens, download para o resto). */
  router.get('/:id/attachment', (req, res) => {
    const abs = resolveAttachment(db, 'executions', req.params.id);
    if (!abs) return res.status(404).json({ error: 'Sem evidência anexada' });

    res.setHeader('Content-Disposition', `${isImage(abs) ? 'inline' : 'attachment'}; filename="${path.basename(abs)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: 'Falha ao enviar a evidência.' });
    });
  });

  /** Remove a evidência anexada (arquivo + campo). */
  router.delete('/:id/attachment', (req, res) => {
    const row = db.prepare('SELECT id FROM executions WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Execução não encontrada' });
    removeAttachment(db, 'executions', req.params.id);
    res.json({ ok: true });
  });

  return router;
};

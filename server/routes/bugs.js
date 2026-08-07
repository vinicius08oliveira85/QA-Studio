const express = require('express');
const path = require('node:path');
const { validateTaskOwnership } = require('../helpers');
const { saveAttachment, removeAttachment, removeFileByPath, resolveAttachment, isImage } = require('../attachments');

module.exports = (db) => {
  const router = express.Router();
  const LIST_SQL = `
    SELECT b.*,
      e.test_case_id AS exec_test_case_id,
      tc.code AS test_case_code, tc.title AS test_case_title,
      r.code AS requirement_code, r.title AS requirement_title,
      (SELECT COUNT(*) FROM bug_retests bt WHERE bt.bug_id = b.id) AS retests_count,
      (SELECT bt.retest_date FROM bug_retests bt WHERE bt.bug_id = b.id ORDER BY bt.id DESC LIMIT 1) AS last_retest_date
    FROM bugs b
    LEFT JOIN executions e ON e.id = b.execution_id
    LEFT JOIN test_cases tc ON tc.id = COALESCE(b.test_case_id, e.test_case_id)
    LEFT JOIN requirements r ON r.id = COALESCE(b.requirement_id, tc.requirement_id)`;

  router.get('/', (req, res) => {
    const { projectId, taskId, status, severity } = req.query;
    const params = [];
    let sql = `${LIST_SQL} WHERE 1=1`;
    if (taskId) {
      sql += ' AND b.task_id = ?';
      params.push(taskId);
    } else if (projectId) {
      sql += ' AND b.project_id = ?';
      params.push(projectId);
    } else {
      return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
    }
    if (status) { sql += ' AND b.status = ?'; params.push(status); }
    if (severity) { sql += ' AND b.severity = ?'; params.push(severity); }
    sql += ' ORDER BY b.updated_at DESC';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`${LIST_SQL} WHERE b.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bug não encontrado' });
    row.retests = db.prepare(`
      SELECT bt.*, tc.code AS test_case_code, tc.title AS test_case_title,
        e.result AS execution_result
      FROM bug_retests bt
      LEFT JOIN executions e ON e.id = bt.execution_id
      LEFT JOIN test_cases tc ON tc.id = e.test_case_id
      WHERE bt.bug_id = ? ORDER BY bt.id DESC
    `).all(req.params.id);
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { project_id, task_id, execution_id, test_case_id, requirement_id, code, title, description = '',
      severity = 'Média', priority = 'Média', status = 'Aberto', steps_to_reproduce = '',
      expected_result = '', actual_result = '', environment = '' } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

    let tcId = test_case_id || null;
    let reqId = requirement_id || null;
    let resolvedTaskId = task_id || null;
    let resolvedProjectId = project_id || null;

    if (execution_id) {
      const exec = db.prepare('SELECT test_case_id, task_id, project_id FROM executions WHERE id=?').get(execution_id);
      if (exec) {
        tcId = tcId || exec.test_case_id;
        resolvedTaskId = resolvedTaskId || exec.task_id;
        resolvedProjectId = resolvedProjectId || exec.project_id;
        const tc = db.prepare('SELECT requirement_id, task_id, project_id FROM test_cases WHERE id=?').get(tcId);
        if (tc?.requirement_id) reqId = reqId || tc.requirement_id;
        if (tc) {
          resolvedTaskId = resolvedTaskId || tc.task_id;
          resolvedProjectId = resolvedProjectId || tc.project_id;
        }
      }
    } else if (tcId) {
      const tc = db.prepare('SELECT requirement_id, task_id, project_id FROM test_cases WHERE id=?').get(tcId);
      if (tc) {
        reqId = reqId || tc.requirement_id;
        resolvedTaskId = resolvedTaskId || tc.task_id;
        resolvedProjectId = resolvedProjectId || tc.project_id;
      }
    }

    if (!resolvedTaskId) return res.status(400).json({ error: 'Tarefa é obrigatória' });
    const owned = validateTaskOwnership(db, resolvedTaskId, resolvedProjectId);
    if (owned.error) return res.status(owned.status).json({ error: owned.error });
    resolvedProjectId = resolvedProjectId || owned.task.project_id;

    const c = code || db.nextCode('bugs', 'BUG', resolvedProjectId);
    const r = db.prepare(
      `INSERT INTO bugs (project_id, task_id, execution_id, test_case_id, requirement_id, code, title, description, severity, priority, status, steps_to_reproduce, expected_result, actual_result, environment)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(resolvedProjectId, resolvedTaskId, execution_id || null, tcId, reqId, c, title, description, severity, priority, status,
      steps_to_reproduce, expected_result, actual_result, environment);
    res.status(201).json({ id: Number(r.lastInsertRowid), code: c });
  });

  router.put('/:id', (req, res) => {
    const { execution_id, test_case_id, requirement_id, code, title, description, severity, priority,
      status, steps_to_reproduce, expected_result, actual_result, environment } = req.body || {};
    const row = db.prepare('SELECT id FROM bugs WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bug não encontrado' });
    db.prepare(
      `UPDATE bugs SET execution_id=?, test_case_id=?, requirement_id=?, code=?, title=?, description=?,
        severity=?, priority=?, status=?, steps_to_reproduce=?, expected_result=?, actual_result=?,
        environment=?, updated_at=datetime('now') WHERE id=?`
    ).run(execution_id || null, test_case_id || null, requirement_id || null, code, title, description,
      severity, priority, status, steps_to_reproduce, expected_result, actual_result, environment, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare('SELECT id, attachment_path FROM bugs WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bug não encontrado' });
    const savedPath = row.attachment_path;
    db.prepare('DELETE FROM bugs WHERE id=?').run(req.params.id);
    // Remove o arquivo de evidência depois de capturar o caminho (a linha já foi apagada).
    if (savedPath) removeFileByPath(db, savedPath);
    res.json({ ok: true });
  });

  /** Upload de evidência (screenshot/anexo) para um bug. */
  router.post('/:id/attachment', (req, res) => {
    const row = db.prepare('SELECT id FROM bugs WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bug não encontrado' });
    const { filename = '', data = '' } = req.body || {};
    const out = saveAttachment(db, 'bugs', req.params.id, filename, data);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json({ ok: true, attachment_path: out.attachment_path });
  });

  /** Download da evidência do bug (inline para imagens, download para o resto). */
  router.get('/:id/attachment', (req, res) => {
    const abs = resolveAttachment(db, 'bugs', req.params.id);
    if (!abs) return res.status(404).json({ error: 'Sem evidência anexada' });
    res.setHeader('Content-Disposition', `${isImage(abs) ? 'inline' : 'attachment'}; filename="${path.basename(abs)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: 'Falha ao enviar a evidência.' });
    });
  });

  /** Remove a evidência anexada (arquivo + campo). */
  router.delete('/:id/attachment', (req, res) => {
    const row = db.prepare('SELECT id FROM bugs WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bug não encontrado' });
    removeAttachment(db, 'bugs', req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/retests', (req, res) => {
    const { execution_id, result = 'Passou', notes = '', retest_date = null } = req.body || {};
    const bug = db.prepare('SELECT id FROM bugs WHERE id=?').get(req.params.id);
    if (!bug) return res.status(404).json({ error: 'Bug não encontrado' });
    const r = db.tx(() => {
      const ins = db.prepare('INSERT INTO bug_retests (bug_id, execution_id, result, notes, retest_date) VALUES (?,?,?,?,?)')
        .run(req.params.id, execution_id || null, result, notes, retest_date || null);
      if (result === 'Passou') {
        db.prepare("UPDATE bugs SET status='Fechado', updated_at=datetime('now') WHERE id=?").run(req.params.id);
      } else if (result === 'Falhou') {
        db.prepare("UPDATE bugs SET status='Em Correção', updated_at=datetime('now') WHERE id=?").run(req.params.id);
      }
      return Number(ins.lastInsertRowid);
    });
    res.status(201).json({ id: r });
  });

  router.put('/retests/:rid', (req, res) => {
    const { execution_id, result, notes } = req.body || {};
    const row = db.prepare('SELECT id FROM bug_retests WHERE id=?').get(req.params.rid);
    if (!row) return res.status(404).json({ error: 'Reteste não encontrado' });
    db.prepare('UPDATE bug_retests SET execution_id=?, result=?, notes=? WHERE id=?')
      .run(execution_id || null, result, notes, req.params.rid);
    res.json({ ok: true });
  });

  router.delete('/retests/:rid', (req, res) => {
    const row = db.prepare('SELECT id FROM bug_retests WHERE id=?').get(req.params.rid);
    if (!row) return res.status(404).json({ error: 'Reteste não encontrado' });
    db.prepare('DELETE FROM bug_retests WHERE id=?').run(req.params.rid);
    res.json({ ok: true });
  });

  return router;
};

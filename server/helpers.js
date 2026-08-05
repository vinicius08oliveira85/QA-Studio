/**
 * Helpers compartilhados das rotas.
 */

/** Garante que a request tenha taskId ou projectId; envia 400 e retorna null se faltar. */
function requireScope(req, res) {
  const { taskId, projectId } = req.query;
  if (!taskId && !projectId) {
    res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
    return null;
  }
  return { taskId, projectId };
}

/** Valida que a tarefa existe e pertence ao projeto; envia erro e retorna null se inválida. */
function validateTaskOwnership(db, taskId, projectId) {
  const task = db.resolveTask(taskId);
  if (!task) return { error: 'Tarefa não encontrada', status: 404 };
  if (Number(projectId) !== Number(task.project_id)) {
    return { error: 'Tarefa não pertence ao projeto informado', status: 400 };
  }
  return { task };
}

/** Mescla campos definidos do body sobre o registro atual (PUT parcial). */
function mergeUpdate(current, body, keys) {
  const merged = { ...current };
  for (const key of keys) {
    if (body[key] !== undefined) merged[key] = body[key];
  }
  return merged;
}

/** Retorna campos do body que não são undefined. */
function pickDefined(body, keys) {
  const out = {};
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

module.exports = { requireScope, validateTaskOwnership, mergeUpdate, pickDefined };

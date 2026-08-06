const express = require('express');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { clearSsoMarker, signalSsoContinue } = require('../../agent-runner/helpers/ssoWait');
const { signalFixAction, clearFixMarkers, readFixRequest } = require('../../agent-runner/helpers/flowControl');
const { appendJobOutput, finalizeJobError } = require('../helpers/agentRunEvents');

const ROOT = path.join(__dirname, '..', '..');
const RUNNER = path.join(ROOT, 'agent-runner');
const jobs = new Map();
const MAX_JOBS = 50;
const ALLOWED_TYPES = new Set(['Fumaça', 'Funcional', 'API']);
const ALLOWED_AGENTS = new Set(['opencode', 'cursor']);
const MAX_JOB_MS = Number(process.env.AGENT_JOB_TIMEOUT_MS) || 30 * 60 * 1000;

/** Redige dados sensíveis dos logs antes de expô-los via API. */
function sanitizeLog(log) {
  return String(log || '')
    .replace(/(senha|password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/(x-goog-api-key|x-app-token)\s*:\s*\S+/gi, '$1: ***');
}

function killJob(job) {
  if (!job.pid) return;
  if (process.platform === 'win32') {
    // SIGTERM não derruba a árvore (opencode/Chromium) no Windows.
    try { spawn('taskkill', ['/pid', String(job.pid), '/T', '/F'], { windowsHide: true }); } catch { /* ignore */ }
    return;
  }
  try { process.kill(job.pid, 'SIGTERM'); } catch { /* processo já encerrado */ }
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Job cujo processo morreu sem emitir 'close' não pode bloquear novas execuções. */
function reapDeadJobs() {
  for (const job of jobs.values()) {
    if ((job.status === 'running' || job.status === 'queued') && job.startedAt && !isPidAlive(job.pid)) {
      clearTimeout(job.timeoutTimer);
      job.status = 'error';
      job.phase = 'orphaned';
      job.error = job.error || 'Processo do runner terminou sem retorno';
      job.finishedAt = Date.now();
      job.waitingSso = false;
      job.waitingFix = false;
    }
  }
}

function activeJob() {
  reapDeadJobs();
  return [...jobs.values()].find((j) => j.status === 'running' || j.status === 'queued') || null;
}

function trimJobs() {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
  while (jobs.size > MAX_JOBS && sorted.length) {
    const old = sorted.shift();
    if (old.status === 'queued' || old.status === 'running') continue;
    jobs.delete(old.id);
  }
}

function appendLog(job, chunk) {
  appendJobOutput(job, chunk);
}

function spawnRunner(job, args) {
  job.status = 'running';
  job.phase = 'starting';
  job.startedAt = Date.now();
  clearSsoMarker();
  clearFixMarkers();
  const headed = args.includes('--headed');
  const child = spawn('node', [path.join(RUNNER, 'src', 'cli.js'), ...args], {
    cwd: RUNNER,
    env: {
      ...process.env,
      AGENT_JOB_ID: job.id,
      ...(headed ? { HEADED: '1' } : {})
    },
    shell: false,
    windowsHide: !headed
  });
  job.pid = child.pid;

  job.timeoutTimer = setTimeout(() => {
    if (job.status === 'running' || job.status === 'queued') {
      killJob(job);
      job.status = 'error';
      job.phase = 'timeout';
      job.error = `Job excedeu o limite de ${Math.round(MAX_JOB_MS / 1000 / 60)} min`;
      job.finishedAt = Date.now();
      job.waitingSso = false;
      job.waitingFix = false;
      clearSsoMarker();
      clearFixMarkers();
    }
  }, MAX_JOB_MS);
  job.timeoutTimer.unref?.();

  child.stdout.on('data', (d) => appendJobOutput(job, d.toString(), { parseStructured: true }));
  child.stderr.on('data', (d) => appendLog(job, d.toString()));
  child.on('error', (err) => {
    clearTimeout(job.timeoutTimer);
    job.status = 'error';
    job.finishedAt = Date.now();
    job.waitingSso = false;
    job.waitingFix = false;
    job.error = err.message;
    finalizeJobError(job, 1);
    clearFixMarkers();
  });
  child.on('close', (code) => {
    clearTimeout(job.timeoutTimer);
    job.exitCode = code ?? 1;
    job.status = code === 0 ? 'done' : 'error';
    job.finishedAt = Date.now();
    job.waitingSso = false;
    job.waitingFix = false;
    if (code === 0) {
      job.phase = job.queueStopped ? 'stopped_after_fail' : 'done';
    } else {
      finalizeJobError(job, code ?? 1);
    }
    clearSsoMarker();
    clearFixMarkers();
  });
}

/** Campos não serializáveis do job (handles/objetos circulares) — nunca expor via JSON. */
const NON_SERIALIZABLE = new Set(['timeoutTimer', 'eventBuffer']);

function publicJob(job) {
  const out = {};
  for (const k of Object.keys(job)) {
    if (!NON_SERIALIZABLE.has(k)) out[k] = job[k];
  }
  return out;
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    reapDeadJobs();
    const list = [...jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)
      .map((job) => ({ ...publicJob(job), logPreview: sanitizeLog(job.log).slice(-500) }));
    res.json(list);
  });

  router.get('/:id', (req, res) => {
    reapDeadJobs();
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    // Atualiza fixPrompt a partir do arquivo se ainda aguardando.
    if (job.waitingFix) {
      const reqFix = readFixRequest();
      if (reqFix) {
        job.fixPrompt = reqFix.error || job.fixPrompt;
        job.currentCaseId = reqFix.caseId || job.currentCaseId;
        job.currentCaseCode = reqFix.code || job.currentCaseCode;
      }
    }
    res.json({ ...publicJob(job), log: sanitizeLog(job.log) });
  });

  /** QA confirms SSO/login done — unblocks waitForManualLogin in Playwright */
  router.post('/:id/continue', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    if (job.status !== 'running' && job.status !== 'queued') {
      return res.status(400).json({ error: 'Job não está em execução' });
    }
    signalSsoContinue();
    job.waitingSso = false;
    job.phase = 'resumed';
    appendLog(job, '[Studio] Usuário confirmou login SSO — sinal enviado ao Playwright.\n');
    res.json({ ok: true, id: job.id, message: 'Sinal de continuar enviado' });
  });

  /** Encerra a execução em andamento (runner + árvore de processos) e libera a fila. */
  router.post('/:id/cancel', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    if (job.status !== 'running' && job.status !== 'queued') {
      return res.json({ ok: true, id: job.id, message: 'Job já estava encerrado' });
    }
    killJob(job);
    clearTimeout(job.timeoutTimer);
    job.status = 'error';
    job.phase = 'cancelled';
    job.error = 'Execução cancelada pelo usuário';
    job.finishedAt = Date.now();
    job.waitingSso = false;
    job.waitingFix = false;
    clearSsoMarker();
    clearFixMarkers();
    appendLog(job, '[Studio] Execução cancelada pelo usuário.\n');
    res.json({ ok: true, id: job.id, message: 'Execução cancelada' });
  });

  /** Fila sequencial: Regenerar | Pular | Parar após imprevisto. */
  router.post('/:id/fix', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    if (job.status !== 'running' && job.status !== 'queued') {
      return res.status(400).json({ error: 'Job não está em execução' });
    }
    const action = String((req.body || {}).action || '').trim().toLowerCase();
    if (!['regen', 'skip', 'stop'].includes(action)) {
      return res.status(400).json({ error: 'action deve ser regen, skip ou stop' });
    }
    try {
      signalFixAction(action);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    job.waitingFix = false;
    job.phase = action === 'stop' ? 'stopping' : 'running';
    job.lastFixAction = action;
    appendLog(job, `[Studio] Ação de correção da fila: ${action}\n`);
    res.json({ ok: true, id: job.id, action, message: `Ação ${action} enviada ao runner` });
  });

  router.post('/', (req, res) => {
    const { caseId, taskId, type, agent, headed, allModes, projectId, sequentialFlow } = req.body || {};
    if (!caseId && !taskId) {
      return res.status(400).json({ error: 'Informe caseId ou taskId' });
    }

    let resolvedProjectId = projectId ? Number(projectId) : null;

    if (caseId) {
      const tc = db.prepare('SELECT id, type, code, project_id, task_id FROM test_cases WHERE id = ?').get(caseId);
      if (!tc) return res.status(404).json({ error: 'Caso não encontrado' });
      if (!ALLOWED_TYPES.has(tc.type)) {
        return res.status(400).json({ error: `Tipo ${tc.type} não suportado pelo agent` });
      }
      if (resolvedProjectId && Number(tc.project_id) !== resolvedProjectId) {
        return res.status(400).json({ error: 'Caso não pertence ao projeto informado' });
      }
      resolvedProjectId = tc.project_id;
    }
    if (taskId) {
      const task = db.prepare('SELECT id, project_id FROM tasks WHERE id = ?').get(taskId);
      if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
      if (resolvedProjectId && Number(task.project_id) !== resolvedProjectId) {
        return res.status(400).json({ error: 'Tarefa não pertence ao projeto informado' });
      }
      resolvedProjectId = task.project_id;
    }
    if (type && !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: `Tipo inválido: ${type}` });
    }
    const agentKey = agent || process.env.AGENT || 'opencode';
    if (!ALLOWED_AGENTS.has(agentKey)) {
      return res.status(400).json({ error: `Agente inválido: ${agentKey}` });
    }

    const running = activeJob();
    if (running) {
      return res.status(409).json({
        error: 'Já existe uma execução com agent em andamento. Aguarde ou cancele a execução atual.',
        runningJobId: running.id,
        runningPhase: running.phase
      });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const useSequential = !!sequentialFlow;
    // Fluxo sequencial sempre headed (continuidade de tela).
    const useHeaded = useSequential ? true : headed !== false;
    const args = [];
    if (caseId) args.push(`--caseId=${caseId}`);
    if (taskId) args.push(`--taskId=${taskId}`);
    if (type) args.push(`--type=${type}`);
    args.push(`--agent=${agentKey}`);
    args.push(useHeaded ? '--headed' : '--headless');
    if (allModes || useSequential) args.push('--all-modes');
    if (useSequential) args.push('--sequential-flow');

    const job = {
      id,
      status: 'queued',
      phase: 'queued',
      waitingSso: false,
      waitingFix: false,
      fixPrompt: null,
      currentCaseId: null,
      currentCaseCode: null,
      lastFixAction: null,
      sequentialFlow: useSequential,
      queueStopped: false,
      items: [],
      summary: null,
      eventBuffer: '',
      caseId: caseId || null,
      taskId: taskId || null,
      type: type || null,
      agent: agentKey,
      headed: useHeaded,
      args,
      log: '',
      error: null,
      exitCode: null,
      pid: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null
    };
    jobs.set(id, job);
    trimJobs();

    setImmediate(() => spawnRunner(job, args));
    res.status(201).json({
      id,
      status: job.status,
      phase: job.phase,
      sequentialFlow: useSequential,
      message: useSequential
        ? 'Suíte contínua em lote iniciada (uma geração, um browser, mesma tela)'
        : 'Agent run iniciado'
    });
  });

  return router;
};

module.exports.killAll = () => {
  for (const job of jobs.values()) {
    if (job.status === 'running' || job.status === 'queued') killJob(job);
  }
  clearFixMarkers();
};

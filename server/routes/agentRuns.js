const express = require('express');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { clearSsoMarker, signalSsoContinue } = require('../../agent-runner/helpers/ssoWait');

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
  if (job.pid) {
    try { process.kill(job.pid, 'SIGTERM'); } catch { /* processo já encerrado */ }
  }
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
  job.log += chunk;
  if (job.log.length > 100_000) job.log = job.log.slice(-80_000);
  if (/\[SSO\].*Aguardando/i.test(chunk) || /\[SSO\].*login manual/i.test(chunk)) {
    job.waitingSso = true;
    job.phase = 'waiting_sso';
  }
  if (/\[SSO\].*Continuando|\[SSO\].*Confirmação|\[SSO\].*retomando/i.test(chunk)) {
    job.waitingSso = false;
    job.phase = 'running';
  }
}

function spawnRunner(job, args) {
  job.status = 'running';
  job.phase = 'starting';
  job.startedAt = Date.now();
  clearSsoMarker();
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
      clearSsoMarker();
    }
  }, MAX_JOB_MS);
  job.timeoutTimer.unref?.();

  child.stdout.on('data', (d) => appendLog(job, d.toString()));
  child.stderr.on('data', (d) => appendLog(job, d.toString()));
  child.on('error', (err) => {
    clearTimeout(job.timeoutTimer);
    job.status = 'error';
    job.phase = 'error';
    job.error = err.message;
    job.finishedAt = Date.now();
    job.waitingSso = false;
  });
  child.on('close', (code) => {
    clearTimeout(job.timeoutTimer);
    job.exitCode = code ?? 1;
    job.status = code === 0 ? 'done' : 'error';
    job.phase = job.status;
    job.finishedAt = Date.now();
    job.waitingSso = false;
    if (code !== 0 && !job.error) job.error = `Runner exit ${code}`;
    clearSsoMarker();
  });
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const list = [...jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)
      .map(({ log, ...rest }) => ({ ...rest, logPreview: sanitizeLog(log).slice(-500) }));
    res.json(list);
  });

  router.get('/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    res.json({ ...job, log: sanitizeLog(job.log) });
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

  router.post('/', (req, res) => {
    const { caseId, taskId, type, agent, headed, allModes, projectId } = req.body || {};
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

    const running = [...jobs.values()].some((j) => j.status === 'running' || j.status === 'queued');
    if (running) {
      return res.status(409).json({ error: 'Já existe uma execução com agent em andamento. Aguarde.' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const useHeaded = headed !== false;
    const args = [];
    if (caseId) args.push(`--caseId=${caseId}`);
    if (taskId) args.push(`--taskId=${taskId}`);
    if (type) args.push(`--type=${type}`);
    args.push(`--agent=${agentKey}`);
    args.push(useHeaded ? '--headed' : '--headless');
    if (allModes) args.push('--all-modes');

    const job = {
      id,
      status: 'queued',
      phase: 'queued',
      waitingSso: false,
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
    res.status(201).json({ id, status: job.status, phase: job.phase, message: 'Agent run iniciado' });
  });

  return router;
};

module.exports.killAll = () => {
  for (const job of jobs.values()) {
    if (job.status === 'running' || job.status === 'queued') killJob(job);
  }
};

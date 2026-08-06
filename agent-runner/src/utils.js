const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cópia recursiva manual de diretório.
 * `fs.cpSync` (recursive) pode derrubar o Node 24 no Windows quando o caminho
 * contém caracteres não-ASCII (ex.: "Repositórios") — ver bundleEvidence.
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (entry.isSymbolicLink()) {
      try { fs.symlinkSync(fs.readlinkSync(s), d); } catch { /* ignore */ }
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * Remoção recursiva manual de diretório.
 * `fs.rmSync` (recursive) falha silenciosamente no Windows com caminhos
 * não-ASCII (deixa arquivos para trás) — mesmo bug do cpSync.
 */
function removeDirSync(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) removeDirSync(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function listRuns(root) {
  const dir = path.join(root, 'artifacts', 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.startsWith('run-'))
    .sort()
    .reverse();
}

/** Mantém apenas os N bundles de evidência mais recentes (EVIDENCE_RUNS). */
function pruneRuns(root, keep = Number(process.env.EVIDENCE_RUNS || 20)) {
  const dir = path.join(root, 'artifacts', 'runs');
  for (const name of listRuns(root).slice(keep)) {
    try { removeDirSync(path.join(dir, name)); } catch { /* ignore */ }
  }
}

function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* continue */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* continue */ }
  }
  return null;
}

function extractCodeFence(text, langHint = 'typescript') {
  if (!text) return null;
  const re = new RegExp('```(?:' + langHint + '|ts|js|javascript)?\\s*([\\s\\S]*?)```', 'i');
  const m = String(text).match(re);
  if (m) return m[1].trim();
  const any = String(text).match(/```\s*([\s\S]*?)```/);
  return any ? any[1].trim() : null;
}

function parseArgs(argv) {
  const out = {
    caseId: null,
    taskId: null,
    type: null,
    // Browser visível por padrão; use --headless para CI
    headed: process.env.HEADED !== '0' && process.env.HEADLESS !== '1',
    agent: null,
    automatedOnly: true,
    reuseSpec: false,
    skipJudge: false,
    replayFailed: false,
    sequentialFlow: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headed') out.headed = true;
    else if (a === '--headless') out.headed = false;
    else if (a === '--reuseSpec') out.reuseSpec = true;
    else if (a === '--skipJudge') out.skipJudge = true;
    else if (a === '--replay-failed') out.replayFailed = true;
    else if (a === '--all-modes') out.automatedOnly = false;
    else if (a === '--sequential-flow') out.sequentialFlow = true;
else if (a.startsWith('--caseId=')) out.caseId = a.slice('--caseId='.length);
else if (a === '--caseId') out.caseId = argv[++i];
    else if (a.startsWith('--taskId=')) out.taskId = Number(a.slice('--taskId='.length));
    else if (a === '--taskId') out.taskId = Number(argv[++i]);
    else if (a.startsWith('--type=')) out.type = a.slice('--type='.length);
    else if (a === '--type') out.type = argv[++i];
    else if (a.startsWith('--agent=')) out.agent = a.slice('--agent='.length);
    else if (a === '--agent') out.agent = argv[++i];
  }
  return out;
}

function winQuote(arg) {
  const s = String(arg).replace(/"/g, '""');
  return /[\s"&^|<>()%@!]/.test(s) ? `"${s}"` : s;
}

/**
 * Spawn a command cross-platform without `shell: true`.
 * On Windows .cmd shims (npx, opencode) need cmd.exe; args are passed as a
 * single quoted line so spaces in paths (e.g. "Novo QA") stay safe.
 */
function spawnCmd(cmd, args = [], opts = {}) {
  if (process.platform === 'win32') {
    const line = [cmd, ...args].map(winQuote).join(' ');
    return spawn(process.env.ComSpec, ['/d', '/s', '/c', line], Object.assign({ windowsHide: true }, opts));
  }
  return spawn(cmd, args, Object.assign({ windowsHide: true }, opts));
}

function aggregateResult(stepResults) {
  const results = (stepResults || []).map((s) => s.result);
  if (results.some((r) => r === 'Falhou')) return 'Falhou';
  if (results.some((r) => r === 'Bloqueado')) return 'Bloqueado';
  if (results.length && results.every((r) => r === 'Passou')) return 'Passou';
  if (results.some((r) => r === 'Não Executado' || r === 'Pendente')) return 'Não Executado';
  return 'Pendente';
}

/**
 * Encerra um processo e toda a sua árvore de filhos.
 * No Windows o kill simples não derruba o Chromium; usa taskkill /T /F.
 */
function treeKill(child) {
  if (!child || child.pid === undefined) return;
  if (process.platform === 'win32') {
    try {
      spawnCmd('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } catch { /* falhou em encerrar */ }
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* ignore */ } }
  }
}

/**
 * Pré-flight: verifica se a URL alvo responde (qualquer status HTTP conta).
 * Lança erro apenas em falha de rede/timeout.
 */
async function checkUrl(url, timeoutMs = 15_000) {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs)
  });
  return res.status;
}

module.exports = {
  extractJson,
  extractCodeFence,
  parseArgs,
  aggregateResult,
  spawnCmd,
  treeKill,
  checkUrl,
  sha256,
  sleep,
  copyDirSync,
  removeDirSync,
  listRuns,
  pruneRuns
};

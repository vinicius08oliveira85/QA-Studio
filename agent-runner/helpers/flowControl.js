const fs = require('fs');
const path = require('path');

const ARTIFACTS = path.join(__dirname, '..', 'artifacts');
const ACTION_FILE = path.join(ARTIFACTS, '.flow-fix-action');
const REQUEST_FILE = path.join(ARTIFACTS, '.flow-fix-request.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
}

/** Publica pedido de correção (CLI → Studio via logs + arquivo). */
function requestFix({ caseId, code, error }) {
  ensureDir();
  try { fs.unlinkSync(ACTION_FILE); } catch { /* ok */ }
  const payload = {
    caseId,
    code,
    error: String(error || '').slice(0, 2000),
    at: new Date().toISOString()
  };
  fs.writeFileSync(REQUEST_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[FLOW] WAITING_FIX case=${code || caseId} ${payload.error.replace(/\s+/g, ' ').slice(0, 240)}`);
}

/**
 * Aguarda ação do Studio: regen | skip | stop.
 * @returns {Promise<'regen'|'skip'|'stop'>}
 */
async function waitForFixAction(timeoutMs = Number(process.env.FLOW_FIX_TIMEOUT_MS) || 30 * 60 * 1000) {
  ensureDir();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(ACTION_FILE)) {
      const action = fs.readFileSync(ACTION_FILE, 'utf8').trim().toLowerCase();
      try { fs.unlinkSync(ACTION_FILE); } catch { /* ok */ }
      try { fs.unlinkSync(REQUEST_FILE); } catch { /* ok */ }
      if (action === 'regen' || action === 'skip' || action === 'stop') {
        console.log(`[FLOW] FIX_ACTION=${action}`);
        return action;
      }
      console.warn(`[FLOW] Ação inválida "${action}", esperando regen|skip|stop…`);
    }
    await sleep(500);
  }
  console.warn('[FLOW] Timeout aguardando correção — tratando como stop');
  return 'stop';
}

/** Studio → runner: grava a ação escolhida pelo usuário. */
function signalFixAction(action) {
  ensureDir();
  const a = String(action || '').trim().toLowerCase();
  if (!['regen', 'skip', 'stop'].includes(a)) {
    throw new Error(`Ação inválida: ${action}`);
  }
  fs.writeFileSync(ACTION_FILE, a, 'utf8');
}

function clearFixMarkers() {
  try { fs.unlinkSync(ACTION_FILE); } catch { /* ok */ }
  try { fs.unlinkSync(REQUEST_FILE); } catch { /* ok */ }
}

function readFixRequest() {
  try {
    if (!fs.existsSync(REQUEST_FILE)) return null;
    return JSON.parse(fs.readFileSync(REQUEST_FILE, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  requestFix,
  waitForFixAction,
  signalFixAction,
  clearFixMarkers,
  readFixRequest,
  ACTION_FILE,
  REQUEST_FILE
};

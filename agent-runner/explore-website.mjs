#!/usr/bin/env node
/**
 * Exploração do CPM (SUT) via Playwright MCP Server (stdio).
 * Reutiliza a sessão SSO salva em artifacts/sso-state-*.json.
 * Documenta: navegação, interações, locators (árvore de acessibilidade) e resultados esperados.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname);
const OUT = path.join(ROOT, 'artifacts', 'explore');
fs.mkdirSync(OUT, { recursive: true });

const TARGET = process.env.TARGET_BASE_URL || 'https://cpm.hom.levesaude.com.br';
const STATE = fs.readdirSync(path.join(ROOT, 'artifacts'))
  .filter((f) => f.startsWith('sso-state-') && f.endsWith('.json'))
  .sort()
  .pop();
if (!STATE) {
  console.error('Nenhum sso-state-*.json em artifacts/ — rode um login manual antes.');
  process.exit(2);
}
const statePath = path.join(ROOT, 'artifacts', STATE);
console.log(`[explore] Sessão SSO: ${statePath}`);

const MCP_CLI = path.join(ROOT, 'node_modules', '@playwright', 'mcp', 'cli.js');
// O MCP alpha espera chromium-1237; usa o build já instalado do projeto.
const pwDir = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null;
const chromeExe = pwDir
  ? ['chromium-1234', 'chromium-1228'].map((v) => path.join(pwDir, v, 'chrome-win64', 'chrome.exe'))
      .find((p) => fs.existsSync(p))
  : null;
if (!chromeExe) {
  console.error('Nenhum chromium do Playwright instalado em ms-playwright.');
  process.exit(2);
}
console.log(`[explore] Chromium: ${chromeExe}`);
const child = spawn(process.execPath, [
  MCP_CLI,
  '--storage-state', statePath,
  '--executable-path', chromeExe,
  '--headless',
  '--isolated',
  '--browser', 'chromium',
  '--allowed-hosts', '*',
  '--timeout-action', '20000',
  '--timeout-navigation', '60000',
  '--image-responses', 'omit',
  '--output-dir', path.join(OUT, 'mcp-output')
], { stdio: ['pipe', 'pipe', 'pipe'] });

child.stderr.on('data', (d) => process.stderr.write(d));

let buf = '';
let nextId = 1;
const pending = new Map();
const logFile = path.join(OUT, 'explore.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

child.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`MCP ${msg.error.code || 'error'}: ${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method === 'notifications/message') {
      const m = msg.params?.message;
      if (m) log('[mcp-log] ' + String(m).slice(0, 300));
    }
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout em ${method}`));
    }, 180_000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

async function notify(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

function textOf(result) {
  if (!result) return '';
  return (result.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('\n');
}

async function callTool(name, args = {}) {
  const r = await send('tools/call', { name, arguments: args });
  return { result: r, text: textOf(r) };
}

const snapshots = [];
function saveSnapshot(label, text) {
  const safe = String(label).replace(/[^A-Za-z0-9_-]+/g, '_');
  const file = path.join(OUT, `snap-${safe}.txt`);
  fs.writeFileSync(file, text);
  snapshots.push({ label, file, chars: text.length });
  log(`[snapshot] ${label} (${text.length} chars) → ${path.basename(file)}`);
}

function findRef(text, regex) {
  const m = String(text).match(regex);
  return m ? m[1] : null;
}

function truncate(text, n = 6000) {
  const t = String(text || '');
  return t.length <= n ? t : t.slice(0, n) + `\n…[truncado ${t.length - n} chars]`;
}

async function waitMs(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function navigate(url) {
  const r = await callTool('browser_navigate', { url });
  log(`[navigate] ${url} → ${truncate(r.text, 300)}`);
}

async function snapshot(label) {
  const r = await callTool('browser_snapshot', {});
  saveSnapshot(label, r.text);
  return r.text;
}

async function screenshot(label) {
  const r = await callTool('browser_take_screenshot', {});
  // Tenta extrair caminho de arquivo da resposta
  const m = r.text.match(/(["']?file["']?\s*:\s*["'])([^"']+)/i);
  if (m) {
    log(`[screenshot] ${label} → ${m[2]}`);
  } else {
    // Sem caminho: resposta pode ser base64 pura
    try {
      const b64 = r.text.trim();
      if (b64) {
        const file = path.join(OUT, `${label}.png`);
        fs.writeFileSync(file, Buffer.from(b64, 'base64'));
        log(`[screenshot] ${label} (base64 ${b64.length} chars) → ${path.basename(file)}`);
      }
    } catch (e) { log(`[screenshot] ${label} falhou: ${e.message}`); }
  }
}

async function clickByText(text) {
  const snap = await snapshot(`antes-click-${text}`);
  const ref = findRef(snap, new RegExp(`ref="([^"]+)"[^\\n]*\\b${escapeRe(text)}`)) ||
    findRef(snap, new RegExp(`([^\\n]*${escapeRe(text)}[^\\n]*)\\s*\\[ref=([^\\]]+)\\]`));
  if (!ref) throw new Error(`Elemento "${text}" não encontrado no snapshot`);
  const r = await callTool('browser_click', { element: ref });
  log(`[click] ${text} (ref=${ref}) → ${truncate(r.text, 200)}`);
  await waitMs(800);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function clickOption(optionText) {
  const snap = await snapshot('opcoes');
  const ref = findRef(snap, new RegExp(`option\\s*"([^"]*${escapeRe(optionText)}[^"]*)"[^\\n]*\\[ref=([^\\]]+)\\]`));
  if (!ref) {
    throw new Error(`Opção "${optionText}" não encontrada no listbox.\n${truncate(snap, 2500)}`);
  }
  const r = await callTool('browser_click', { element: ref });
  log(`[option] ${optionText} (ref=${ref}) → ${truncate(r.text, 200)}`);
  await waitMs(1200);
}

async function selectCombobox(name, optionText) {
  const snap = await snapshot(`combo-${name}`);
  const ref = findRef(snap, new RegExp(`combobox[^\\n]*\\[ref=([^\\]]+)\\]`));
  if (!ref) throw new Error(`Combobox "${name}" não encontrado\n${truncate(snap, 1500)}`);
  await callTool('browser_click', { element: ref });
  await waitMs(900);
  await clickOption(optionText);
}

async function main() {
  try {
    const init = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'qa-studio-explore', version: '1.0.0' }
    });
    log(`[init] ${JSON.stringify(init.serverInfo || {})} protocol=${init.protocolVersion}`);
    await notify('notifications/initialized');

    const tools = await send('tools/list');
    const names = (tools.tools || []).map((t) => t.name);
    log(`[tools] ${names.length} ferramentas: ${names.join(', ')}`);

    // ————— FLOW 1: Acesso + navegação Atendimento → Ambulatorial —————
    await navigate(TARGET + '/');
    await waitMs(2500);
    let snap = await snapshot('01-landing');

    if (snap.includes('Entrar com Microsoft')) {
      log('[flow1] Landing de login — clicando "Entrar com Microsoft"…');
      const ref = findRef(snap, /button[^\n]*"Entrar com Microsoft"[^\n]*\[ref=([^\]]+)\]/);
      if (ref) await callTool('browser_click', { element: ref });
      await waitMs(4000);
      snap = await snapshot('01b-pos-login');
    }
    saveSnapshot('01-final-login-state', snap);

    // Navegação via menu
    await navigate(TARGET + '/atendimento/ambulatorial');
    await waitMs(2500);
    snap = await snapshot('02-ambulatorial');

    // ————— FLOW 2: Selecionar agenda —————
    await selectCombobox('Clínica', 'LEVE CLINICA TIJUCA');
    await waitMs(1500);
    snap = await snapshot('03-clinica-selecionada');
    await selectCombobox('Especialidade', 'Clínica médica');
    await waitMs(1500);
    snap = await snapshot('04-especialidade-selecionada');
    await selectCombobox('Profissional', 'Dr. Physician');
    await waitMs(2500);
    snap = await snapshot('05-fila-pacientes');

    // ————— FLOW 3: Fila de pacientes —————
    const fila = snap;
    saveSnapshot('06-fila-focus', fila);
    const pacienteRef = findRef(fila, /option[^\n]*|row[^\n]*|button[^\n]*"Iniciar"[^\n]*\[ref=([^\]]+)\]/);
    // Documenta botão Iniciar e pacientes
    const iniciarRef = findRef(fila, /"Iniciar"[^\n]*\[ref=([^\]]+)\]/);
    if (iniciarRef) {
      log('[flow3] Botão "Iniciar" encontrado — abrindo prontuário…');
      await callTool('browser_click', { element: iniciarRef });
      await waitMs(4000);
    }
    snap = await snapshot('07-prontuario');
    await screenshot('prontuario');

    // ————— FLOW 4: Abas do prontuário —————
    for (const tab of ['Subjetivo', 'Objetivo', 'Avaliação', 'Plano']) {
      const t = await snapshot(`tab-check-${tab}`);
      const ref = findRef(t, new RegExp(`tab\\s*"[^"]*${escapeRe(tab)}[^"]*"[^\\n]*\\[ref=([^\\]]+)\\]`));
      if (ref) {
        await callTool('browser_click', { element: ref });
        await waitMs(1500);
        await snapshot(`08-aba-${tab}`);
      } else {
        log(`[flow4] Aba "${tab}" não encontrada no snapshot atual`);
      }
    }

    // ————— FLOW 5: Botões/menções de IA no prontuário —————
    snap = await snapshot('09-prontuario-final');
    saveSnapshot('09-prontuario-final', snap);

    await callTool('browser_close', {});
    log('[done] browser fechado.');

    // ————— RELATÓRIO —————
    const report = buildReport(snapshots);
    fs.writeFileSync(path.join(OUT, 'REPORT.md'), report);
    log(`[report] artifacts/explore/REPORT.md (${report.length} chars)`);
  } catch (err) {
    log('[ERRO] ' + (err.stack || err.message));
    try { await callTool('browser_close', {}); } catch { /* ignore */ }
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
}

function buildReport(list) {
  const lines = [
    '# Exploração do CPM (cpm.hom.levesaude.com.br)',
    '',
    `- Data: ${new Date().toISOString()}`,
    `- Sessão: ${STATE}`,
    `- Snapshots capturados: ${list.length}`,
    '',
    '## Fluxos explorados',
    '',
    '1. **Acesso** — navegação até `/atendimento/ambulatorial` via menu (Atendimento → Ambulatorial).',
    '2. **Seleção de agenda** — comboboxes Clínica/Especialidade/Profissional (listbox de opções).',
    '3. **Fila de pacientes** — listagem com botão "Iniciar" por paciente.',
    '4. **Prontuário** — abas Subjetivo/Objetivo/Avaliação/Plano e cabeçalho do paciente.',
    '5. **Ações de IA** — botões "Estruturar com a IA", "Sugerir plano Clínico", "Exames".',
    '',
    '## Artefatos',
    '',
    ...list.map((s) => `- \`${path.basename(s.file)}\` — ${s.label} (${s.chars} chars)`),
    ''
  ];
  return lines.join('\n');
}

main().catch((err) => {
  log('[FATAL] ' + (err.stack || err.message));
  process.exit(1);
});

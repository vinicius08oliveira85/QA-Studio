const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnCmd, treeKill } = require('../utils');

/**
 * OpenCode em modo live: usa MCP Playwright apontando para o Chromium
 * já aberto (QA_FLOW_CDP / PLAYWRIGHT_MCP_CDP_ENDPOINT).
 */
function envForLive(cdpEndpoint) {
  const env = { ...process.env };
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY && env.GEMINI_API_KEY) {
    env.GOOGLE_GENERATIVE_AI_API_KEY = env.GEMINI_API_KEY;
  }
  const cdp = cdpEndpoint || process.env.QA_FLOW_CDP;
  if (cdp) {
    env.QA_FLOW_CDP = cdp;
    env.PLAYWRIGHT_MCP_CDP_ENDPOINT = cdp;
  }
  return env;
}

/**
 * Prefere o binário local de @playwright/mcp (evita npx -y a cada caso).
 */
function mcpCommand(cdp) {
  const localCli = path.join(__dirname, '..', '..', 'node_modules', '@playwright', 'mcp', 'cli.js');
  const base = fs.existsSync(localCli)
    ? [process.execPath, localCli]
    : ['npx', '-y', '@playwright/mcp@latest'];
  if (cdp) base.push(`--cdp-endpoint=${cdp}`);
  // Sem screenshots nas respostas MCP — mais rápido para o modelo.
  base.push('--image-responses', 'omit');
  return base;
}

/**
 * Garante opencode.json local com Playwright MCP + CDP.
 */
function ensureLiveConfig(cwd, cdpEndpoint) {
  const configPath = path.join(cwd, 'opencode.json');
  const cdp = cdpEndpoint || process.env.QA_FLOW_CDP || '';
  const config = {
    $schema: 'https://opencode.ai/config.json',
    mcp: {
      playwright: {
        type: 'local',
        command: mcpCommand(cdp),
        enabled: true
      }
    }
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return configPath;
}

/**
 * Executa o OpenCode com tools MCP (browser ao vivo).
 * @returns {Promise<string>} stdout/stderr combinados
 */
async function runLive(prompt, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const cdp = opts.cdpEndpoint || process.env.QA_FLOW_CDP;
  if (!cdp) {
    throw new Error('QA_FLOW_CDP ausente — browserSession precisa estar ativo para o Agent ao vivo.');
  }
  ensureLiveConfig(cwd, cdp);

  const tmp = path.join(os.tmpdir(), `qa-agent-opencode-live-${Date.now()}.txt`);
  fs.writeFileSync(tmp, prompt, 'utf8');
  try {
    const bin = process.env.OPENCODE_BIN || 'opencode';
    const args = ['run'];
    const model = process.env.OPENCODE_LIVE_MODEL || process.env.OPENCODE_MODEL || 'google/gemini-2.5-flash';
    if (model) args.push('--model', model);
    if (process.env.OPENCODE_AUTO !== '0') args.push('--auto');
    args.push('--format', 'default');

    console.log(`[agent-runner] OpenCode live (MCP Playwright → ${cdp})…`);

    const result = await new Promise((resolve, reject) => {
      const child = spawnCmd(bin, args, {
        cwd,
        env: envForLive(cdp)
      });
      let stdout = '';
      let stderr = '';
      let stream;
      const timeoutMs = opts.timeoutMs || Number(process.env.LIVE_CASE_TIMEOUT_MS) || Number(process.env.AGENT_TIMEOUT_MS) || 600_000;
      const timer = setTimeout(() => {
        try { stream?.destroy(); } catch { /* ignore */ }
        treeKill(child);
        reject(new Error(`OpenCode live timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();

      child.stdout.on('data', (d) => {
        const t = d.toString();
        stdout += t;
        process.stdout.write(t);
      });
      child.stderr.on('data', (d) => {
        const t = d.toString();
        stderr += t;
        process.stderr.write(t);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        try { stream?.destroy(); } catch { /* ignore */ }
        reject(new Error(`OpenCode live failed to start (${bin}): ${err.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });

      stream = fs.createReadStream(tmp);
      stream.pipe(child.stdin);
      stream.on('error', reject);
    });

    return result.stdout || result.stderr || '';
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

module.exports = { name: 'opencode-live', runLive, ensureLiveConfig };

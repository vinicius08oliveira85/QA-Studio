const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnCmd } = require('../utils');

/**
 * OpenCode (provider Google) lê GOOGLE_GENERATIVE_AI_API_KEY.
 * O Studio já usa GEMINI_API_KEY no .env — reaproveita para não exigir chave duplicada.
 */
function envForOpenCode() {
  const env = { ...process.env };
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY && env.GEMINI_API_KEY) {
    env.GOOGLE_GENERATIVE_AI_API_KEY = env.GEMINI_API_KEY;
  }
  return env;
}

/** Prefer writing prompt to temp file + stdin to avoid Windows arg length limits. */
async function prompt(text, opts = {}) {
  const tmp = path.join(os.tmpdir(), `qa-agent-opencode-${Date.now()}.txt`);
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    const bin = process.env.OPENCODE_BIN || 'opencode';
    const args = ['run'];
    // Modelo de imagem (ex.: gemini-*-image*) não gera spec; preferir um modelo de texto.
    const model = process.env.OPENCODE_MODEL || 'google/gemini-2.5-flash';
    if (model) args.push('--model', model);
    if (process.env.OPENCODE_AUTO !== '0') args.push('--auto');

    const result = await new Promise((resolve, reject) => {
      const child = spawnCmd(bin, args, {
        cwd: opts.cwd || process.cwd(),
        env: envForOpenCode()
      });
      let stdout = '';
      let stderr = '';
      const timeoutMs = opts.timeoutMs || Number(process.env.AGENT_TIMEOUT_MS) || 600_000;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`OpenCode timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`OpenCode failed to start (${bin}): ${err.message}. Is OpenCode installed and on PATH?`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });

      const stream = fs.createReadStream(tmp);
      stream.pipe(child.stdin);
      stream.on('error', reject);
    });

    return result.stdout || result.stderr || '';
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

module.exports = { name: 'opencode', prompt };

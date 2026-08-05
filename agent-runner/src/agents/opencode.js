const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function runOpencode(prompt, { cwd, timeoutMs = 600_000 } = {}) {
  const bin = process.env.OPENCODE_BIN || 'opencode';
  const args = ['run', prompt];
  if (process.env.OPENCODE_MODEL) {
    args.push('--model', process.env.OPENCODE_MODEL);
  }
  if (process.env.OPENCODE_AUTO !== '0') {
    args.push('--auto');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: cwd || process.cwd(),
      env: process.env,
      shell: true,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`OpenCode timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`OpenCode failed to start (${bin}): ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`OpenCode exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}

/** Prefer writing prompt to temp file + stdin to avoid Windows arg length limits. */
async function prompt(text, opts = {}) {
  const tmp = path.join(os.tmpdir(), `qa-agent-opencode-${Date.now()}.txt`);
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    const bin = process.env.OPENCODE_BIN || 'opencode';
    const args = ['run'];
    if (process.env.OPENCODE_MODEL) args.push('--model', process.env.OPENCODE_MODEL);
    if (process.env.OPENCODE_AUTO !== '0') args.push('--auto');

    const result = await new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        cwd: opts.cwd || process.cwd(),
        env: process.env,
        shell: true,
        windowsHide: true
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`OpenCode timeout after ${opts.timeoutMs || 600_000}ms`));
      }, opts.timeoutMs || 600_000);

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

module.exports = { name: 'opencode', prompt, runOpencode };

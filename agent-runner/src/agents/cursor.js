async function prompt(text, opts = {}) {
  if (!process.env.CURSOR_API_KEY) {
    throw new Error('CURSOR_API_KEY is required when AGENT=cursor');
  }

  let Agent;
  try {
    ({ Agent } = await import('@cursor/sdk'));
  } catch (err) {
    throw new Error(
      `Failed to load @cursor/sdk. Install it in agent-runner (optionalDependency). ${err.message}`
    );
  }

  const modelId = process.env.CURSOR_MODEL || 'composer-2.5';
  const result = await Agent.prompt(text, {
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: modelId },
    local: { cwd: opts.cwd || process.cwd() }
  });

  if (result?.result) return String(result.result);
  if (typeof result === 'string') return result;
  return JSON.stringify(result ?? {});
}

module.exports = { name: 'cursor', prompt };

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
    skipJudge: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headed') out.headed = true;
    else if (a === '--headless') out.headed = false;
    else if (a === '--reuseSpec') out.reuseSpec = true;
    else if (a === '--skipJudge') out.skipJudge = true;
    else if (a === '--all-modes') out.automatedOnly = false;
    else if (a.startsWith('--caseId=')) out.caseId = Number(a.slice('--caseId='.length));
    else if (a === '--caseId') out.caseId = Number(argv[++i]);
    else if (a.startsWith('--taskId=')) out.taskId = Number(a.slice('--taskId='.length));
    else if (a === '--taskId') out.taskId = Number(argv[++i]);
    else if (a.startsWith('--type=')) out.type = a.slice('--type='.length);
    else if (a === '--type') out.type = argv[++i];
    else if (a.startsWith('--agent=')) out.agent = a.slice('--agent='.length);
    else if (a === '--agent') out.agent = argv[++i];
  }
  return out;
}

function aggregateResult(stepResults) {
  const results = (stepResults || []).map((s) => s.result);
  if (results.some((r) => r === 'Falhou')) return 'Falhou';
  if (results.some((r) => r === 'Bloqueado')) return 'Bloqueado';
  if (results.length && results.every((r) => r === 'Passou')) return 'Passou';
  if (results.some((r) => r === 'Não Executado' || r === 'Pendente')) return 'Não Executado';
  return 'Pendente';
}

module.exports = {
  extractJson,
  extractCodeFence,
  parseArgs,
  aggregateResult
};

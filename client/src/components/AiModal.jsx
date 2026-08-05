import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { buildPrompt, extractJson, applyResult, SCOPE_LABELS } from '../ai.js';
import { Badge, Btn, Collapse, Field, Input, Modal, Select, Textarea } from './ui.jsx';

const SCOPES = ['requisitos', 'completar', 'estrategias', 'cenarios', 'casos', 'completo'];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); return true; } catch { return false; }
    finally { document.body.removeChild(ta); }
  }
}

function taskPrefill(task) {
  if (!task) return { title: '', description: '' };
  const title = [task.code, task.title].filter(Boolean).join(' — ');
  return { title, description: task.description || '' };
}

export default function AiModal({ open, onClose, initialScope = 'completo', onApplied }) {
  const { current, currentTask, taskId } = useApp();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState(initialScope);
  const [existing, setExisting] = useState({});
  const [selReq, setSelReq] = useState([]);
  const [responseText, setResponseText] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open) return;
    const pre = taskPrefill(currentTask);
    setTitle(pre.title);
    setDescription(pre.description);
    setScope(initialScope);
    setResponseText('');
    setError('');
    setSuccess('');
    setCopied('');
    setSelReq([]);
    if (!taskId) {
      setError('Abra uma tarefa primeiro para gerar conteúdo com IA.');
      setExisting({});
      return;
    }
    (async () => {
      try {
        const [reqs, scen, tcs, strats] = await Promise.all([
          api.get('/requirements/context?taskId=' + taskId),
          api.get('/scenarios?taskId=' + taskId),
          api.get('/test-cases?taskId=' + taskId),
          api.get('/strategies?taskId=' + taskId)
        ]);
        setExisting({
          reqList: reqs.map((r) => ({
            id: r.id, code: r.code, title: r.title, module: r.module,
            priority: r.priority, status: r.status, description: r.description,
            business_rules: r.business_rules || []
          })),
          scnList: scen.map((s) => ({ id: s.id, title: s.title, requirement_id: s.requirement_id })),
          stratList: strats.map((s) => ({ id: s.id, name: s.name, requirement_id: s.requirement_id })),
          reqCodes: reqs.map((r) => r.code).join(', '),
          scCodes: scen.map((s, i) => `${i}: ${s.title}`).join(' | '),
          tcCodes: tcs.map((t) => t.code).join(', ')
        });
      } catch { /* segue */ }
    })();
  }, [open, initialScope, taskId, currentTask]);

  const selReqs = useMemo(
    () => selReq.length === 0
      ? (existing.reqList || [])
      : (existing.reqList || []).filter((r) => selReq.includes(Number(r.id))),
    [selReq, existing.reqList]
  );

  const toggleReq = (id) => {
    setSelReq((prev) => {
      if (prev.includes(Number(id))) return prev.filter((x) => x !== Number(id));
      if (prev.length === 0) return (existing.reqList || []).map((r) => Number(r.id)).filter((x) => x !== Number(id));
      return [...prev, Number(id)];
    });
  };

  const prompt = useMemo(
    () => buildPrompt({ project: current, title, description, scope, existing, selectedReqIds: selReq }),
    [current, title, description, scope, existing, selReq]
  );

  const parsed = useMemo(() => extractJson(responseText), [responseText]);

  const countPreview = () => {
    if (!parsed) return null;
    return {
      requirements: (parsed.requirements || []).length,
      rules: (parsed.requirements || []).reduce((s, r) => s + (r.business_rules || []).length, 0),
      strategies: (parsed.strategies || []).length,
      scenarios: (parsed.scenarios || []).length,
      cases: (parsed.test_cases || []).length,
      steps: (parsed.test_cases || []).reduce((s, tc) => s + (tc.steps || []).length, 0),
      mass: (parsed.test_mass || []).length
    };
  };
  const preview = countPreview();

  const contextScopes = ['completar', 'estrategias', 'cenarios', 'casos'];
  const replacesSection = scope !== 'completar';
  const canGenerate = contextScopes.includes(scope) ? selReqs.length > 0 : (title.trim() || description.trim());

  const generate = async () => {
    if (!taskId) { setError('Abra uma tarefa primeiro para gerar conteúdo com IA.'); return; }
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const r = await api.post('/ai/generate', { prompt });
      setResponseText(JSON.stringify(r.content, null, 2));
    } catch (e) {
      setError(e.message);
      if (/Chave da API/.test(e.message)) setError(e.message + ' Você pode continuar usando "Copiar prompt".');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!taskId) { setError('Abra uma tarefa primeiro para aplicar o conteúdo.'); return; }
    if (!parsed) { setError('Resposta da IA inválida: não contém JSON estruturado.'); return; }
    if (replacesSection) {
      const ok = window.confirm('Isso substituirá o conteúdo desta seção na tarefa. Continuar?');
      if (!ok) return;
    }
    setError(''); setApplying(true);
    try {
      const summary = await applyResult(parsed, {
        projectId: current.id,
        taskId,
        scope,
        existing,
        selectedReqIds: selReq,
        mode: replacesSection ? 'replace' : 'append'
      });
      setSuccess(
        `Aplicado: ${summary.requirements} requisito(s), ${summary.rules} regra(s), ${summary.strategies} estratégia(s), ${summary.scenarios} cenário(s), ${summary.cases} caso(s) (${summary.steps} passos), ${summary.mass} massa(s).`
      );
      setResponseText('');
      onApplied && onApplied();
    } catch (e) {
      setError('Falha ao aplicar: ' + e.message);
    } finally {
      setApplying(false);
    }
  };

  const selScns = (existing.scnList || []).filter((s) => selReqs.some((r) => Number(r.id) === Number(s.requirement_id)));
  const needExisting =
    (scope === 'cenarios' && selReqs.length === 0) ||
    (scope === 'casos' && (selReqs.length === 0 || selScns.length === 0)) ||
    (scope === 'completar' && selReqs.length === 0) ||
    (scope === 'estrategias' && selReqs.length === 0);

  const promptSummary = `${prompt.length.toLocaleString('pt-BR')} caracteres`;
  const respSummary = responseText
    ? (parsed
        ? [
            preview?.strategies ? `${preview.strategies} estratégia(s)` : '',
            preview?.requirements ? `${preview.requirements} requisito(s)` : '',
            preview?.scenarios ? `${preview.scenarios} cenário(s)` : '',
            preview?.cases ? `${preview.cases} caso(s)` : '',
            preview?.mass ? `${preview.mass} massa(s)` : ''
          ].filter(Boolean).join(' · ') || 'JSON válido'
        : 'JSON inválido')
    : 'nenhuma resposta';

  return (
    <Modal open={open} onClose={onClose} title="Gerar conteúdo com IA" width={820}>
      <div className="highlight">
        {scope === 'completar'
          ? <>A IA completa os <strong>requisitos selecionados</strong>: define módulo, prioridade, status, refina a descrição e gera as regras de negócio (substituindo as existentes).</>
          : <>
              Descreva a funcionalidade e a IA gera o conteúdo estruturado (PT-BR). Ao aplicar, o conteúdo atual desta seção na tarefa será <strong>substituído</strong>.
              Use <strong>Gerar com IA</strong> (chave Gemini) ou <strong>Copiar prompt</strong> para usar uma IA externa e colar a resposta abaixo.
            </>}
      </div>

      <div className="grid2">
        <Field label={contextScopes.includes(scope) ? 'Observações (opcional)' : 'Título da funcionalidade'}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={contextScopes.includes(scope) ? 'Ex.: preferências de módulo/prioridade...' : 'Ex.: Cadastro de usuário'} />
        </Field>
        <Field label="Escopo">
          <Select value={scope} onChange={(e) => setScope(e.target.value)}>
            {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={contextScopes.includes(scope) ? 'Texto livre (opcional — orientações, contextos)' : 'Texto livre (descrição, regras, dúvidas...)'} required={!contextScopes.includes(scope)}>
        <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={contextScopes.includes(scope) ? 'Opcional: acrescente orientações para os requisitos selecionados...' : 'Explique a funcionalidade: quem usa, o que faz, fluxos, regras, campos, integrações, erros esperados...'} />
      </Field>

      {(scope === 'estrategias' || scope === 'cenarios' || scope === 'casos' || scope === 'completar') && (
        <Field label={`${scope === 'completar' ? 'Requisitos a completar' : 'Requisitos de contexto'} (${selReq.length === 0 ? 'todos' : selReq.length + ' de ' + (existing.reqList || []).length})`}>
          <div className="check-list">
            {(existing.reqList || []).length === 0 && <span className="muted small">Nenhum requisito cadastrado nesta tarefa.</span>}
            {(existing.reqList || []).map((r) => {
              const checked = selReq.length === 0 || selReq.includes(Number(r.id));
              return (
                <label key={r.id} className="check-item">
                  <input type="checkbox" checked={checked} onChange={() => toggleReq(r.id)} />
                  <span className="check-code">{r.code}</span> {r.title}
                  {r.business_rules && r.business_rules.length === 0 && <Badge tone="amber">sem regras</Badge>}
                </label>
              );
            })}
          </div>
          <div className="row-actions mt" style={{ justifyContent: 'flex-start' }}>
            <Btn className="ghost small" onClick={() => setSelReq([])}>Selecionar todos</Btn>
            <Btn className="ghost small" onClick={() => setSelReq((existing.reqList || []).filter((r) => !r.business_rules || r.business_rules.length === 0).map((r) => Number(r.id)))}>Só os sem regras</Btn>
          </div>
        </Field>
      )}

      {needExisting && (
        <div className="highlight" style={{ background: '#fff7ed', borderColor: '#fdba74' }}>
          Atenção: este escopo precisa de itens existentes, mas não há {scope === 'casos' ? 'requisitos/cenários' : 'requisitos'} selecionados.
          Selecione-os acima ou use o escopo "Fluxo completo (tudo)".
        </div>
      )}

      <div className="row-actions mb" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <Btn onClick={generate} disabled={!canGenerate || loading}>
          {loading ? 'Gerando...' : 'Gerar com IA'}
        </Btn>
        <Btn className="ghost" onClick={async () => { if (await copyText(prompt)) { setCopied('prompt'); setTimeout(() => setCopied(''), 1800); } }}>
          {copied === 'prompt' ? 'Prompt copiado!' : 'Copiar prompt'}
        </Btn>
        <Btn className="gray" onClick={() => navigate('/configuracoes')}>Configurar chave</Btn>
      </div>

      <Collapse title="Prompt estruturado (para uso externo)" summary={promptSummary}>
        <Textarea className="mono" rows={7} readOnly value={prompt} />
      </Collapse>

      <Collapse key={responseText ? 'res-open' : 'res-closed'} title="Resposta da IA (JSON) — gere ou cole aqui" summary={respSummary} defaultOpen={!!responseText}>
        <Textarea className="mono" rows={8} value={responseText} onChange={(e) => setResponseText(e.target.value)}
          placeholder='Cole aqui o JSON gerado pela IA externa e clique em "Aplicar"...' />
      </Collapse>

      {preview && (
        <div className="panel mt">
          <h2 style={{ margin: 0 }}>{replacesSection ? 'Preview do que substituirá esta seção' : 'Preview do que será aplicado'}</h2>
          <div className="inline-stats">
            {preview.strategies > 0 && <div className="stat-chip"><div className="v">{preview.strategies}</div><div className="k">Estratégias</div></div>}
            {preview.requirements > 0 && <div className="stat-chip"><div className="v">{preview.requirements}</div><div className="k">{scope === 'completar' ? 'Requisitos a completar' : 'Requisitos'}</div></div>}
            {preview.rules > 0 && <div className="stat-chip"><div className="v">{preview.rules}</div><div className="k">Regras</div></div>}
            {preview.scenarios > 0 && <div className="stat-chip"><div className="v">{preview.scenarios}</div><div className="k">Cenários</div></div>}
            {preview.cases > 0 && <div className="stat-chip"><div className="v">{preview.cases}</div><div className="k">Casos</div></div>}
            {preview.steps > 0 && <div className="stat-chip"><div className="v">{preview.steps}</div><div className="k">Passos</div></div>}
            {preview.mass > 0 && <div className="stat-chip"><div className="v">{preview.mass}</div><div className="k">Massas</div></div>}
          </div>
          <div className="row-actions mt">
            <Btn onClick={apply} disabled={applying}>{applying ? 'Aplicando...' : 'Aplicar'}</Btn>
            <Btn className="ghost" onClick={async () => { if (await copyText(responseText)) { setCopied('resposta'); setTimeout(() => setCopied(''), 1800); } }}>
              {copied === 'resposta' ? 'Resposta copiada!' : 'Copiar resposta'}
            </Btn>
          </div>
        </div>
      )}

      {success && <div className="highlight" style={{ background: '#e8f7ee', borderColor: '#86efac' }}>{success}</div>}
      {error && <div className="highlight" style={{ background: '#fdecec', borderColor: '#fca5a5' }}>{error}</div>}
    </Modal>
  );
}

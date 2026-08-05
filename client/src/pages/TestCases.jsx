import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDate } from '../api.js';
import { Badge, Btn, Empty, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import AiModal from '../components/AiModal.jsx';
import { CASE_STATUS, CASE_TYPES, EXECUTION_MODES, PRIORITIES, toneFor } from '../utils.js';

const blank = {
  code: '', title: '', priority: 'Média', type: 'Funcional', execution_mode: 'Manual',
  status: 'Pronto', preconditions: '', steps: [{ order: 1, action: '', expected: '' }],
  scenario_id: '', requirement_id: '', strategy_id: '', regression_relevant: 0, automated: 0, automation_tool: ''
};

const routeOf = (type) => ({ 'Funcional': 'funcional', 'API': 'api', 'Fumaça': 'fumaca', 'Regressão': 'funcional' })[type] || 'funcional';

export default function TestCases() {
  const { current } = useApp();
  const navigate = useNavigate();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/test-cases?projectId=' + current.id), [current.id]
  ));

  const [scenarios, setScenarios] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [strategies, setStrategies] = useState([]);

  const [q, setQ] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fReq, setFReq] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [detail, setDetail] = useState(null);

  React.useEffect(() => {
    if (!current.id) return;
    api.get('/scenarios?projectId=' + current.id).then(setScenarios).catch(() => {});
    api.get('/requirements?projectId=' + current.id).then(setReqs).catch(() => {});
    api.get('/strategies?projectId=' + current.id).then(setStrategies).catch(() => {});
  }, [current.id]);

  const filtered = items.filter((it) => {
    const t = `${it.code} ${it.title} ${it.requirement_code}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) &&
      (!fType || it.type === fType) &&
      (!fStatus || it.status === fStatus) &&
      (!fReq || String(it.requirement_id) === String(fReq));
  });

  const openCreate = () => { setForm({ ...blank, steps: [{ order: 1, action: '', expected: '' }] }); setCreating(true); };
  const parseSteps = (s) => {
    if (Array.isArray(s)) return s;
    try { const arr = JSON.parse(s || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; }
  };
  const openEdit = (tc) => {
    const steps = parseSteps(tc.steps);
    setForm({ ...tc, scenario_id: tc.scenario_id || '', requirement_id: tc.requirement_id || '', strategy_id: tc.strategy_id || '', steps: steps.length ? steps : [{ order: 1, action: '', expected: '' }] });
    setEditing(tc);
  };

  const updateStep = (i, key, val) => {
    const steps = form.steps.map((s, idx) => (idx === i ? { ...s, [key]: val } : s));
    setForm({ ...form, steps });
  };
  const addStep = () => setForm({ ...form, steps: [...form.steps, { order: form.steps.length + 1, action: '', expected: '' }] });
  const delStep = (i) => {
    const steps = form.steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx + 1 }));
    setForm({ ...form, steps: steps.length ? steps : [{ order: 1, action: '', expected: '' }] });
  };

  const save = async () => {
    if (!form.title.trim()) return;
    const steps = form.steps.filter((s) => s.action.trim()).map((s, i) => ({ order: i + 1, action: s.action, expected: s.expected }));
    const body = { ...form, steps };
    if (editing) await api.put('/test-cases/' + editing.id, body);
    else await api.post('/test-cases', { ...body, project_id: current.id });
    refresh();
    setCreating(false); setEditing(null);
  };

  const remove = async (tc) => {
    if (!window.confirm(`Excluir o caso ${tc.code} - ${tc.title}?`)) return;
    await api.del('/test-cases/' + tc.id);
    refresh();
    if (detail && detail.id === tc.id) setDetail(null);
  };

  const loadDetail = async (id) => {
    const d = await api.get('/test-cases/' + id);
    setDetail(d);
  };

  const toggleFlag = async (tc, key) => {
    const full = await api.get('/test-cases/' + tc.id);
    await api.put('/test-cases/' + tc.id, { ...full, [key]: full[key] ? 0 : 1 });
    refresh();
    if (detail?.id === tc.id) loadDetail(tc.id);
  };

  const duplicate = async (tc) => {
    await api.post(`/test-cases/${tc.id}/duplicate`);
    refresh();
  };

  const addMass = async () => {
    if (!detail) return;
    if (!window.prompt('Nome da massa de teste (identificação):')) return;
    const name = window.prompt('Nome da massa:');
    if (!name) return;
    const data = window.prompt('Conteúdo da massa (dados):', '') || '';
    const purpose = window.prompt('Objetivo da massa:', '') || '';
    await api.post(`/test-cases/${detail.id}/test-mass`, { name, data, purpose });
    loadDetail(detail.id);
  };

  const delMass = async (m) => {
    if (!window.confirm('Excluir esta massa?')) return;
    await api.del(`/test-cases/test-mass/${m.id}`);
    loadDetail(detail.id);
  };

  return (
    <div>
      <Header
        title="Casos de Teste"
        subtitle="Desenhe os passos e resultados esperados. Cada caso pode ter massa de teste e ser executado na seção Execução."
        actions={<>
          <Btn className="ghost" onClick={() => setAiOpen(true)}>Gerar com IA</Btn>
          <Btn onClick={openCreate}>Novo caso de teste</Btn>
        </>}
      />

      <div className="panel mb">
        <div className="grid3">
          <Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código ou título" /></Field>
          <Field label="Tipo">
            <Select value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="">Todos</option>
              {CASE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Todos</option>
              {CASE_STATUS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Requisito">
          <Select value={fReq} onChange={(e) => setFReq(e.target.value)}>
            <option value="">Todos</option>
            {reqs.map((r) => <option key={r.id} value={r.id}>{r.code} - {r.title}</option>)}
          </Select>
        </Field>
      </div>

      {loading ? <Loading /> : (
        <div className="table-wrap">
          {filtered.length === 0 ? <Empty>Nenhum caso de teste encontrado.</Empty> : (
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th><th>Título</th><th>Tipo</th><th>Modo</th><th>Prioridade</th>
                  <th>Status</th><th>Req.</th><th>Massa</th><th>Exec.</th><th>Último</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((tc) => (
                  <tr key={tc.id}>
                    <td className="cell-title">{tc.source === 'ia' && <Badge tone="blue">IA</Badge>} {tc.code}</td>
                    <td className="cell-title">{tc.title}<div className="cell-sub">{tc.scenario_title}</div></td>
                    <td><Badge tone={tc.type === 'API' ? 'green' : tc.type === 'Fumaça' ? 'amber' : 'blue'}>{tc.type}</Badge></td>
                    <td><Badge tone={tc.execution_mode === 'Automatizado' ? 'blue' : 'gray'}>{tc.execution_mode}</Badge></td>
                    <td><Badge tone={toneFor(tc.priority)}>{tc.priority}</Badge></td>
                    <td><Badge tone={toneFor(tc.status)}>{tc.status}</Badge></td>
                    <td>{tc.requirement_code || '-'}</td>
                    <td>{tc.mass_count > 0 ? <Badge tone="blue">{tc.mass_count}</Badge> : <Badge tone="amber">sem massa</Badge>}</td>
                    <td>{tc.executions_count}</td>
                    <td>{tc.last_result ? <Badge tone={toneFor(tc.last_result)}>{tc.last_result}</Badge> : '-'}</td>
                    <td>
                      <div className="row-actions">
                        <Btn className="ghost small" onClick={() => loadDetail(tc.id)}>Detalhes</Btn>
                        <Btn className="ghost small" onClick={() => openEdit(tc)}>Editar</Btn>
                        <Btn className="ghost small" onClick={() => duplicate(tc)} title="Duplicar">Duplicar</Btn>
                        <Btn className="danger small" onClick={() => remove(tc)}>Excluir</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={creating || editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Editar caso de teste' : 'Novo caso de teste'} width={760}>
        <div className="grid2">
          <Field label="Código"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="auto (ex.: TC-001)" /></Field>
          <Field label="Título" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        </div>
        <div className="grid3">
          <Field label="Tipo">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {CASE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Modo de execução">
            <Select value={form.execution_mode} onChange={(e) => setForm({ ...form, execution_mode: e.target.value })}>
              {EXECUTION_MODES.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid3">
          <Field label="Cenário">
            <Select value={form.scenario_id} onChange={(e) => setForm({ ...form, scenario_id: e.target.value })}>
              <option value="">Nenhum</option>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </Select>
          </Field>
          <Field label="Requisito">
            <Select value={form.requirement_id} onChange={(e) => setForm({ ...form, requirement_id: e.target.value })}>
              <option value="">Nenhum</option>
              {reqs.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
            </Select>
          </Field>
          <Field label="Estratégia">
            <Select value={form.strategy_id} onChange={(e) => setForm({ ...form, strategy_id: e.target.value })}>
              <option value="">Nenhuma</option>
              {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Pré-condições"><Textarea value={form.preconditions} onChange={(e) => setForm({ ...form, preconditions: e.target.value })} /></Field>

        <Field label={`Passos de teste (${form.steps.length})`}>
          {form.steps.map((s, i) => (
            <div key={i} className="step-card" style={{ alignItems: 'center' }}>
              <div className="step-num">{s.order}</div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input value={s.action} onChange={(e) => updateStep(i, 'action', e.target.value)} placeholder="Ação a executar" />
                <Input value={s.expected} onChange={(e) => updateStep(i, 'expected', e.target.value)} placeholder="Resultado esperado" />
              </div>
              <Btn className="danger small" onClick={() => delStep(i)}>Remover</Btn>
            </div>
          ))}
          <Btn className="ghost small" onClick={addStep}>+ Adicionar passo</Btn>
        </Field>
        <div className="modal-foot-inline"><Btn onClick={save}>{editing ? 'Salvar' : 'Criar'}</Btn></div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`${detail?.code} - ${detail?.title}`} width={820}>
        {detail && (
          <>
            <div className="grid2">
              <div className="kv"><span className="k">Tipo</span><span className="v"><Badge tone="blue">{detail.type}</Badge> <Badge tone={detail.execution_mode === 'Automatizado' ? 'blue' : 'gray'}>{detail.execution_mode}</Badge></span></div>
              <div className="kv"><span className="k">Prioridade</span><span className="v"><Badge tone={toneFor(detail.priority)}>{detail.priority}</Badge></span></div>
              <div className="kv"><span className="k">Requisito</span><span className="v">{detail.requirement_code ? `${detail.requirement_code} - ${detail.requirement_title}` : '-'}</span></div>
              <div className="kv"><span className="k">Cenário</span><span className="v">{detail.scenario_title || '-'}</span></div>
              <div className="kv"><span className="k">Estratégia</span><span className="v">{detail.strategy_name || '-'}</span></div>
              <div className="kv"><span className="k">Status</span><span className="v"><Badge tone={toneFor(detail.status)}>{detail.status}</Badge></span></div>
            </div>
            <div className="row-actions mb mt">
              <Btn className="small" onClick={() => navigate(`/execucao/${routeOf(detail.type)}?case=${detail.id}`)}>Executar agora</Btn>
              <Btn className="ghost small" onClick={() => toggleFlag(detail, 'regression_relevant')}>{detail.regression_relevant ? 'Remover da regressão' : 'Marcar p/ regressão'}</Btn>
              <Btn className="ghost small" onClick={() => toggleFlag(detail, 'automated')}>{detail.automated ? 'Desmarcar automatizado' : 'Marcar automatizado'}</Btn>
            </div>
            {detail.preconditions && <div className="highlight"><strong>Pré-condições:</strong> {detail.preconditions}</div>}

            <h3>Passos</h3>
            {detail.steps.length === 0 && <Empty>Este caso não possui passos.</Empty>}
            {detail.steps.map((s, i) => (
              <div className="step-card" key={i}>
                <div className="step-num">{s.order}</div>
                <div style={{ flex: 1 }}>
                  <div><strong>Ação:</strong> {s.action || '-'}</div>
                  <div className="muted small"><strong>Esperado:</strong> {s.expected || '-'}</div>
                </div>
              </div>
            ))}

            <h3>Massa de teste</h3>
            {detail.test_mass.length === 0 && <Empty>Nenhuma massa cadastrada.</Empty>}
            {detail.test_mass.map((m) => (
              <div className="step-card" key={m.id}>
                <div style={{ flex: 1 }}>
                  <div className="cell-title">{m.name}</div>
                  <div className="muted small">{m.purpose}</div>
                  {m.data && <div className="mono-block mt">{m.data}</div>}
                </div>
                <Btn className="danger small" onClick={() => delMass(m)}>Excluir</Btn>
              </div>
            ))}
            <Btn className="ghost small" onClick={addMass}>+ Adicionar massa</Btn>

            <h3>Execuções deste caso</h3>
            {detail.executions.length === 0 && <Empty>Nenhuma execução registrada.</Empty>}
            <table className="table">
              <thead><tr><th>Data</th><th>Ambiente</th><th>Resultado</th><th>Bugs</th><th /></tr></thead>
              <tbody>
                {detail.executions.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{fmtDate(e.execution_date)}</td>
                    <td>{e.environment}</td>
                    <td><Badge tone={toneFor(e.result)}>{e.result}</Badge></td>
                    <td>{e.bugs_count}</td>
                    <td><Btn className="ghost small" onClick={() => navigate(`/execucao/${routeOf(detail.type)}?case=${detail.id}&exec=${e.id}`)}>Ver</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal>

      <AiModal open={aiOpen} onClose={() => setAiOpen(false)} initialScope="casos" onApplied={refresh} />
    </div>
  );
}

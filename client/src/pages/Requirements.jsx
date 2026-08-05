import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Field, Header, Input, Loading, Modal, Select, Textarea, useAction, useList } from '../components/ui.jsx';
import AiModal from '../components/AiModal.jsx';
import { PRIORITIES, REQUIREMENT_STATUS, toneFor } from '../utils.js';

export default function Requirements() {
  const { current, currentTask, taskId } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/requirements?taskId=' + taskId), [taskId]
  ));

  const [aiOpen, setAiOpen] = useState(false);
  const [aiCompleteOpen, setAiCompleteOpen] = useState(false);
  const [q, setQ] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ code: '', title: '', description: '', priority: 'Média', status: 'Ativo', module: '' });
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState('');
  const [editingRule, setEditingRule] = useState(null);
  const [ruleText, setRuleText] = useState('');
  const [error, run] = useAction();

  const loadDetail = async (id) => {
    const d = await api.get('/requirements/' + id);
    setDetail(d);
    setRules(d.business_rules || []);
    setNewRule('');
  };

  const filtered = items.filter((r) => {
    const t = `${r.code} ${r.title} ${r.module}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) &&
      (!fPriority || r.priority === fPriority) &&
      (!fStatus || r.status === fStatus);
  });

  const openCreate = () => { setForm({ code: '', title: '', description: '', priority: 'Média', status: 'Ativo', module: '' }); setCreating(true); };
  const openEdit = (r) => { setForm(r); setEditing(r); };

  const save = async () => {
    if (!form.title.trim()) return;
    await run(async () => {
      if (editing) await api.put('/requirements/' + editing.id, form);
      else await api.post('/requirements', { ...form, project_id: current.id, task_id: taskId });
      refresh();
      setCreating(false); setEditing(null);
    });
  };

  const remove = async (r) => {
    if (!window.confirm(`Excluir o requisito ${r.code}?`)) return;
    await run(async () => {
      await api.del('/requirements/' + r.id);
      refresh();
    });
  };

  const addRule = async () => {
    if (!newRule.trim()) return;
    await run(async () => {
      await api.post(`/requirements/${detail.id}/business-rules`, { rule: newRule.trim() });
      setNewRule('');
      loadDetail(detail.id);
    });
  };

  const saveRule = async () => {
    await run(async () => {
      await api.put(`/requirements/business-rules/${editingRule.id}`, { rule: ruleText, category: editingRule.category });
      setEditingRule(null);
      loadDetail(detail.id);
    });
  };

  const delRule = async (rid) => {
    if (!window.confirm('Excluir esta regra de negócio?')) return;
    await run(async () => {
      await api.del(`/requirements/business-rules/${rid}`);
      loadDetail(detail.id);
    });
  };

  return (
    <div>
      <Header
        title="Requisitos"
        actions={<>
          <Btn className="ghost" onClick={() => setAiOpen(true)}>Gerar com IA</Btn>
          <Btn className="ghost" onClick={() => setAiCompleteOpen(true)}>Completar com IA</Btn>
          <Btn onClick={openCreate}>Novo requisito</Btn>
        </>}
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="panel mb">
        <div className="grid3">
          <Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, título ou módulo" /></Field>
          <Field label="Prioridade">
            <Select value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
              <option value="">Todas</option>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Todos</option>
              {REQUIREMENT_STATUS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
      </div>

      {loading ? <Loading /> : (
        <div className="table-wrap">
          {filtered.length === 0 ? <Empty>Nenhum requisito encontrado.</Empty> : (
            <table className="table">
              <thead><tr><th>Código</th><th>Título</th><th>Módulo</th><th>Prioridade</th><th>Status</th><th>Regras</th><th>Cenários</th><th>Casos</th><th /></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title">{r.source === 'ia' && <Badge tone="blue">IA</Badge>} {r.code}</td>
                    <td className="cell-title">{r.title}<div className="cell-sub">{r.description}</div></td>
                    <td>{r.module || '-'}</td>
                    <td><Badge tone={toneFor(r.priority)}>{r.priority}</Badge></td>
                    <td><Badge tone={toneFor(r.status)}>{r.status}</Badge></td>
                    <td>{r.rules_count}</td>
                    <td>{r.scenarios_count}</td>
                    <td>{r.cases_count}</td>
                    <td>
                      <div className="row-actions">
                        <Btn className="ghost small" onClick={() => loadDetail(r.id)}>Detalhes</Btn>
                        <Btn className="ghost small" onClick={() => openEdit(r)}>Editar</Btn>
                        <Btn className="danger small" onClick={() => remove(r)}>Excluir</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={creating || editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Editar requisito' : 'Novo requisito'} width={560}>
        <div className="grid2">
          <Field label="Código">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="auto (ex.: REQ-001)" />
          </Field>
          {editing && <Field label="Módulo"><Input value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} placeholder="Ex.: Login" /></Field>}
        </div>
        <Field label="Título" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Descrição"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        {editing ? (
          <div className="grid2">
            <Field label="Prioridade">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {REQUIREMENT_STATUS.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
        ) : (
          <div className="highlight">
            Módulo, prioridade, status e regras de negócio serão definidos pela IA: após criar, use <strong>Gerar com IA → Completar requisitos existentes</strong>.
          </div>
        )}
        <div className="modal-foot-inline"><Btn onClick={save}>{editing ? 'Salvar' : 'Criar'}</Btn></div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`${detail?.code} - ${detail?.title}`} width={760}>
        {detail && (
          <>
            <div className="kv"><span className="k">Descrição</span><span className="v">{detail.description || '-'}</span></div>
            <div className="kv"><span className="k">Módulo</span><span className="v">{detail.module || '-'}</span></div>
            <div className="kv"><span className="k">Prioridade</span><span className="v"><Badge tone={toneFor(detail.priority)}>{detail.priority}</Badge></span></div>
            <div className="kv"><span className="k">Status</span><span className="v"><Badge tone={toneFor(detail.status)}>{detail.status}</Badge></span></div>
            <div className="kv"><span className="k">Execuções vinculadas</span><span className="v">{detail.executions_count}</span></div>

            <h3>Regras de negócio</h3>
            {rules.length === 0 && <Empty>Nenhuma regra cadastrada.</Empty>}
            {rules.map((r) => (
              <div className="step-card" key={r.id}>
                <div style={{ flex: 1 }}>
                  <div>{r.rule}</div>
                  <div className="muted small">Categoria: {r.category}</div>
                </div>
                {editingRule?.id === r.id ? (
                  <div style={{ width: '60%' }}>
                    <Textarea value={ruleText} onChange={(e) => setRuleText(e.target.value)} />
                    <div className="row-actions mt">
                      <Btn className="ghost small" onClick={() => setEditingRule(null)}>Cancelar</Btn>
                      <Btn className="small" onClick={saveRule}>Salvar</Btn>
                    </div>
                  </div>
                ) : (
                  <div className="row-actions">
                    <Btn className="ghost small" onClick={() => { setEditingRule(r); setRuleText(r.rule); }}>Editar</Btn>
                    <Btn className="danger small" onClick={() => delRule(r.id)}>Excluir</Btn>
                  </div>
                )}
              </div>
            ))}
            <div className="grid2" style={{ alignItems: 'end' }}>
              <Field label="Nova regra de negócio">
                <Textarea value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Descreva a regra que o teste deve validar..." />
              </Field>
              <div style={{ marginBottom: 14 }}><Btn onClick={addRule}>Adicionar regra</Btn></div>
            </div>

            <h3>Casos de teste vinculados</h3>
            {detail.test_cases.length === 0 && <Empty>Nenhum caso de teste criado para este requisito. Crie na seção Design.</Empty>}
            <table className="table">
              <thead><tr><th>Código</th><th>Título</th><th>Tipo</th><th>Status</th></tr></thead>
              <tbody>
                {detail.test_cases.map((tc) => (
                  <tr key={tc.id}>
                    <td className="cell-title">{tc.code}</td>
                    <td>{tc.title}</td>
                    <td><Badge tone="blue">{tc.type}</Badge></td>
                    <td><Badge tone={toneFor(tc.status)}>{tc.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal>

      <AiModal open={aiOpen} onClose={() => setAiOpen(false)} initialScope="requisitos" onApplied={refresh} />
      <AiModal open={aiCompleteOpen} onClose={() => setAiCompleteOpen(false)} initialScope="completar" onApplied={refresh} />
    </div>
  );
}

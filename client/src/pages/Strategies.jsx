import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Field, Header, Input, Loading, Modal, Select, Textarea, useAction, useList } from '../components/ui.jsx';
import AiModal from '../components/AiModal.jsx';
import { toneFor } from '../utils.js';

const blank = { name: '', description: '', approach: '', risk_scope: '', entry_criteria: '', exit_criteria: '', status: 'Ativo', requirement_id: '' };

export default function Strategies() {
  const { current, taskId } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/strategies?taskId=' + taskId), [taskId]
  ));
  const [aiOpen, setAiOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [detail, setDetail] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [error, run] = useAction();

  React.useEffect(() => {
    if (taskId) api.get('/requirements?taskId=' + taskId).then(setReqs).catch(() => {});
  }, [taskId]);

  const openCreate = () => { setForm({ ...blank }); setCreating(true); };
  const openEdit = (s) => { setForm({ ...s, requirement_id: s.requirement_id || '' }); setEditing(s); };

  const save = async () => {
    if (!form.name.trim()) return;
    await run(async () => {
      if (editing) await api.put('/strategies/' + editing.id, form);
      else await api.post('/strategies', { ...form, project_id: current.id, task_id: taskId });
      refresh();
      setCreating(false); setEditing(null);
    });
  };

  const remove = async (s) => {
    if (!window.confirm(`Excluir a estratégia "${s.name}"?`)) return;
    await run(async () => {
      await api.del('/strategies/' + s.id);
      refresh();
    });
  };

  const shortName = (s) => {
    let n = s.name || '';
    n = n.replace(/^Estratégia de [Tt]este\s*[-–—]\s*/i, '');
    if (s.requirement_code) {
      n = n.replace(new RegExp(`^${s.requirement_code}\\s*[-–—]\\s*`), '');
    }
    return n.trim() || s.name;
  };

  return (
    <div>
      <Header
        title="Estratégia"
        actions={<>
          <Btn className="ghost" onClick={() => setAiOpen(true)}>Gerar com IA</Btn>
          <Btn onClick={openCreate}>Nova estratégia</Btn>
        </>}
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty>Nenhuma estratégia nesta tarefa.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Requisito</th>
                <th>Status</th>
                <th>Casos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="cell-title">
                    {s.source === 'ia' && <Badge tone="blue">IA</Badge>}{' '}
                    {shortName(s)}
                  </td>
                  <td>{s.requirement_code || '—'}</td>
                  <td><Badge tone={toneFor(s.status)}>{s.status}</Badge></td>
                  <td>{s.cases_count}</td>
                  <td>
                    <div className="row-actions">
                      <Btn className="ghost small" onClick={() => setDetail(s)}>Ver</Btn>
                      <Btn className="ghost small" onClick={() => openEdit(s)}>Editar</Btn>
                      <Btn className="danger small" onClick={() => remove(s)}>Excluir</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating || editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Editar estratégia' : 'Nova estratégia'} width={620}>
        <div className="grid2">
          <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Requisito vinculado">
            <Select value={form.requirement_id} onChange={(e) => setForm({ ...form, requirement_id: e.target.value })}>
              <option value="">Sem requisito vinculado</option>
              {reqs.map((r) => <option key={r.id} value={r.id}>{r.code} - {r.title}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Descrição"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Abordagem">
          <Textarea value={form.approach} onChange={(e) => setForm({ ...form, approach: e.target.value })} placeholder="Ex.: caixa preta com foco em risco..." />
        </Field>
        <Field label="Riscos / Escopo">
          <Textarea value={form.risk_scope} onChange={(e) => setForm({ ...form, risk_scope: e.target.value })} />
        </Field>
        <div className="grid2">
          <Field label="Critérios de entrada">
            <Textarea value={form.entry_criteria} onChange={(e) => setForm({ ...form, entry_criteria: e.target.value })} />
          </Field>
          <Field label="Critérios de saída">
            <Textarea value={form.exit_criteria} onChange={(e) => setForm({ ...form, exit_criteria: e.target.value })} />
          </Field>
        </div>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option>Ativo</option><option>Arquivo</option>
          </Select>
        </Field>
        <div className="modal-foot-inline"><Btn onClick={save}>{editing ? 'Salvar' : 'Criar'}</Btn></div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name} width={640}>
        {detail && (
          <div className="dl">
            <dt>Requisito</dt><dd>{detail.requirement_code ? `${detail.requirement_code} — ${detail.requirement_title}` : '—'}</dd>
            <dt>Descrição</dt><dd>{detail.description || '—'}</dd>
            <dt>Abordagem</dt><dd>{detail.approach || '—'}</dd>
            <dt>Riscos / Escopo</dt><dd>{detail.risk_scope || '—'}</dd>
            <dt>Critérios de entrada</dt><dd>{detail.entry_criteria || '—'}</dd>
            <dt>Critérios de saída</dt><dd>{detail.exit_criteria || '—'}</dd>
            <dt>Status</dt><dd><Badge tone={toneFor(detail.status)}>{detail.status}</Badge></dd>
            <dt>Casos</dt><dd>{detail.cases_count ?? 0}</dd>
          </div>
        )}
      </Modal>

      <AiModal open={aiOpen} onClose={() => setAiOpen(false)} initialScope="estrategias" onApplied={refresh} />
    </div>
  );
}

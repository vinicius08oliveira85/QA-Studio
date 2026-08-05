import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import AiModal from '../components/AiModal.jsx';
import { toneFor } from '../utils.js';

const blank = { name: '', description: '', approach: '', risk_scope: '', entry_criteria: '', exit_criteria: '', status: 'Ativo', requirement_id: '' };

export default function Strategies() {
  const { current } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/strategies?projectId=' + current.id), [current.id]
  ));
  const [aiOpen, setAiOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [detail, setDetail] = useState(null);
  const [reqs, setReqs] = useState([]);

  React.useEffect(() => {
    if (current.id) api.get('/requirements?projectId=' + current.id).then(setReqs).catch(() => {});
  }, [current.id]);

  const openCreate = () => { setForm({ ...blank }); setCreating(true); };
  const openEdit = (s) => { setForm({ ...s, requirement_id: s.requirement_id || '' }); setEditing(s); };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editing) await api.put('/strategies/' + editing.id, form);
    else await api.post('/strategies', { ...form, project_id: current.id });
    refresh();
    setCreating(false); setEditing(null);
  };

  const remove = async (s) => {
    if (!window.confirm(`Excluir a estratégia "${s.name}"?`)) return;
    await api.del('/strategies/' + s.id);
    refresh();
  };

  return (
    <div>
      <Header
        title="Estratégia de Teste"
        subtitle="Defina a abordagem, escopo de risco e critérios de entrada/saída que orientam os casos de teste."
        actions={<>
          <Btn className="ghost" onClick={() => setAiOpen(true)}>Gerar com IA</Btn>
          <Btn onClick={openCreate}>Nova estratégia</Btn>
        </>}
      />

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty>Crie uma estratégia de teste para documentar a abordagem do projeto.</Empty>
      ) : (
        <div className="cards">
          {items.map((s) => (
            <div className="card" key={s.id}>
              <div className="kv"><span className="k">Nome</span><span className="v">{s.source === 'ia' && <Badge tone="blue">IA</Badge>} {s.name}</span></div>
              <div className="kv"><span className="k">Requisito</span><span className="v">{s.requirement_code ? `${s.requirement_code} - ${s.requirement_title}` : '-'}</span></div>
              <div className="kv"><span className="k">Status</span><span className="v"><Badge tone={toneFor(s.status)}>{s.status}</Badge></span></div>
              <div className="kv"><span className="k">Casos vinculados</span><span className="v">{s.cases_count}</span></div>
              <div className="row-actions mt">
                <Btn className="ghost small" onClick={() => setDetail(s)}>Ver</Btn>
                <Btn className="ghost small" onClick={() => openEdit(s)}>Editar</Btn>
                <Btn className="danger small" onClick={() => remove(s)}>Excluir</Btn>
              </div>
            </div>
          ))}
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
          <Textarea value={form.approach} onChange={(e) => setForm({ ...form, approach: e.target.value })} placeholder="Ex.: caixa preta com foco em risco, baseada em fluxos críticos..." />
        </Field>
        <Field label="Riscos / Escopo">
          <Textarea value={form.risk_scope} onChange={(e) => setForm({ ...form, risk_scope: e.target.value })} placeholder="Áreas de maior risco e o que está dentro/fora do escopo..." />
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
            <dt>Requisito</dt><dd>{detail.requirement_code ? `${detail.requirement_code} - ${detail.requirement_title}` : '-'}</dd>
            <dt>Descrição</dt><dd>{detail.description || '-'}</dd>
            <dt>Abordagem</dt><dd>{detail.approach || '-'}</dd>
            <dt>Riscos / Escopo</dt><dd>{detail.risk_scope || '-'}</dd>
            <dt>Critérios de entrada</dt><dd>{detail.entry_criteria || '-'}</dd>
            <dt>Critérios de saída</dt><dd>{detail.exit_criteria || '-'}</dd>
            <dt>Status</dt><dd><Badge tone={toneFor(detail.status)}>{detail.status}</Badge></dd>
          </div>
        )}
      </Modal>

      <AiModal open={aiOpen} onClose={() => setAiOpen(false)} initialScope="estrategias" onApplied={refresh} />
    </div>
  );
}

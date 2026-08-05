import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import AiModal from '../components/AiModal.jsx';
import { toneFor } from '../utils.js';

export default function Scenarios() {
  const { current } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/scenarios?projectId=' + current.id), [current.id]
  ));
  const [aiOpen, setAiOpen] = useState(false);
  const [reqs, setReqs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ requirement_id: '', title: '', description: '', preconditions: '' });

  React.useEffect(() => {
    if (current.id) api.get('/requirements?projectId=' + current.id).then(setReqs).catch(() => {});
  }, [current.id]);

  const openCreate = () => { setForm({ requirement_id: '', title: '', description: '', preconditions: '' }); setCreating(true); };
  const openEdit = (s) => { setForm({ requirement_id: s.requirement_id || '', title: s.title, description: s.description, preconditions: s.preconditions }); setEditing(s); };

  const save = async () => {
    if (!form.title.trim()) return;
    if (editing) await api.put('/scenarios/' + editing.id, form);
    else await api.post('/scenarios', { ...form, project_id: current.id });
    refresh();
    setCreating(false); setEditing(null);
  };

  const remove = async (s) => {
    if (!window.confirm(`Excluir o cenário "${s.title}"?`)) return;
    await api.del('/scenarios/' + s.id);
    refresh();
  };

  const openDetail = async (s) => {
    const d = await api.get('/scenarios/' + s.id);
    setDetail(d);
  };

  return (
    <div>
      <Header
        title="Cenários de Teste"
        subtitle="Cenários descrevem situações de uso; cada um reúne casos de teste."
        actions={<>
          <Btn className="ghost" onClick={() => setAiOpen(true)}>Gerar com IA</Btn>
          <Btn onClick={openCreate}>Novo cenário</Btn>
        </>}
      />

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty>Crie cenários a partir dos requisitos para organizar os casos de teste.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Título</th><th>Requisito</th><th>Casos</th><th /></tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="cell-title">{s.source === 'ia' && <Badge tone="blue">IA</Badge>} {s.title}<div className="cell-sub">{s.description}</div></td>
                  <td>{s.requirement_code ? <span>{s.requirement_code} - {s.requirement_title}</span> : '-'}</td>
                  <td>{s.cases_count > 0 ? <Badge tone="blue">{s.cases_count} caso(s)</Badge> : <Badge tone="amber">sem casos</Badge>}</td>
                  <td>
                    <div className="row-actions">
                      <Btn className="ghost small" onClick={() => openDetail(s)}>Ver</Btn>
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

      <Modal open={creating || editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Editar cenário' : 'Novo cenário'}>
        <Field label="Requisito">
          <Select value={form.requirement_id} onChange={(e) => setForm({ ...form, requirement_id: e.target.value })}>
            <option value="">Sem requisito vinculado</option>
            {reqs.map((r) => <option key={r.id} value={r.id}>{r.code} - {r.title}</option>)}
          </Select>
        </Field>
        <Field label="Título" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Descrição"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Pré-condições"><Textarea value={form.preconditions} onChange={(e) => setForm({ ...form, preconditions: e.target.value })} /></Field>
        <div className="modal-foot-inline"><Btn onClick={save}>{editing ? 'Salvar' : 'Criar'}</Btn></div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title} width={720}>
        {detail && (
          <>
            <div className="dl mb">
              <dt>Requisito</dt><dd>{detail.requirement_code ? `${detail.requirement_code} - ${detail.requirement_title}` : '-'}</dd>
              <dt>Descrição</dt><dd>{detail.description || '-'}</dd>
              <dt>Pré-condições</dt><dd>{detail.preconditions || '-'}</dd>
            </div>
            <h3>Casos de teste do cenário</h3>
            {detail.test_cases.length === 0 ? <Empty>Nenhum caso de teste neste cenário.</Empty> : (
              <table className="table">
                <thead><tr><th>Código</th><th>Título</th><th>Tipo</th><th>Prioridade</th><th>Status</th></tr></thead>
                <tbody>
                  {detail.test_cases.map((tc) => (
                    <tr key={tc.id}>
                      <td className="cell-title">{tc.code}</td>
                      <td>{tc.title}</td>
                      <td><Badge tone="blue">{tc.type}</Badge></td>
                      <td><Badge tone={toneFor(tc.priority)}>{tc.priority}</Badge></td>
                      <td><Badge tone={toneFor(tc.status)}>{tc.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Modal>

      <AiModal open={aiOpen} onClose={() => setAiOpen(false)} initialScope="cenarios" onApplied={refresh} />
    </div>
  );
}

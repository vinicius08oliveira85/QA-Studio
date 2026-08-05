import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api, fmtDateShort } from '../api.js';
import { Btn, Empty, Field, Header, Input, Loading, Modal, Textarea, useList } from '../components/ui.jsx';
import AiModal from '../components/AiModal.jsx';

export default function TestMass() {
  const { taskId } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/test-cases/mass/all?taskId=' + taskId), [taskId]
  ));
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [form, setForm] = useState({ name: '', data: '', purpose: '' });

  const filtered = items.filter((m) =>
    `${m.name} ${m.test_case_code} ${m.test_case_title} ${m.data} ${m.purpose}`.toLowerCase().includes(q.toLowerCase())
  );

  const openEdit = (m) => {
    setForm({ name: m.name || '', data: m.data || '', purpose: m.purpose || '' });
    setEditing(m);
  };

  const save = async () => {
    if (!form.name.trim() || !editing) return;
    await api.put(`/test-cases/test-mass/${editing.id}`, form);
    refresh();
    setEditing(null);
  };

  const del = async (m) => {
    if (!window.confirm('Excluir esta massa?')) return;
    await api.del(`/test-cases/test-mass/${m.id}`);
    refresh();
  };

  return (
    <div>
      <Header
        title="Massa"
        actions={<Btn className="ghost" onClick={() => setAiOpen(true)}>Gerar com IA</Btn>}
      />

      <div className="toolbar">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome, caso ou dados..." />
      </div>

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty>Nenhuma massa nesta tarefa.</Empty>
      ) : filtered.length === 0 ? (
        <Empty>Nenhum resultado para a busca.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Caso</th>
                <th>Objetivo</th>
                <th>Dados</th>
                <th>Criada</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="cell-title">{m.name}</td>
                  <td>
                    <span className="cell-title">{m.test_case_code || '—'}</span>
                    {m.test_case_title && <div className="cell-sub">{m.test_case_title}</div>}
                  </td>
                  <td className="small">{m.purpose || '—'}</td>
                  <td>
                    {m.data
                      ? <div className="mono cell-sub" title={m.data}>{m.data}</div>
                      : '—'}
                  </td>
                  <td className="small">{fmtDateShort(m.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      <Btn className="ghost small" onClick={() => openEdit(m)}>Editar</Btn>
                      <Btn className="danger small" onClick={() => del(m)}>Excluir</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar massa" width={560}>
        <Field label="Nome" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Objetivo">
          <Textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        </Field>
        <Field label="Dados">
          <Textarea className="mono" rows={5} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </Field>
        <div className="modal-foot-inline"><Btn onClick={save}>Salvar</Btn></div>
      </Modal>

      <AiModal open={aiOpen} onClose={() => setAiOpen(false)} initialScope="casos" onApplied={refresh} />
    </div>
  );
}

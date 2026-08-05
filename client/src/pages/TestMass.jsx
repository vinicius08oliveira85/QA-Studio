import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api, fmtDate } from '../api.js';
import { Badge, Btn, Empty, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';

export default function TestMass() {
  const { current } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/test-cases/mass/all?projectId=' + current.id), [current.id]
  ));
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', data: '', purpose: '' });

  const filtered = items.filter((m) => `${m.name} ${m.test_case_code} ${m.test_case_title} ${m.data}`.toLowerCase().includes(q.toLowerCase()));

  const openEdit = (m) => setForm({ name: m.name, data: m.data, purpose: m.purpose });

  const save = async () => {
    if (!form.name.trim()) return;
    await api.put(`/test-cases/test-mass/${editing.id}`, form);
    refresh();
    setEditing(null);
  };

  const del = async (m) => {
    if (!window.confirm('Excluir esta massa de teste?')) return;
    await api.del(`/test-cases/test-mass/${m.id}`);
    refresh();
  };

  return (
    <div>
      <Header
        title="Massa de Teste"
        subtitle="Central de dados de teste utilizados pelos casos: usuários, payloads, valores de borda, etc."
      />

      <div className="panel mb">
        <Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome da massa, caso ou conteúdo" /></Field>
      </div>

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty>Nenhuma massa cadastrada. Adicione massa aos casos de teste na seção Casos de Teste.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nome</th><th>Caso de teste</th><th>Objetivo</th><th>Dados</th><th>Criada</th><th /></tr></thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="cell-title">{m.name}</td>
                  <td>{m.test_case_code} - {m.test_case_title}</td>
                  <td className="small">{m.purpose || '-'}</td>
                  <td>{m.data ? <div className="mono-block">{m.data}</div> : '-'}</td>
                  <td className="small">{fmtDate(m.created_at)}</td>
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar massa de teste" width={560}>
        <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Objetivo"><Textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
        <Field label="Dados (conteúdo da massa)"><Textarea className="mono" rows={5} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></Field>
        <div className="modal-foot-inline"><Btn onClick={save}>Salvar</Btn></div>
      </Modal>
    </div>
  );
}

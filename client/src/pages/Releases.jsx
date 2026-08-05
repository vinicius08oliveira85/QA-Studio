import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import { RELEASE_STATUS, toneFor } from '../utils.js';

export default function Releases() {
  const { current } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/releases?projectId=' + current.id), [current.id]
  ));
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', version: '', release_date: '', status: 'Em Homologação', notes: '' });

  const save = async () => {
    if (!form.name.trim()) return;
    await api.post('/releases', { ...form, project_id: current.id });
    refresh();
    setCreating(false);
    setForm({ name: '', version: '', release_date: '', status: 'Em Homologação', notes: '' });
  };

  const remove = async (r) => {
    if (!window.confirm(`Excluir a release "${r.name}"?`)) return;
    await api.del('/releases/' + r.id);
    refresh();
  };

  return (
    <div>
      <Header
        title="Homologação / Liberação"
        subtitle="Agrupe requisitos, acompanhe a cobertura e decida pela liberação da release."
        actions={<Btn onClick={() => setCreating(true)}>Nova release</Btn>}
      />

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty>Crie uma release para consolidar requisitos, execuções e bugs na decisão de liberação.</Empty>
      ) : (
        <div className="cards">
          {items.map((r) => (
            <div className="card" key={r.id}>
              <div className="kv"><span className="k">Release</span><span className="v"><Link className="link-plain" to={`/homologacao/${r.id}`}>{r.name}</Link></span></div>
              <div className="kv"><span className="k">Versão</span><span className="v">{r.version || '-'}</span></div>
              <div className="kv"><span className="k">Status</span><span className="v"><Badge tone={toneFor(r.status)}>{r.status}</Badge></span></div>
              <div className="kv"><span className="k">Requisitos</span><span className="v">{r.requirements_count}</span></div>
              <div className="kv"><span className="k">Bugs abertos</span><span className="v">{r.open_bugs > 0 ? <Badge tone="red">{r.open_bugs}</Badge> : <Badge tone="green">0</Badge>}</span></div>
              <div className="row-actions mt">
                <Link className="btn ghost small" to={`/homologacao/${r.id}`}>Abrir</Link>
                <Btn className="danger small" onClick={() => remove(r)}>Excluir</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nova release" width={520}>
        <div className="grid2">
          <Field label="Nome" required><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Release 1.0" /></Field>
          <Field label="Versão"><Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.0.0" /></Field>
        </div>
        <div className="grid2">
          <Field label="Data de liberação"><Input type="date" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {RELEASE_STATUS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Observações"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div className="modal-foot-inline"><Btn onClick={save}>Criar</Btn></div>
      </Modal>
    </div>
  );
}

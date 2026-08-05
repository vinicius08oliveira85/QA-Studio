import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Field, Header, Input, Loading, Modal, Textarea, useList } from '../components/ui.jsx';
import EnvSelect from '../components/EnvSelect.jsx';
import { RUN_STATUS, toneFor } from '../utils.js';

export default function Regression() {
  const { current } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/regressions?projectId=' + current.id), [current.id]
  ));
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', environment: 'Homologação', notes: '' });
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.name.trim()) return;
    try {
      await api.post('/regressions', { ...form, project_id: current.id });
      refresh();
      setCreating(false);
      setError('');
      setForm({ name: '', environment: 'Homologação', notes: '' });
    } catch (e) { setError(e.message || 'Falha ao criar regressão.'); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Excluir a regressão "${r.name}"?`)) return;
    await api.del('/regressions/' + r.id);
    refresh();
  };

  const finish = async (r) => {
    if (!window.confirm('Marcar regressão como Concluída?')) return;
    await api.put('/regressions/' + r.id, { ...r, status: 'Concluída' });
    refresh();
  };

  return (
    <div>
      <Header
        title="Regressão"
        actions={<Btn onClick={() => setCreating(true)}>Nova regressão</Btn>}
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty>Crie uma rodada de regressão. Dica: marque casos como "regressão" na seção Casos de Teste.</Empty>
      ) : (
        <div className="cards">
          {items.map((r) => {
            const done = r.passed + r.failed + r.blocked;
            const pct = r.total_cases ? Math.round((done / r.total_cases) * 100) : 0;
            return (
              <div className="card" key={r.id}>
                <div className="kv"><span className="k">Nome</span><span className="v"><Link className="link-plain" to={`/regressao/${r.id}`}>{r.name}</Link></span></div>
                <div className="kv"><span className="k">Status</span><span className="v"><Badge tone={toneFor(r.status)}>{r.status}</Badge></span></div>
                <div className="kv"><span className="k">Ambiente</span><span className="v">{r.environment}</span></div>
                <div className="small muted">Casos: {r.total_cases} | Passou: {r.passed} | Falhou: {r.failed} | Bloqueado: {r.blocked}</div>
                <div className="progress"><div style={{ width: `${pct}%` }} /></div>
                <div className="row-actions mt">
                  <Link className="btn ghost small" to={`/regressao/${r.id}`}>Abrir</Link>
                  {r.status === 'Em Andamento' && <Btn className="ghost small" onClick={() => finish(r)}>Concluir</Btn>}
                  <Btn className="danger small" onClick={() => remove(r)}>Excluir</Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nova regressão" width={520}>
        <Field label="Nome" required><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Regressão Release 1.1" /></Field>
        <Field label="Ambiente">
          <EnvSelect value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} />
        </Field>
        <Field label="Observações"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div className="modal-foot-inline"><Btn onClick={save}>Criar</Btn></div>
      </Modal>
    </div>
  );
}

import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import { AUTOMATION_STATUS, toneFor } from '../utils.js';

export default function Automations() {
  const { current } = useApp();
  const { items: automations, loading, refresh } = useList(React.useCallback(
    () => api.get('/automations?projectId=' + current.id), [current.id]
  ));
  const { items: suggestions, refresh: refreshSug } = useList(React.useCallback(
    () => api.get('/automations/suggestions?projectId=' + current.id), [current.id]
  ));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ test_case_id: '', title: '', description: '', tool: '', frequency: '', owner: '', status: 'Sugerido' });
  const [error, setError] = useState('');

  const openCreate = () => { setForm({ test_case_id: '', title: '', description: '', tool: 'Playwright', frequency: 'A cada release', owner: '', status: 'Sugerido' }); setCreating(true); };
  const openEdit = (a) => setForm({ test_case_id: a.test_case_id || '', title: a.title, description: a.description, tool: a.tool, frequency: a.frequency, owner: a.owner, status: a.status });
  const openFromSuggestion = (s) => setForm({ test_case_id: s.id, title: `Automatizar: ${s.title}`, description: `Processo repetitivo com ${s.exec_count} execuções registradas.`, tool: '', frequency: 'A cada release', owner: '', status: 'Sugerido' });

  const save = async () => {
    if (!form.title.trim()) return;
    try {
      if (editing) await api.put('/automations/' + editing.id, form);
      else await api.post('/automations', { ...form, project_id: current.id });
      refresh(); refreshSug();
      setError('');
      setCreating(false); setEditing(null);
    } catch (e) { setError(e.message || 'Falha ao salvar automação.'); }
  };

  const remove = async (a) => {
    if (!window.confirm('Excluir esta automação?')) return;
    try {
      await api.del('/automations/' + a.id);
      refresh(); refreshSug();
    } catch (e) { setError(e.message || 'Falha ao excluir automação.'); }
  };

  const setStatus = async (a, status) => {
    try {
      await api.put('/automations/' + a.id, { ...a, status });
      refresh();
    } catch (e) { setError(e.message || 'Falha ao atualizar status.'); }
  };

  return (
    <div>
      <Header
        title="Automação"
        actions={<Btn onClick={openCreate}>Nova automação</Btn>}
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="panel">
        <h2>Candidatos à automação</h2>
        {suggestions.length === 0 ? <Empty>Nenhum candidato.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Código</th><th>Caso</th><th>Tipo</th><th>Execuções</th><th>Massa</th><th>Regressão</th><th /></tr></thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-title">{s.code}</td>
                    <td className="cell-title">{s.title}</td>
                    <td><Badge tone="blue">{s.type}</Badge></td>
                    <td>{s.exec_count}</td>
                    <td>{s.mass_count}</td>
                    <td>{s.regression_relevant ? <Badge tone="amber">Sim</Badge> : '-'}</td>
                    <td><Btn className="ghost small" onClick={() => { openFromSuggestion(s); setCreating(true); }}>Criar automação</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Automações ({automations.length})</h2>
        {loading ? <Loading /> : automations.length === 0 ? <Empty>Nenhuma automação cadastrada.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Título</th><th>Caso</th><th>Ferramenta</th><th>Frequência</th><th>Status</th><th /></tr></thead>
              <tbody>
                {automations.map((a) => (
                  <tr key={a.id}>
                    <td className="cell-title">{a.title}<div className="cell-sub">{a.description}</div></td>
                    <td>{a.test_case_code ? `${a.test_case_code} - ${a.test_case_title}` : '-'}</td>
                    <td>{a.tool || '-'}</td>
                    <td>{a.frequency || '-'}</td>
                    <td>
                      <Select value={a.status} onChange={(e) => setStatus(a, e.target.value)} style={{ width: 'auto' }}>
                        {AUTOMATION_STATUS.map((s) => <option key={s}>{s}</option>)}
                      </Select>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Btn className="ghost small" onClick={() => openEdit(a)}>Editar</Btn>
                        <Btn className="danger small" onClick={() => remove(a)}>Excluir</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={creating || editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Editar automação' : 'Nova automação'} width={560}>
        <Field label="Título" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Descrição"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="Ferramenta"><Input value={form.tool} onChange={(e) => setForm({ ...form, tool: e.target.value })} placeholder="Playwright, Cypress, Postman/Newman..." /></Field>
          <Field label="Frequência"><Input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="A cada release, semanal..." /></Field>
        </div>
        <div className="grid2">
          <Field label="Responsável"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {AUTOMATION_STATUS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <div className="modal-foot-inline"><Btn onClick={save}>{editing ? 'Salvar' : 'Criar'}</Btn></div>
      </Modal>
    </div>
  );
}

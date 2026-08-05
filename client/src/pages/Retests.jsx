import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api, fmtDate } from '../api.js';
import { Badge, Btn, Empty, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import { BUG_STATUS, toneFor } from '../utils.js';

export default function Retests() {
  const { current, currentTask, taskId } = useApp();
  const [bugs, setBugs] = useState([]);
  const [retests, setRetests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ bugStatus: '', result: '', bugId: '' });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ bug_id: '', execution_id: '', result: 'Passou', notes: '', retest_date: '' });

  const load = async () => {
    const [b, r] = await Promise.all([
      api.get('/bugs?taskId=' + taskId),
      api.get('/executions?taskId=' + taskId)
    ]);
    setBugs(b);
    // monta visão global de retestes buscando cada bug com retestes
    const withRetests = await Promise.all(b.filter((x) => x.retests_count > 0).map((x) => api.get('/bugs/' + x.id)));
    const rows = withRetests.flatMap((bug) => (bug.retests || []).map((rt) => ({ ...rt, bug })));
    rows.sort((a, b2) => (b2.retest_date || '').localeCompare(a.retest_date || ''));
    setRetests(rows);
    setLoading(false);
  };

  React.useEffect(() => { load(); }, [taskId]);

  const openCreate = () => {
    setForm({ bug_id: filter.bugId || (bugs[0]?.id || ''), execution_id: '', result: 'Passou', notes: '', retest_date: new Date().toISOString().slice(0, 10) });
    setCreating(true);
  };

  const filtered = retests.filter((rt) =>
    (!filter.bugStatus || rt.bug.status === filter.bugStatus) &&
    (!filter.result || rt.result === filter.result) &&
    (!filter.bugId || String(rt.bug_id) === String(filter.bugId))
  );

  const save = async () => {
    if (!form.bug_id) return;
    await api.post(`/bugs/${form.bug_id}/retests`, form);
    setCreating(false);
    load();
  };

  const del = async (rt) => {
    if (!window.confirm('Excluir este reteste?')) return;
    await api.del(`/bugs/retests/${rt.id}`);
    load();
  };

  return (
    <div>
      <Header
        title="Reteste"
        actions={<Btn onClick={openCreate} disabled={bugs.length === 0}>Registrar reteste</Btn>}
      />

      <div className="panel mb">
        <div className="grid3">
          <Field label="Status do bug">
            <Select value={filter.bugStatus} onChange={(e) => setFilter({ ...filter, bugStatus: e.target.value })}>
              <option value="">Todos</option>
              {BUG_STATUS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Resultado do reteste">
            <Select value={filter.result} onChange={(e) => setFilter({ ...filter, result: e.target.value })}>
              <option value="">Todos</option>
              <option>Passou</option><option>Falhou</option><option>Não Reproduzido</option>
            </Select>
          </Field>
          <Field label="Bug">
            <Select value={filter.bugId} onChange={(e) => setFilter({ ...filter, bugId: e.target.value })}>
              <option value="">Todos</option>
              {bugs.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.title}</option>)}
            </Select>
          </Field>
        </div>
      </div>

      {loading ? <Loading /> : retests.length === 0 ? (
        <Empty>Nenhum reteste registrado. Registre retestes a partir do detalhe de um bug ou pelo botão acima.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Data</th><th>Bug</th><th>Status do bug</th><th>Resultado</th><th>Observações</th><th /></tr></thead>
            <tbody>
              {filtered.map((rt) => (
                <tr key={rt.id}>
                  <td className="small">{fmtDate(rt.retest_date)}</td>
                  <td className="cell-title">{rt.bug.code} - {rt.bug.title}</td>
                  <td><Badge tone={toneFor(rt.bug.status)}>{rt.bug.status}</Badge></td>
                  <td><Badge tone={toneFor(rt.result)}>{rt.result}</Badge></td>
                  <td className="small">{rt.notes || '-'}</td>
                  <td><Btn className="danger small" onClick={() => del(rt)}>Excluir</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Registrar reteste" width={560}>
        <Field label="Bug" required>
          <Select value={form.bug_id} onChange={(e) => setForm({ ...form, bug_id: e.target.value })}>
            <option value="">Selecione</option>
            {bugs.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.title}</option>)}
          </Select>
        </Field>
        <div className="grid2">
          <Field label="Resultado">
            <Select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
              <option>Passou</option><option>Falhou</option><option>Não Reproduzido</option>
            </Select>
          </Field>
          <Field label="Data"><Input type="date" value={form.retest_date} onChange={(e) => setForm({ ...form, retest_date: e.target.value })} /></Field>
        </div>
        <Field label="Observações"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div className="modal-foot-inline"><Btn onClick={save}>Salvar reteste</Btn></div>
      </Modal>
    </div>
  );
}

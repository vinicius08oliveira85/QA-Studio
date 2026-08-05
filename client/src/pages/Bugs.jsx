import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api, fmtDate } from '../api.js';
import { Badge, Btn, Empty, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import { BUG_STATUS, SEVERITIES, toneFor } from '../utils.js';

const blank = {
  code: '', title: '', description: '', severity: 'Média', priority: 'Média', status: 'Aberto',
  steps_to_reproduce: '', expected_result: '', actual_result: '', environment: '',
  execution_id: '', test_case_id: '', requirement_id: ''
};

export default function Bugs() {
  const { current } = useApp();
  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/bugs?projectId=' + current.id), [current.id]
  ));
  const [reqs, setReqs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [retestForm, setRetestForm] = useState(null);
  const [form, setForm] = useState(blank);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSeverity, setFSeverity] = useState('');

  React.useEffect(() => {
    if (current.id) api.get('/requirements?projectId=' + current.id).then(setReqs).catch(() => {});
  }, [current.id]);

  const filtered = items.filter((b) => {
    const t = `${b.code} ${b.title} ${b.test_case_code}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) &&
      (!fStatus || b.status === fStatus) &&
      (!fSeverity || b.severity === fSeverity);
  });

  const openCreate = () => { setForm(blank); setCreating(true); };
  const openEdit = (b) => setForm({
    ...blank, ...b,
    execution_id: b.execution_id || '', test_case_id: b.test_case_id || '', requirement_id: b.requirement_id || ''
  });

  const save = async () => {
    if (!form.title.trim()) return;
    if (editing) await api.put('/bugs/' + editing.id, form);
    else await api.post('/bugs', { ...form, project_id: current.id });
    refresh();
    setCreating(false); setEditing(null);
  };

  const remove = async (b) => {
    if (!window.confirm(`Excluir o bug ${b.code}?`)) return;
    await api.del('/bugs/' + b.id);
    refresh();
    if (detail?.id === b.id) setDetail(null);
  };

  const loadDetail = async (id) => {
    const d = await api.get('/bugs/' + id);
    setDetail(d);
  };

  const addRetest = async () => {
    await api.post(`/bugs/${detail.id}/retests`, retestForm);
    setRetestForm(null);
    loadDetail(detail.id);
    refresh();
  };

  const delRetest = async (rt) => {
    if (!window.confirm('Excluir este reteste?')) return;
    await api.del(`/bugs/retests/${rt.id}`);
    loadDetail(detail.id);
    refresh();
  };

  const setStatus = async (b, status) => {
    await api.put('/bugs/' + b.id, { ...b, status });
    refresh();
    if (detail?.id === b.id) loadDetail(b.id);
  };

  return (
    <div>
      <Header
        title="Documentar Bug"
        subtitle="Registre, acompanhe e feche bugs. Bugs podem ser criados a partir de execuções falhas."
        actions={<Btn onClick={openCreate}>Novo bug</Btn>}
      />

      <div className="panel mb">
        <div className="grid3">
          <Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, título ou caso" /></Field>
          <Field label="Status">
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Todos</option>
              {BUG_STATUS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Severidade">
            <Select value={fSeverity} onChange={(e) => setFSeverity(e.target.value)}>
              <option value="">Todas</option>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
      </div>

      {loading ? <Loading /> : (
        <div className="table-wrap">
          {filtered.length === 0 ? <Empty>Nenhum bug encontrado.</Empty> : (
            <table className="table">
              <thead><tr><th>Código</th><th>Título</th><th>Caso</th><th>Severidade</th><th>Status</th><th>Retestes</th><th>Criado</th><th /></tr></thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="cell-title">{b.code}</td>
                    <td className="cell-title">{b.title}<div className="cell-sub">{b.test_case_code ? `Caso ${b.test_case_code}` : b.requirement_code || ''}</div></td>
                    <td>{b.test_case_code || '-'}</td>
                    <td><Badge tone={toneFor(b.severity)}>{b.severity}</Badge></td>
                    <td><Badge tone={toneFor(b.status)}>{b.status}</Badge></td>
                    <td>{b.retests_count}</td>
                    <td className="small">{fmtDate(b.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <Btn className="ghost small" onClick={() => loadDetail(b.id)}>Detalhes</Btn>
                        <Btn className="ghost small" onClick={() => openEdit(b)}>Editar</Btn>
                        <Btn className="danger small" onClick={() => remove(b)}>Excluir</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={creating || editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Editar bug' : 'Novo bug'} width={760}>
        <div className="grid2">
          <Field label="Código"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="auto (ex.: BUG-001)" /></Field>
          <Field label="Título" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        </div>
        <div className="grid3">
          <Field label="Severidade">
            <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option>Alta</option><option>Média</option><option>Baixa</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {BUG_STATUS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid2">
          <Field label="Requisito">
            <Select value={form.requirement_id} onChange={(e) => setForm({ ...form, requirement_id: e.target.value })}>
              <option value="">Nenhum</option>
              {reqs.map((r) => <option key={r.id} value={r.id}>{r.code} - {r.title}</option>)}
            </Select>
          </Field>
          <Field label="Ambiente"><Input value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} /></Field>
        </div>
        <Field label="Descrição"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Passos para reproduzir"><Textarea className="mono" rows={4} value={form.steps_to_reproduce} onChange={(e) => setForm({ ...form, steps_to_reproduce: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="Resultado esperado"><Textarea value={form.expected_result} onChange={(e) => setForm({ ...form, expected_result: e.target.value })} /></Field>
          <Field label="Resultado obtido"><Textarea value={form.actual_result} onChange={(e) => setForm({ ...form, actual_result: e.target.value })} /></Field>
        </div>
        <div className="modal-foot-inline"><Btn onClick={save}>{editing ? 'Salvar' : 'Criar'}</Btn></div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`${detail?.code} - ${detail?.title}`} width={760}>
        {detail && (
          <>
            <div className="grid2">
              <div className="kv"><span className="k">Severidade</span><span className="v"><Badge tone={toneFor(detail.severity)}>{detail.severity}</Badge></span></div>
              <div className="kv"><span className="k">Status</span><span className="v"><Badge tone={toneFor(detail.status)}>{detail.status}</Badge></span></div>
              <div className="kv"><span className="k">Caso</span><span className="v">{detail.test_case_code ? `${detail.test_case_code} - ${detail.test_case_title}` : '-'}</span></div>
              <div className="kv"><span className="k">Requisito</span><span className="v">{detail.requirement_code ? `${detail.requirement_code} - ${detail.requirement_title}` : '-'}</span></div>
              <div className="kv"><span className="k">Ambiente</span><span className="v">{detail.environment || '-'}</span></div>
              <div className="kv"><span className="k">Criado</span><span className="v">{fmtDate(detail.created_at)}</span></div>
            </div>
            {detail.description && <div className="highlight">{detail.description}</div>}
            <div className="grid2">
              <div><h3>Passos para reproduzir</h3><div className="mono-block">{detail.steps_to_reproduce || '-'}</div></div>
              <div>
                <h3>Resultado</h3>
                <div className="mono-block">{`Esperado:\n${detail.expected_result || '-'}\n\nObtido:\n${detail.actual_result || '-'}`}</div>
              </div>
            </div>

            <h3>Retestes ({detail.retests.length})</h3>
            {detail.retests.length === 0 && <Empty>Nenhum reteste registrado.</Empty>}
            {detail.retests.map((rt) => (
              <div className="step-card" key={rt.id}>
                <div style={{ flex: 1 }}>
                  <div className="small">{fmtDate(rt.retest_date)} {rt.test_case_code ? `- ${rt.test_case_code} ${rt.test_case_title}` : ''}</div>
                  {rt.notes && <div className="muted small">{rt.notes}</div>}
                </div>
                <Badge tone={toneFor(rt.result)}>{rt.result}</Badge>
                <Btn className="danger small" onClick={() => delRetest(rt)}>Excluir</Btn>
              </div>
            ))}

            {!retestForm ? (
              <Btn className="ghost small mt" onClick={() => setRetestForm({ execution_id: '', result: 'Passou', notes: '' })}>+ Registrar reteste</Btn>
            ) : (
              <div className="panel mt">
                <h3>Novo reteste</h3>
                <div className="grid2">
                  <Field label="Resultado">
                    <Select value={retestForm.result} onChange={(e) => setRetestForm({ ...retestForm, result: e.target.value })}>
                      <option>Passou</option><option>Falhou</option><option>Não Reproduzido</option>
                    </Select>
                  </Field>
                  <Field label="Data do reteste"><Input type="date" value={(retestForm.retest_date || new Date().toISOString().slice(0, 10))} onChange={(e) => setRetestForm({ ...retestForm, retest_date: e.target.value })} /></Field>
                </div>
                <Field label="Observações"><Textarea value={retestForm.notes} onChange={(e) => setRetestForm({ ...retestForm, notes: e.target.value })} /></Field>
                <div className="row-actions">
                  <Btn className="gray small" onClick={() => setRetestForm(null)}>Cancelar</Btn>
                  <Btn className="small" onClick={addRetest}>Salvar reteste</Btn>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

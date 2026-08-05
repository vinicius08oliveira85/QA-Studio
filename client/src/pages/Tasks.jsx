import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import { PRIORITIES, toneFor } from '../utils.js';

export const TASK_STATUS = ['Aberta', 'Em Andamento', 'Em Homologação', 'Concluída', 'Cancelada'];

export default function Tasks() {
  const { current, setTaskId, refreshTasks } = useApp();
  const navigate = useNavigate();

  React.useEffect(() => {
    setTaskId(0);
  }, [setTaskId]);

  const { items, loading, refresh } = useList(React.useCallback(
    () => api.get('/tasks?projectId=' + current.id), [current.id]
  ));

  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    code: '', title: '', description: '', status: 'Aberta', priority: 'Média', assignee: ''
  });

  const filtered = items.filter((t) => {
    const text = `${t.code} ${t.title} ${t.assignee}`.toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (!fStatus || t.status === fStatus);
  });

  const openCreate = () => {
    setForm({ code: '', title: '', description: '', status: 'Aberta', priority: 'Média', assignee: '' });
    setCreating(true);
  };

  const openEdit = (t) => {
    setForm({
      code: t.code, title: t.title, description: t.description || '',
      status: t.status, priority: t.priority, assignee: t.assignee || ''
    });
    setEditing(t);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    try {
      if (editing) {
        await api.put('/tasks/' + editing.id, form);
      } else {
        await api.post('/tasks', { ...form, project_id: current.id });
      }
      await refreshTasks(current.id);
      refresh();
      setError('');
      setCreating(false);
      setEditing(null);
    } catch (e) { setError(e.message || 'Falha ao salvar tarefa.'); }
  };

  const remove = async (t) => {
    if (!window.confirm(`Excluir a tarefa ${t.code}? Todo o conteúdo vinculado será removido.`)) return;
    try {
      await api.del('/tasks/' + t.id);
      await refreshTasks(current.id);
      refresh();
    } catch (e) { setError(e.message || 'Falha ao excluir tarefa.'); }
  };

  const openTask = (t) => {
    setTaskId(t.id);
    navigate(`/tarefas/${t.id}`);
  };

  if (loading) return <Loading />;

  return (
    <div>
      <Header
        title="Tarefas"
        actions={<Btn onClick={openCreate}>+ Nova tarefa</Btn>}
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="toolbar">
        <Input placeholder="Buscar código, título..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {TASK_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Empty>Nenhuma tarefa neste projeto. Crie a primeira (TAR-001) para organizar requisitos, cenários e casos.</Empty>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Responsável</th>
                <th>Reqs</th>
                <th>Casos</th>
                <th>Bugs abertos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="row-click" onClick={() => openTask(t)}>
                  <td className="cell-title">{t.code}</td>
                  <td>{t.title}</td>
                  <td><Badge tone={toneFor(t.status)}>{t.status}</Badge></td>
                  <td><Badge tone={toneFor(t.priority)}>{t.priority}</Badge></td>
                  <td className="muted">{t.assignee || '—'}</td>
                  <td>{t.requirements_count}</td>
                  <td>{t.cases_count}</td>
                  <td>{t.open_bugs_count}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <Btn className="small ghost" onClick={() => openTask(t)}>Abrir</Btn>
                      <Btn className="small ghost" onClick={() => openEdit(t)}>Editar</Btn>
                      <Btn className="small ghost" onClick={() => remove(t)}>Excluir</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        title={editing ? `Editar ${editing.code}` : 'Nova tarefa'}
        width={520}
      >
        <Field label="Código" hint="Deixe vazio para gerar TAR-NNN automaticamente">
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="TAR-001" disabled={!!editing} />
        </Field>
        <Field label="Título" required>
          <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Login com SSO" />
        </Field>
        <Field label="Descrição">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </Field>
        <div className="form-row">
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {TASK_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Responsável">
          <Input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} placeholder="Nome do responsável" />
        </Field>
        <div className="modal-foot-inline">
          <Btn onClick={save}>{editing ? 'Salvar' : 'Criar tarefa'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

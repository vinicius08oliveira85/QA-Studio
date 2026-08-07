import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fileToBase64, taskAttachmentUrl } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import { IconFile, IconX } from '../components/Icon.jsx';
import { PRIORITIES, toneFor } from '../utils.js';

export const TASK_STATUS = ['Aberta', 'Em Andamento', 'Em Homologação', 'Concluída', 'Cancelada'];

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
const isImageName = (name) => IMAGE_EXT.has((name.split('.').pop() || '').toLowerCase());

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

  // Anexos: `attachments` = já salvos no servidor; `pending` = upload adiado para o save
  // (a tarefa precisa existir); `removedIds` = remoções aplicadas apenas ao salvar.
  const [attachments, setAttachments] = useState([]);
  const [pending, setPending] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const fileInputRef = useRef(null);
  // Tarefa criada no modo "nova" dentro desta sessão do modal: permite o retry do
  // save via PUT (sem duplicar) caso o upload de um anexo falhe após a criação.
  const createdIdRef = useRef(null);

  const filtered = items.filter((t) => {
    const text = `${t.code} ${t.title} ${t.assignee}`.toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (!fStatus || t.status === fStatus);
  });

  const resetAttachments = () => {
    pending.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    createdIdRef.current = null;
    setAttachments([]);
    setPending([]);
    setRemovedIds([]);
  };

  const openCreate = () => {
    setForm({ code: '', title: '', description: '', status: 'Aberta', priority: 'Média', assignee: '' });
    resetAttachments();
    setCreating(true);
  };

  const openEdit = async (t) => {
    setForm({
      code: t.code, title: t.title, description: t.description || '',
      status: t.status, priority: t.priority, assignee: t.assignee || ''
    });
    resetAttachments();
    setEditing(t);
    try {
      setAttachments(await api.get(`/tasks/${t.id}/attachments`));
    } catch { /* anexos indisponíveis não bloqueiam a edição */ }
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    resetAttachments();
  };

  const addFiles = (files) => {
    const next = Array.from(files || [])
      .filter((f) => f && f.name)
      .map((file) => ({
        key: `p${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        isImage: file.type.startsWith('image/') || isImageName(file.name),
        url: URL.createObjectURL(file)
      }));
    if (!next.length) return;
    setPending((prev) => [...prev, ...next]);
  };

  const removePending = (key) => {
    setPending((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.key !== key);
    });
  };

  const markRemove = (id) => setRemovedIds((prev) => [...prev, id]);

  // Colar imagem direto (Ctrl+V): intercepta apenas quando há imagem no clipboard;
  // pastes de texto seguem normalmente para o campo focado.
  const handlePaste = (e) => {
    const items = Array.from(e?.clipboardData?.items || []);
    const images = items
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (!images.length) return;
    e.preventDefault();
    addFiles(images);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer?.files);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    try {
      let taskId = editing ? editing.id : createdIdRef.current;
      if (editing || createdIdRef.current) {
        await api.put('/tasks/' + taskId, form);
      } else {
        const created = await api.post('/tasks', { ...form, project_id: current.id });
        createdIdRef.current = created.id;
        taskId = created.id;
      }
      // Upload adiado: só agora a tarefa existe.
      for (const p of pending) {
        const data = await fileToBase64(p.file);
        await api.post(`/tasks/${taskId}/attachments`, {
          filename: p.file.name, data, mime: p.file.type || ''
        });
      }
      for (const id of removedIds) {
        await api.del(`/tasks/attachments/${id}`);
      }
      await refreshTasks(current.id);
      refresh();
      setError('');
      setCreating(false);
      setEditing(null);
      resetAttachments();
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

  const visibleAttachments = attachments.filter((a) => !removedIds.includes(a.id));

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
          <div className="table-wrap">
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
                  <td className="cell-code">{t.code}</td>
                  <td className="cell-title">{t.title}</td>
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
        </div>
      )}

      <Modal
        open={creating || !!editing}
        onClose={closeModal}
        title={editing ? `Editar ${editing.code}` : 'Nova tarefa'}
        width={560}
      >
        <div onPaste={handlePaste}>
          <Field label="Código" hint="Deixe vazio para gerar TAR-NNN automaticamente">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="TAR-001" disabled={!!editing} />
          </Field>
          <Field label="Título" required>
            <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Login com SSO" />
          </Field>
          <Field label="Descrição">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Descreva a funcionalidade; os materiais anexados ajudam a IA a gerar estratégias, cenários, casos e massa." />
          </Field>

          <div className="task-attachments">
            <span className="field-label">Materiais (imagens/arquivos — usados pela IA na geração)</span>
            {visibleAttachments.length === 0 && pending.length === 0 ? (
              <div className="attach-empty muted small">Nenhum material anexado.</div>
            ) : (
              <div className="attach-grid">
                {visibleAttachments.map((a) => (
                  <div key={a.id} className="attach-item">
                    {isImageName(a.filename)
                      ? <img src={taskAttachmentUrl(a.id)} alt={a.filename} />
                      : <span className="attach-ico"><IconFile size={20} /></span>}
                    <span className="attach-name" title={a.filename}>{a.filename}</span>
                    <button type="button" className="icon-btn" aria-label={`Remover ${a.filename}`} onClick={() => markRemove(a.id)}><IconX size={14} /></button>
                  </div>
                ))}
                {pending.map((p) => (
                  <div key={p.key} className="attach-item">
                    {p.isImage
                      ? <img src={p.url} alt={p.file.name} />
                      : <span className="attach-ico"><IconFile size={20} /></span>}
                    <span className="attach-name" title={p.file.name}>{p.file.name}</span>
                    <button type="button" className="icon-btn" aria-label={`Remover ${p.file.name}`} onClick={() => removePending(p.key)}><IconX size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div
              className="evidence-drop attach-drop"
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <span>Clique para anexar, arraste arquivos aqui ou cole uma imagem (Ctrl+V)</span>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                accept="image/*,.pdf,.txt,.md,.log,.json,.csv,.html,.xml,.zip"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
            {removedIds.length > 0 && <div className="small muted">A remoção é aplicada ao salvar.</div>}
          </div>

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
        </div>
      </Modal>
    </div>
  );
}

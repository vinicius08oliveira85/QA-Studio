import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context.jsx';
import { Btn, Field, Header, Input, Select } from '../components/ui.jsx';

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const navigate = useNavigate();
  const { refreshProjects } = useApp();

  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [projects, setProjects] = useState([]);
  const [exportId, setExportId] = useState('');
  const [busy, setBusy] = useState(''); // '' | 'export' | 'import'
  const [backupMsg, setBackupMsg] = useState('');
  const [backupError, setBackupError] = useState('');
  const fileRef = useRef(null);
  const timers = useRef([]);

  useEffect(() => {
    api.get('/settings').then((s) => {
      setGeminiConfigured(Boolean(s.geminiConfigured));
      if (s.geminiModel) setGeminiModel(s.geminiModel);
    }).catch(() => {});
    api.get('/projects').then((list) => {
      const arr = list || [];
      setProjects(arr);
      if (arr.length) setExportId((cur) => cur || String(arr[0].id));
    }).catch(() => {});
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const flash = (setter, value) => {
    setter(value);
    timers.current.push(setTimeout(() => setter(''), 3000));
  };

  const save = async () => {
    try {
      const body = { geminiModel };
      if (geminiApiKey.trim()) body.geminiApiKey = geminiApiKey.trim();
      await api.put('/settings', body);
      setGeminiConfigured(true);
      setGeminiApiKey('');
      setError('');
      flash(setSaved, true);
    } catch (e) {
      setError(e.message || 'Falha ao salvar configurações.');
    }
  };

  const removeKey = async () => {
    try {
      await api.del('/settings?key=geminiApiKey');
      setGeminiConfigured(false);
      setError('');
      flash(setSaved, true);
    } catch (e) {
      setError(e.message || 'Falha ao remover a chave.');
    }
  };

  const exportProject = async () => {
    if (!exportId || busy) return;
    setBusy('export');
    setBackupError('');
    setBackupMsg('');
    try {
      const project = projects.find((p) => String(p.id) === String(exportId));
      const data = await api.get(`/backups/projects/${exportId}/export`);
      const slug = (project?.name || 'projeto')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'projeto';
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(data, `qa-studio-${slug}-${stamp}.json`);
      flash(setBackupMsg, `Projeto "${project?.name || ''}" exportado com sucesso.`);
    } catch (e) {
      setBackupError(e.message || 'Falha ao exportar o projeto.');
    } finally {
      setBusy('');
    }
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy) return;
    setBusy('import');
    setBackupError('');
    setBackupMsg('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await api.post('/backups/import', data);
      refreshProjects(); // atualiza o seletor do sidebar
      const list = await api.get('/projects').catch(() => []);
      setProjects(list || []);
      setExportId(String(res.id));
      flash(setBackupMsg,
        `Projeto "${res.name}" importado: ${res.counts.tasks} tarefas, ${res.counts.requirements} requisitos, ` +
        `${res.counts.cases} casos de teste, ${res.counts.executions} execuções e ${res.counts.bugs} bugs.`);
    } catch (err) {
      setBackupError(err.message || 'Falha ao importar o arquivo. Verifique se é um backup do QA Studio.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <Header title="Configurações" />

      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="highlight">
          Obtenha sua chave gratuitamente em{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
          A chave fica salva apenas no servidor e nunca é devolvida ao navegador.
        </div>

        <Field label="Chave da API Gemini">
          <Input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder={geminiConfigured ? 'Chave já configurada (deixe em branco para manter)' : 'AIza...'}
            autoComplete="off" />
        </Field>
        {geminiConfigured && (
          <div className="muted small">
            Chave configurada. Para substituí-la, digite a nova chave acima e salve.
          </div>
        )}
        <Field label="Modelo">
          <Select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
            {['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>

        <div className="row-actions mt">
          <Btn onClick={save}>Salvar configurações</Btn>
          {geminiConfigured && <Btn className="ghost danger" onClick={removeKey}>Remover chave</Btn>}
          <Btn className="ghost" onClick={() => navigate(-1)}>Voltar</Btn>
        </div>
        {error && <div className="highlight" style={{ background: '#fdecec', borderColor: '#fca5a5' }}>{error}</div>}
        {saved && <div className="highlight" style={{ background: '#e8f7ee', borderColor: '#86efac' }}>Configurações salvas.</div>}
      </div>

      <div className="panel" style={{ maxWidth: 640 }}>
        <h2>Backup de projetos</h2>
        <div className="highlight">
          <strong>Exportar</strong> salva um projeto com todos os dados vinculados (tarefas, requisitos, regras,
          estratégias, cenários, casos, massa, execuções, bugs, retestes, regressões, automações e releases) em um
          arquivo JSON. <strong>Importar</strong> restaura esse arquivo criando um projeto novo, em qualquer máquina.
          A chave da API Gemini e demais configurações não são exportadas.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <Field label="Projeto para exportar">
              <Select value={exportId} onChange={(e) => setExportId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <Btn onClick={exportProject} disabled={!exportId || busy !== ''}>
            {busy === 'export' ? 'Exportando...' : 'Exportar projeto'}
          </Btn>
          <Btn className="ghost" onClick={() => fileRef.current?.click()} disabled={busy !== ''}>
            {busy === 'import' ? 'Importando...' : 'Importar projeto'}
          </Btn>
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
            onChange={onImportFile} />
        </div>

        {backupError && <div className="highlight mt" style={{ background: '#fdecec', borderColor: '#fca5a5' }}>{backupError}</div>}
        {backupMsg && <div className="highlight mt" style={{ background: '#e8f7ee', borderColor: '#86efac' }}>{backupMsg}</div>}
      </div>
    </div>
  );
}

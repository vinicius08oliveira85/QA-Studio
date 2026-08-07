import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fileToBase64 } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Field, Header, Loading, Select } from '../components/ui.jsx';
import ReportBugModal from '../components/ReportBugModal.jsx';
import { toneFor } from '../utils.js';

export default function RegressionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { current } = useApp();
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bugForm, setBugForm] = useState(null);
  const [error, setError] = useState('');

  const load = React.useCallback(async () => {
    const d = await api.get('/regressions/' + id);
    setRun(d);
    setLoading(false);
  }, [id]);
  React.useEffect(() => { load().catch((e) => { setError(e.message || 'Falha ao carregar regressão.'); setLoading(false); }); }, [load]);

  const setResult = async (rc, result) => {
    try {
      await api.put('/regressions/cases/' + rc.id, { result, notes: rc.notes });
      load();
    } catch (e) { setError(e.message || 'Falha ao atualizar resultado.'); }
  };

  const addCase = async (tc) => {
    try {
      await api.post(`/regressions/${id}/cases`, { test_case_id: tc.id });
      load();
    } catch (e) { setError(e.message || 'Falha ao adicionar caso.'); }
  };

  const populate = async () => {
    const r = await api.post(`/regressions/${id}/populate`);
    alert(r.added > 0 ? `${r.added} caso(s) de regressão adicionado(s).` : 'Nenhum caso marcado para regressão pendente.');
    load();
  };

  const removeCase = async (tc) => {
    if (!window.confirm('Remover este caso da regressão?')) return;
    await api.del(`/regressions/${id}/cases/${tc.test_case_id}`);
    load();
  };

  const openBug = (rc) => {
    setBugForm({
      test_case_id: rc.test_case_id,
      requirement_id: rc.requirement_id || '',
      title: `[${rc.code}] Falha na regressão: ${rc.title}`,
      severity: 'Média', priority: 'Média',
      steps_to_reproduce: '', expected_result: '', actual_result: '',
      environment: run.environment, description: `Bug reportado na regressão "${run.name}".`
    });
  };

  const submitBug = async (file) => {
    try {
      const created = await api.post('/bugs', { ...bugForm, project_id: current.id });
      setBugForm(null);
      if (file && created?.id) {
        try {
          const data = await fileToBase64(file);
          await api.post(`/bugs/${created.id}/attachment`, { filename: file.name, data });
        } catch (e) { setError(`Bug criado, mas falha ao anexar a evidência: ${e.message || 'erro'}`); }
      }
    } catch (e) { setError(e.message || 'Falha ao registrar bug.'); }
  };

  if (loading) return <Loading />;
  if (!run) return <Empty>Regressão não encontrada.</Empty>;

  const progress = run.total_cases ? Math.round(((run.passed + run.failed + run.blocked) / run.total_cases) * 100) : 0;

  return (
    <div>
      <Header
        title={run.name}
        actions={
          <>
            <Btn className="ghost small" onClick={() => navigate('/regressao')}>Voltar</Btn>
            {run.status === 'Em Andamento' && (
              <Btn className="small" onClick={async () => { await api.put('/regressions/' + id, { ...run, status: 'Concluída' }); load(); }}>Concluir regressão</Btn>
            )}
          </>
        }
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {(run.environment || run.notes) && (
        <div className="muted small mb" style={{ marginTop: -8 }}>
          {[run.environment && `Ambiente: ${run.environment}`, run.notes].filter(Boolean).join(' · ')}
        </div>
      )}

      <div className="panel">
        <div className="inline-stats">
          <div className="stat-chip"><div className="v">{run.total_cases}</div><div className="k">Total</div></div>
          <div className="stat-chip"><div className="v green" style={{ color: 'var(--green)' }}>{run.passed}</div><div className="k">Passou</div></div>
          <div className="stat-chip"><div className="v red" style={{ color: 'var(--red)' }}>{run.failed}</div><div className="k">Falhou</div></div>
          <div className="stat-chip"><div className="v" style={{ color: 'var(--amber)' }}>{run.blocked}</div><div className="k">Bloqueado</div></div>
          <div className="stat-chip"><div className="v" style={{ color: 'var(--muted)' }}>{run.pending}</div><div className="k">Pendente</div></div>
          <div className="stat-chip"><div className="v">{progress}%</div><div className="k">Progresso</div></div>
        </div>
        <div className="progress"><div style={{ width: `${progress}%` }} /></div>
      </div>

      <div className="panel">
        <div className="row-actions mb" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Casos ({run.cases.length})</h2>
          <div className="row-actions">
            <Btn className="ghost small" onClick={populate}>+ Adicionar casos marcados p/ regressão</Btn>
          </div>
        </div>

        <Field label="Adicionar caso manualmente (buscar por código)">
          <Select defaultValue="" onChange={(e) => { if (e.target.value) addCase(JSON.parse(e.target.value)); e.target.value = ''; }}>
            <option value="">Selecione um caso para adicionar...</option>
            {run.available_cases.map((tc) => (
              <option key={tc.id} value={JSON.stringify(tc)}>{tc.code} - {tc.title} ({tc.type})</option>
            ))}
          </Select>
        </Field>

        {run.cases.length === 0 ? <Empty>Nenhum caso nesta regressão.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Código</th><th>Caso</th><th>Tipo</th><th>Bugs abertos</th><th>Resultado</th><th /></tr></thead>
              <tbody>
                {run.cases.map((rc) => (
                  <tr key={rc.id}>
                    <td className="cell-title">{rc.code}</td>
                    <td className="cell-title">{rc.title}<div className="cell-sub">{rc.requirement_code ? `${rc.requirement_code} - ${rc.requirement_title}` : ''}</div></td>
                    <td><Badge tone="blue">{rc.type}</Badge></td>
                    <td>{rc.open_bugs > 0 ? <Badge tone="red">{rc.open_bugs}</Badge> : '-'}</td>
                    <td>
                      <Select value={rc.result} onChange={(e) => setResult(rc, e.target.value)}>
                        <option>Pendente</option><option>Passou</option><option>Falhou</option><option>Bloqueado</option>
                      </Select>
                    </td>
                    <td>
                      <div className="row-actions">
                        {rc.result === 'Falhou' && <Btn className="danger small" onClick={() => openBug(rc)}>Reportar bug</Btn>}
                        <Btn className="ghost small" onClick={() => removeCase(rc)}>Remover</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReportBugModal
        form={bugForm}
        onChange={(patch) => setBugForm({ ...bugForm, ...patch })}
        onCancel={() => setBugForm(null)}
        onSubmit={submitBug}
        context={`Bug vinculado à regressão "${run.name}".`}
      />
    </div>
  );
}

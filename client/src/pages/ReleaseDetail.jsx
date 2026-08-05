import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Field, Header, Loading, Select, useAction } from '../components/ui.jsx';
import { RELEASE_STATUS, toneFor } from '../utils.js';

export default function ReleaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { current } = useApp();
  const [rel, setRel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, run] = useAction();

  const load = React.useCallback(async () => {
    const d = await api.get('/releases/' + id);
    setRel(d);
    setLoading(false);
  }, [id]);
  React.useEffect(() => { load(); }, [load]);

  const setStatus = async (status) => {
    await run(async () => {
      await api.put('/releases/' + id, { ...rel, status });
      load();
    });
  };

  const addReq = async (rid) => {
    if (!rid) return;
    await run(async () => {
      await api.post(`/releases/${id}/requirements`, { requirement_id: rid });
      load();
    });
  };

  const removeReq = async (rid) => {
    if (!window.confirm('Remover este requisito da release?')) return;
    await run(async () => {
      await api.del(`/releases/${id}/requirements/${rid}`);
      load();
    });
  };

  if (loading) return <Loading />;
  if (!rel) return <Empty>Release não encontrada.</Empty>;

  const canRelease = rel.stats.openBugs === 0 && rel.stats.coveredRequirements > 0 && rel.stats.totalRequirements === rel.stats.coveredRequirements;

  return (
    <div>
      <Header
        title={`${rel.name}${rel.version ? ` (v${rel.version})` : ''}`}
        actions={
          <>
            <Btn className="ghost small" onClick={() => navigate('/homologacao')}>Voltar</Btn>
            <Select value={rel.status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
              {RELEASE_STATUS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </>
        }
      />
      {rel.notes && <div className="muted small mb" style={{ marginTop: -8 }}>{rel.notes}</div>}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="panel">
        <div className="inline-stats">
          <div className="stat-chip"><div className="v">{rel.stats.totalRequirements}</div><div className="k">Requisitos</div></div>
          <div className="stat-chip"><div className="v green" style={{ color: 'var(--green)' }}>{rel.stats.coveredRequirements}</div><div className="k">Com casos de teste</div></div>
          <div className="stat-chip"><div className="v">{rel.stats.totalExecutions}</div><div className="k">Execuções</div></div>
          <div className="stat-chip"><div className="v" style={{ color: 'var(--green)' }}>{rel.stats.passRate}%</div><div className="k">Aprovação</div></div>
          <div className="stat-chip"><div className="v" style={{ color: rel.stats.openBugs > 0 ? 'var(--red)' : 'var(--green)' }}>{rel.stats.openBugs}</div><div className="k">Bugs abertos</div></div>
        </div>
        <div className="progress"><div style={{ width: `${rel.stats.passRate}%` }} /></div>
        <div className="mt">
          {rel.status === 'Liberado' && <div className="highlight"><strong>Release liberada.</strong> Parabéns!</div>}
          {rel.status === 'Em Homologação' && !canRelease && (
            <div className="highlight"><strong>Checklist para liberação:</strong> sem bugs abertos ({rel.stats.openBugs}) e todos os requisitos cobertos por casos de teste ({rel.stats.coveredRequirements}/{rel.stats.totalRequirements}).</div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="row-actions mb" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Requisitos da release ({rel.requirements.length})</h2>
        </div>

        <Field label="Adicionar requisito">
          <Select defaultValue="" onChange={(e) => { addReq(e.target.value); e.target.value = ''; }}>
            <option value="">Selecione um requisito...</option>
            {rel.available_requirements.map((r) => (
              <option key={r.id} value={r.id}>{r.code} - {r.title}</option>
            ))}
          </Select>
        </Field>

        {rel.requirements.length === 0 ? <Empty>Nenhum requisito adicionado à release.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Código</th><th>Requisito</th><th>Prioridade</th><th>Casos</th><th>Execuções</th><th>Passou</th><th>Bugs abertos</th><th /></tr></thead>
              <tbody>
                {rel.requirements.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title">{r.code}</td>
                    <td className="cell-title">{r.title}</td>
                    <td><Badge tone={toneFor(r.priority)}>{r.priority}</Badge></td>
                    <td>{r.cases_count}</td>
                    <td>{r.executions_count}</td>
                    <td>{r.passed_count}</td>
                    <td>{r.open_bugs > 0 ? <Badge tone="red">{r.open_bugs}</Badge> : <Badge tone="green">0</Badge>}</td>
                    <td><Btn className="ghost small" onClick={() => removeReq(r.id)}>Remover</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDate } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Header, Loading, useList } from '../components/ui.jsx';
import { toneFor } from '../utils.js';
import AiModal from '../components/AiModal.jsx';

function Card({ num, cls = '', lbl }) {
  return (
    <div className="card">
      <div className={`num ${cls}`}>{num}</div>
      <div className="lbl">{lbl}</div>
    </div>
  );
}

export default function Dashboard({ scope = 'project' }) {
  const { current, currentTask, taskId } = useApp();
  const isTask = scope === 'task';
  const effectiveTaskId = currentTask?.id || taskId;

  if (isTask && !effectiveTaskId) return <Loading />;

  return <DashboardBody isTask={isTask} taskId={effectiveTaskId} current={current} currentTask={currentTask} />;
}

function DashboardBody({ isTask, taskId, current, currentTask }) {
  const [aiOpen, setAiOpen] = useState(false);

  const query = isTask
    ? '/dashboard?taskId=' + taskId
    : '/dashboard?projectId=' + current.id;

  const { items: d, loading, error, refresh } = useList(React.useCallback(
    () => api.get(query),
    [query]
  ));

  if (loading) return <Loading />;

  if (!d || typeof d !== 'object' || !Array.isArray(d.recentExecutions)) {
    return (
      <div>
        <Header
          title="Dashboard"
          actions={isTask ? <Btn className="ghost" onClick={() => setAiOpen(true)}>IA (completo)</Btn> : null}
        />
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Empty>Não foi possível carregar o dashboard.</Empty>
      </div>
    );
  }

  const severityLegend = { Blocker: 'red', Alta: 'red', Média: 'amber', Baixa: 'gray' };
  const typeColors = { 'Funcional': 'blue', 'API': 'green', 'Fumaça': 'amber', 'Regressão': 'gray' };
  const resultColors = { 'Passou': 'green', 'Falhou': 'red', 'Bloqueado': 'red', 'Não Executado': 'gray', 'Pendente': 'amber' };
  const maxSeverity = Math.max(1, ...(d.bugsBySeverity || []).map((b) => b.c));
  const bugsLink = isTask && currentTask ? `/tarefas/${currentTask.id}/bugs` : '/tarefas';
  const noBugs = (d.bugsBySeverity || []).length === 0 && (d.recentBugs || []).length === 0;

  return (
    <div>
      <Header
        title="Dashboard"
        actions={isTask ? (
            <Btn className="ghost" onClick={() => setAiOpen(true)}>IA (completo)</Btn>
        ) : null}
      />

      <div className="cards">
        {!isTask && d.totalTasks != null && <Card num={d.totalTasks} cls="blue" lbl="Tarefas" />}
        <Card num={d.totalRequirements} cls="blue" lbl="Requisitos" />
        <Card num={d.coveredRequirements} cls="green" lbl="Requisitos com casos" />
        <Card num={d.totalCases} lbl="Casos" />
        <Card num={`${d.passRate}%`} cls={d.passRate >= 80 ? 'green' : d.passRate >= 50 ? 'amber' : 'red'} lbl="Aprovação" />
        <Card num={d.openBugs} cls={d.openBugs > 0 ? 'red' : 'green'} lbl="Bugs abertos" />
        <Card num={d.regressionCases} cls="amber" lbl="Regressão" />
        <Card num={d.automatedCases} cls="blue" lbl="Automatizados" />
        {!isTask && <Card num={d.openAutomations} cls="amber" lbl="Automações pendentes" />}
      </div>

      {(d.lowCoverage || []).length > 0 && (
        <div className="panel" style={{ borderColor: '#f3d9a0', background: '#fffbf0' }}>
          <h2>Requisitos sem casos</h2>
          <table className="table">
            <thead><tr><th>Código</th><th>Requisito</th><th>Prioridade</th></tr></thead>
            <tbody>
              {d.lowCoverage.map((r) => (
                <tr key={r.code}>
                  <td className="cell-title">{r.code}</td>
                  <td>{r.title}</td>
                  <td><Badge tone={toneFor(r.priority)}>{r.priority}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="dash-grid">
        <div className="panel dash-col">
          <h2>Execuções recentes</h2>
          {d.recentExecutions.length === 0 && <Empty>Nenhuma execução.</Empty>}
          <table className="table">
            <thead><tr><th>Data</th><th>Caso</th><th>Resultado</th></tr></thead>
            <tbody>
              {d.recentExecutions.map((e) => (
                <tr key={e.id}>
                  <td className="small">{fmtDate(e.execution_date)}</td>
                  <td><span className="cell-title">{e.test_case_code}</span><div className="cell-sub">{e.test_case_title}</div></td>
                  <td><Badge tone={resultColors[e.result] || 'gray'}>{e.result}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel dash-col">
          <h2>Bugs por severidade</h2>
          {noBugs ? (
            <Empty>Nenhum bug.</Empty>
          ) : (
            <>
              {d.bugsBySeverity.map((b) => (
                <div key={b.severity}>
                  <div className="kv"><span className="k"><Badge tone={severityLegend[b.severity] || 'gray'}>{b.severity}</Badge></span><span className="v">{b.c}</span></div>
                  <div className="progress red" style={{ height: 6 }}><div style={{ width: `${(b.c / maxSeverity) * 100}%`, background: 'var(--red)' }} /></div>
                </div>
              ))}
              {d.bugsByStatus.length > 0 && (
                <div className="legend">
                  {d.bugsByStatus.map((s) => <span key={s.status}><Badge tone={toneFor(s.status)}>{s.status}: {s.c}</Badge></span>)}
                </div>
              )}
            </>
          )}
        </div>

        <div className="panel dash-col">
          <h2>Casos por tipo</h2>
          {d.casesByType.length === 0 && <Empty>Sem casos.</Empty>}
          <div className="stat-bar">
            {d.casesByType.map((t) => (
              <span key={t.type} style={{ width: `${(t.c / Math.max(1, d.totalCases)) * 100}%`, background: `var(--${typeColors[t.type]})` }} title={t.type} />
            ))}
          </div>
          <div className="legend">
            {d.casesByType.map((t) => (
              <span key={t.type}><i style={{ background: `var(--${typeColors[t.type]})` }} />{t.type}: {t.c}</span>
            ))}
          </div>
          <div className="mt">
            <h2>Casos por modo</h2>
            {d.casesByMode.map((m) => (
              <div className="kv" key={m.execution_mode}><span className="k">{m.execution_mode}</span><span className="v">{m.c}</span></div>
            ))}
          </div>
        </div>

        <div className="panel dash-col">
          <h2>Bugs recentes</h2>
          {noBugs ? (
            <Empty>Nenhum bug.</Empty>
          ) : (
            d.recentBugs.map((b) => (
              <div className="kv" key={b.id}>
                <span className="k"><Link className="link-plain" to={bugsLink}>{b.code} - {b.title}</Link></span>
                <span className="v"><Badge tone={toneFor(b.status)}>{b.status}</Badge></span>
              </div>
            ))
          )}
        </div>

        {!isTask && (
          <>
            <div className="panel dash-col">
              <h2>Releases</h2>
              {d.releases.length === 0 && <Empty>Nenhuma release.</Empty>}
              {d.releases.map((r) => (
                <div className="kv" key={r.id}>
                  <span className="k"><Link className="link-plain" to={`/homologacao/${r.id}`}>{r.name}</Link></span>
                  <span className="v"><Badge tone={toneFor(r.status)}>{r.status}</Badge></span>
                </div>
              ))}
            </div>

            <div className="panel dash-col">
              <h2>Regressões</h2>
              {d.regressionRuns.length === 0 && <Empty>Nenhuma regressão.</Empty>}
              {d.regressionRuns.map((r) => (
                <div className="kv" key={r.id}>
                  <span className="k"><Link className="link-plain" to={`/regressao/${r.id}`}>{r.name}</Link></span>
                  <span className="v"><Badge tone={toneFor(r.status)}>{r.status}</Badge></span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {isTask && (
        <AiModal open={aiOpen} onClose={() => setAiOpen(false)} initialScope="completo" onApplied={refresh} />
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context.jsx';
import { api, fmtDate } from '../api.js';
import { Badge, Btn, Empty, ErrorBanner, Header, Loading, Modal } from '../components/ui.jsx';
import { toneFor } from '../utils.js';

const RESULT_COLORS = { 'Passou': 'green', 'Falhou': 'red', 'Bloqueado': 'red', 'Não Executado': 'gray', 'Pendente': 'amber' };
const VERDICT_TONES = { green: 'green', amber: 'amber', red: 'red', gray: 'gray' };

function Card({ num, cls = '', lbl }) {
  return (
    <div className="card">
      <div className={`num ${cls}`}>{num}</div>
      <div className="lbl">{lbl}</div>
    </div>
  );
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function VerdictBanner({ verdict, task }) {
  if (!verdict) return null;
  const tone = VERDICT_TONES[verdict.tone] || 'gray';
  return (
    <div className={`verdict verdict-${tone} mb`}>
      <div className="verdict-icon" aria-hidden="true">
        {verdict.key === 'apto' ? '✓' : ['nao_apto', 'bloqueado'].includes(verdict.key) ? '✕' : verdict.key === 'nao_executado' ? '·' : '!'}
      </div>
      <div className="verdict-body">
        <div className="verdict-label">{verdict.label}</div>
        <div className="verdict-summary">{verdict.summary}</div>
      </div>
      <div className="verdict-meta">
        <span><strong>Tarefa:</strong> {task?.code}</span>
        <span><strong>Status:</strong> {task?.status}</span>
        <span><strong>Responsável:</strong> {task?.assignee || '—'}</span>
      </div>
    </div>
  );
}

export default function Report() {
  const { taskId, currentTask } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get(`/reports/task/${taskId}`)
      .then(setData)
      .catch((e) => setError(e?.message || 'Falha ao carregar o relatório.'))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => { load(); }, [load, reload]);

  const refresh = () => setReload((n) => n + 1);

  const openExecution = (id) => {
    api.get('/executions/' + id).then(setViewing).catch((e) => setError(e.message || 'Falha ao carregar execução.'));
  };

  const exportMarkdown = () => {
    if (!data) return;
    const { task, summary, requirements, cases, executions, verdict, open_bugs_list, attention_cases } = data;
    const L = [];
    L.push(`# Relatório de Testes — ${task.code} — ${task.title}`);
    L.push('');
    L.push(`**Parecer:** ${verdict?.label || '—'}`);
    L.push(`**${verdict?.summary || ''}**`);
    L.push('');
    L.push(`- **Status da tarefa:** ${task.status}${task.assignee ? ` | **Responsável:** ${task.assignee}` : ''}`);
    L.push(`- **Prioridade:** ${task.priority}`);
    L.push(`- **Gerado em:** ${fmtDate(data.generated_at)}${data.last_activity ? ` | **Última atividade:** ${fmtDate(data.last_activity)}` : ''}`);
    L.push('');
    L.push('## Resumo executivo');
    L.push('');
    L.push('| Métrica | Valor |');
    L.push('|---|---|');
    L.push(`| Casos totais | ${summary.totalCases} |`);
    L.push(`| Executados | ${summary.executedCases} |`);
    L.push(`| Não executados | ${summary.notExecutedCases} |`);
    L.push(`| Passou | ${summary.passed} |`);
    L.push(`| Falhou | ${summary.failed} |`);
    L.push(`| Bloqueado | ${summary.blocked} |`);
    L.push(`| Aprovação | ${summary.passRate}% |`);
    L.push(`| Cobertura de requisitos | ${summary.requirements_covered}/${summary.requirements_total} (${summary.requirement_coverage}%) |`);
    L.push(`| Bugs em aberto | ${summary.open_bugs} |`);
    L.push('');
    if (attention_cases.length > 0) {
      L.push('## Pontos de atenção (falhas e bloqueios)');
      L.push('');
      L.push('| Código | Caso | Requisito | Resultado | Ambiente |');
      L.push('|---|---|---|---|---|');
      for (const c of attention_cases) {
        L.push(`| ${mdEscape(c.code)} | ${mdEscape(c.title)} | ${mdEscape(c.requirement_code || '-')} | ${mdEscape(c.result)} | ${mdEscape(c.environment || '-')} |`);
      }
      L.push('');
    }
    if (open_bugs_list.length > 0) {
      L.push('## Bugs em aberto');
      L.push('');
      L.push('| Bug | Título | Severidade | Prioridade | Caso relacionado |');
      L.push('|---|---|---|---|---|');
      for (const b of open_bugs_list) {
        L.push(`| ${mdEscape(b.code)} | ${mdEscape(b.title)} | ${mdEscape(b.severity)} | ${mdEscape(b.priority)} | ${mdEscape(b.test_case_code || '-')} |`);
      }
      L.push('');
    }
    L.push('## Cobertura por requisito');
    L.push('');
    L.push('| Requisito | Casos | Executados | Passou | Falhou | Bloqueado |');
    L.push('|---|---|---|---|---|---|');
    for (const r of requirements) {
      L.push(`| ${mdEscape(r.code)} — ${mdEscape(r.title)} | ${r.total_cases} | ${r.executed_cases} | ${r.passed} | ${r.failed} | ${r.blocked} |`);
    }
    L.push('');
    L.push('## O que foi testado');
    L.push('');
    L.push('| Código | Caso | Requisito | Tipo | Modo | Prioridade | Último resultado |');
    L.push('|---|---|---|---|---|---|---|');
    for (const c of cases) {
      const last = c.last_execution ? `${c.last_execution.result} (${fmtDate(c.last_execution.execution_date)})` : 'Não executado';
      L.push(`| ${mdEscape(c.code)} | ${mdEscape(c.title)} | ${mdEscape(c.requirement_code || '-')} | ${mdEscape(c.type)} | ${mdEscape(c.execution_mode)} | ${mdEscape(c.priority)} | ${mdEscape(last)} |`);
    }
    L.push('');
    L.push('## Execuções recentes');
    L.push('');
    L.push('| Data | Caso | Ambiente | Executado por | Resultado |');
    L.push('|---|---|---|---|---|');
    for (const e of executions) {
      L.push(`| ${fmtDate(e.execution_date)} | ${mdEscape(e.test_case_code)} | ${mdEscape(e.environment)} | ${mdEscape(e.tester)} | ${mdEscape(e.result)} |`);
    }
    L.push('');
    const blob = new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${task.code}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) return <Loading />;

  return (
    <div className="report">
      <div className="print-only report-print-head">
        <h1>Relatório de Testes — {data?.task?.code} — {data?.task?.title}</h1>
        <div>Gerado em {fmtDate(data?.generated_at)} · Status: {data?.task?.status} · Parecer: {data?.verdict?.label}</div>
      </div>

      <Header
        title="Relatório"
        subtitle={data ? `${data.task.code} — ${data.task.title} · ${data.task.status} · Prioridade ${data.task.priority}` : currentTask?.code}
        actions={
          <div className="row-actions">
            <Btn className="ghost small" onClick={refresh}>Atualizar</Btn>
            <Btn className="ghost small" onClick={exportMarkdown} disabled={!data}>Exportar .md</Btn>
            <Btn className="small" onClick={() => window.print()} disabled={!data}>Imprimir / PDF</Btn>
          </div>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!data ? (
        <Empty>Nenhum dado para o relatório.</Empty>
      ) : (
        <>
          <VerdictBanner verdict={data.verdict} task={data.task} />

          <div className="cards report-cards">
            <Card num={data.summary.totalCases} lbl="Casos totais" />
            <Card num={data.summary.executedCases} cls="blue" lbl="Executados" />
            <Card num={data.summary.notExecutedCases} cls={data.summary.notExecutedCases ? 'amber' : 'green'} lbl="Não executados" />
            <Card num={data.summary.passed} cls="green" lbl="Passou" />
            <Card num={data.summary.failed} cls={data.summary.failed ? 'red' : 'green'} lbl="Falhou" />
            <Card num={data.summary.blocked} cls={data.summary.blocked ? 'red' : 'green'} lbl="Bloqueado" />
            <Card num={`${data.summary.passRate}%`} cls={data.summary.passRate >= 80 ? 'green' : data.summary.passRate >= 50 ? 'amber' : 'red'} lbl="Aprovação" />
            <Card num={`${data.summary.requirements_covered}/${data.summary.requirements_total}`} cls="blue" lbl="Requisitos cobertos" />
            <Card num={data.summary.open_bugs} cls={data.summary.open_bugs > 0 ? 'red' : 'green'} lbl="Bugs abertos" />
          </div>

          <div className="panel mb">
            <h2>Aprovação geral</h2>
            <div className="progress" style={{ height: 10 }}>
              <div style={{ width: `${data.summary.passRate}%`, background: data.summary.passRate >= 80 ? 'var(--green)' : data.summary.passRate >= 50 ? 'var(--amber)' : 'var(--red)' }} />
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--green)' }} />Passou: {data.summary.passed}</span>
              <span><i style={{ background: 'var(--red)' }} />Falhou: {data.summary.failed}</span>
              <span><i style={{ background: 'var(--amber)' }} />Bloqueado: {data.summary.blocked}</span>
              <span><i style={{ background: 'var(--gray-bg)' }} />Não executado: {data.summary.notExecutedCases}</span>
            </div>
            {data.summary.bugs_by_severity.length > 0 && (
              <div className="legend">
                {data.summary.bugs_by_severity.map((b) => (
                  <span key={b.severity}><Badge tone={b.severity === 'Blocker' || b.severity === 'Alta' ? 'red' : b.severity === 'Média' ? 'amber' : 'gray'}>{b.severity}: {b.c}</Badge></span>
                ))}
              </div>
            )}
          </div>

          {data.attention_cases.length > 0 && (
            <div className="panel mb">
              <h2>Pontos de atenção ({data.attention_cases.length})</h2>
              <p className="muted small">Casos com última execução <strong>Falhou</strong> ou <strong>Bloqueado</strong> — precisam de correção ou desbloqueio antes da liberação.</p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Código</th><th>Caso</th><th>Requisito</th><th>Resultado</th><th>Ambiente</th><th>Detalhe</th></tr>
                  </thead>
                  <tbody>
                    {data.attention_cases.map((c) => (
                      <tr key={c.code}>
                        <td className="cell-title">{c.code}</td>
                        <td className="cell-title">{c.title}</td>
                        <td>{c.requirement_code || '-'}</td>
                        <td><Badge tone={RESULT_COLORS[c.result] || 'red'}>{c.result}</Badge></td>
                        <td>{c.environment || '-'}</td>
                        <td className="cell-sub">{c.actual_result ? (String(c.actual_result).slice(0, 120)) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.open_bugs_list.length > 0 && (
            <div className="panel mb">
              <h2>Bugs em aberto ({data.open_bugs_list.length})</h2>
              <p className="muted small">Bugs com status <strong>Aberto</strong> ou <strong>Em Correção</strong>.</p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Bug</th><th>Título</th><th>Severidade</th><th>Prioridade</th><th>Caso relacionado</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {data.open_bugs_list.map((b) => (
                      <tr key={b.code}>
                        <td className="cell-title">{b.code}</td>
                        <td className="cell-title">{b.title}</td>
                        <td><Badge tone={toneFor(b.severity)}>{b.severity}</Badge></td>
                        <td><Badge tone={toneFor(b.priority)}>{b.priority}</Badge></td>
                        <td>{b.test_case_code || '-'}</td>
                        <td><Badge tone={toneFor(b.status)}>{b.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="panel mb">
            <h2>Cobertura por requisito</h2>
            {data.requirements.length === 0 ? <Empty>Nenhum requisito cadastrado.</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Requisito</th><th>Casos</th><th>Executados</th><th>Passou</th><th>Falhou</th><th>Bloqueado</th><th style={{ width: '28%' }}>Cobertura</th></tr>
                  </thead>
                  <tbody>
                    {data.requirements.map((r) => {
                      const pct = r.total_cases ? Math.round((r.executed_cases / r.total_cases) * 100) : 0;
                      return (
                        <tr key={r.id}>
                          <td><span className="cell-title">{r.code}</span><div className="cell-sub">{r.title}</div></td>
                          <td>{r.total_cases}</td>
                          <td>{r.executed_cases}</td>
                          <td>{r.passed}</td>
                          <td>{r.failed > 0 ? <Badge tone="red">{r.failed}</Badge> : r.failed}</td>
                          <td>{r.blocked > 0 ? <Badge tone="red">{r.blocked}</Badge> : r.blocked}</td>
                          <td>
                            <div className="progress"><div style={{ width: `${pct}%` }} /></div>
                            <div className="muted small">{pct}%</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel mb">
            <h2>O que foi testado ({data.cases.length})</h2>
            {data.cases.length === 0 ? <Empty>Nenhum caso de teste.</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Código</th><th>Caso</th><th>Requisito</th><th>Tipo</th><th>Modo</th><th>Prioridade</th><th>Último resultado</th><th>Bugs</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.cases.map((c) => (
                      <tr key={c.id}>
                        <td className="cell-title">{c.code}</td>
                        <td className="cell-title">{c.title}</td>
                        <td>{c.requirement_code || '-'}</td>
                        <td><Badge tone={c.type === 'API' ? 'green' : c.type === 'Fumaça' ? 'amber' : 'blue'}>{c.type}</Badge></td>
                        <td><Badge tone={c.execution_mode === 'Automatizado' ? 'blue' : 'gray'}>{c.execution_mode}</Badge></td>
                        <td><Badge tone={toneFor(c.priority)}>{c.priority}</Badge></td>
                        <td>
                          {c.last_execution ? (
                            <>
                              <Badge tone={RESULT_COLORS[c.last_execution.result] || 'gray'}>{c.last_execution.result}</Badge>
                              <div className="cell-sub">{fmtDate(c.last_execution.execution_date)}</div>
                            </>
                          ) : <Badge tone="gray">Não executado</Badge>}
                        </td>
                        <td>{c.bugs_count > 0 ? <Badge tone="red">{c.bugs_count}</Badge> : '-'}</td>
                        <td>
                          {c.last_execution && (
                            <Btn className="ghost small" onClick={() => openExecution(c.last_execution.id)}>Detalhes</Btn>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <h2>Execuções recentes ({data.executions.length})</h2>
            {data.executions.length === 0 ? <Empty>Nenhuma execução registrada.</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Data</th><th>Caso</th><th>Ambiente</th><th>Executado por</th><th>Resultado</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.executions.map((e) => (
                      <tr key={e.id}>
                        <td className="small">{fmtDate(e.execution_date)}</td>
                        <td><span className="cell-title">{e.test_case_code}</span><div className="cell-sub">{e.test_case_title}</div></td>
                        <td>{e.environment}</td>
                        <td>{e.tester}</td>
                        <td><Badge tone={RESULT_COLORS[e.result] || 'gray'}>{e.result}</Badge></td>
                        <td><Btn className="ghost small" onClick={() => openExecution(e.id)}>Detalhes</Btn></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Execução de ${viewing?.test_case_code}`} width={680}>
        {viewing && (
          <>
            <div className="grid2">
              <div className="kv"><span className="k">Data</span><span className="v">{fmtDate(viewing.execution_date)}</span></div>
              <div className="kv"><span className="k">Ambiente</span><span className="v">{viewing.environment}</span></div>
              <div className="kv"><span className="k">Resultado</span><span className="v"><Badge tone={toneFor(viewing.result)}>{viewing.result}</Badge></span></div>
              <div className="kv"><span className="k">Executado por</span><span className="v">{viewing.tester}</span></div>
            </div>
            {viewing.actual_result && <div className="highlight"><strong>Resultado geral:</strong> {viewing.actual_result}</div>}
            {viewing.notes && <div className="kv"><span className="k">Observações</span><span className="v">{viewing.notes}</span></div>}
            <h3>Passos executados</h3>
            {!viewing.steps?.length && <Empty>Sem passos registrados.</Empty>}
            {viewing.steps?.map((s) => (
              <div className="step-card" key={s.id}>
                <div className="step-num">{s.step_order}</div>
                <div style={{ flex: 1 }}>
                  <div><strong>{s.action}</strong></div>
                  <div className="muted small">Esperado: {s.expected}</div>
                  {s.actual && <div className="small">Obtido: {s.actual}</div>}
                </div>
                <Badge tone={toneFor(s.result)}>{s.result}</Badge>
              </div>
            ))}
          </>
        )}
      </Modal>
    </div>
  );
}

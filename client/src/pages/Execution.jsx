import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { api, fmtDate } from '../api.js';
import { Badge, Btn, Empty, Field, Header, Input, Loading, Modal, Select, Textarea, useList } from '../components/ui.jsx';
import AgentChat from '../components/AgentChat.jsx';
import { EXEC_RESULTS, toneFor } from '../utils.js';

const TYPE_LABEL = { 'Fumaça': 'Fumaça', 'Funcional': 'Funcional', 'API': 'API' };
const AGENT_TYPES = new Set(['Fumaça', 'Funcional', 'API']);

export default function Execution({ type }) {
  const { current, taskId } = useApp();
  const [params, setParams] = useSearchParams();

  const { items: cases, loading, refresh } = useList(React.useCallback(
    () => api.get(`/test-cases?taskId=${taskId}&type=${encodeURIComponent(type)}`), [taskId, type]
  ));
  const { items: execs, refresh: refreshExecs } = useList(React.useCallback(
    () => api.get('/executions?taskId=' + taskId), [taskId]
  ));

  const [target, setTarget] = useState(null);
  const [execForm, setExecForm] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [bugForm, setBugForm] = useState(null);
  const [agentJob, setAgentJob] = useState(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const caseIds = new Set(cases.map((c) => c.id));
  const history = execs.filter((e) => caseIds.has(e.test_case_id));
  const automatedCount = cases.filter((c) => c.execution_mode === 'Automatizado').length;
  const canAgent = AGENT_TYPES.has(type);

  const openExecute = async (tc) => {
    const d = await api.get('/test-cases/' + tc.id);
    setTarget(d);
    setExecForm({
      environment: 'Homologação', tester: 'QA', result: 'Passou', actual_result: '', notes: '',
      step_results: d.steps.map((s) => ({ order: s.order, actual: '', result: 'Passou' }))
    });
  };

  const pollAgentJob = (jobId) => {
    const tick = async () => {
      try {
        const job = await api.get('/agent-runs/' + jobId);
        setAgentJob(job);
        if (job.status === 'queued' || job.status === 'running') {
          setTimeout(tick, 1000);
          return;
        }
        setAgentBusy(false);
        refresh();
        refreshExecs();
      } catch {
        setAgentBusy(false);
        setAgentJob((j) => j ? { ...j, status: 'error', error: 'Falha ao consultar status' } : j);
      }
    };
    setTimeout(tick, 800);
  };

  const startAgent = async (body) => {
    if (agentBusy) return;
    setAgentBusy(true);
    setAgentJob(null);
    setChatOpen(true);
    try {
      const job = await api.post('/agent-runs', body);
      setAgentJob(job);
      pollAgentJob(job.id);
    } catch (err) {
      setAgentBusy(false);
      setAgentJob({ status: 'error', error: err.message || 'Falha ao iniciar agent', log: err.message });
    }
  };

  const continueSso = async () => {
    if (!agentJob?.id) return;
    try {
      await api.post(`/agent-runs/${agentJob.id}/continue`, {});
      setAgentJob((j) => j ? {
        ...j,
        waitingSso: false,
        log: (j.log || '') + '[Studio] Você confirmou o login — retomando…\n'
      } : j);
    } catch (err) {
      setAgentJob((j) => j ? {
        ...j,
        log: (j.log || '') + `[Studio] Erro ao continuar: ${err.message}\n`
      } : j);
    }
  };

  React.useEffect(() => {
    const cid = params.get('case');
    if (cid && !target) {
      api.get('/test-cases/' + cid).then((d) => {
        setTarget(d);
        setExecForm({
          environment: 'Homologação', tester: 'QA', result: 'Passou', actual_result: '', notes: '',
          step_results: d.steps.map((s) => ({ order: s.order, actual: '', result: 'Passou' }))
        });
      }).catch(() => {});
    }
    const eid = params.get('exec');
    if (eid) {
      api.get('/executions/' + eid).then(setViewing).catch(() => {});
    }
  }, []);

  const setStep = (order, key, val) => {
    setExecForm({ ...execForm, step_results: execForm.step_results.map((s) => (s.order === order ? { ...s, [key]: val } : s)) });
  };

  const submit = async () => {
    const r = await api.post('/executions', {
      project_id: current.id, task_id: taskId, test_case_id: target.id,
      environment: execForm.environment, tester: execForm.tester, result: execForm.result,
      actual_result: execForm.actual_result, notes: execForm.notes, step_results: execForm.step_results
    });
    params.delete('case');
    setParams(params, { replace: true });
    const failed = execForm.result === 'Falhou';
    const data = { actual_result: execForm.actual_result, environment: execForm.environment };
    setTarget(null); setExecForm(null);
    refresh(); refreshExecs();
    if (failed) openBug(r.id, target, data);
  };

  const openBug = async (executionId, tc, data = {}) => {
    const detail = tc.steps && tc.steps.length ? tc : await api.get('/test-cases/' + tc.id);
    setBugForm({
      execution_id: executionId,
      test_case_id: detail.id,
      requirement_id: detail.requirement_id || '',
      title: `[${detail.code}] Falha na execução: ${detail.title}`,
      severity: 'Média', priority: 'Média',
      steps_to_reproduce: detail.steps.map((s) => `${s.order}. ${s.action}`).join('\n'),
      expected_result: detail.steps.map((s) => `${s.order}. ${s.expected}`).join('\n'),
      actual_result: data.actual_result || '',
      environment: data.environment || 'Homologação',
      description: 'Bug reportado automaticamente a partir de uma execução falha.'
    });
    setViewing(null);
  };

  const submitBug = async () => {
    await api.post('/bugs', { ...bugForm, project_id: current.id, task_id: taskId });
    setBugForm(null);
    refreshExecs();
  };

  return (
    <div>
      <Header
        title={TYPE_LABEL[type]}
        actions={
          <div className="row-actions">
            <div className="muted small">{cases.length} caso(s)</div>
            {canAgent && (
              <Btn
                className="small"
                disabled={agentBusy || automatedCount === 0}
                title={automatedCount === 0 ? 'Nenhum caso Automatizado nesta aba' : 'Fila agent dos casos Automatizado'}
                onClick={() => startAgent({ taskId: Number(taskId), type, headed: true })}
              >
                {agentBusy ? 'Agent…' : `Agent (${automatedCount})`}
              </Btn>
            )}
          </div>
        }
      />

      {chatOpen && agentJob && (
        <AgentChat
          job={agentJob}
          busy={agentBusy}
          onContinue={continueSso}
          onClose={() => setChatOpen(false)}
        />
      )}

      {loading ? <Loading /> : (
        <div className="table-wrap mb">
          {cases.length === 0 ? <Empty>Nenhum caso de teste do tipo "{type}" criado. Crie na seção Casos de Teste.</Empty> : (
            <table className="table">
              <thead><tr><th>Código</th><th>Título</th><th>Requisito</th><th>Modo</th><th>Status</th><th>Último resultado</th><th /></tr></thead>
              <tbody>
                {cases.map((tc) => {
                  const last = history.find((e) => e.test_case_id === tc.id);
                  return (
                    <tr key={tc.id}>
                      <td className="cell-title">{tc.code}</td>
                      <td className="cell-title">{tc.title}</td>
                      <td>{tc.requirement_code || '-'}</td>
                      <td><Badge tone={tc.execution_mode === 'Automatizado' ? 'blue' : 'gray'}>{tc.execution_mode}</Badge></td>
                      <td><Badge tone={toneFor(tc.status)}>{tc.status}</Badge></td>
                      <td>{last ? <Badge tone={toneFor(last.result)}>{last.result}</Badge> : '-'}</td>
                      <td>
                        <div className="row-actions">
                          <Btn className="small" onClick={() => openExecute(tc)}>Executar</Btn>
                          {canAgent && (
                            <Btn
                              className="ghost small"
                              disabled={agentBusy}
                              onClick={() => startAgent({ caseId: tc.id, headed: true })}
                            >
                              Agent
                            </Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="panel">
        <h2>Histórico de execução ({history.length})</h2>
        {history.length === 0 ? <Empty>Nenhuma execução registrada ainda.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Data</th><th>Caso</th><th>Ambiente</th><th>Resultado</th><th>Bugs</th><th /></tr></thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{fmtDate(e.execution_date)}</td>
                    <td><span className="cell-title">{e.test_case_code}</span><div className="cell-sub">{e.test_case_title}</div></td>
                    <td>{e.environment}</td>
                    <td><Badge tone={toneFor(e.result)}>{e.result}</Badge></td>
                    <td>{e.bugs_count}</td>
                    <td>
                      <div className="row-actions">
                        <Btn className="ghost small" onClick={() => api.get('/executions/' + e.id).then(setViewing)}>Ver</Btn>
                        {e.result === 'Falhou' && <Btn className="danger small" onClick={() => openBug(e.id, { id: e.test_case_id, steps: [] }, e)}>Reportar bug</Btn>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!execForm} onClose={() => { setTarget(null); setExecForm(null); }} title={`Executar ${target?.code} - ${target?.title}`} width={720}>
        {target && execForm && (
          <>
            {target.test_mass?.length > 0 && (
              <div className="highlight"><strong>Massa de teste disponível:</strong> {target.test_mass.map((m) => m.name).join(', ')}</div>
            )}
            <div className="grid3">
              <Field label="Ambiente">
                <Select value={execForm.environment} onChange={(e) => setExecForm({ ...execForm, environment: e.target.value })}>
                  <option>Homologação</option><option>Staging</option><option>Produção</option><option>Local</option>
                </Select>
              </Field>
              <Field label="Executado por"><Input value={execForm.tester} onChange={(e) => setExecForm({ ...execForm, tester: e.target.value })} /></Field>
              <Field label="Resultado">
                <Select value={execForm.result} onChange={(e) => setExecForm({ ...execForm, result: e.target.value })}>
                  {EXEC_RESULTS.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Passos">
              {target.steps.length === 0 && <Empty>Este caso não possui passos.</Empty>}
              {target.steps.map((s, i) => {
                const sr = execForm.step_results.find((x) => x.order === s.order);
                return (
                  <div className="step-card" key={i} style={{ flexDirection: 'column' }}>
                    <div><span className="step-num" style={{ display: 'inline-flex', marginRight: 8 }}>{s.order}</span><strong>{s.action}</strong></div>
                    <div className="muted small">Esperado: {s.expected}</div>
                    <div className="grid2" style={{ marginTop: 6 }}>
                      <Input placeholder="Resultado obtido" value={sr?.actual || ''} onChange={(e) => setStep(s.order, 'actual', e.target.value)} />
                      <Select value={sr?.result || 'Passou'} onChange={(e) => setStep(s.order, 'result', e.target.value)}>
                        <option>Passou</option><option>Falhou</option><option>Não Executado</option>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </Field>

            <Field label="Resultado geral / evidências"><Textarea value={execForm.actual_result} onChange={(e) => setExecForm({ ...execForm, actual_result: e.target.value })} placeholder="O que realmente aconteceu (evidências, prints, logs)..." /></Field>
            <Field label="Observações"><Textarea value={execForm.notes} onChange={(e) => setExecForm({ ...execForm, notes: e.target.value })} /></Field>

            <div className="modal-foot-inline">
              <Btn className="gray" onClick={() => { setTarget(null); setExecForm(null); }}>Cancelar</Btn>
              {canAgent && (
                <Btn className="ghost" disabled={agentBusy} onClick={() => { const id = target.id; setTarget(null); setExecForm(null); startAgent({ caseId: id, headed: true }); }}>
                  Executar com agent
                </Btn>
              )}
              <Btn onClick={submit}>Registrar execução</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!viewing} onClose={() => { setViewing(null); }} title={`Execução de ${viewing?.test_case_code}`} width={680}>
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
            {viewing.steps.length === 0 && <Empty>Sem passos.</Empty>}
            {viewing.steps.map((s) => (
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
            <div className="row-actions mt">
              <Btn className="ghost small" onClick={() => { const id = viewing.id; setViewing(null); api.get('/executions/' + id).then(setViewing); }}>Recarregar</Btn>
              {viewing.result === 'Falhou' && <Btn className="danger small" onClick={() => openBug(viewing.id, { id: viewing.test_case_id, steps: [] }, viewing)}>Reportar bug</Btn>}
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!bugForm} onClose={() => setBugForm(null)} title="Reportar bug" width={720}>
        {bugForm && (
          <>
            <div className="highlight">Bug gerado a partir de uma execução falha. Ajuste os campos e confirme.</div>
            <Field label="Título" required><Input value={bugForm.title} onChange={(e) => setBugForm({ ...bugForm, title: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="Severidade">
                <Select value={bugForm.severity} onChange={(e) => setBugForm({ ...bugForm, severity: e.target.value })}>
                  <option>Blocker</option><option>Alta</option><option>Média</option><option>Baixa</option>
                </Select>
              </Field>
              <Field label="Prioridade">
                <Select value={bugForm.priority} onChange={(e) => setBugForm({ ...bugForm, priority: e.target.value })}>
                  <option>Alta</option><option>Média</option><option>Baixa</option>
                </Select>
              </Field>
            </div>
            <div className="grid2">
              <Field label="Ambiente"><Input value={bugForm.environment} onChange={(e) => setBugForm({ ...bugForm, environment: e.target.value })} /></Field>
              <Field label="Requisito">
                <Select value={bugForm.requirement_id} onChange={(e) => setBugForm({ ...bugForm, requirement_id: e.target.value })}>
                  <option value="">Nenhum</option>
                  {cases.filter((c) => c.requirement_id).map((c) => <option key={c.requirement_id} value={c.requirement_id}>{c.requirement_code}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Descrição"><Textarea value={bugForm.description} onChange={(e) => setBugForm({ ...bugForm, description: e.target.value })} /></Field>
            <Field label="Passos para reproduzir"><Textarea className="mono" rows={4} value={bugForm.steps_to_reproduce} onChange={(e) => setBugForm({ ...bugForm, steps_to_reproduce: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="Resultado esperado"><Textarea value={bugForm.expected_result} onChange={(e) => setBugForm({ ...bugForm, expected_result: e.target.value })} /></Field>
              <Field label="Resultado obtido"><Textarea value={bugForm.actual_result} onChange={(e) => setBugForm({ ...bugForm, actual_result: e.target.value })} /></Field>
            </div>
            <div className="modal-foot-inline">
              <Btn className="gray" onClick={() => setBugForm(null)}>Cancelar</Btn>
              <Btn className="danger" onClick={submitBug}>Registrar bug</Btn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

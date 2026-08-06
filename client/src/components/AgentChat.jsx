import React, { useEffect, useRef } from 'react';
import { Btn } from './ui.jsx';
import AgentSuiteProgress from './AgentSuiteProgress.jsx';

function parseChatLines(log) {
  if (!log) return [];
  return String(log)
    .split(/\r?\n/)
    .map((t) => t.trimEnd())
    .filter((t) => t.trim().length > 0)
    .filter((t) => !t.includes('[QA_EVENT]'))
    .map((text, i) => {
      let role = 'sys';
      if (/\[SSO\]/i.test(text)) role = 'sso';
      else if (/\[FLOW\]/i.test(text)) role = 'flow';
      else if (/\[Studio\]/i.test(text)) role = 'user';
      else if (/\[agent-runner\]/i.test(text)) role = 'agent';
      else if (/Error:|TimeoutError|failed|Falhou/i.test(text)) role = 'err';
      else if (/Passou|ok |✓|passed/i.test(text)) role = 'ok';
      return { id: i + ':' + text.slice(0, 40), role, text };
    });
}

export default function AgentChat({ job, busy, onContinue, onFix, onClose }) {
  const endRef = useRef(null);
  const lines = parseChatLines(job?.log || '');
  const waitingSso = !!job?.waitingSso || lines.some((l) => l.role === 'sso' && /Aguardando/i.test(l.text));
  const waitingFix = !!job?.waitingFix;
  const waiting = waitingSso || waitingFix;
  const running = job?.status === 'queued' || job?.status === 'running';
  const stoppedAfterFail = job?.queueStopped || job?.phase === 'stopped_after_fail';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length, job?.status, waitingFix]);

  if (!job) return null;

  const statusLabel = {
    queued: 'Na fila…',
    running: waitingFix
      ? 'Aguardando correção da fila'
      : waitingSso
        ? 'Aguardando seu login SSO'
        : job.sequentialFlow
          ? 'Agent ao vivo no browser…'
          : 'Executando…',
    done: stoppedAfterFail ? 'Fila parada' : 'Concluído',
    error: job.phase === 'generation_failed'
      ? 'Falha ao regenerar suíte'
      : stoppedAfterFail
        ? 'Fila parada'
        : 'Erro'
  }[job.status] || job.status;

  return (
    <div className="agent-chat panel mb">
      <div className="agent-chat-head">
        <div>
          <strong>{job.sequentialFlow ? 'Agent ao vivo · mesma sessão CDP' : 'Agent'}</strong>
          <span className="muted small"> · {statusLabel}</span>
          {job.id && <span className="muted small"> · job {job.id}</span>}
        </div>
        <div className="row-actions">
          {running && waitingSso && !waitingFix && (
            <Btn
              className="small"
              disabled={!running}
              onClick={onContinue}
              title="Desbloqueia o Playwright após você completar o SSO no browser"
            >
              Já fiz login
            </Btn>
          )}
          {!running && (
            <Btn className="ghost small" onClick={onClose}>Fechar</Btn>
          )}
        </div>
      </div>

      {waitingSso && !waitingFix && (
        <div className="highlight">
          Complete o login/SSO no Chromium aberto. Depois clique em <strong>Já fiz login</strong>.
        </div>
      )}

      {waitingFix && (
        <div className="highlight" role="alert">
          <div style={{ marginBottom: 8 }}>
            <strong>Imprevisto na fila</strong>
            {job.currentCaseCode ? ` · ${job.currentCaseCode}` : ''}
          </div>
          <div className="small" style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>
            {job.fixPrompt || 'Falha inesperada (seletor, SUT ou contexto de tela perdido).'}
          </div>
          <div className="row-actions">
            <Btn className="small" onClick={() => onFix?.('regen')}>Tentar de novo</Btn>
            <Btn className="ghost small" onClick={() => onFix?.('skip')}>Pular caso</Btn>
            <Btn className="danger small" onClick={() => onFix?.('stop')}>Parar fila</Btn>
          </div>
        </div>
      )}

      {stoppedAfterFail && !running && (
        <div className="highlight">
          Fila parada{job.currentCaseCode ? ` em ${job.currentCaseCode}` : ''} — próximos casos não foram executados.
          Veja o histórico de execução abaixo.
        </div>
      )}

      {job.status === 'error' && job.error && !waitingFix && (
        <div className="highlight" role="alert">
          <strong>Erro:</strong> {job.error}
        </div>
      )}

      {job.sequentialFlow && (
        <AgentSuiteProgress items={job.items || []} summary={job.summary} />
      )}

      <div className="agent-chat-body" role="log" aria-live="polite">
        {lines.length === 0 && (
          <div className="agent-bubble sys">Iniciando… o log aparece aqui em tempo real.</div>
        )}
        {lines.map((l) => (
          <div key={l.id} className={`agent-bubble ${l.role}`}>{l.text}</div>
        ))}
        <div ref={endRef} />
      </div>

      {busy && running && (
        <div className="agent-chat-foot muted small">Atualizando a cada segundo…</div>
      )}
    </div>
  );
}

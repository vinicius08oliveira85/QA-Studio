import React, { useEffect, useRef } from 'react';
import { Btn } from './ui.jsx';

function parseChatLines(log) {
  if (!log) return [];
  return String(log)
    .split(/\r?\n/)
    .map((t) => t.trimEnd())
    .filter((t) => t.trim().length > 0)
    .map((text, i) => {
      let role = 'sys';
      if (/\[SSO\]/i.test(text)) role = 'sso';
      else if (/\[Studio\]/i.test(text)) role = 'user';
      else if (/\[agent-runner\]/i.test(text)) role = 'agent';
      else if (/Error:|TimeoutError|failed|Falhou/i.test(text)) role = 'err';
      else if (/Passou|ok |✓|passed/i.test(text)) role = 'ok';
      return { id: i + ':' + text.slice(0, 40), role, text };
    });
}

export default function AgentChat({ job, busy, onContinue, onClose }) {
  const endRef = useRef(null);
  const lines = parseChatLines(job?.log || '');
  const waiting = !!job?.waitingSso || lines.some((l) => l.role === 'sso' && /Aguardando/i.test(l.text));
  const running = job?.status === 'queued' || job?.status === 'running';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length, job?.status]);

  if (!job) return null;

  const statusLabel = {
    queued: 'Na fila…',
    running: waiting ? 'Aguardando seu login SSO' : 'Executando…',
    done: 'Concluído',
    error: 'Erro'
  }[job.status] || job.status;

  return (
    <div className="agent-chat panel mb">
      <div className="agent-chat-head">
        <div>
          <strong>Agent</strong>
          <span className="muted small"> · {statusLabel}</span>
          {job.id && <span className="muted small"> · job {job.id}</span>}
        </div>
        <div className="row-actions">
          {running && (
            <Btn
              className={waiting ? 'small' : 'ghost small'}
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

      {waiting && (
        <div className="highlight">
          Complete o login/SSO no Chromium aberto. Depois clique em <strong>Já fiz login</strong>.
        </div>
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

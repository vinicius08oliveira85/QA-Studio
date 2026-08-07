import React from 'react';
import { Badge, Modal } from './ui.jsx';
import { fmtDate } from '../api.js';
import { diffTokens, parseResultado, toneFor } from '../utils.js';
import Verdict from './Verdict.jsx';

/**
 * Renderiza o diff de palavras entre dois textos.
 * `side` limita o que aparece: 'both' mostra tudo; 'A' mostra same+del; 'B' mostra same+add.
 * Tokens de espaço em branco não recebem destaque (evita riscos invisíveis no texto).
 */
function DiffText({ tokens, side = 'both' }) {
  if (!tokens.length) return <span className="muted small">—</span>;
  const blank = (t) => String(t).trim() === '';
  return (
    <span className={`diff-text ${side === 'A' || side === 'B' ? 'diff-side' : ''}`}>
      {tokens.map((tok, i) => {
        const keep = side === 'A'
          ? tok.kind === 'same' || tok.kind === 'del'
          : side === 'B'
            ? tok.kind === 'same' || tok.kind === 'add'
            : true;
        if (!keep) return null;
        const kind = blank(tok.t) ? 'same' : tok.kind;
        return (
          <span key={i} className={`diff-tok ${kind}`}>{tok.t}</span>
        );
      })}
    </span>
  );
}

/** Painel de uma execução: cabeçalho com metadados + Resultado Obtido completo. */
function ExecPanel({ exec, side }) {
  return (
    <div className={`compare-panel ${side === 'B' ? 'side-b' : ''}`}>
      <div className="compare-panel-head">
        <span className="compare-side-tag">Execução {side} · #{exec.id}</span>
        <span className="muted small">{fmtDate(exec.execution_date)}</span>
      </div>
      <div className="compare-meta">
        <div className="kv"><span className="k">Ambiente</span><span className="v">{exec.environment || '—'}</span></div>
        <div className="kv"><span className="k">Resultado</span><span className="v"><Badge tone={toneFor(exec.result)}>{exec.result || '—'}</Badge></span></div>
        <div className="kv"><span className="k">Executado por</span><span className="v">{exec.tester || '—'}</span></div>
      </div>
      <div className="compare-result">
        {exec.actual_result
          ? <Verdict text={exec.actual_result} executionId={exec.id} />
          : <span className="muted small">Sem Resultado Obtido.</span>}
      </div>
    </div>
  );
}

/**
 * Comparador de execuções do mesmo caso: duas colunas com os Resultados Obtidos
 * completos, um diff de palavras entre eles (narrativa/obs/evidência) e a lista
 * de passos alinhada, destacando as divergências de "Obtido" e status.
 */
export default function CompareExecutions({ a, b, onClose }) {
  if (!a || !b) return null;

  const ra = parseResultado(a.actual_result);
  const rb = parseResultado(b.actual_result);
  const has = (x) => String(x || '').trim() !== '';

  // Diff estruturado: separa cabeçalho [AMBIENTE data | URL] (sempre diferente) do conteúdo.
  const parts = [
    { label: 'Narrativa', a: ra.narrativa, b: rb.narrativa },
    { label: 'Obs.', a: ra.obs, b: rb.obs },
    { label: 'Evidencia', a: ra.evidencia, b: rb.evidencia }
  ].filter((p) => has(p.a) || has(p.b));
  if (!parts.length) {
    parts.push({ label: 'Resultado Obtido', a: a.actual_result, b: b.actual_result });
  }

  const stepsA = new Map((a.steps || []).map((s) => [Number(s.step_order), s]));
  const stepsB = new Map((b.steps || []).map((s) => [Number(s.step_order), s]));
  const orders = [...new Set([...(a.steps || []), ...(b.steps || [])].map((s) => Number(s.step_order)))]
    .sort((x, y) => x - y);

  const divergedCount = orders.reduce((acc, o) => {
    const sa = stepsA.get(o);
    const sb = stepsB.get(o);
    return acc + ((sa?.actual || '') !== (sb?.actual || '') || (sa?.result || '') !== (sb?.result || '') ? 1 : 0);
  }, 0);

  return (
    <Modal open onClose={onClose} width={1100} title={`Comparar execuções — ${a.test_case_code || a.test_case_title || ''}`}>
      <div className="compare-grid">
        <ExecPanel exec={a} side="A" />
        <ExecPanel exec={b} side="B" />
      </div>

      <h3 className="compare-section-title">
        Diff do Resultado Obtido
        {divergedCount > 0 && <span className="compare-flag">{divergedCount} passo(s) divergente(s)</span>}
      </h3>
      <div className="diff-box">
        <div className="diff-legend">
          <span><span className="diff-tok del">removido em B</span> (só na execução A)</span>
          <span><span className="diff-tok add">adicionado em B</span> (só na execução B)</span>
        </div>
        {parts.map((p) => (
          <div className="diff-row" key={p.label}>
            <span className="diff-label">{p.label}</span>
            <DiffText tokens={diffTokens(p.a, p.b)} />
          </div>
        ))}
      </div>

      <h3 className="compare-section-title">Passos executados ({orders.length})</h3>
      {orders.length === 0 && <div className="muted small">Sem passos registrados nas execuções.</div>}
      <div className="compare-steps">
        {orders.map((o) => {
          const sa = stepsA.get(o);
          const sb = stepsB.get(o);
          const actA = sa?.actual || '';
          const actB = sb?.actual || '';
          const resA = sa?.result || '';
          const resB = sb?.result || '';
          const diverged = actA !== actB || resA !== resB;
          const stepTokens = diffTokens(actA, actB);
          return (
            <div className={`compare-step ${diverged ? 'diverged' : ''}`} key={o}>
              <div className="compare-step-head">
                <span className="step-num">{o}</span>
                <strong>{sa?.action || sb?.action || `Passo ${o}`}</strong>
                {diverged && <span className="compare-flag">divergente</span>}
              </div>
              <div className="muted small compare-expected">Esperado: {sa?.expected || sb?.expected || '—'}</div>
              <div className="compare-step-cols">
                <div className={`compare-step-cell ${actA ? '' : 'empty'}`}>
                  <span className="compare-side-tag">A</span>
                  {actA
                    ? <DiffText tokens={stepTokens} side="A" />
                    : <span className="muted small">Sem registro.</span>}
                  <Badge tone={toneFor(resA)}>{resA || '—'}</Badge>
                </div>
                <div className={`compare-step-cell ${actB ? '' : 'empty'}`}>
                  <span className="compare-side-tag">B</span>
                  {actB
                    ? <DiffText tokens={stepTokens} side="B" />
                    : <span className="muted small">Sem registro.</span>}
                  <Badge tone={toneFor(resB)}>{resB || '—'}</Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

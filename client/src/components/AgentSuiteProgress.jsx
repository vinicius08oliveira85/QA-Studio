import React from 'react';
import { Badge } from './ui.jsx';
import { toneFor } from '../utils.js';

function normalizedStatus(item) {
  if (item.status === 'Não Executado' && item.reportStatus === 'skippedByUser') return 'Pulado';
  return item.status || 'Pendente';
}

export default function AgentSuiteProgress({ items = [], summary }) {
  if (!items.length) return null;
  const passed = items.filter((item) => normalizedStatus(item) === 'Passou').length;
  const finished = items.filter((item) =>
    ['Passou', 'Falhou', 'Bloqueado', 'Não Executado', 'Pulado'].includes(normalizedStatus(item))
  ).length;

  return (
    <div className="agent-suite-progress" aria-label="Progresso do Agent ao vivo">
      <div className="agent-suite-summary">
        <strong>Suíte contínua</strong>
        <span className="muted small">
          {summary
            ? ` · ${summary.passed}/${summary.total} passou`
            : ` · ${finished}/${items.length} concluído · ${passed} passou`}
        </span>
      </div>
      <div className="agent-suite-items">
        {items
          .slice()
          .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
          .map((item) => {
            const status = normalizedStatus(item);
            return (
              <div className="agent-suite-item" key={item.caseId}>
                <div>
                  <strong>{item.code || `Caso ${item.caseId}`}</strong>
                  {item.title && <span className="muted small"> · {item.title}</span>}
                  {item.error && <div className="small agent-suite-error">{item.error}</div>}
                </div>
                <Badge tone={toneFor(status)}>{status}</Badge>
              </div>
            );
          })}
      </div>
    </div>
  );
}

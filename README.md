# QA Studio - Aplicativo de Testes para QA

Aplicativo local (Web App) para concentrar todo o ciclo de testes de um QA: da análise de
requisitos até a liberação, com todas as seções integradas entre si.

## Como rodar

Pré-requisitos: Node.js 24+ (usa o módulo nativo `node:sqlite`, sem dependências nativas).

> No Windows, se o PowerShell bloquear `npm.ps1` (execution policy), use `npm.cmd`.

### Opção 1 - Produção local (recomendada)

```bash
npm.cmd install        # instala dependências do servidor e do client (postinstall)
npm.cmd run build      # gera o frontend estático em client/dist
npm.cmd start          # sobe tudo em http://localhost:3001
```

### Opção 2 - Desenvolvimento (hot reload)

```bash
npm.cmd install
npm.cmd run dev        # servidor na 3001 + Vite na 5173 (proxy /api)
```

Abra http://localhost:3001 (produção) ou http://localhost:5173 (dev).

Os dados ficam no arquivo local `data/qa.db` (SQLite). Uso pessoal, sem login.

## Variáveis de ambiente (opcionais)

| Variável | Onde | Padrão | Efeito |
|---|---|---|---|
| `PORT` | servidor | `3001` | Porta da API |
| `APP_TOKEN` | servidor | — | Exige header `x-app-token` em `/api` (acesso remoto) |
| `CORS_ORIGIN` | servidor | — | Habilita CORS para o client em outra origem |
| `GEMINI_TIMEOUT_MS` | servidor | `60000` | Timeout do fetch à API Gemini |
| `QA_API_BASE` | tests / agent-runner | `http://localhost:3001/api` | URL da API para `scripts/test-api.js` |
| `QA_APP_TOKEN` | agent-runner | — | Enviado como `x-app-token` ao chamar a API |
| `QA_API_TIMEOUT_MS` / `QA_API_RETRIES` | agent-runner | `30000` / `0` | Timeout e tentativas do client HTTP do runner |
| `TARGET_BASE_URL` | agent-runner | — | App/API sob teste (obrigatória na CLI) |
| `PLAYWRIGHT_TIMEOUT_MS` | agent-runner | `900000` | Timeout do Chromium; encerra o processo se estourar |
| `ARTIFACT_MAX_BYTES` | agent-runner | `10485760` | Tamanho máximo de artefato persistido em `specs/` |

## As 5 seções (integradas entre si)

1. **Análise de Requisitos e Planejamento**
   - Requisitos e Regras de Negócio
   - Estratégia de Teste
2. **Criação de Casos de Teste (Design)**
   - Cenários de Teste
   - Casos de Teste (passos, prioridade, tipo, modo manual/automatizado)
   - Massa de Teste
3. **Execução e Validação**
   - Teste de Fumaça
   - Teste Funcional (Manual/Automatizado)
   - Teste de API
4. **Reporte e Acompanhamento de Bugs**
   - Documentar Bug
   - Reteste
5. **Teste de Regressão e Fechamento**
   - Rodar Regressão
   - Automatizar Processos Repetitivos
   - Homologação / Liberação

## Como as seções conversam entre si

- **Requisito → Design:** cada caso de teste referencia requisito, regra de negócio, cenário e estratégia.
- **Design → Execução:** os casos aparecem por tipo nas telas de execução (fumaça/funcional/API) e a massa de teste é exibida no momento de executar.
- **Execução → Bug:** ao registrar uma execução **Falhou**, o app abre o formulário de bug pré-preenchido (caso, passos, resultado esperado/obtido, ambiente). É possível reportar bug a partir do histórico ou do detalhe de uma execução.
- **Bug → Reteste:** cada reteste aponta para o bug; reteste com **Passou** fecha o bug automaticamente.
- **Execução/Bugs → Fechamento:** a regressão monta o pacote a partir dos casos marcados como regressão e permite reportar bugs direto dos casos falhos. A **Homologação/Liberação** consolida requisitos, cobertura, execuções, taxa de aprovação e bugs abertos para apoiar a decisão de liberar a release.
- **Automação:** sugere casos repetitivos (com muitas execuções) para automatização e atualiza o modo dos casos.
- **Dashboard:** consolida as métricas de todas as seções e alerta requisitos sem cobertura de testes.

## Estrutura

```
server/          API REST (Express + node:sqlite) e schema do banco
server/routes/   Rotas por área (projetos, requisitos, casos, execuções, bugs, regressão...)
client/          Frontend React (Vite)
agent-runner/    CLI Playwright + agent (OpenCode/Cursor) com autofill de execuções
scripts/         Testes de integração da API (scripts/test-api.js)
data/            Banco SQLite local (criado automaticamente)
```

## Execução com agent (Playwright / Postman + OpenCode/Cursor)

Fluxo híbrido: a CLI (ou a UI) gera artefato a partir dos **passos + massa**, executa, pede ao agent para julgar e grava via `POST /api/executions`.

| Tipo do caso | Artefato | Runner |
|---|---|---|
| Fumaça / Funcional | Playwright `.spec.ts` | Chromium |
| API | Coleção Postman v2.1 | `fetch` nativo (sem Newman) |

Specs/coleções úteis são copiadas para `agent-runner/specs/` (versionáveis). Cópias efêmeras ficam em `.generated/` (gitignored).

### Pré-requisitos

1. QA Studio rodando (`npm run dev` ou `npm start`) — API em `http://localhost:3001`
2. Node deps do runner: `npm.cmd --prefix agent-runner install` (instala Chromium do Playwright)
3. Agent configurado:
   - **OpenCode** (padrão): CLI `opencode` no PATH
   - **Cursor**: `CURSOR_API_KEY` e `@cursor/sdk`
4. `agent-runner/.env` com `TARGET_BASE_URL` apontando para o app/API sob teste (veja `.env.example`)

### Pela UI

Nas abas **Fumaça**, **Funcional** ou **API**:

- **Agent** na linha do caso — executa 1 caso
- **Agent (N)** no header — fila todos os casos **Automatizado** da aba
- No modal de execução manual: **Executar com agent**

Status do job aparece no banner; ao terminar, o histórico atualiza (`tester` = `agent:opencode` ou `agent:cursor`).

API usada pela UI: `POST /api/agent-runs` (`caseId` ou `taskId` + `type`) e `GET /api/agent-runs/:id`.

### Pela CLI

```bash
# 1 caso
npm.cmd run test:agent -- --caseId=22
npm.cmd run test:agent -- --caseId=22 --agent=cursor
# CI / sem janela:
npm.cmd run test:agent -- --caseId=22 --headless

# Fila da tarefa (só Automatizado; use --all-modes para incluir Manual)
npm.cmd run test:agent -- --taskId=3 --type=Funcional
npm.cmd run test:agent -- --taskId=3 --type=API
```

Artifacts (screenshots / logs) em `agent-runner/artifacts/`.

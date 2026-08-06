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

O servidor carrega automaticamente um arquivo `.env` na raiz do projeto (usando o loader nativo do
Node ≥ 20.12, sem dependência externa) antes de ler qualquer variável. Copie o
[`.env.example`](.env.example) para `.env` e ajuste — o `.env` é ignorado pelo git. As mesmas
variáveis também podem ser exportadas no shell; na Vercel elas são definidas em
*Project Settings → Environment Variables*. Variáveis definidas no `.env` também são repassadas aos
jobs do agent-runner iniciados pela UI (o servidor propaga `process.env` ao processo filho).

> Precedência: valores já definidos no ambiente (shell ou Vercel) **vencem** os do `.env` — o loader
> nativo não sobrescreve variáveis existentes, igual ao comportamento padrão do dotenv.

| Variável | Onde | Padrão | Efeito |
|---|---|---|---|
| `GEMINI_API_KEY` | servidor | — | Chave da API Gemini (alternativa à tela Configurações) |
| `GEMINI_TIMEOUT_MS` | servidor | `60000` | Timeout do fetch à API Gemini |
| `PORT` | servidor | `3001` | Porta da API |
| `APP_TOKEN` | servidor | — | Exige header `x-app-token` em `/api` (acesso remoto) |
| `CORS_ORIGIN` | servidor | — | Habilita CORS para o client em outra origem |
| `QA_DB_PATH` | servidor | `data/qa.db` | Caminho do banco SQLite |
| `AGENT` | servidor | `opencode` | Agente padrão dos jobs de execução automática |
| `AGENT_JOB_TIMEOUT_MS` | servidor | `1800000` | Tempo máximo de um job de execução com agent (30 min) |
| `QA_API_BASE` | tests / agent-runner | `http://localhost:3001/api` | URL da API para `scripts/test-api.js` |
| `QA_APP_TOKEN` | agent-runner | — | Enviado como `x-app-token` ao chamar a API |
| `QA_API_TIMEOUT_MS` / `QA_API_RETRIES` | agent-runner | `30000` / `0` | Timeout e tentativas do client HTTP do runner |
| `TARGET_BASE_URL` | agent-runner | — | App/API sob teste (obrigatória na CLI) |
| `PLAYWRIGHT_TIMEOUT_MS` | agent-runner | `900000` | Timeout do Chromium; encerra o processo se estourar |
| `PLAYWRIGHT_RETRIES` | agent-runner | `0` | Reexecuta o caso automaticamente em falha (ex.: `1` na CI) |
| `SSO_STATE_OFF` | agent-runner | — | `1` desliga o reuso de sessão de login entre casos da fila |
| `SSO_HEADLESS_WAIT` | agent-runner | — | `1` aguarda o botão "Já fiz login" do Studio mesmo em headless (default: falha rápido) |
| `SSO_STATE_MAX_AGE_DAYS` | agent-runner | `7` | Avisa quando a sessão SSO salva está mais velha que N dias (provável expiração) |
| `CASE_RETRIES` | agent-runner | `1` | Retenta casos que falharam por infra (timeout/crash/rede); veredito `Falhou` nunca retenta |
| `EVIDENCE_RUNS` | agent-runner | `20` | Bundles de evidência mantidos em `artifacts/runs/` (mais antigos são apagados) |
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

## Backup de projetos (Exportar / Importar)

Na tela **Configurações**:

- **Exportar projeto** — baixa um arquivo JSON com o projeto e todos os dados vinculados
  (tarefas, requisitos, regras de negócio, estratégias, cenários, casos de teste com passos,
  massa de teste, execuções, bugs e retestes, regressões, automações e releases).
- **Importar projeto** — restaura um arquivo de backup criando um **projeto novo** (os ids são
  remapeados automaticamente, preservando todas as referências entre os registros). O backup
  pode ser importado em qualquer máquina ou após migrar o `data/qa.db`.

O arquivo tem assinatura `{ "app": "qa-studio", "type": "project-export", "version": 1 }` e a
chave da API Gemini (`settings`) nunca é exportada. A importação roda em transação: se qualquer
passo falhar, nenhum dado é gravado. API: `GET /api/backups/projects/:id/export` e
`POST /api/backups/import` (aceita arquivos de até 25 MB).

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
# Regrava no Studio as execuções que caíram no fallback local (API estava fora)
npm.cmd run test:agent -- --replay-failed
```

Artifacts (screenshots / logs) em `agent-runner/artifacts/`. Cada caso gera um bundle de evidência em `artifacts/runs/<timestamp>-<código>/` (screenshots, report.json, HTML report, spec, judgment.json, execution.json) — os mais antigos são podados (`EVIDENCE_RUNS`). Specs são cacheados por **hash do conteúdo**: só são reutilizados se passos/massa não mudaram. A sessão de login é salva por ambiente em `artifacts/sso-state-<hash>.json`. Se a API cair ao gravar o resultado, o veredito é preservado em `artifacts/failed-executions/` e pode ser regravado com `--replay-failed` quando a API voltar. Cada fila grava `artifacts/results.json` (resumo por caso, com tempos por etapa) e `artifacts/last-run.json` (lista dos bundles mais recentes). Se o SUT exibir tela de erro no fluxo (ex.: "Não foi possível carregar as clínicas"), o spec lança `SUT_ERROR: <texto>` e o caso é registrado como **Bloqueado (falha de ambiente)**, sujeito ao retry do `CASE_RETRIES` — sem ser contabilizado como falha do teste.

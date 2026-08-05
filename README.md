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
scripts/         Testes de integração da API (scripts/test-api.js)
data/            Banco SQLite local (criado automaticamente)
```

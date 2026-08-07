# agent-runner — Automação Playwright do QA Studio

CLI de execução de casos de teste com Playwright + agente (OpenCode/Cursor) e navegação
**semântica do CPM** (Leve Saúde) reutilizável via `src/cpmNav.js`.

- [Execução com agent (visão geral)](../README.md#execução-com-agent-playwright--postman--opencodecursor)
- Testes unitários: `npm run test:unit` (roda `node --test src/*.test.js`)
- Dependências: `npm install` (postinstall instala o Chromium do Playwright)
- Config: `agent-runner/.env` com `TARGET_BASE_URL` (veja `.env.example`)

---

## `src/cpmNav.js` — Navegação semântica do CPM (reutilizável)

Módulo com o fluxo real do CPM mapeado por exploração. Qualquer runner/tarefa pode adotá-lo em
vez de reimplementar cliques frágeis por texto. Fluxo mapeado:

```
menu Atendimento → Ambulatorial
→ combobox Clínica → Especialidade → Profissional (opções reais)
→ calendário: dia com pacientes / dia com finalizados
→ listagem de pacientes (cards com "Iniciar")
→ prontuário (abre em NOVA aba com token JWT)
```

### Como usar

```js
const cpm = require('./cpmNav'); // ou path.join(ROOT, 'src', 'cpmNav')

await cpm.gotoAmbulatorial(page);
await cpm.ensureAgenda(page);                       // defaults: TIJUCA / Clinica medica / Dr. Physician
await cpm.ensureDayWithPatients(page);              // garante um dia com pacientes agendados
await cpm.openFirstAwaiting(page);                  // clica em "Iniciar" do 1º aguardando
page = await cpm.resolveActivePage(page);           // prontuário abriu em nova aba — aponte para ela
```

### Referência de funções

**Utilitários de interação (resilientes a overlay/dropdown do CPM):**

| Função | Descrição |
|---|---|
| `clickDom(page, label)` | Clique nativo via DOM (rápido, ignora actionability check). Bom para dropdowns sob overlay. |
| `clickBest(page, label)` | Clique robusto: locators do Playwright (auto-wait) + fallback DOM fuzzy normalizado. |
| `selectCombo(page, comboLabel, option)` | Abre o combobox pelo rótulo e escolhe a opção exata (evita o menu lateral "Clínicas"). |
| `fillBest(page, hint, value)` | Preenche o melhor input/textarea visível cujo label/placeholder casa com `hint`. |
| `closeModal(page)` | Fecha o modal ativo com os botões reais do CPM: `Close` → `Cancelar` → `X` → `Escape`. |
| `bodyText(page)` | Texto visível da página normalizado (minúsculas, sem acentos, só a-z0-9). |
| `expectTextVisible(page, text)` | Verifica texto na tela (substring exata ou overlap ≥ 55% de palavras significativas). |
| `detectSutError(page)` | Detecta mensagens de erro/empty-state do SUT (ex.: "não foi possível..."). |
| `normalize(s)` | Normaliza texto para comparação (caixa, acentos, pontuação). |
| `cleanUrl(u)` | Remove o token JWT (`eyJ...`) das URLs do prontuário — relatório/verificação legível. |
| `screenSnapshot(page)` | **Foto do estado REAL da tela**: combos (com valor aplicado), opções visíveis do dropdown, contadores `aguardando N` / `finalizado N`, botão "Iniciar", erro do SUT e início do texto da página. |
| `waitForCondition(page, opts, predicate)` | **Polling por condição real** (nunca wait fixo): chama `predicate()` a cada `interval` ms até retornar `{ ok: true, ... }` ou esgotar `timeout`. `opts`: `{ label, timeout, interval, log }`. |

**Navegação do CPM:**

| Função | Descrição |
|---|---|
| `gotoAmbulatorial(page)` | Menu Atendimento → Ambulatorial (no-op se já estiver lá). |
| `comboValues(page)` | Lê o texto atual de cada `[role=combobox]` da página. |
| `ensureAgenda(page, opts?)` | Seleciona Clínica → Especialidade → Profissional (pula combos já selecionados) e espera a listagem carregar. `opts`: `{ clinica, especialidade, profissional }`. |
| `waitAgendaLoaded(page, tries?)` | Espera a agenda carregar de verdade (botão "Iniciar" visível ou contador "aguardando N > 0"). |
| `ensureDayWithPatients(page)` | Garante um dia com pacientes agendados (navega "Anterior" até achar). |
| `ensureDayWithFinalized(page)` | Garante um dia com atendimentos FINALIZADOS. |
| `openFirstAwaiting(page)` | Abre o primeiro atendimento "Aguardando" (botão `Iniciar`). |
| `patientHeader(page)` | Nome do paciente no cabeçalho do prontuário. |
| `CPM_AGENDA_DEFAULTS` | `{ clinica: 'LEVE CLINICA TIJUCA', especialidade: 'Clinica medica', profissional: 'Dr. Physician' }` |

**Página ativa (prontuário abre em nova aba):**

| Função | Descrição |
|---|---|
| `cdpResident()` | Conexão CDP única e cacheada (evita páginas órfãs de conexões fechadas). |
| `resolveActivePage(page)` | Retorna a página certa: prontuário (token JWT) → ambulatorial → primeira. **Use após clicar "Iniciar".** |
| `resetCdpResident()` | Zera a conexão cacheada (chame após `browserSession.stop()`). |

### Exemplo de runner completo

```js
const browserSession = require('./browserSession');
const cpm = require('./cpmNav');

async function run() {
  await browserSession.start({ headed: true, statePath, baseURL: process.env.TARGET_BASE_URL });

  try {
    const resident = await cpm.cdpResident();
    let page = resident.page;

    // Login SSO (se necessário) + preparação da agenda
    await cpm.gotoAmbulatorial(page);
    await cpm.ensureAgenda(page);
    await cpm.ensureDayWithPatients(page);

    // Para cada caso:
    // 1) sempre resolva a página ativa (o prontuário abre em nova aba)
    page = await cpm.resolveActivePage(page);
    // 2) interaja com os passos usando os utilitários
    await cpm.clickBest(page, 'Estruturar com IA');
    await cpm.closeModal(page);
    await cpm.fillBest(page, 'texto livre da consulta', 'Paciente vem para check-up de rotina.');
  } finally {
    await browserSession.stop();
    cpm.resetCdpResident();
  }
}
```

### PADRÃO: enxergar o estado real da tela a cada passo

A regra de ouro deste módulo: **nunca confie no que você clicou — confie no que a tela
mostra.** Todo passo assíncrono (dropdown que carrega por API, agenda, modal, status) deve:

1. **Abrir** o elemento (combobox, botão, aba).
2. **Aguardar a condição REAL** com `waitForCondition` (nunca `waitForTimeout` fixo) — ex.:
   as opções do Radix `[role=option]` só existem no DOM depois da API responder.
3. **Clicar** na opção exata (via DOM, sem fuzzy global que acerta o menu lateral).
4. **Confirmar** que o valor foi aplicado de verdade lendo `screenSnapshot().combos` — o
   Radix troca o texto do botão só quando a seleção é registrada. Se não aplicou, reabre e
   tenta de novo (máx 3).

```js
const snap = await cpm.screenSnapshot(page);
console.log(snap.combos, snap.awaiting, snap.hasIniciar, snap.sutError);

const w = await cpm.waitForCondition(page, { label: 'paciente carregado', timeout: 15_000 }, async () => {
  const s = await cpm.screenSnapshot(page);
  return s.hasIniciar ? { ok: true, via: 'iniciar-visible', snapshot: s } : { ok: false };
});
```

### Dicas para outros runners/tarefas

- **Sempre** chame `resolveActivePage(page)` antes de interagir depois do "Iniciar" — o prontuário
  abre em outra aba e o runner preso na listagem "não enxerga" os modais do prontuário.
- **Nunca use `waitForTimeout` para esperar estado**: use `waitForCondition` + `screenSnapshot`
  (espera a condição real; é mais rápido quando a tela responde cedo e não trava quando demora).
- A dependência real do CPM: Especialidade só carrega DEPOIS da Clínica aplicada, e o
  Profissional só depois da Especialidade. O `selectCombo`/`ensureAgenda` confirmam cada
  seleção via `comboValues` antes de avançar — mantenha isso em qualquer fluxo novo.
- Prefira `selectCombo`/`clickBest` a `page.getByText(...).click()`: o CPM tem overlay/spinner que
  derruba a actionability check do Playwright.
- `ensureAgenda` é idempotente: pode ser chamado de novo sem resetar a seleção.
- `closeModal` usa o botão literal **"Close"** do CPM (mapeado em exploração) antes de tentar
  Cancelar/X/Escape.
- Testes do módulo: `src/cpmNav.test.js` (parte pura, sem browser) — rode `npm run test:unit`.
- Referência de implementação real: `scripts/run-gmptl141.js` (runner GMPTL-141 com Resultado
  Obtido formatado `[HOMOL dd/mm/aaaa | URL] VEREDITO. narrativa... Obs.: ... Evidencia: ...`).

---

## Testes

```bash
npm run test:unit        # node --test src/*.test.js (inclui cpmNav.test.js)
```

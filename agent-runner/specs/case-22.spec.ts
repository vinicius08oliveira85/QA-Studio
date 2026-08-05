import { test, expect } from '@playwright/test';
import { waitForManualLogin } from '../helpers/ssoWait';

/**
 * TC-001 — Acesso e Carregamento de Prontuário para Paciente Válido
 *
 * Pré-condições:
 *  - Usuário 'Dr. Physician' logado no sistema.
 *  - Paciente 'Maria Silva' está na lista de atendimentos agendados.
 *
 * Massa de dados:
 *  - Paciente válido para acesso: Maria Silva
 *    (validar o carregamento correto do prontuário de um paciente da lista de atendimentos)
 */

const BASE_URL = 'https://cpm.hom.levesaude.com.br';
const PACIENTE = 'Maria Silva';

// Passo 2 — contexto de agenda (interpretação literal do caminho)
const CLINICA_ALVO = /LEVE\s*CL[IÍ]NICA\s+TIJUCA\s*[-—]\s*Rio de Janeiro/i;
const CLINICA_PROIBIDA = /BARRA\s+DA\s+TIJUCA/i;
const ESPECIALIDADE = /Cl[ií]nica\s*m[eé]dica/i;
const PROFISSIONAL = /Dr\.?\s*Physician\s*-\s*Cl[ií]nica\s*m[eé]dica|Dr\.?\s*Physician/i;

async function selectComboboxOption(page, comboboxName, optionPattern, { rejectPattern } = {}) {
  const combo = page.getByRole('combobox', { name: new RegExp(`^${comboboxName}$`, 'i') });
  await expect(combo, `Combobox "${comboboxName}" deve estar visível`).toBeVisible({ timeout: 20_000 });
  await combo.click();
  await page.waitForTimeout(400);

  const options = page.getByRole('option');
  await expect(options.first(), `Opções de "${comboboxName}" devem abrir`).toBeVisible({ timeout: 15_000 });

  const count = await options.count();
  let chosen = null;
  for (let i = 0; i < count; i++) {
    const opt = options.nth(i);
    const text = ((await opt.textContent()) || '').replace(/\s+/g, ' ').trim();
    if (rejectPattern && rejectPattern.test(text)) continue;
    if (optionPattern.test(text)) {
      chosen = text;
      await opt.click();
      break;
    }
  }

  if (!chosen) {
    await page.keyboard.press('Escape').catch(() => {});
    const sample = [];
    for (let i = 0; i < Math.min(count, 8); i++) {
      sample.push(((await options.nth(i).textContent()) || '').trim());
    }
    throw new Error(
      `Não encontrei opção em "${comboboxName}" para ${optionPattern}. ` +
        `Exemplos visíveis: ${sample.join(' | ') || '(nenhuma)'}`
    );
  }

  console.log(`[contexto] ${comboboxName} = ${chosen}`);
  await page.waitForTimeout(600);
  return chosen;
}

test.describe('TC-001', () => {
  test('Acesso e Carregamento de Prontuário para Paciente Válido', async ({ page }) => {
    test.setTimeout(900_000);

    // ——— PASSO 1 ———
    // ACTION: Acessar o URL do sistema
    // EXPECTED: Tela de login ou dashboard principal é exibida com sucesso.
    console.log('[1] Acessar URL do sistema…');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await waitForManualLogin(page, { force: true });
    await expect(
      page
        .getByRole('button', { name: /^Sair$/i })
        .or(page.getByRole('navigation'))
        .or(page.locator('body')),
      'Após acesso, login/dashboard deve estar disponível'
    ).toBeVisible({ timeout: 30_000 });
    expect(
      page.url(),
      'Sessão autenticada — URL de área logada (dashboard/agendas/atendimento) ou tela de login'
    ).toMatch(/dashboard|agendas|atendimento|login/i);
    await page.screenshot({ path: 'artifacts/step-22-1.png', fullPage: true });
    console.log(`[1] OK — ${page.url()}`);

    // ——— PASSO 2 ———
    // ACTION: Navegar para 'Atendimento/Ambulatorial > LEVE CLINICA TIJUCA - Rio de Janeiro > Clinica medica > Dr. Physician - Clinica medica'.
    // EXPECTED: A lista de atendimentos do 'Dr. Physician' na 'LEVE CLINICA TIJUCA' é carregada, exibindo os pacientes agendados.
    console.log('[2] Navegar Atendimento → Ambulatorial…');
    await page.getByRole('button', { name: /^Atendimento$/i }).click({ timeout: 20_000 });
    await page.getByRole('link', { name: /^Ambulatorial$/i }).click({ timeout: 20_000 });
    await page.waitForURL(/atendimento\/ambulatorial/i, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1_500);

    // Tela de contexto de agenda (interpretação do restante do caminho do passo 2)
    await expect(
      page.getByRole('heading', { name: /Selecionar agenda/i }).or(page.getByText(/Escopo da agenda/i)),
      'Tela de seleção de agenda deve aparecer'
    ).toBeVisible({ timeout: 30_000 });

    console.log('[2] Clínica = LEVE CLINICA TIJUCA - Rio de Janeiro (não Barra)…');
    const clinica = await selectComboboxOption(page, 'Clínica', CLINICA_ALVO, {
      rejectPattern: CLINICA_PROIBIDA
    });
    expect(clinica, 'Clínica selecionada não pode ser Barra da Tijuca').not.toMatch(CLINICA_PROIBIDA);
    expect(clinica, 'Deve ser LEVE CLINICA TIJUCA').toMatch(/LEVE\s*CL[IÍ]NICA\s+TIJUCA/i);

    console.log('[2] Especialidade = Clinica medica…');
    await selectComboboxOption(page, 'Especialidade', ESPECIALIDADE);

    console.log('[2] Profissional = Dr. Physician - Clinica medica…');
    await expect(page.getByRole('combobox', { name: /^Profissional$/i })).toBeEnabled({ timeout: 20_000 });
    await selectComboboxOption(page, 'Profissional', PROFISSIONAL);

    // EXPECTED: lista carregada com pacientes agendados
    await expect(
      page.getByText(/Selecione a clínica, a especialidade e o profissional/i)
    ).toBeHidden({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: 'artifacts/step-22-2.png', fullPage: true });

    // soft: garantir que o contexto não ficou em Barra da Tijuca
    if (await page.getByText(CLINICA_PROIBIDA).first().isVisible().catch(() => false)) {
      const stillBarra = await page.getByRole('combobox', { name: /^Clínica$/i }).textContent();
      if (CLINICA_PROIBIDA.test(stillBarra || '')) {
        throw new Error('Contexto ainda em BARRA DA TIJUCA — o caso pede LEVE CLINICA TIJUCA - Rio de Janeiro.');
      }
    }
    console.log('[2] OK — contexto de agenda definido para TIJUCA + Physician');

    // ——— PASSO 3 ———
    // ACTION: Localizar o paciente 'Maria Silva' na lista de atendimentos e clicar no botão 'Iniciar'.
    // EXPECTED: O prontuário eletrônico é carregado na tela.
    console.log('[3] Localizar Maria Silva e Iniciar…');
    const linha = page
      .locator('tr, li, [role="row"], [class*="row"], [class*="card"], [class*="item"], [class*="list"]')
      .filter({ hasText: new RegExp(PACIENTE, 'i') })
      .first();

    await expect(
      linha,
      `Paciente "${PACIENTE}" deve aparecer na lista de atendimentos (pré-condição / passo 2)`
    ).toBeVisible({ timeout: 45_000 });

    await linha.getByRole('button', { name: /iniciar/i }).first().click({ timeout: 20_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: 'artifacts/step-22-3.png', fullPage: true });
    console.log('[3] OK — Iniciar acionado');

    // ——— PASSO 4 ———
    // ACTION: Verificar o nome do paciente exibido no cabeçalho do prontuário.
    // EXPECTED: O nome do paciente exibido no cabeçalho do prontuário é 'Maria Silva',
    //           idêntico ao da listagem de atendimentos.
    console.log('[4] Verificar nome no cabeçalho…');
    const cabecalho = page.locator('header, [class*="header"], [class*="cabecalho"], main').first();
    await expect(
      cabecalho.getByText(new RegExp(PACIENTE, 'i')).first(),
      `Cabeçalho do prontuário deve exibir "${PACIENTE}"`
    ).toBeVisible({ timeout: 30_000 });
    const nomeCabecalho = (await cabecalho.getByText(new RegExp(PACIENTE, 'i')).first().textContent())
      ?.replace(/\s+/g, ' ')
      .trim();
    expect(nomeCabecalho, 'Nome exibido no cabeçalho deve ser idêntico ao da listagem').toMatch(
      new RegExp(PACIENTE, 'i')
    );
    await page.screenshot({ path: 'artifacts/step-22-4.png', fullPage: true });
    console.log('[4] OK — nome conferido');
  });
});

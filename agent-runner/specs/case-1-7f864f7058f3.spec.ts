import { test, expect } from '@playwright/test';
import { waitForManualLogin } from '../helpers/ssoWait';

/**
 * TC-001 — Acesso bem-sucedido e início de atendimento de paciente
 * Login: Microsoft SSO (botão "Entrar com Microsoft") — sem campos email/senha na landing.
 */

const PACIENTE = 'Carlos Machado Monteiro';
const CLINICA_ALVO = /LEVE\s*CL[IÍ]NICA\s+TIJUCA\s*[-—]\s*Rio de Janeiro/i;
const CLINICA_PROIBIDA = /BARRA\s+DA\s+TIJUCA/i;
const ESPECIALIDADE = /Cl[ií]nica\s*m[eé]dica/i;
const PROFISSIONAL = /Dr\.?\s*Physician\s*-\s*Cl[ií]nica\s*m[eé]dica|Dr\.?\s*Physician/i;

async function selectComboboxOption(page, comboboxName, optionPattern, { rejectPattern } = {}) {
  const combo = page.getByRole('combobox', { name: new RegExp(`^${comboboxName}$`, 'i') });
  await expect(combo, `Combobox "${comboboxName}" deve estar visível`).toBeVisible({ timeout: 20_000 });
  await combo.click();

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
        `Exemplos: ${sample.join(' | ') || '(nenhuma)'}`
    );
  }
  return chosen;
}

async function clickMenu(page, label) {
  const loc = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') })
    .or(page.getByRole('link', { name: new RegExp(`^${label}$`, 'i') })
    .or(page.getByRole('menuitem', { name: new RegExp(label, 'i') })));
  await expect(loc.first()).toBeVisible({ timeout: 20_000 });
  await loc.first().click();
}

test.describe('TC-001', () => {
  test('Acesso bem-sucedido e início de atendimento de paciente', async ({ page }) => {
    test.setTimeout(900_000);

    await test.step('Passo 1 — Acessar a URL do sistema', async () => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(
        page.getByRole('button', { name: /Entrar com Microsoft/i })
          .or(page.getByRole('button', { name: /^Sair$/i }))
      ).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'artifacts/step-1-1.png', fullPage: true });
    });

    await test.step('Passo 2 — Login SSO Microsoft', async () => {
      const msBtn = page.getByRole('button', { name: /Entrar com Microsoft/i });
      if (await msBtn.count()) {
        await msBtn.click();
      }
      await waitForManualLogin(page, { force: true });
      await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: 'artifacts/step-1-2.png', fullPage: true });
    });

    await test.step('Passo 3 — Navegar para lista de pacientes', async () => {
      // Menu lateral pode ser button/link (não só link).
      await clickMenu(page, 'Atendimento');
      await clickMenu(page, 'Ambulatorial');

      await selectComboboxOption(page, 'Clínica', CLINICA_ALVO, { rejectPattern: CLINICA_PROIBIDA });
      await selectComboboxOption(page, 'Especialidade', ESPECIALIDADE);
      await selectComboboxOption(page, 'Profissional', PROFISSIONAL);

      await expect(page.getByText(new RegExp(PACIENTE, 'i')).first()).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: 'artifacts/step-1-3.png', fullPage: true });
    });

    await test.step('Passo 4 — Iniciar atendimento do paciente', async () => {
      await expect(page.getByText(new RegExp(PACIENTE, 'i')).first()).toBeVisible({ timeout: 30_000 });

      const row = page.locator(`tr:has-text("${PACIENTE}")`);
      const iniciar = row.getByRole('button', { name: /Iniciar/i })
        .or(page.getByRole('button', { name: /^Iniciar$/i }));
      await iniciar.first().click();

      await expect(
        page.getByText(/prontu[aá]rio|anamnese|Subjetivo|Objetivo|Avalia/i).first()
      ).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: 'artifacts/step-1-4.png', fullPage: true });
    });
  });
});

import { test, expect } from '@playwright/test';
import { waitForManualLogin } from '../helpers/ssoWait';

test.describe('TC-001', () => {
  test('Acesso bem-sucedido e início de atendimento de paciente', async ({ page }) => {
    // Helper function to check for SUT errors
    const checkForSUTError = async () => {
      const errorMessage = await page.locator('body').textContent();
      const errorPatterns = /não foi possível|erro ao|falha ao|ocorreu um erro|não carregou|indisponível|sem dados/i;
      if (errorMessage && errorPatterns.test(errorMessage)) {
        throw new Error('SUT_ERROR: ' + errorMessage.trim());
      }
    };

    await test.step('Passo 1 — Acessar a URL do sistema', async () => {
      await page.goto('/');
      await checkForSUTError();
      await page.screenshot({ path: 'artifacts/step-1-1.png', fullPage: true });
      await expect(page.locator('text="Entrar com Microsoft"').or(page.locator('text="Sair"'))).toBeVisible();
    });

    await test.step('Passo 2 — Completar login corporativo Microsoft SSO e aguardar área logada', async () => {
      // Check if already logged in (e.g., "Sair" button visible)
      const logoutButton = page.locator('button', { hasText: 'Sair' });
      const signInButton = page.locator('button', { hasText: 'Entrar com Microsoft' });

      if (await signInButton.isVisible()) {
        await signInButton.click();
      } else if (await logoutButton.isVisible()) {
        console.log('Already logged in, skipping Microsoft SSO button click.');
      } else {
        // Potentially an error state or unexpected landing, but we will proceed with waitForManualLogin
        console.log('Neither "Entrar com Microsoft" nor "Sair" button found, proceeding with waitForManualLogin.');
      }
      
      await waitForManualLogin(page, { force: true });
      await checkForSUTError();
      await page.screenshot({ path: 'artifacts/step-1-2.png', fullPage: true });
      await expect(page.url()).toMatch(/\/dashboard|\/agendas|\/atendimento/); // Resilient check for logged-in state
      await expect(page.locator('button', { hasText: 'Sair' }).or(page.locator('nav').filter({ hasText: 'Atendimento' }))).toBeVisible(); // Another resilient check
    });

    await test.step('Passo 3 — Navegar por "Atendimento/Ambulatorial > LEVE CLINICA TIJUCA - Rio de Janeiro > Clinica medica > Dr. Physician - Clinica medica"', async () => {
      // Click "Atendimento" menu item
      await page.locator('nav a', { hasText: 'Atendimento' }).click();
      await checkForSUTError();
      await page.locator('nav a', { hasText: 'Ambulatorial' }).click();
      await checkForSUTError();

      // Select "LEVE CLINICA TIJUCA - Rio de Janeiro"
      await page.locator('label:has-text("Clínica") + div div[role="combobox"]').click(); // Click to open combobox
      await page.locator('li', { hasText: 'LEVE CLINICA TIJUCA - Rio de Janeiro' }).click();
      await checkForSUTError();

      // Select "Clinica medica"
      await page.locator('label:has-text("Especialidade") + div div[role="combobox"]').click();
      await page.locator('li', { hasText: 'Clinica medica' }).click();
      await checkForSUTError();

      // Select "Dr. Physician - Clinica medica"
      await page.locator('label:has-text("Profissional") + div div[role="combobox"]').click();
      await page.locator('li', { hasText: 'Dr. Physician - Clinica medica' }).click();
      await checkForSUTError();
      
      await expect(page.locator('text="Lista de pacientes agendados para Dr. Physician"')).toBeVisible(); // Adjust as per actual UI text
      await page.screenshot({ path: 'artifacts/step-1-3.png', fullPage: true });
    });

    await test.step('Passo 4 — Selecionar o paciente "Carlos Machado Monteiro" na lista e clicar em "Iniciar"', async () => {
      const patientRow = page.locator('tr', { hasText: 'Carlos Machado Monteiro' });
      await expect(patientRow).toBeVisible(); // Ensure the patient is in the list
      await checkForSUTError();

      await patientRow.locator('button', { hasText: 'Iniciar' }).click();
      await checkForSUTError();

      await expect(page.locator('text="Prontuário do Paciente: Carlos Machado Monteiro"').or(page.locator('text="Carlos Machado Monteiro"').filter({has: page.locator('text="Prontuário"')}))).toBeVisible(); // Resilient check for patient's record
      await page.screenshot({ path: 'artifacts/step-1-4.png', fullPage: true });
    });
  });
});

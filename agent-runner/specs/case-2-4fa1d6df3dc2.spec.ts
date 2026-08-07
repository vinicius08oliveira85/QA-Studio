import { test, expect, Page } from '@playwright/test';
import { waitForManualLogin } from '../helpers/ssoWait';

test.describe('TC-002', () => {
  const patientName = 'João dos Santos';
  const sutErrorPatterns = /(não foi possível|erro ao|falha ao|ocorreu um erro|não carregou|indisponível|sem dados)/i;

  async function checkForSUTError(page: Page, stepTitle: string) {
    // Look for common error messages within the main content area or body
    const errorLocator = page.locator('body', { hasText: sutErrorPatterns });
    
    // Check if any element matching the error patterns is visible.
    // We poll for it to handle potential lazy rendering of error messages.
    const isErrorVisible = await expect(errorLocator).toBeVisible({ timeout: 500 }).catch(() => false);

    if (isErrorVisible) {
      const errorMessage = await errorLocator.textContent();
      throw new Error(`SUT_ERROR in "${stepTitle}": ${errorMessage}`);
    }
  }

  test('Validação do nome do paciente no prontuário após iniciar atendimento', async ({ page }) => {
    // Navigate to the base URL
    await page.goto('/');
    await checkForSUTError(page, 'Initial navigation to base URL');

    // Step 0: Handle SSO and ensure login
    await test.step('Passo 0 — Realizar login via SSO', async () => {
      // Check for 'Entrar com Microsoft' button or 'Sair' button (already logged in)
      const microsoftLoginButton = page.getByRole('button', { name: 'Entrar com Microsoft' });
      const logoutButton = page.getByRole('button', { name: 'Sair' });

      if (await microsoftLoginButton.isVisible()) {
        await microsoftLoginButton.click();
        await checkForSUTError(page, 'Clicking "Entrar com Microsoft"');
      } else if (await logoutButton.isVisible()) {
        // User is already logged in
        await page.waitForLoadState('domcontentloaded'); // Ensure page is fully loaded before proceeding
      } else {
        // Fallback: Assume the page is awaiting manual login if no specific buttons are present
      }

      await waitForManualLogin(page, { force: true });
      await checkForSUTError(page, 'Waiting for manual login completion');

      // Assert session after login with resilient checks
      await expect(page).toHaveURL(/dashboard|agendas|atendimento|home/i, { timeout: 60000 }); // Increase timeout for login navigation
      await checkForSUTError(page, 'Verifying post-login URL');
      await page.screenshot({ path: 'artifacts/step-2-0-login.png', fullPage: true });
    });

    // Step 1: Identificar o nome de um paciente na lista, por exemplo, 'João dos Santos'.
    await test.step('Passo 1 — Identificar o paciente na lista', async () => {
      await expect(page.getByText(patientName, { exact: true })).toBeVisible();
      await checkForSUTError(page, 'Identifying patient in list');
      await page.screenshot({ path: 'artifacts/step-2-1.png', fullPage: true });
    });

    // Step 2: Clicar em 'Iniciar' para o paciente 'João dos Santos'.
    await test.step('Passo 2 — Clicar em "Iniciar" para o paciente', async () => {
      // Locate the 'Iniciar' button associated with the patientName.
      // Assuming a structure where the button is a sibling or child within the same container as the patient's name.
      const patientCard = page.locator(`:has-text("${patientName}")`).first(); // Find the container with the patient name
      const startButton = patientCard.getByRole('button', { name: 'Iniciar' });
      
      await expect(startButton).toBeVisible(); // Ensure button is visible before clicking
      await startButton.click();
      await checkForSUTError(page, 'Clicking "Iniciar" button');

      // Expected: O prontuário do paciente deve ser carregado.
      // We look for a common indicator of a patient record page, like a main heading or a specific section.
      const recordHeaderLocator = page.locator('h1, h2, h3, [data-testid="patient-record-header"], [role="main"]', { hasText: /Prontuário|Atendimento/i });
      await expect(recordHeaderLocator).toBeVisible();
      await checkForSUTError(page, 'Verifying patient record loaded');
      await page.screenshot({ path: 'artifacts/step-2-2.png', fullPage: true });
    });

    // Step 3: Verificar o nome exibido no cabeçalho ou seção de identificação do prontuário.
    await test.step('Passo 3 — Verificar o nome no cabeçalho do prontuário', async () => {
      // Locate the element displaying the patient's name in the record header/identification section.
      // This often is a prominent heading or a specifically labeled text.
      const patientNameInRecordLocator = page.locator('h1:has-text("Prontuário"), h2, h3, [data-testid="patient-name-display"], .patient-header-name');
      await expect(patientNameInRecordLocator).toContainText(patientName);
      await checkForSUTError(page, 'Verifying patient name in record header');
      await page.screenshot({ path: 'artifacts/step-2-3.png', fullPage: true });
    });
  });
});

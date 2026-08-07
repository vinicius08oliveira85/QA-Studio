import { test, expect } from '../helpers/flowFixtures';
import { waitForManualLogin } from '../helpers/ssoWait';
import { runSuiteCase } from '../helpers/suiteRuntime';

test.describe.configure({ mode: 'serial' });

// Global variables to store patient data across test cases
let patientName: string;
let patientAge: string;
let patientSex: string;

test('CASE::13::TC-001::Acesso e validação de espelhamento de dados do paciente no prontuário', async ({ page }) => {
  // CASE_START:13:continue
  await runSuiteCase({ caseId: 13, code: 'TC-001', title: 'Acesso e validação de espelhamento de dados do paciente no prontuário' }, async () => {
    await test.step('Validate inherited screen for CASE 13', async () => {
      const currentUrl = page.url();
      const currentTitle = await page.title();
      const currentHeading = await page.locator('h1').textContent();

      if (currentUrl !== 'https://cpm.hom.levesaude.com.br/atendimento/ambulatorial' ||
          currentTitle !== 'Portal Operadora de Saúde' ||
          currentHeading?.trim() !== 'Selecionar agenda para acompanhamento') {
        throw new Error(`FLOW_CONTEXT_LOST: Initial state for TC-001 is invalid. Expected URL: https://cpm.hom.levesaude.com.br/atendimento/ambulatorial, got: ${currentUrl}. Expected Title: Portal Operadora de Saúde, got: ${currentTitle}. Expected Heading: Selecionar agenda para acompanhamento, got: ${currentHeading}`);
      }
      await page.screenshot({ path: 'artifacts/step-13-initial.png' });
    });

    await test.step("1. ACTION: Acessar a URL [https://cpm.hom.levesaude.com.br/] e navegar até 'Atendimento/Ambulatorial > LEVE CLINICA TIJUCA - Rio de Janeiro > Clinica medica > Dr. Physician - Clinica medica'", async () => {
      // Click on each navigation item sequentially
      await page.getByText('LEVE CLINICA TIJUCA - Rio de Janeiro', { exact: true }).click();
      await page.getByText('Clinica medica', { exact: true }).click();
      await page.getByText('Dr. Physician - Clinica medica', { exact: true }).click();
      // EXPECTED: A listagem de pacientes agendados é exibida corretamente.
      await expect(page.locator('h1')).toHaveText('Listagem de Pacientes Agendados'); // Assuming this heading appears after navigation
      await page.screenshot({ path: 'artifacts/step-13-1.png' });
    });

    await test.step("2. ACTION: Identificar o paciente na listagem, memorizar Nome, Idade e Sexo, e clicar em 'Iniciar'", async () => {
      // Patient data from mass: Paciente_Nome: João Carlos Santos | Idade: 45 anos | Sexo: Masculino | Status_Agendamento: Aguardando
      patientName = 'João Carlos Santos';
      patientAge = '45 anos'; // Assuming this exact string appears on the UI
      patientSex = 'Masculino'; // Assuming this exact string appears on the UI

      const patientRow = page.locator('tr', { hasText: patientName });
      await expect(patientRow).toBeVisible(); // Ensure the patient's row is visible

      // Click the 'Iniciar' button within the identified patient's row
      await patientRow.getByRole('button', { name: 'Iniciar' }).click();

      // EXPECTED: A tela do prontuário é aberta.
      await expect(page).toHaveURL(/.*\/atendimento\/prontuario\/.*/); // Verify URL changes to a patient chart pattern
      await expect(page.locator('h1', { hasText: 'Prontuário do Paciente' })).toBeVisible(); // Verify a specific heading indicating the chart is open
      await page.screenshot({ path: 'artifacts/step-13-2.png' });
    });

    await test.step("3. ACTION: Verificar os dados do paciente exibidos no cabeçalho do prontuário", async () => {
      // EXPECTED: O Nome, Idade e Sexo do paciente no cabeçalho correspondem exatamente aos dados da listagem.
      // Assuming a header or a distinct section for patient information that contains these details
      const patientInfoHeader = page.locator('header', { hasText: patientName }); // Locating a header that contains the patient's name
      await expect(patientInfoHeader).toBeVisible();
      await expect(patientInfoHeader.getByText(patientName)).toBeVisible();
      await expect(patientInfoHeader.getByText(patientAge)).toBeVisible();
      await expect(patientInfoHeader.getByText(patientSex)).toBeVisible();
      await page.screenshot({ path: 'artifacts/step-13-3.png' });
    });
  });
  // CASE_END:13
});

test('CASE::14::TC-002::Garantia de persistência de identidade em modais de atendimento', async ({ page }) => {
  // CASE_START:14:continue
  await runSuiteCase({ caseId: 14, code: 'TC-002', title: 'Garantia de persistência de identidade em modais de atendimento' }, async () => {
    await test.step('Validate inherited screen for CASE 14', async () => {
      const currentUrl = page.url();
      const currentHeading = await page.locator('h1').textContent();

      // Precondition: Prontuário do paciente aberto.
      if (!currentUrl.includes('/atendimento/prontuario/') ||
          currentHeading?.trim() !== 'Prontuário do Paciente') {
        throw new Error(`FLOW_CONTEXT_LOST: Prontuário do paciente not open for TC-002. Expected URL to contain '/atendimento/prontuario/', got: ${currentUrl}. Expected Heading: Prontuário do Paciente, got: ${currentHeading}`);
      }
      // Ensure patient data is available from the previous test case
      if (!patientName || !patientAge || !patientSex) {
        throw new Error('FLOW_CONTEXT_LOST: Patient data (name, age, sex) not available from previous test. This indicates a failure in the previous test or context loss.');
      }
      await page.screenshot({ path: 'artifacts/step-14-initial.png' });
    });

    await test.step("1. ACTION: Clicar no botão 'Estruturar com a IA' para abrir o Modal da IA", async () => {
      await page.getByRole('button', { name: 'Estruturar com a IA' }).click();
      // EXPECTED: O modal é aberto e os dados do paciente (Nome, Idade, Sexo) são exibidos corretamente no cabeçalho ou contexto do modal.
      const iaModal = page.getByRole('dialog', { name: /ia|inteligência artificial|estrutura/i }).or(page.locator('.modal-ia')); // More robust locator for the modal
      await expect(iaModal).toBeVisible();
      await expect(iaModal.getByText(patientName)).toBeVisible();
      await expect(iaModal.getByText(patientAge)).toBeVisible();
      await expect(iaModal.getByText(patientSex)).toBeVisible();
      await page.screenshot({ path: 'artifacts/step-14-1.png' });
    });

    await test.step("2. ACTION: Fechar o Modal da IA, navegar para a aba 'Plano' e clicar em 'Sugerir plano Clínico'", async () => {
      // Close the AI Modal - assuming a generic close button or an 'X' icon
      await page.getByRole('button', { name: 'Fechar', exact: true }).or(page.locator('[aria-label="Fechar"]')).click();
      const iaModal = page.getByRole('dialog', { name: /ia|inteligência artificial|estrutura/i }).or(page.locator('.modal-ia'));
      await expect(iaModal).not.toBeVisible(); // Ensure modal is closed

      await page.getByRole('tab', { name: 'Plano' }).click();
      await page.getByRole('button', { name: 'Sugerir plano Clínico' }).click();

      // EXPECTED: O Modal de Plano Clínico é aberto exibindo exatamente o mesmo Nome, Idade e Sexo.
      const planoModal = page.getByRole('dialog', { name: /plano clínico|sugerir plano/i }).or(page.locator('.modal-plano-clinico')); // Locator for Plano Clínico modal
      await expect(planoModal).toBeVisible();
      await expect(planoModal.getByText(patientName)).toBeVisible();
      await expect(planoModal.getByText(patientAge)).toBeVisible();
      await expect(planoModal.getByText(patientSex)).toBeVisible();
      await page.screenshot({ path: 'artifacts/step-14-2.png' });
    });

    await test.step("3. ACTION: Clicar na opção de adicionar/visualizar 'Exames'", async () => {
      // Close the 'Plano Clínico' modal first
      await page.getByRole('button', { name: 'Fechar', exact: true }).or(page.locator('[aria-label="Fechar"]')).click();
      const planoModal = page.getByRole('dialog', { name: /plano clínico|sugerir plano/i }).or(page.locator('.modal-plano-clinico'));
      await expect(planoModal).not.toBeVisible(); // Ensure modal is closed

      // Click on 'Exames' - assuming it's a button or link in the main prontuário view
      await page.getByRole('button', { name: 'Exames' }).click(); // Adjust locator if 'Exames' is a link or tab

      // EXPECTED: O Modal de Exames mantém a consistência inalterada dos dados de identificação do paciente.
      const examesModal = page.getByRole('dialog', { name: /exames|adicionar exames/i }).or(page.locator('.modal-exames')); // Locator for Exames modal
      await expect(examesModal).toBeVisible();
      await expect(examesModal.getByText(patientName)).toBeVisible();
      await expect(examesModal.getByText(patientAge)).toBeVisible();
      await expect(examesModal.getByText(patientSex)).toBeVisible();
      await page.screenshot({ path: 'artifacts/step-14-3.png' });
    });
  });
  // CASE_END:14
});

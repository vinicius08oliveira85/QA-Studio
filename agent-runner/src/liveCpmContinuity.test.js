/**
 * Validação de continuidade TC-001→TC-002 no mesmo CDP (menu hierárquico).
 * Simula o fluxo live sem OpenCode: snapshot → click por segmento → caso 2 na mesma tela.
 * Rode: node src/liveCpmContinuity.test.js  (via npm run test:unit)
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const browserSession = require('./browserSession');

const FIXTURE = `data:text/html,${encodeURIComponent(`<!DOCTYPE html>
<html><body>
<nav>
  <button id="atend">Atendimento</button>
  <div id="sub" hidden>
    <button id="amb">Ambulatorial</button>
  </div>
</nav>
<main>
  <h1 id="title">Home</h1>
  <p id="status">idle</p>
</main>
<script>
  document.getElementById('atend').onclick = () => {
    document.getElementById('sub').hidden = false;
    document.getElementById('status').textContent = 'menu-atendimento';
  };
  document.getElementById('amb').onclick = () => {
    document.getElementById('title').textContent = 'Ambulatorial';
    document.getElementById('status').textContent = 'tela-ambulatorial';
  };
</script>
</body></html>`)}`;

describe('Continuidade live TC-001→TC-002 (menu hierárquico no CDP)', () => {
  before(async () => {
    await browserSession.start({ headed: false, baseURL: FIXTURE });
  });

  after(async () => {
    await browserSession.stop();
  });

  it('TC-001 navega Atendimento → Ambulatorial por cliques separados', async () => {
    const { page } = await browserSession.connectDefaultPage();
    // Snapshot-equivalent: ler árvore visível
    const atend = page.getByRole('button', { name: 'Atendimento' });
    assert.equal(await atend.isVisible(), true);
    await atend.click();
    const amb = page.getByRole('button', { name: 'Ambulatorial' });
    assert.equal(await amb.isVisible(), true);
    await amb.click();
    assert.equal(await page.locator('#title').innerText(), 'Ambulatorial');
    assert.equal(await page.locator('#status').innerText(), 'tela-ambulatorial');
  });

  it('TC-002 herda a tela do TC-001 sem novo goto/login', async () => {
    const snap = await browserSession.snapshot();
    assert.match(snap.heading, /Ambulatorial/);
    const { page } = await browserSession.connectDefaultPage();
    assert.equal(await page.locator('#status').innerText(), 'tela-ambulatorial');
    // Continuidade: não voltou para Home
    assert.notEqual(await page.locator('#title').innerText(), 'Home');
  });
});

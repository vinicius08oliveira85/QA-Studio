/**
 * cpmNav.js — Navegação SEMÂNTICA do CPM (Leve Saúde) mapeada por exploração real.
 *
 * Extraído de scripts/run-gmptl141.js para reuso por qualquer runner/tarefa:
 *   - menu Atendimento → Ambulatorial
 *   - combobox Clínica → Especialidade → Profissional (com opções reais)
 *   - calendário: dia com pacientes / com finalizados
 *   - listagem de pacientes (cards com "Iniciar")
 *   - abertura do prontuário (que abre em NOVA aba com token JWT)
 *   - utilitários de clique/preenchimento/texto resilientes (overlay do CPM)
 *
 * Uso:
 *   const cpm = require('./cpmNav');
 *   await cpm.gotoAmbulatorial(page);
 *   await cpm.ensureAgenda(page, { clinica: 'LEVE CLINICA TIJUCA' });
 *   const w = await cpm.ensureDayWithPatients(page);
 *   await cpm.openFirstAwaiting(page);
 *   page = await cpm.resolveActivePage(page); // prontuário em nova aba
 */
const browserSession = require('./browserSession');

// ------------------------------------------------------------------ utilitários

/** Normaliza texto para comparação: minúsculas, sem acentos, só a-z0-9. */
function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Texto visível normalizado da página atual. */
async function bodyText(page) {
  return page.evaluate(() => (document.body.innerText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' '));
}

/**
 * Clique nativo via DOM (rápido, sem actionability check do Playwright).
 * Útil quando há overlay/spinner sobre o elemento (dropdowns do CPM).
 */
async function clickDom(page, label) {
  const q = normalize(label);
  if (!q) return { ok: false, reason: 'rótulo vazio' };
  const res = await page.evaluate((query) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('button, a, [role="button"], [role="combobox"], [role="option"], [role="menuitem"], [role="tab"], label, .dropdown-item, li a, td')].filter(visible);
    let best = null, bestScore = 0;
    for (const el of els) {
      const t = norm((el.innerText || el.getAttribute('aria-label') || el.textContent || '').trim());
      if (!t) continue;
      let score = 0;
      if (t.includes(query)) score = 100 + query.length;
      else if (query.includes(t) && t.length >= 3) score = 50 + t.length;
      else {
        const qt = query.split(' '), tt = t.split(' ');
        score = qt.filter((w) => w.length >= 3 && tt.includes(w)).length * 20;
      }
      if (score > bestScore) { best = el; bestScore = score; }
    }
    if (best && bestScore >= 15) {
      best.scrollIntoView({ block: 'center' });
      best.click();
      return { ok: true, text: (best.innerText || best.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60), score: bestScore };
    }
    return { ok: false, score: bestScore };
  }, q);
  if (res.ok) await page.waitForTimeout(400);
  return res;
}

/** Clique robusto: locators do Playwright (auto-wait) com fallback DOM normalizado. */
async function clickBest(page, label) {
  const q = normalize(label);
  if (!q) return { ok: false, reason: 'rótulo vazio' };
  const locators = [
    () => page.getByRole('menuitem', { name: label, exact: false }).first(),
    () => page.getByRole('button', { name: label, exact: false }).first(),
    () => page.getByRole('tab', { name: label, exact: false }).first(),
    () => page.getByRole('treeitem', { name: label, exact: false }).first(),
    () => page.getByRole('option', { name: label, exact: false }).first(),
    () => page.getByRole('link', { name: label, exact: false }).first(),
    () => page.getByText(label, { exact: false }).first()
  ];
  for (const mk of locators) {
    try {
      const loc = mk();
      await loc.waitFor({ state: 'visible', timeout: 2500 });
      await loc.click({ timeout: 3000 });
      await page.waitForTimeout(350);
      return { ok: true, via: 'locator', label };
    } catch { /* próximo */ }
  }
  const res = await page.evaluate((query) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="treeitem"], [role="option"], label, .dropdown-item, li a, td')].filter(visible);
    let best = null, bestScore = 0;
    for (const el of els) {
      const t = norm((el.innerText || el.getAttribute('aria-label') || el.textContent || '').trim());
      if (!t) continue;
      let score = 0;
      if (t.includes(query)) score = 100 + query.length;
      else if (query.includes(t) && t.length >= 3) score = 50 + t.length;
      else {
        const qt = query.split(' '), tt = t.split(' ');
        score = qt.filter((w) => w.length >= 3 && tt.includes(w)).length * 20;
      }
      if (score > bestScore) { best = el; bestScore = score; }
    }
    if (best && bestScore >= 15) {
      best.scrollIntoView({ block: 'center' });
      best.click();
      return { ok: true, via: 'dom', text: (best.innerText || best.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 70), score: bestScore };
    }
    return { ok: false, score: bestScore, reason: 'sem candidato' };
  }, q);
  if (res.ok) await page.waitForTimeout(350);
  return res;
}

/** Fecha o modal ativo (botões reais do CPM: Close/Cancelar/X/Escape/aria-label). */
async function closeModal(page) {
  const locatorTries = [
    () => page.getByRole('button', { name: /close|fechar/i }).first(),
    () => page.getByRole('button', { name: /cancelar/i }).first(),
    () => page.getByLabel(/close|fechar/i).first(),
    () => page.getByRole('dialog').getByRole('button').filter({ hasText: /^\s*[x×✕]\s*$/i }).first()
  ];
  for (const mk of locatorTries) {
    try {
      const loc = mk();
      await loc.waitFor({ state: 'visible', timeout: 1200 });
      await loc.click({ timeout: 2000 });
      await page.waitForTimeout(500);
      return { ok: true, via: 'locator' };
    } catch { /* próximo */ }
  }
  // Escape como último recurso.
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return { ok: true, via: 'escape' };
  } catch { /* ignore */ }
  return { ok: false, reason: 'modal não fechou (Close/Cancelar/X/Escape)' };
}

/**
 * Abre um combobox Radix Select (Clínica/Especialidade) e escolhe a opção exata,
 * VERIFICANDO que a seleção foi realmente aplicada no botão do combobox.
 *
 * A dependência real do CPM: as opções de Especialidade só carregam DEPOIS que a
 * Clínica é aplicada, e o Profissional só depois da Especialidade. Cada passo
 * confere o valor aplicado antes de retornar (senão o fluxo avança com o combo
 * ainda "Selecione..." e o popover anterior vaza para o próximo).
 */
async function selectCombo(page, comboLabel, option, { log } = {}) {
  if (log) log(`selectCombo ${comboLabel} → ${option}`);
  const q = normalize(option);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0 && log) log(`selectCombo ${comboLabel}: tentativa ${attempt + 1}`);

    // 1) Abre o dropdown clicando no role=combobox cujo texto casa com o rótulo.
    const open = await page.evaluate(({ label }) => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const qq = norm(label);
      const combos = [...document.querySelectorAll('[role="combobox"], button')].filter(visible);
      let best = null, bestScore = 0;
      for (const el of combos) {
        const t = norm((el.innerText || el.getAttribute('aria-label') || el.textContent || '').trim());
        if (!t) continue;
        let score = 0;
        if (t.includes(qq)) score = 100 + qq.length;
        else if (qq.includes(t) && t.length >= 3) score = 50 + t.length;
        // Penaliza o menu "Clínicas" (plural) quando o rótulo é singular "Clínica".
        if (/s$/.test(t) && !/s$/.test(qq)) score -= 40;
        if (score > bestScore) { best = el; bestScore = score; }
      }
      if (best && bestScore >= 40) {
        best.click();
        return { ok: true, text: (best.innerText || best.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50), score: bestScore };
      }
      return { ok: false, score: bestScore };
    }, { label: comboLabel });
    if (!open.ok) {
      const r2 = await clickBest(page, comboLabel);
      if (!r2.ok) return { ok: false, reason: `combobox não aberto: ${comboLabel} (score ${open.score})` };
    }
    await page.waitForTimeout(400);
    if (log) log(`selectCombo ${comboLabel}: dropdown aberto, aguardando opções reais`);

    // 2) Aguarda as opções do Radix ([role=option] / [data-slot=select-item]) carregarem
    //    (o CPM as busca por API após abrir). Só clica numa opção REAL do dropdown.
    let opt = null;
    for (let i = 0; i < 16; i++) {
      const found = await page.evaluate((query) => {
        const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const qq = norm(query);
        for (const el of [...document.querySelectorAll('[role="option"], [data-slot="select-item"]')]) {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
          const t = norm((el.innerText || el.getAttribute('aria-label') || el.textContent || '').trim());
          if (t && (t.includes(qq) || qq.includes(t))) return { found: true, text: t.slice(0, 50) };
        }
        return { found: false };
      }, q);
      if (found.found) {
        const clicked = await clickDom(page, option);
        if (clicked.ok) { opt = clicked; break; }
      }
      if (log && i < 3) {
        const debug = await page.evaluate(() => {
          const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
          const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width>0 && r.height>0 && cs.visibility!=='hidden' && cs.display!=='none'; };
          return [...document.querySelectorAll('[role="option"], [data-slot="select-item"]')].filter(vis).map((o) => norm((o.innerText || o.textContent || '').trim()).slice(0, 40)).slice(0, 10);
        });
        log(`selectCombo ${comboLabel}: it ${i} opções visíveis = ${JSON.stringify(debug)}`);
      }
      await page.waitForTimeout(600);
    }
    if (!opt || !opt.ok) {
      if (log) log(`selectCombo ${comboLabel}: opção não achada no dropdown — reabrindo`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(600);
      continue;
    }
    await page.waitForTimeout(600);

    // 3) VERIFICA que o valor foi aplicado de verdade (o Radix troca o texto do botão).
    const vals = await comboValues(page);
    const applied = vals.some((v) => normalize(v).includes(q));
    if (applied) {
      if (log) log(`selectCombo ${comboLabel}: aplicado (${vals.join(' | ')})`);
      return { ok: true, via: 'dom-option', option };
    }
    if (log) log(`selectCombo ${comboLabel}: clicou mas NÃO aplicou (combos=${JSON.stringify(vals)}) — reabrindo`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  }
  if (log) log(`selectCombo ${comboLabel}: opção ${option} não aplicada após 3 tentativas`);
  return { ok: false, reason: `opção não aplicada: ${option}` };
}

/** Preenche o melhor input visível cujo label casa com `hint`. */
async function fillBest(page, hint, value) {
  const q = normalize(hint);
  const v = String(value ?? '').trim() || 'Valor de teste';
  const res = await page.evaluate(({ q, v }) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]')].filter(visible);
    let best = null, bestScore = 0;
    for (const el of els) {
      const label = norm((el.labels && el.labels[0] ? el.labels[0].innerText : '') || el.getAttribute('aria-label') || el.placeholder || '');
      const tag = el.tagName.toLowerCase();
      let score = 0;
      if (q && label.includes(q)) score = 80 + q.length;
      else if (q && q.includes(label) && label.length >= 3) score = 40 + label.length;
      else if (tag === 'textarea') score = 25;
      else if (q && /(texto|anamnese|justificativa)/.test(q) && label) score = 10;
      if (score > bestScore) { best = el; bestScore = score; }
    }
    if (best) {
      const proto = best.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(best, v); else best.value = v;
      best.dispatchEvent(new Event('input', { bubbles: true }));
      best.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, label: (best.labels && best.labels[0] ? best.labels[0].innerText : best.placeholder || best.getAttribute('aria-label') || '').trim().slice(0, 60), tag: best.tagName.toLowerCase() };
    }
    return { ok: false, reason: 'nenhum input casou', score: bestScore };
  }, { q, v });
  if (res.ok) await page.waitForTimeout(250);
  return res;
}

const STOPWORDS = new Set(['para', 'que', 'com', 'sem', 'uma', 'um', 'dos', 'das', 'do', 'da', 'em', 'no', 'na', 'os', 'as', 'o', 'a', 'de', 'e', 'ou', 'se', 'como', 'pelo', 'pela', 'ser', 'esta', 'estao', 'nao', 'mais', 'menos', 'todos', 'todas', 'toda', 'todo', 'sao', 'foi', 'ao', 'nos', 'nas', 'seus', 'suas', 'pode', 'podem', 'deve', 'devem', 'mesmo', 'mesma', 'tambem', 'apos', 'ate', 'sobre', 'entre', 'por', 'com']);

/** Verifica presença de texto (substring exata ou overlap >= 55% de palavras significativas). */
async function expectTextVisible(page, text) {
  const q = normalize(text);
  if (!q) return { found: true, reason: 'vazio' };
  return page.evaluate(({ q, stop }) => {
    const stopSet = new Set(stop);
    const body = (document.body.innerText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ');
    if (body.includes(q)) return { found: true, kind: 'exact' };
    const sig = q.split(' ').filter((w) => w.length >= 4 && !stopSet.has(w));
    if (!sig.length) return { found: true, kind: 'soft' };
    const hit = sig.filter((w) => body.includes(w)).length;
    return { found: hit / sig.length >= 0.55, kind: 'overlap', hit, total: sig.length };
  }, { q, stop: [...STOPWORDS] });
}

/** Detecta mensagens de erro do SUT visíveis na página (tela de erro/empty-state). */
async function detectSutError(page) {
  return page.evaluate(() => {
    const body = document.body.innerText || '';
    const m = body.match(/(não foi possível|erro ao|falha ao|ocorreu um erro|indisponível|sem dados|não encontrad)[^\n]{0,120}/i);
    return m ? m[0].replace(/\s+/g, ' ').slice(0, 200) : '';
  });
}

// ------------------------------------------------------------------ PADRÃO: enxergar o estado real da tela

/** Remove o token JWT (eyJ...) das URLs do prontuário (relatório/verificação legível). */
function cleanUrl(u) {
  const s = String(u || '');
  // /atendimento/ambulatorial/eyJhbGciOiJkaXIi... → /atendimento/ambulatorial
  // Só remove a query quando havia token JWT (senão não perde dados de URL legítima).
  const withToken = /(\/[^/?#]+)\/eyJ[A-Za-z0-9_\-.]{20,}/.exec(s);
  if (!withToken) return s.slice(0, 160);
  return s.replace(/(\/[^/?#]+)\/eyJ[A-Za-z0-9_\-.]{20,}/, '$1').split('?')[0].slice(0, 160);
}

/**
 * FOTO do estado REAL da tela em um instante: combos (com valor aplicado),
 * opções visíveis de dropdown, contadores da agenda (aguardando/finalizados),
 * presença do botão "Iniciar", erro do SUT e início do texto da página.
 *
 * É a base do padrão "não confie no que você clicou, confie no que a tela
 * mostra": cada passo tira uma foto antes/depois e decide com base nela.
 */
async function screenSnapshot(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const body = document.body.innerText || '';
    const combos = [...document.querySelectorAll('[role="combobox"]')]
      .filter(visible)
      .map((c) => (c.innerText || c.getAttribute('aria-label') || c.value || '').trim().replace(/\s+/g, ' '));
    const options = [...document.querySelectorAll('[role="option"], [data-slot="select-item"]')]
      .filter(visible)
      .map((o) => norm((o.innerText || o.textContent || '').trim()).slice(0, 45))
      .filter(Boolean);
    const awaiting = (body.match(/aguardando\s+(\d+)/i) || [])[1];
    const finalized = (body.match(/finalizad[ao]s?\s+(\d+)/i) || [])[1];
    const sut = (body.match(/(não foi possível|erro ao|falha ao|ocorreu um erro|indisponível|sem dados|não encontrad)[^\n]{0,120}/i) || [])[0] || '';
    const normBody = norm(body);
    return {
      url: location.href,
      combos,
      visibleOptions: [...new Set(options)].slice(0, 8),
      awaiting: awaiting ? Number(awaiting) : null,
      finalized: finalized ? Number(finalized) : null,
      // Texto normalizado: aceita "iniciar" como substring (ex.: "Iniciar atendimento"),
      // igual ao comportamento antigo do waitAgendaLoaded — sem risco de regressão.
      hasIniciar: /iniciar/.test(normBody),
      sutError: sut.replace(/\s+/g, ' ').slice(0, 200),
      textHead: normBody.slice(0, 200)
    };
  }).catch(() => null);
}

/**
 * Polling por CONDIÇÃO REAL da tela (nunca wait fixo): chama `predicate()` a
 * cada `interval` ms até retornar { ok: true, ... } ou esgotar `timeout`.
 * Cada chamada recebe a snapshot mais recente — o padrão para tudo que depende
 * de carregamento assíncrono (opções do dropdown, agenda, modais, status).
 */
async function waitForCondition(page, { label = 'condição', timeout = 20_000, interval = 700, log } = {}, predicate) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await predicate(); } catch { last = null; }
    if (last && last.ok) {
      if (log) log(`${label}: confirmado em ${((timeout - (deadline - Date.now())) / 1000).toFixed(1)}s`);
      return { ok: true, ...last };
    }
    await page.waitForTimeout(interval).catch(() => {});
  }
  if (log) log(`${label}: NÃO confirmado em ${(timeout / 1000).toFixed(0)}s`);
  return { ok: false, last, reason: `${label} não confirmado em ${timeout}ms` };
}

// ------------------------------------------------------------------ navegação do CPM

/** Agenda padrão da hom: Dr. Physician na TIJUCA, Clinica medica. */
const CPM_AGENDA_DEFAULTS = {
  clinica: 'LEVE CLINICA TIJUCA',
  especialidade: 'Clinica medica',
  profissional: 'Dr. Physician'
};

/** Menu Atendimento → Ambulatorial (no-op se já estiver lá). */
async function gotoAmbulatorial(page) {
  if (/\/atendimento\/ambulatorial/i.test(page.url())) return { ok: true, via: 'já está' };
  await clickBest(page, 'Atendimento').catch(() => {});
  await page.waitForTimeout(600);
  const r = await clickBest(page, 'Ambulatorial');
  await page.waitForTimeout(2500);
  return r.ok ? { ok: true, via: 'menu' } : { ok: false, reason: 'menu Atendimento/Ambulatorial' };
}

/** Lê o valor atual (texto) de cada combobox VISÍVEL da página. */
async function comboValues(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="combobox"]')]
      .filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((c) => (c.innerText || c.getAttribute('aria-label') || c.value || '').trim().replace(/\s+/g, ' '))
  );
}

/**
 * Garante a agenda: seleciona Clínica → Especialidade → Profissional
 * (pula combos já selecionados) e espera a listagem carregar.
 */
async function ensureAgenda(page, opts = {}) {
  const issues = [];
  const log = opts.log || (() => {});
  const clinica = opts.clinica || CPM_AGENDA_DEFAULTS.clinica;
  const especialidade = opts.especialidade || CPM_AGENDA_DEFAULTS.especialidade;
  const profissional = opts.profissional || CPM_AGENDA_DEFAULTS.profissional;
  const vals = await comboValues(page);
  const have = vals.join(' | ');
  const wantC = normalize(clinica);
  const wantE = normalize(especialidade);
  const wantP = normalize(profissional);
  // Combobox Clínica — só seleciona se ainda não estiver selecionada.
  if (!have.includes(wantC)) {
    let r = await selectCombo(page, 'Clínica', clinica, { log });
    if (!r.ok) issues.push(`clínica: ${r.reason}`);
    await page.waitForTimeout(800);
    if (log) log(`após Clínica, combos = ${JSON.stringify(await comboValues(page))}`);
  } else if (log) log('clínica já selecionada');
  // Combobox Especialidade
  const vals2 = await comboValues(page);
  if (!vals2.join(' | ').includes(wantE)) {
    let r = await selectCombo(page, 'Especialidade', especialidade, { log });
    if (!r.ok) issues.push(`especialidade: ${r.reason}`);
    await page.waitForTimeout(800);
    if (log) log(`após Especialidade, combos = ${JSON.stringify(await comboValues(page))}`);
  } else if (log) log('especialidade já selecionada');
  // Combobox Profissional
  const vals3 = await comboValues(page);
  if (!vals3.join(' | ').includes(wantP)) {
    let r = await selectCombo(page, 'Profissional', profissional, { log });
    if (!r.ok) issues.push(`profissional: ${r.reason}`);
    await page.waitForTimeout(1500);
    if (log) log(`após Profissional, combos = ${JSON.stringify(await comboValues(page))}`);
  } else if (log) log('profissional já selecionado');
  // Espera a agenda carregar de verdade antes de retornar.
  await waitAgendaLoaded(page);
  return issues.length ? { ok: false, issues } : { ok: true };
}

/**
 * Aguarda a listagem carregar de VERDADE (polling por estado real da tela,
 * não wait fixo): botão "Iniciar" visível OU contador "aguardando N" com N>0.
 */
async function waitAgendaLoaded(page, tries = 24) {
  return waitForCondition(page, {
    label: 'agenda carregada',
    timeout: tries * 1200,
    interval: 1200
  }, async () => {
    const snap = await screenSnapshot(page);
    if (!snap) return { ok: false };
    if (snap.hasIniciar) return { ok: true, via: 'iniciar-visible', snapshot: snap };
    if (snap.awaiting != null && snap.awaiting > 0) return { ok: true, aguardando: snap.awaiting, via: 'contador', snapshot: snap };
    return { ok: false, snapshot: snap };
  });
}

/** Navega o calendário até um dia com pacientes agendados (máx 12 cliques). */
async function ensureDayWithPatients(page) {
  // 1) Espera o carregamento REAL da agenda do dia atual.
  const w = await waitAgendaLoaded(page);
  if (w.ok && w.aguardando) return w;
  // 2) Se o dia atual não tem pacientes, navega dias anteriores rapidamente (DOM).
  for (let i = 0; i < 12; i++) {
    if (/\/atendimento\//i.test(page.url()) && !/ambulatorial/i.test(page.url())) {
      await clickBest(page, 'Voltar').catch(() => {});
      await page.waitForTimeout(1500);
      continue;
    }
    const r = await clickDom(page, 'Anterior');
    if (!r.ok) { const r2 = await clickBest(page, 'Anterior'); if (!r2.ok) break; }
    await page.waitForTimeout(900);
    const w2 = await waitAgendaLoaded(page, 8);
    if (w2.ok && w2.aguardando) return w2;
  }
  return { ok: false, reason: 'nenhum dia com pacientes encontrado' };
}

/** Navega o calendário até um dia com atendimentos FINALIZADOS (máx 20 cliques). */
async function ensureDayWithFinalized(page) {
  for (let i = 0; i < 20; i++) {
    const t = await bodyText(page);
    const m = t.match(/finalizad[ao]s? (\d+)/);
    if (m && Number(m[1]) > 0) return { ok: true, finalizados: Number(m[1]) };
    // Se estamos em um prontuário, volta antes de navegar.
    if (/\/atendimento\//i.test(page.url()) && !/ambulatorial/i.test(page.url())) {
      await clickBest(page, 'Voltar').catch(() => {});
      await page.waitForTimeout(1500);
      continue;
    }
    const r = await clickBest(page, 'Anterior');
    if (!r.ok) break;
    await page.waitForTimeout(900);
  }
  return { ok: false, reason: 'nenhum dia com finalizados encontrado' };
}

/** Abre o primeiro atendimento "Aguardando" disponível (botão Iniciar). */
async function openFirstAwaiting(page) {
  const btn = page.getByRole('button', { name: /^Iniciar$/i }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 3000 }).catch(async () => { await clickBest(page, 'Iniciar'); });
    await page.waitForTimeout(3000);
    return { ok: true, via: 'iniciar' };
  }
  const r = await clickBest(page, 'Iniciar');
  if (r.ok) { await page.waitForTimeout(3000); return { ok: true, via: 'dom' }; }
  return { ok: false, reason: 'sem botão Iniciar na listagem' };
}

/** Nome do paciente no cabeçalho do prontuário (texto grande acima das abas). */
async function patientHeader(page) {
  const t = await bodyText(page);
  // Cabeçalho: primeira linha significativa após "Voltar".
  const seg = t.slice(0, 2000);
  const idx = seg.indexOf('voltar');
  const head = seg.slice(idx + 6, idx + 160).split('masculino')[0].split('feminino')[0].trim();
  return head;
}

// ------------------------------------------------------------------ página ativa (prontuário abre em nova aba)

/**
 * Resolve a página ativa do context CDP: prefere o prontuário (token JWT),
 * senão a ambulatorial, senão a primeira. O prontuário abre em NOVA aba ao
 * clicar "Iniciar" — sem isso o runner interage com a listagem errada.
 * Usa UMA conexão residente (não abre/fecha por chamada, senão a página
 * retornada fica órfã de uma conexão fechada).
 */
let RESIDENT_CDP = null;

async function cdpResident() {
  if (RESIDENT_CDP) return RESIDENT_CDP;
  RESIDENT_CDP = await browserSession.connectDefaultPage();
  return RESIDENT_CDP;
}

async function resolveActivePage(page) {
  const res = await cdpResident();
  if (!res || !res.context) return page;
  const pages = res.context.pages() || [];
  if (!pages.length) return page;
  let best = null;
  for (const p of pages) {
    const u = p.url();
    if (/\/atendimento\//i.test(u) && !/ambulatorial/i.test(u)) { best = p; break; }
  }
  if (!best) {
    for (const p of pages) {
      const u = p.url();
      if (/ambulatorial/i.test(u)) { best = p; break; }
    }
  }
  return best || pages[0] || page;
}

/** Zera a conexão residente (útil entre execuções de suíte). */
function resetCdpResident() {
  RESIDENT_CDP = null;
}

module.exports = {
  // utilitários
  normalize,
  bodyText,
  clickDom,
  clickBest,
  closeModal,
  selectCombo,
  fillBest,
  expectTextVisible,
  detectSutError,
  // padrão: enxergar o estado real da tela
  cleanUrl,
  screenSnapshot,
  waitForCondition,
  // navegação do CPM
  CPM_AGENDA_DEFAULTS,
  gotoAmbulatorial,
  comboValues,
  ensureAgenda,
  waitAgendaLoaded,
  ensureDayWithPatients,
  ensureDayWithFinalized,
  openFirstAwaiting,
  patientHeader,
  // página ativa
  cdpResident,
  resolveActivePage,
  resetCdpResident
};

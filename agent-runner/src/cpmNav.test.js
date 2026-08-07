/**
 * Testes do módulo cpmNav (navegação semântica do CPM) — parte pura (sem browser).
 * Rode: npm run test:unit  (em agent-runner/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const cpm = require('./cpmNav');

describe('cpmNav exports', () => {
  it('expõe todos os utilitários e navegações', () => {
    const expected = [
      'normalize', 'bodyText', 'clickDom', 'clickBest', 'closeModal', 'selectCombo',
      'fillBest', 'expectTextVisible', 'detectSutError',
      'cleanUrl', 'screenSnapshot', 'waitForCondition',
      'CPM_AGENDA_DEFAULTS', 'gotoAmbulatorial', 'comboValues', 'ensureAgenda',
      'waitAgendaLoaded', 'ensureDayWithPatients', 'ensureDayWithFinalized',
      'openFirstAwaiting', 'patientHeader',
      'cdpResident', 'resolveActivePage', 'resetCdpResident'
    ];
    for (const k of expected) {
      assert.ok(k in cpm, `faltou export: ${k}`);
      assert.equal(typeof cpm[k], 'function' === typeof cpm[k] ? 'function' : 'object', `${k} deve ser function`);
    }
  });
});

describe('cpmNav normalize', () => {
  it('remove acentos e normaliza caixa/plural', () => {
    assert.equal(cpm.normalize('Clínica Médica'), 'clinica medica');
    assert.equal(cpm.normalize('Dr. Physician — Clinica medica'), 'dr physician clinica medica');
    assert.equal(cpm.normalize('LEVE CLINICA TIJUCA - Rio de Janeiro'), 'leve clinica tijuca rio de janeiro');
    assert.equal(cpm.normalize(''), '');
    assert.equal(cpm.normalize(null), '');
  });
});

describe('cpmNav agenda defaults', () => {
  it('mantém a agenda mapeada da hom (Dr. Physician / TIJUCA)', () => {
    assert.equal(cpm.CPM_AGENDA_DEFAULTS.clinica, 'LEVE CLINICA TIJUCA');
    assert.equal(cpm.CPM_AGENDA_DEFAULTS.especialidade, 'Clinica medica');
    assert.equal(cpm.CPM_AGENDA_DEFAULTS.profissional, 'Dr. Physician');
  });
});

describe('cpmNav cleanUrl', () => {
  it('remove o token JWT das URLs do prontuário', () => {
    const jwt = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiY2xpbmljYWwtcmVzb3VyY2Urand0In0..3yqSyEz4spW22kR3.EoZBe8QJByqiCT2fuIhUKdr6qMaTcHjY7fkwWcb6hNzPZ_v5nFogGpXKg1salqmMxEygtdWIXJt2E3wX8vldLRXzuZI-M2TXc3PWS-OJVwAfbRBAnp9vBoH2ylAzFl2rpFQSfd_ETsba8MsbMcmDbkR1nlD7ZWF-iyK25m2pWg46Nn8XDDuDhBA_Y5fjrw8aPGUjlfYtoPOe-fU626ickE8M8FwzDeftTtTw_qVwVf6RHUVIv87FyNKVRzj-zOYKjSUG9DnJXoI47OJkh3E1QSURfPcIRkqdXVBwe2iNDXf6HL09CAWHCPQfGuS_fB7K5n_clis0X16-gYenB2NXYWQTOn19m-J5WBPeM6x4GRkPmYxagqu8_nmS0yRcPMKSr4OlPSwfiRj5Z2HaWxNfDlgIb598oVttmj9aGCJrJLkV5xF7e3ufZfsIvM2qiytbrcCZBIHkyTPiqQHyFxfhrSuoc0ahqz8C-1LvB34ziaAQpHTsjBdO_bUepVHoiqGA5l9X.I9dcuQ8';
    const clean = cpm.cleanUrl(`https://cpm.hom.levesaude.com.br/atendimento/ambulatorial/${jwt}`);
    assert.equal(clean, 'https://cpm.hom.levesaude.com.br/atendimento/ambulatorial');
  });

  it('mantém URLs sem token intactas', () => {
    assert.equal(cpm.cleanUrl('https://cpm.hom.levesaude.com.br/atendimento/ambulatorial'), 'https://cpm.hom.levesaude.com.br/atendimento/ambulatorial');
    assert.equal(cpm.cleanUrl('https://cpm.hom.levesaude.com.br/'), 'https://cpm.hom.levesaude.com.br/');
    assert.equal(cpm.cleanUrl(''), '');
    assert.equal(cpm.cleanUrl(null), '');
  });
});

describe('cpmNav waitForCondition (lógica de polling pura)', () => {
  it('respeita ok:true imediato', async () => {
    const page = { waitForTimeout: async () => {} };
    const r = await cpm.waitForCondition(page, { label: 't', timeout: 5000, interval: 10 }, async () => ({ ok: true, via: 'x' }));
    assert.equal(r.ok, true);
    assert.equal(r.via, 'x');
  });

  it('continua polling até a condição passar (não desiste na 1ª falha)', async () => {
    let predicates = 0;
    const page = { waitForTimeout: async () => {} };
    const r = await cpm.waitForCondition(page, { label: 't', timeout: 5000, interval: 10 }, async () => {
      predicates++;
      return predicates >= 2 ? { ok: true, via: 'na-segunda' } : { ok: false };
    });
    assert.equal(r.ok, true);
    assert.equal(r.via, 'na-segunda');
    assert.equal(predicates, 2, 'predicado deve rodar 2x: 1 falha + 1 sucesso');
  });

  it('esgota o timeout e retorna ok:false quando a condição nunca passa', async () => {
    const page = { waitForTimeout: async () => {} };
    const r = await cpm.waitForCondition(page, { label: 't', timeout: 30, interval: 10 }, async () => ({ ok: false }));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('não confirmado'));
  });
});

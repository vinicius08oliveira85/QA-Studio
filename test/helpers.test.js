const { test } = require('node:test');
const assert = require('node:assert');
const { requireScope, validateTaskOwnership, mergeUpdate, pickDefined } = require('../server/helpers.js');

test('mergeUpdate mescla apenas chaves definidas', () => {
  const current = { a: 1, b: 2, c: 3 };
  const body = { a: 10, b: undefined, d: 4 };
  assert.deepStrictEqual(mergeUpdate(current, body, ['a', 'b']), { a: 10, b: 2, c: 3 });
});

test('mergeUpdate ignora chaves fora da lista', () => {
  const current = { a: 1 };
  assert.deepStrictEqual(mergeUpdate(current, { a: 9, z: 99 }, ['a']), { a: 9 });
});

test('pickDefined retorna apenas chaves definidas', () => {
  const body = { a: 1, b: undefined, c: 'x' };
  assert.deepStrictEqual(pickDefined(body, ['a', 'b', 'c']), { a: 1, c: 'x' });
});

test('requireScope responde 400 quando falta taskId e projectId', () => {
  let status, body;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; } };
  const out = requireScope({ query: {} }, res);
  assert.strictEqual(out, null);
  assert.strictEqual(status, 400);
  assert.ok(body.error);
});

test('requireScope devolve scope quando presente', () => {
  const scope = requireScope({ query: { taskId: '1', projectId: '2' } }, {});
  assert.deepStrictEqual(scope, { taskId: '1', projectId: '2' });
});

test('validateTaskOwnership responde 404 para tarefa inexistente', () => {
  const db = { resolveTask: () => null };
  assert.strictEqual(validateTaskOwnership(db, '99', '1').status, 404);
});

test('validateTaskOwnership responde 400 quando tarefa não pertence ao projeto', () => {
  const db = { resolveTask: () => ({ id: 1, project_id: 5 }) };
  assert.strictEqual(validateTaskOwnership(db, '1', '2').status, 400);
});

test('validateTaskOwnership devolve a tarefa em caso de sucesso', () => {
  const task = { id: 1, project_id: 5 };
  const db = { resolveTask: () => task };
  assert.deepStrictEqual(validateTaskOwnership(db, '1', '5'), { task });
});

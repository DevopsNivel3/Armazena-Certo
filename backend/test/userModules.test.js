const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_USER_MODULES,
  normalizeUserModules,
  isValidUserModules,
  hasUserModule
} = require('../constants/userModules');

test('modulos exigem habilitacao explicita e migracao pode informar fallback legado', () => {
  assert.deepEqual(DEFAULT_USER_MODULES, ['inventario', 'cross_docking']);
  assert.deepEqual(normalizeUserModules(undefined), []);
  assert.deepEqual(normalizeUserModules(undefined, DEFAULT_USER_MODULES), DEFAULT_USER_MODULES);
  assert.equal(hasUserModule({}, 'inventario'), false);
  assert.equal(hasUserModule({}, 'cross_docking'), false);
});

test('normaliza permissoes recebidas como array ou JSON', () => {
  assert.deepEqual(normalizeUserModules(['expedicao', 'inventario', 'invalido', 'inventario']), ['inventario', 'cross_docking']);
  assert.deepEqual(normalizeUserModules('["recebimento"]'), ['cross_docking']);
  assert.deepEqual(normalizeUserModules(['recebimento', 'expedicao']), ['cross_docking']);
  assert.equal(isValidUserModules(['inventario', 'cross_docking']), true);
  assert.equal(isValidUserModules(['recebimento']), false);
  assert.equal(isValidUserModules('inventario'), false);
});

test('lista vazia representa usuario sem modulos habilitados', () => {
  assert.deepEqual(normalizeUserModules([], []), []);
  assert.equal(hasUserModule({ modulos: [] }, 'inventario'), false);
  assert.equal(hasUserModule({ modulos: [] }, 'cross_docking'), false);
});

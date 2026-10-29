const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const vm = require('node:vm');

// Isola a consulta do usuário sem carregar configuração ou conexão de banco.
function loadAuthMiddleware(findByPk = async () => null) {
  const moduleMock = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../middlewares/authMiddleware'), 'utf8'), {
    module: moduleMock,
    require(name) {
      if (name === 'jsonwebtoken') return jwt;
      if (name === '../models/Usuario') return { findByPk };
      throw new Error(`Dependência inesperada: ${name}`);
    },
    process,
    console
  });
  return moduleMock.exports;
}

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('middleware de autenticacao rejeita requisicao sem token', async () => {
  const authMiddleware = loadAuthMiddleware();
  const res = responseMock();
  await authMiddleware({ header: () => null }, res, () => assert.fail('next nao deveria ser chamado'));
  assert.equal(res.statusCode, 401);
});

test('middleware usa perfil e modulos atuais do cadastro em vez das permissoes do token', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const token = jwt.sign({ id: 9, empresa_id: 3, nivel_acesso: 'admin', modulos: ['inventario', 'cross_docking'] }, process.env.JWT_SECRET);
  const authMiddleware = loadAuthMiddleware(async (id) => {
    assert.equal(id, 9);
    return { toJSON: () => ({ id: 9, empresa_id: 3, nivel_acesso: 'operador', modulos: ['cross_docking'] }), empresa_id: 3 };
  });
  const req = { header: () => `Bearer ${token}` };
  const res = responseMock();
  let called = false;
  try {
    await authMiddleware(req, res, () => { called = true; });
    assert.equal(called, true);
    assert.equal(req.user.id, 9);
    assert.equal(req.user.empresa_id, 3);
    assert.equal(req.user.nivel_acesso, 'operador');
    assert.deepEqual(req.user.modulos, ['cross_docking']);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  }
});

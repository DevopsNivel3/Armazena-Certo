const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middlewares/authMiddleware');

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('middleware de autenticacao rejeita requisicao sem token', () => {
  const res = responseMock();
  authMiddleware({ header: () => null }, res, () => assert.fail('next nao deveria ser chamado'));
  assert.equal(res.statusCode, 401);
});

test('middleware de autenticacao disponibiliza empresa, usuario e perfil do token', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const token = jwt.sign({ id: 9, empresa_id: 3, nivel_acesso: 'gerente' }, process.env.JWT_SECRET);
  const req = { header: () => `Bearer ${token}` };
  const res = responseMock();
  let called = false;
  authMiddleware(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.id, 9);
  assert.equal(req.user.empresa_id, 3);
  assert.equal(req.user.nivel_acesso, 'gerente');
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});

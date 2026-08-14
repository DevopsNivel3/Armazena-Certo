const test = require('node:test');
const assert = require('node:assert/strict');
const {
  registerSocketUser,
  unregisterSocket,
  getOutboundUserConnectionStatus,
  getSocketUserContext
} = require('../socket');

test('resume presença outbound por empresa, usuário e aparelho', () => {
  registerSocketUser('socket-a', 10, 'scanner-a', 1);
  registerSocketUser('socket-b', 10, 'scanner-b', 1);
  registerSocketUser('socket-c', 10, 'scanner-a', 1);
  registerSocketUser('socket-outra-empresa', 10, 'scanner-c', 2);

  const status = getOutboundUserConnectionStatus(1).get('10');
  assert.equal(status.online, true);
  assert.equal(status.aparelhos_conectados, 2);
  assert.deepEqual(getSocketUserContext('socket-a'), { userId: 10, companyId: 1 });

  unregisterSocket('socket-a');
  unregisterSocket('socket-b');
  unregisterSocket('socket-c');
  unregisterSocket('socket-outra-empresa');
  assert.equal(getOutboundUserConnectionStatus(1).has('10'), false);
});

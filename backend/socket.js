let io;

const socketPresence = new Map();

function ensureSocketEntry(socketId) {
  if (!socketPresence.has(socketId)) {
    socketPresence.set(socketId, {
      userId: null,
      companyId: null,
      clientId: null,
      inventoryIds: new Set(),
      connectedAt: new Date()
    });
  }

  return socketPresence.get(socketId);
}

function registerSocketUser(socketId, userId, clientId = null, companyId = null) {
  const entry = ensureSocketEntry(socketId);
  entry.userId = userId || null;
  entry.companyId = companyId || null;
  entry.clientId = clientId || null;
  entry.connectedAt = new Date();
}

function getSocketUserContext(socketId) {
  const entry = socketPresence.get(socketId);
  if (!entry) return null;
  return { userId: entry.userId, companyId: entry.companyId };
}

function getOutboundUserConnectionStatus(companyId) {
  const targetCompanyId = String(companyId);
  const summaryMap = new Map();
  const uniqueDevicesByUser = new Map();

  for (const [socketId, entry] of socketPresence.entries()) {
    if (!entry.userId || String(entry.companyId) !== targetCompanyId) continue;

    const userId = String(entry.userId);
    if (!uniqueDevicesByUser.has(userId)) uniqueDevicesByUser.set(userId, new Set());
    uniqueDevicesByUser.get(userId).add(entry.clientId || `socket:${socketId}`);

    const current = summaryMap.get(userId) || {
      online: false,
      aparelhos_conectados: 0,
      ultima_conexao_em: null
    };
    current.online = true;
    current.aparelhos_conectados = uniqueDevicesByUser.get(userId).size;
    if (!current.ultima_conexao_em || entry.connectedAt > new Date(current.ultima_conexao_em)) {
      current.ultima_conexao_em = entry.connectedAt.toISOString();
    }
    summaryMap.set(userId, current);
  }

  return summaryMap;
}

function registerSocketInventory(socketId, inventoryId) {
  const entry = ensureSocketEntry(socketId);
  entry.inventoryIds.add(String(inventoryId));
}

function unregisterSocketInventory(socketId, inventoryId) {
  const entry = socketPresence.get(socketId);
  if (!entry) {
    return;
  }

  entry.inventoryIds.delete(String(inventoryId));
}

function unregisterSocket(socketId) {
  const entry = socketPresence.get(socketId);
  if (!entry) {
    return [];
  }

  const inventoryIds = Array.from(entry.inventoryIds);
  socketPresence.delete(socketId);
  return inventoryIds;
}

function getInventoryUserConnectionStatus(inventoryId) {
  const targetInventoryId = String(inventoryId);
  const summaryMap = new Map();
  const uniqueDevicesByUser = new Map();

  for (const [socketId, entry] of socketPresence.entries()) {
    if (!entry.userId || !entry.inventoryIds.has(targetInventoryId)) {
      continue;
    }

    const userIdStr = String(entry.userId);
    const current = summaryMap.get(userIdStr) || {
      online: false,
      aparelhos_conectados: 0,
      ultima_conexao_em: null
    };

    current.online = true;
    if (!uniqueDevicesByUser.has(userIdStr)) {
      uniqueDevicesByUser.set(userIdStr, new Set());
    }
    const deviceKey = entry.clientId || `socket:${socketId}`;
    uniqueDevicesByUser.get(userIdStr).add(deviceKey);
    current.aparelhos_conectados = uniqueDevicesByUser.get(userIdStr).size;

    if (!current.ultima_conexao_em || entry.connectedAt > new Date(current.ultima_conexao_em)) {
      current.ultima_conexao_em = entry.connectedAt.toISOString();
    }

    summaryMap.set(userIdStr, current);
  }

  return summaryMap;
}

module.exports = {
  init: (httpServer) => {
    const { Server } = require('socket.io');
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
      }
    });
    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error('Socket.io not initialized!');
    }
    return io;
  },
  registerSocketUser,
  registerSocketInventory,
  unregisterSocketInventory,
  unregisterSocket,
  getInventoryUserConnectionStatus,
  getOutboundUserConnectionStatus,
  getSocketUserContext
};

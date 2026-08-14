const CACHE_PREFIX = 'outbound_cache_v1';
const QUEUE_PREFIX = 'outbound_queue_v1';

const storageKey = (prefix, userId, cargoId) => `${prefix}:${userId}:${cargoId}`;

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function createOutboundOperationId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `outbound_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function readOutboundCache(userId, cargoId) {
  return readJson(storageKey(CACHE_PREFIX, userId, cargoId), null);
}

export function writeOutboundCache(userId, cargoId, payload) {
  localStorage.setItem(storageKey(CACHE_PREFIX, userId, cargoId), JSON.stringify({ ...payload, cached_at: new Date().toISOString() }));
}

export function readOutboundQueue(userId, cargoId) {
  return readJson(storageKey(QUEUE_PREFIX, userId, cargoId), []);
}

export function writeOutboundQueue(userId, cargoId, queue) {
  const key = storageKey(QUEUE_PREFIX, userId, cargoId);
  if (queue.length) localStorage.setItem(key, JSON.stringify(queue));
  else localStorage.removeItem(key);
}

export function appendOutboundOperation(userId, cargoId, operation) {
  const queue = readOutboundQueue(userId, cargoId);
  const next = [...queue, operation];
  writeOutboundQueue(userId, cargoId, next);
  return next;
}

function itemStatus(quantity, expected) {
  if (quantity > expected) return 'sobra';
  if (Math.abs(quantity - expected) < 0.001) return 'conferido';
  return quantity > 0 ? 'parcial' : 'pendente';
}

export function applyPendingOutboundOperations(carga, queue) {
  if (!carga) return carga;
  const clone = structuredClone(carga);
  const validOperations = queue.filter((operation) => operation.sync_status !== 'blocked');
  validOperations.forEach((operation) => {
    const item = clone.itens?.find((entry) => entry.id === Number(operation.item_id));
    if (!item) return;
    const result = Math.round((Number(item.quantidade_conferida || 0) + Number(operation.quantidade)) * 1000) / 1000;
    item.quantidade_conferida = result;
    item.status = itemStatus(result, Number(item.quantidade_prevista || 0));
  });
  const itens = clone.itens || [];
  clone.resumo = {
    ...(clone.resumo || {}),
    itens_conferidos: itens.filter((item) => item.status === 'conferido').length,
    itens_pendentes: itens.filter((item) => ['pendente', 'parcial'].includes(item.status)).length,
    itens_com_sobra: itens.filter((item) => item.status === 'sobra').length,
    quantidade_conferida: Math.round(itens.reduce((total, item) => total + Number(item.quantidade_conferida || 0), 0) * 1000) / 1000
  };
  return clone;
}

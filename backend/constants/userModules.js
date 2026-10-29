const USER_MODULES = Object.freeze(['inventario', 'cross_docking']);
const DEFAULT_USER_MODULES = Object.freeze([...USER_MODULES]);

const parseModules = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(',');
  }
};

// Somente leitura/migração de cadastros antigos aceita os nomes anteriores.
const normalizeUserModules = (value, fallback = []) => {
  if (value === undefined || value === null) return [...fallback];

  const normalized = parseModules(value)
    .map((moduleName) => String(moduleName || '').trim().toLowerCase())
    .map((moduleName) => ['recebimento', 'expedicao'].includes(moduleName) ? 'cross_docking' : moduleName)
    .filter((moduleName, index, modules) => USER_MODULES.includes(moduleName) && modules.indexOf(moduleName) === index);

  return USER_MODULES.filter((moduleName) => normalized.includes(moduleName));
};

const hasUserModule = (user, moduleName) => normalizeUserModules(user?.modulos).includes(moduleName);

const isValidUserModules = (value) => Array.isArray(value)
  && value.every((moduleName) => USER_MODULES.includes(moduleName));

module.exports = {
  USER_MODULES,
  DEFAULT_USER_MODULES,
  normalizeUserModules,
  isValidUserModules,
  hasUserModule
};

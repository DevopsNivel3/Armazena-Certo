export const USER_MODULES = ['inventario', 'cross_docking'];

export const MODULE_META = {
  inventario: {
    label: 'Inventário',
    description: 'Inventários, contagens, divergências e relatórios de estoque.'
  },
  cross_docking: {
    label: 'Cross Docking',
    description: 'Recebimento de mercadorias, conferência, expedição, retornos e prestação de contas.'
  }
};

export function normalizeUserModules(value) {
  if (value === undefined || value === null) return [];

  let modules = value;
  if (typeof value === 'string') {
    try {
      modules = JSON.parse(value);
    } catch {
      modules = value.split(',');
    }
  }

  if (!Array.isArray(modules)) return [];
  modules = modules.map((name) => String(name || '').trim().toLowerCase())
    .map((name) => ['recebimento', 'expedicao'].includes(name) ? 'cross_docking' : name);
  return USER_MODULES.filter((moduleName) => modules.includes(moduleName));
}

export function hasModule(user, moduleName) {
  return normalizeUserModules(user?.modulos).includes(moduleName);
}

export function hasAllModules(user, moduleNames) {
  return moduleNames.every((moduleName) => hasModule(user, moduleName));
}

export function getModuleRoute(user, moduleName) {
  if (!hasModule(user, moduleName)) return '/sem-acesso';
  if (moduleName === 'inventario') {
    return ['admin', 'gerente'].includes(user.nivel_acesso) ? '/dashboard' : '/inventarios';
  }
  return '/conferencia/inbound';
}

export function getDefaultRouteForUser(user) {
  if (!user) return '/';
  const modules = normalizeUserModules(user.modulos);
  if (modules.length > 1) return '/modulos';
  if (modules.length === 1) return getModuleRoute(user, modules[0]);
  if (user.nivel_acesso === 'admin') return '/usuarios';
  return '/sem-acesso';
}

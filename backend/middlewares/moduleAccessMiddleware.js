const { USER_MODULES, hasUserModule } = require('../constants/userModules');

// authMiddleware carrega o cadastro atual antes de qualquer autorização.
const requireAllModules = (...moduleNames) => {
  if (!moduleNames.length || moduleNames.some((name) => !USER_MODULES.includes(name))) {
    throw new Error('Módulo inválido na configuração de acesso.');
  }
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Sessão não autenticada.' });
    const missingModules = moduleNames.filter((name) => !hasUserModule(req.user, name));
    if (missingModules.length) {
      return res.status(403).json({
        message: 'Seu usuário não possui acesso a este módulo.',
        code: 'MODULE_ACCESS_DENIED',
        modules: missingModules
      });
    }
    return next();
  };
};

const requireModule = (moduleName) => requireAllModules(moduleName);
module.exports = { requireModule, requireAllModules };

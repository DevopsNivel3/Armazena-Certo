const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const authMiddleware = async (req, res, next) => {
  const authorization = req.header('Authorization');
  const token = typeof authorization === 'string' ? authorization.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) return res.status(401).json({ message: 'Informe um token de acesso.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isSafeInteger(Number(decoded.id)) || Number(decoded.id) <= 0) {
      return res.status(401).json({ message: 'Sessão inválida.' });
    }
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }

  try {
    // Perfil, empresa e módulos do token nunca autorizam operações por conta própria.
    const user = await Usuario.findByPk(decoded.id, {
      attributes: ['id', 'nome', 'email', 'empresa_id', 'nivel_acesso', 'modulos']
    });
    if (!user || !user.empresa_id || Number(user.empresa_id) !== Number(decoded.empresa_id)) {
      return res.status(401).json({ message: 'Sessão inválida. Entre novamente.' });
    }
    req.user = user.toJSON();
  } catch (error) {
    console.error('Erro ao consultar permissões da sessão:', error);
    return res.status(500).json({ message: 'Não foi possível consultar as permissões da sessão.' });
  }
  return next();
};

module.exports = authMiddleware;

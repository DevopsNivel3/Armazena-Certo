const Usuario = require('../models/Usuario');
const Empresa = require('../models/Empresa');
const bcrypt = require('bcrypt');
const { fn, col, where, Op } = require('sequelize');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function ensureAdminAccess(user) {
  return user?.nivel_acesso === 'admin'
    ? null
    : { status: 403, message: 'Apenas administradores podem gerenciar usuarios.' };
}

function ensureUserReadAccess(user) {
  return user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'gerente' || user?.nivel_acesso === 'admin_inventario'
    ? null
    : { status: 403, message: 'Apenas gerentes e administradores podem consultar usuarios.' };
}

exports.getAll = async (req, res) => {
  try {
    const accessError = ensureUserReadAccess(req.user);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.message });
    }

    const usuarios = await Usuario.findAll({
      where: { empresa_id: req.user.empresa_id },
      attributes: { exclude: ['senha_hash'] },
      include: [{ model: Empresa, attributes: ['nome'] }]
    });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const accessError = ensureUserReadAccess(req.user);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.message });
    }

    const usuario = await Usuario.findByPk(req.params.id, {
      attributes: { exclude: ['senha_hash'] },
      include: [{ model: Empresa, attributes: ['nome'] }]
    });
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (usuario.empresa_id !== req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { nome, email, senha, nivel_acesso, empresa_id } = req.body;
    
    // Admin can create anything. Gerente and admin_inventario can create 'operador' and 'admin_inventario'.
    if (req.user?.nivel_acesso !== 'admin') {
      if (req.user?.nivel_acesso !== 'gerente' && req.user?.nivel_acesso !== 'admin_inventario') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
      if (nivel_acesso !== 'operador' && nivel_acesso !== 'admin_inventario') {
        return res.status(403).json({ error: 'Gerentes e administradores de inventário só podem criar usuários do tipo operador ou admin de inventário.' });
      }
    }
    const normalizedEmail = normalizeEmail(email);

    if (!nome || !normalizedEmail || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    const targetCompanyId = empresa_id || req.user.empresa_id;
    if (targetCompanyId !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Não é permitido criar usuários em outra empresa' });
    }
    
    // Check if email exists
    const existingUser = await Usuario.findOne({
      where: where(fn('LOWER', col('email')), normalizedEmail)
    });
    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senha, salt);

    const usuario = await Usuario.create({
      nome,
      email: normalizedEmail,
      senha_hash,
      nivel_acesso: nivel_acesso || 'operador',
      empresa_id: targetCompanyId
    });

    const { senha_hash: _, ...usuarioSemSenha } = usuario.toJSON();
    res.status(201).json(usuarioSemSenha);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const accessError = ensureAdminAccess(req.user);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.message });
    }

    const { nome, email, nivel_acesso, empresa_id, senha } = req.body;
    const usuario = await Usuario.findByPk(req.params.id);
    
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (usuario.empresa_id !== req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const targetCompanyId = empresa_id || usuario.empresa_id;
    if (targetCompanyId !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Não é permitido mover usuários para outra empresa' });
    }

    if (email) {
      const normalizedEmail = normalizeEmail(email);
      const existingUser = await Usuario.findOne({
        where: {
          [Op.and]: [
            where(fn('LOWER', col('email')), normalizedEmail),
            { id: { [Op.ne]: usuario.id } }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email já cadastrado' });
      }

      usuario.email = normalizedEmail;
    }

    usuario.nome = nome || usuario.nome;
    usuario.nivel_acesso = nivel_acesso || usuario.nivel_acesso;
    usuario.empresa_id = targetCompanyId;

    if (senha) {
      const salt = await bcrypt.genSalt(10);
      usuario.senha_hash = await bcrypt.hash(senha, salt);
    }

    await usuario.save();
    
    const { senha_hash: _, ...usuarioSemSenha } = usuario.toJSON();
    res.json(usuarioSemSenha);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const accessError = ensureAdminAccess(req.user);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.message });
    }

    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (usuario.empresa_id !== req.user.empresa_id) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    if (usuario.id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir o próprio usuário.' });
    }
    
    await usuario.destroy();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const accessError = ensureUserReadAccess(req.user);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.message });
    }

    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (usuario.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { Contagem, Produto, Inventario } = require('../models');

    const whereClause = { usuario_id: req.params.id };
    if (req.query.inventario_id) {
      whereClause.inventario_id = req.query.inventario_id;
    }

    const history = await Contagem.findAll({
      where: whereClause,
      include: [
        {
            model: Produto,
            attributes: ['id', 'sku', 'nome', 'codigo_barras', 'unidade_medida']
          },
        { 
          model: Inventario, 
          attributes: ['id', 'nome'] 
        }
      ],
      order: [['data_hora', 'DESC']],
      limit: 200 // Limite para evitar travar a tela se tiver milhares
    });

    res.json(history);
  } catch (error) {
    console.error('Erro ao buscar histórico do usuário:', error);
    res.status(500).json({ error: error.message });
  }
};

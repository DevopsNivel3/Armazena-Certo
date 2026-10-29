const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { fn, col, where } = require('sequelize');
const { Usuario, Empresa, sequelize } = require('../models');
const { DEFAULT_USER_MODULES } = require('../constants/userModules');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

exports.register = async (req, res) => {
  try {
    const { nome, email, senha, empresa_nome, empresa_cnpj } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!nome || !normalizedEmail || !senha || !String(empresa_nome || '').trim()) {
      return res.status(400).json({ message: 'Nome, email, senha e nome da empresa são obrigatórios.' });
    }

    // Check if user already exists
    let user = await Usuario.findOne({
      where: where(fn('LOWER', col('email')), normalizedEmail)
    });
    if (user) {
      return res.status(400).json({ message: 'Usuario ja existe' });
    }

    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senha, salt);

    // O cadastro público cria um administrador somente em uma nova empresa.
    user = await sequelize.transaction(async (transaction) => {
      const empresa = await Empresa.create({ nome: empresa_nome.trim(), cnpj: empresa_cnpj }, { transaction });
      return Usuario.create({
        nome,
        email: normalizedEmail,
        senha_hash,
        empresa_id: empresa.id,
        nivel_acesso: 'admin',
        modulos: DEFAULT_USER_MODULES
      }, { transaction });
    });

    // Generate Token
    const token = jwt.sign(
      { id: user.id, email: user.email, nivel_acesso: user.nivel_acesso, empresa_id: user.empresa_id, modulos: user.modulos },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({ token, user: { id: user.id, nome: user.nome, email: user.email, nivel_acesso: user.nivel_acesso, empresa_id: user.empresa_id, modulos: user.modulos } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, senha } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !senha) {
      return res.status(400).json({ message: 'Email e senha sao obrigatorios' });
    }

    // Check if user exists
    const user = await Usuario.findOne({
      where: where(fn('LOWER', col('email')), normalizedEmail)
    });
    if (!user || !user.empresa_id) {
      return res.status(401).json({ message: 'Credenciais invalidas' });
    }

    // Validate password
    const validPassword = await bcrypt.compare(senha, user.senha_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Credenciais invalidas' });
    }

    // Generate Token
    const token = jwt.sign(
      { id: user.id, email: user.email, nivel_acesso: user.nivel_acesso, empresa_id: user.empresa_id, modulos: user.modulos },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, nivel_acesso: user.nivel_acesso, empresa_id: user.empresa_id, modulos: user.modulos } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await Usuario.findByPk(req.user.id, {
      attributes: { exclude: ['senha_hash'] }
    });
    if (!user) return res.status(401).json({ message: 'Usuário da sessão não encontrado.' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

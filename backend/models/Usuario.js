const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Empresa = require('./Empresa');
const { normalizeUserModules } = require('../constants/userModules');

const Usuario = sequelize.define('Usuario', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: 'uq_usuarios_email',
    set(value) {
      this.setDataValue('email', String(value || '').trim().toLowerCase());
    }
  },
  senha_hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nivel_acesso: {
    type: DataTypes.ENUM('admin', 'gerente', 'operador', 'admin_inventario'),
    defaultValue: 'operador'
  },
  modulos: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      return normalizeUserModules(this.getDataValue('modulos'));
    },
    set(value) {
      this.setDataValue('modulos', JSON.stringify(normalizeUserModules(value)));
    }
  }
}, {
  hooks: {
    beforeValidate(usuario) {
      if (usuario.getDataValue('modulos') === null || usuario.getDataValue('modulos') === undefined) {
        usuario.modulos = [];
      }
    }
  }
});

Usuario.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Empresa.hasMany(Usuario, { foreignKey: 'empresa_id' });

module.exports = Usuario;

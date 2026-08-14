const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Empresa = require('./Empresa');

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
  }
});

Usuario.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Empresa.hasMany(Usuario, { foreignKey: 'empresa_id' });

module.exports = Usuario;

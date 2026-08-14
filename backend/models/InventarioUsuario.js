const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const InventarioUsuario = sequelize.define('InventarioUsuario', {
  inventario_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
  },
  usuario_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
  },
  local_atribuido: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  timestamps: true,
  tableName: 'InventarioUsuario'
});

module.exports = InventarioUsuario;
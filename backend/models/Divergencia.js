const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Inventario = require('./Inventario');
const Produto = require('./Produto');

const Divergencia = sequelize.define('Divergencia', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  quantidade_erp: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false
  },
  quantidade_contada: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false
  },
  diferenca: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false
  },
  status: {
    type: DataTypes.STRING, // pendente, justificada, aceita
    defaultValue: 'pendente'
  }
});

Divergencia.belongsTo(Inventario, { foreignKey: 'inventario_id' });
Inventario.hasMany(Divergencia, { foreignKey: 'inventario_id' });

Divergencia.belongsTo(Produto, { foreignKey: 'produto_id' });
// Produto.hasMany(Divergencia, { foreignKey: 'produto_id' });

module.exports = Divergencia;

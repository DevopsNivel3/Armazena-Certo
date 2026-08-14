const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Empresa = require('./Empresa');

const Produto = sequelize.define('Produto', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sku: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  categoria: DataTypes.STRING,
  unidade_medida: DataTypes.STRING,
  codigo_referencia: DataTypes.STRING,
  codigo_barras: {
    type: DataTypes.STRING,
  },
  preco_custo: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  preco_venda: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  fator_conversao: {
    type: DataTypes.DECIMAL(10, 3),
    defaultValue: 1
  }
});

Produto.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Empresa.hasMany(Produto, { foreignKey: 'empresa_id' });

module.exports = Produto;

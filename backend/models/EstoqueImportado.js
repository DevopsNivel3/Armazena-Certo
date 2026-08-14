const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Inventario = require('./Inventario');
const Produto = require('./Produto');
const Localizacao = require('./Localizacao');

const EstoqueImportado = sequelize.define('EstoqueImportado', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  lote: DataTypes.STRING,
  validade: DataTypes.DATEONLY,
  saldo_erp: {
    type: DataTypes.DECIMAL(10, 3),
    defaultValue: 0
  },
  fator_conversao: {
    type: DataTypes.DECIMAL(10, 3),
    defaultValue: 1
  }
});

EstoqueImportado.belongsTo(Inventario, { foreignKey: 'inventario_id' });
Inventario.hasMany(EstoqueImportado, { foreignKey: 'inventario_id' });

EstoqueImportado.belongsTo(Produto, { foreignKey: 'produto_id' });
// Produto.hasMany(EstoqueImportado, { foreignKey: 'produto_id' });

EstoqueImportado.belongsTo(Localizacao, { foreignKey: 'localizacao_id' });
// Localizacao.hasMany(EstoqueImportado, { foreignKey: 'localizacao_id' });

module.exports = EstoqueImportado;

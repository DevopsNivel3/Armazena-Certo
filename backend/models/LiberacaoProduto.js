const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Inventario = require('./Inventario');
const Produto = require('./Produto');
const Usuario = require('./Usuario');

const LiberacaoProduto = sequelize.define('LiberacaoProduto', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  origem: {
    type: DataTypes.ENUM('manual', 'categoria', 'status', 'mista'),
    allowNull: false,
    defaultValue: 'manual'
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['inventario_id', 'usuario_id', 'produto_id'],
      name: 'uq_liberacao_produto_usuario'
    }
  ]
});

LiberacaoProduto.belongsTo(Inventario, { foreignKey: 'inventario_id' });
Inventario.hasMany(LiberacaoProduto, { foreignKey: 'inventario_id' });

LiberacaoProduto.belongsTo(Produto, { foreignKey: 'produto_id' });
Produto.hasMany(LiberacaoProduto, { foreignKey: 'produto_id' });

LiberacaoProduto.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuarioDestino' });
Usuario.hasMany(LiberacaoProduto, { foreignKey: 'usuario_id', as: 'liberacoesRecebidas' });

LiberacaoProduto.belongsTo(Usuario, { foreignKey: 'liberado_por_usuario_id', as: 'liberadoPor' });
Usuario.hasMany(LiberacaoProduto, { foreignKey: 'liberado_por_usuario_id', as: 'liberacoesCriadas' });

module.exports = LiberacaoProduto;

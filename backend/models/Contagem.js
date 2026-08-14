const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Inventario = require('./Inventario');
const Produto = require('./Produto');
const Localizacao = require('./Localizacao');
const Usuario = require('./Usuario');

const Contagem = sequelize.define('Contagem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  numero_contagem: {
    type: DataTypes.INTEGER, // 1, 2, 3
    allowNull: false
  },
  quantidade_contada: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false
  },
  validade: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  observacao: {
    type: DataTypes.STRING,
    allowNull: true
  },
  data_hora: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  local_contagem: {
    type: DataTypes.STRING,
    allowNull: true
  },
  client_operation_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true
  }
});

Contagem.belongsTo(Inventario, { foreignKey: 'inventario_id' });
Inventario.hasMany(Contagem, { foreignKey: 'inventario_id' });

Contagem.belongsTo(Produto, { foreignKey: 'produto_id' });
// Produto.hasMany(Contagem, { foreignKey: 'produto_id' });

Contagem.belongsTo(Localizacao, { foreignKey: 'localizacao_id' });
// Localizacao.hasMany(Contagem, { foreignKey: 'localizacao_id' });

Contagem.belongsTo(Usuario, { foreignKey: 'usuario_id' });
Usuario.hasMany(Contagem, { foreignKey: 'usuario_id' });

module.exports = Contagem;

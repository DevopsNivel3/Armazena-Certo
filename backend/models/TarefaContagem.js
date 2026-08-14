const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Inventario = require('./Inventario');
const Localizacao = require('./Localizacao');
const Operador = require('./Operador');

const TarefaContagem = sequelize.define('TarefaContagem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  status: {
    type: DataTypes.ENUM('pendente', 'em_andamento', 'finalizada'),
    defaultValue: 'pendente'
  },
  data_inicio: DataTypes.DATE,
  data_fim: DataTypes.DATE
});

TarefaContagem.belongsTo(Inventario, { foreignKey: 'inventario_id' });
Inventario.hasMany(TarefaContagem, { foreignKey: 'inventario_id' });

TarefaContagem.belongsTo(Localizacao, { foreignKey: 'localizacao_id' });
// Localizacao.hasMany(TarefaContagem, { foreignKey: 'localizacao_id' });

TarefaContagem.belongsTo(Operador, { foreignKey: 'operador_id' });
Operador.hasMany(TarefaContagem, { foreignKey: 'operador_id' });

module.exports = TarefaContagem;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const CargaExpedicao = require('./CargaExpedicao');
const CargaExpedicaoItem = require('./CargaExpedicaoItem');
const Usuario = require('./Usuario');

const ExpedicaoItemConferencia = sequelize.define('ExpedicaoItemConferencia', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tipo: {
    type: DataTypes.ENUM('contagem', 'ajuste', 'recontagem'),
    allowNull: false
  },
  quantidade_informada: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  quantidade_anterior: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  quantidade_resultante: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  unidade_medida: { type: DataTypes.STRING(20), allowNull: false },
  motivo: { type: DataTypes.STRING(500), allowNull: true },
  client_operation_id: { type: DataTypes.STRING(100), allowNull: true },
  registrado_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  indexes: [
    { fields: ['carga_expedicao_id', 'registrado_em'] },
    { fields: ['carga_expedicao_item_id', 'registrado_em'] },
    { fields: ['usuario_id', 'registrado_em'] },
    { unique: true, fields: ['usuario_id', 'client_operation_id'], name: 'uq_expedicao_conferencia_operacao_usuario' }
  ]
});

ExpedicaoItemConferencia.belongsTo(CargaExpedicao, { foreignKey: 'carga_expedicao_id' });
CargaExpedicao.hasMany(ExpedicaoItemConferencia, { foreignKey: 'carga_expedicao_id', as: 'historicoConferencia' });
ExpedicaoItemConferencia.belongsTo(CargaExpedicaoItem, { foreignKey: 'carga_expedicao_item_id', as: 'item' });
CargaExpedicaoItem.hasMany(ExpedicaoItemConferencia, { foreignKey: 'carga_expedicao_item_id', as: 'historico' });
ExpedicaoItemConferencia.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
Usuario.hasMany(ExpedicaoItemConferencia, { foreignKey: 'usuario_id', as: 'conferenciasExpedicao' });

module.exports = ExpedicaoItemConferencia;

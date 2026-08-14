const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const CargaExpedicao = require('./CargaExpedicao');
const RecebimentoNota = require('./RecebimentoNota');

const ExpedicaoNota = sequelize.define('ExpedicaoNota', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  chave_acesso: { type: DataTypes.STRING(44), allowNull: false },
  status: {
    type: DataTypes.ENUM('pendente', 'apta', 'nao_localizada', 'inbound_divergente', 'embarcada', 'divergencia_embarque'),
    defaultValue: 'pendente'
  },
  motivo_divergencia: { type: DataTypes.STRING, allowNull: true },
  qtd_volumes_embarcados: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
  embarcado_em: { type: DataTypes.DATE, allowNull: true }
}, {
  indexes: [{ unique: true, fields: ['carga_expedicao_id', 'chave_acesso'] }]
});

ExpedicaoNota.belongsTo(CargaExpedicao, { foreignKey: 'carga_expedicao_id' });
CargaExpedicao.hasMany(ExpedicaoNota, { foreignKey: 'carga_expedicao_id', as: 'notas' });
ExpedicaoNota.belongsTo(RecebimentoNota, { as: 'notaRecebimento', foreignKey: 'recebimento_nota_id' });
RecebimentoNota.hasMany(ExpedicaoNota, { foreignKey: 'recebimento_nota_id', as: 'vinculosExpedicao' });

const Usuario = require('./Usuario');
ExpedicaoNota.belongsTo(Usuario, { as: 'embarcadoPor', foreignKey: 'embarcado_por_usuario_id' });
Usuario.hasMany(ExpedicaoNota, { as: 'notasExpedicaoEmbarcadas', foreignKey: 'embarcado_por_usuario_id' });

module.exports = ExpedicaoNota;

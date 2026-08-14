const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Empresa = require('./Empresa');
const Usuario = require('./Usuario');

const CargaExpedicao = sequelize.define('CargaExpedicao', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  placa_veiculo: { type: DataTypes.STRING, allowNull: true },
  motorista: { type: DataTypes.STRING, allowNull: true },
  rota: { type: DataTypes.STRING, allowNull: true },
  data_rota: { type: DataTypes.DATEONLY, allowNull: true },
  arquivo_nome: { type: DataTypes.STRING, allowNull: true },
  xml_original: { type: DataTypes.TEXT('long'), allowNull: true },
  atribuido_em: { type: DataTypes.DATE, allowNull: true },
  conferencia_iniciada_em: { type: DataTypes.DATE, allowNull: true },
  conferencia_finalizada_em: { type: DataTypes.DATE, allowNull: true },
  liberado_em: { type: DataTypes.DATE, allowNull: true },
  justificativa_liberacao: { type: DataTypes.STRING(500), allowNull: true },
  recontagem_status: {
    type: DataTypes.ENUM('pendente', 'em_andamento', 'finalizada'),
    allowNull: true
  },
  recontagem_motivo: { type: DataTypes.STRING(500), allowNull: true },
  recontagem_solicitada_em: { type: DataTypes.DATE, allowNull: true },
  recontagem_iniciada_em: { type: DataTypes.DATE, allowNull: true },
  recontagem_finalizada_em: { type: DataTypes.DATE, allowNull: true },
  retornado_em: { type: DataTypes.DATE, allowNull: true },
  retorno_motivo: { type: DataTypes.STRING(500), allowNull: true },
  retorno_destino: {
    type: DataTypes.ENUM('reintegracao', 'nova_roteirizacao'),
    allowNull: true
  },
  retorno_observacoes: { type: DataTypes.STRING(1000), allowNull: true },
  status: {
    type: DataTypes.ENUM('aguardando_liberacao', 'divergente', 'em_carregamento', 'liberada', 'cancelada', 'retornada'),
    defaultValue: 'aguardando_liberacao'
  },
  importado_em: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

CargaExpedicao.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Empresa.hasMany(CargaExpedicao, { foreignKey: 'empresa_id' });
CargaExpedicao.belongsTo(Usuario, { as: 'importadoPor', foreignKey: 'importado_por_usuario_id' });
Usuario.hasMany(CargaExpedicao, { as: 'cargasExpedicaoImportadas', foreignKey: 'importado_por_usuario_id' });
CargaExpedicao.belongsTo(Usuario, { as: 'conferenteResponsavel', foreignKey: 'conferente_usuario_id' });
Usuario.hasMany(CargaExpedicao, { as: 'cargasExpedicaoAtribuidas', foreignKey: 'conferente_usuario_id' });
CargaExpedicao.belongsTo(Usuario, { as: 'atribuidoPor', foreignKey: 'atribuido_por_usuario_id' });
Usuario.hasMany(CargaExpedicao, { as: 'cargasExpedicaoDistribuidas', foreignKey: 'atribuido_por_usuario_id' });
CargaExpedicao.belongsTo(Usuario, { as: 'conferenciaFinalizadaPor', foreignKey: 'conferencia_finalizada_por_usuario_id' });
Usuario.hasMany(CargaExpedicao, { as: 'conferenciasExpedicaoFinalizadas', foreignKey: 'conferencia_finalizada_por_usuario_id' });
CargaExpedicao.belongsTo(Usuario, { as: 'liberadoPor', foreignKey: 'liberado_por_usuario_id' });
Usuario.hasMany(CargaExpedicao, { as: 'cargasExpedicaoLiberadas', foreignKey: 'liberado_por_usuario_id' });
CargaExpedicao.belongsTo(Usuario, { as: 'conferenteRecontagem', foreignKey: 'recontagem_usuario_id' });
Usuario.hasMany(CargaExpedicao, { as: 'recontagensExpedicaoAtribuidas', foreignKey: 'recontagem_usuario_id' });
CargaExpedicao.belongsTo(Usuario, { as: 'recontagemSolicitadaPor', foreignKey: 'recontagem_solicitada_por_usuario_id' });
Usuario.hasMany(CargaExpedicao, { as: 'recontagensExpedicaoSolicitadas', foreignKey: 'recontagem_solicitada_por_usuario_id' });
CargaExpedicao.belongsTo(Usuario, { as: 'retornadoPor', foreignKey: 'retornado_por_usuario_id' });
Usuario.hasMany(CargaExpedicao, { as: 'cargasExpedicaoRetornadas', foreignKey: 'retornado_por_usuario_id' });

module.exports = CargaExpedicao;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const CargaExpedicao = require('./CargaExpedicao');
const Usuario = require('./Usuario');

const CargaExpedicaoItem = sequelize.define('CargaExpedicaoItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  codigo_produto: { type: DataTypes.STRING, allowNull: false },
  codigo_barras: { type: DataTypes.STRING, allowNull: true },
  descricao: { type: DataTypes.STRING, allowNull: false },
  unidade_medida: { type: DataTypes.STRING(20), allowNull: false },
  quantidade_prevista: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  quantidade_conferida: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  status: {
    type: DataTypes.ENUM('pendente', 'parcial', 'conferido', 'sobra'),
    allowNull: false,
    defaultValue: 'pendente'
  },
  requer_recontagem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  quantidade_primeira_conferencia: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  recontado_em: { type: DataTypes.DATE, allowNull: true },
  ultima_conferencia_em: { type: DataTypes.DATE, allowNull: true }
}, {
  indexes: [
    { fields: ['carga_expedicao_id', 'codigo_produto'] },
    { fields: ['carga_expedicao_id', 'codigo_barras'] }
  ]
});

CargaExpedicaoItem.belongsTo(CargaExpedicao, { foreignKey: 'carga_expedicao_id' });
CargaExpedicao.hasMany(CargaExpedicaoItem, { foreignKey: 'carga_expedicao_id', as: 'itens' });
CargaExpedicaoItem.belongsTo(Usuario, { as: 'conferidoPor', foreignKey: 'conferido_por_usuario_id' });
Usuario.hasMany(CargaExpedicaoItem, { as: 'itensExpedicaoConferidos', foreignKey: 'conferido_por_usuario_id' });
CargaExpedicaoItem.belongsTo(Usuario, { as: 'recontadoPor', foreignKey: 'recontado_por_usuario_id' });
Usuario.hasMany(CargaExpedicaoItem, { as: 'itensExpedicaoRecontados', foreignKey: 'recontado_por_usuario_id' });

module.exports = CargaExpedicaoItem;

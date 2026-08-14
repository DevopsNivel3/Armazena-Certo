const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Empresa = require('./Empresa');
const Usuario = require('./Usuario');

const LoteRecebimento = sequelize.define('LoteRecebimento', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  doca: {
    type: DataTypes.STRING,
    allowNull: true
  },
  origem: {
    type: DataTypes.STRING,
    allowNull: true
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('importado', 'em_conferencia', 'conferido', 'divergente', 'liberado_fusion', 'cancelado'),
    defaultValue: 'importado'
  },
  data_recebimento: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  encerrado_em: {
    type: DataTypes.DATE,
    allowNull: true
  },
  exportacao_codigo: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  exportado_em: {
    type: DataTypes.DATE,
    allowNull: true
  },
  liberado_em: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

LoteRecebimento.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Empresa.hasMany(LoteRecebimento, { foreignKey: 'empresa_id' });

LoteRecebimento.belongsTo(Usuario, { as: 'criadoPor', foreignKey: 'criado_por_usuario_id' });
Usuario.hasMany(LoteRecebimento, { as: 'lotesRecebimentoCriados', foreignKey: 'criado_por_usuario_id' });

LoteRecebimento.belongsTo(Usuario, { as: 'liberadoPor', foreignKey: 'liberado_por_usuario_id' });
Usuario.hasMany(LoteRecebimento, { as: 'lotesRecebimentoLiberados', foreignKey: 'liberado_por_usuario_id' });

module.exports = LoteRecebimento;

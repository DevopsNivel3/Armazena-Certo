const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const LoteRecebimento = require('./LoteRecebimento');
const Usuario = require('./Usuario');

const RecebimentoNota = sequelize.define('RecebimentoNota', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  chave_acesso: {
    type: DataTypes.STRING(60),
    allowNull: false
  },
  numero_nfe: {
    type: DataTypes.STRING,
    allowNull: true
  },
  serie: {
    type: DataTypes.STRING,
    allowNull: true
  },
  emitente_nome: {
    type: DataTypes.STRING,
    allowNull: true
  },
  emitente_cnpj: {
    type: DataTypes.STRING,
    allowNull: true
  },
  destinatario_nome: {
    type: DataTypes.STRING,
    allowNull: true
  },
  destinatario_cnpj: {
    type: DataTypes.STRING,
    allowNull: true
  },
  qtd_volumes_xml: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: false,
    defaultValue: 0
  },
  qtd_volumes_fisico: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: true
  },
  especie: {
    type: DataTypes.STRING,
    allowNull: true
  },
  marca: {
    type: DataTypes.STRING,
    allowNull: true
  },
  numeracao: {
    type: DataTypes.STRING,
    allowNull: true
  },
  peso_liquido: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: true
  },
  peso_bruto: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: true
  },
  avarias: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  arquivo_nome: {
    type: DataTypes.STRING,
    allowNull: true
  },
  xml_original: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  conferido_em: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pendente', 'ok', 'falta', 'sobra', 'avaria'),
    defaultValue: 'pendente'
  },
  situacao_logistica: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'recebida'
  },
  exportado_em: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['lote_recebimento_id', 'chave_acesso']
    }
  ]
});

RecebimentoNota.belongsTo(LoteRecebimento, { foreignKey: 'lote_recebimento_id' });
LoteRecebimento.hasMany(RecebimentoNota, { foreignKey: 'lote_recebimento_id', as: 'notas' });

RecebimentoNota.belongsTo(Usuario, { as: 'conferidoPor', foreignKey: 'conferido_por_usuario_id' });
Usuario.hasMany(RecebimentoNota, { as: 'notasRecebimentoConferidas', foreignKey: 'conferido_por_usuario_id' });

module.exports = RecebimentoNota;

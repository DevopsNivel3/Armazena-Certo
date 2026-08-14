const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Empresa = require('./Empresa');

const Inventario = sequelize.define('Inventario', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  data_inicio: DataTypes.DATE,
  data_fim: DataTypes.DATE,
  status: {
    type: DataTypes.ENUM('criado', 'em_contagem', 'em_recontagem', 'finalizado'),
    defaultValue: 'criado'
  },
  etapa_contagem: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  validade_obrigatoria: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  observacoes: DataTypes.TEXT,
  empresa_cliente_nome: {
    type: DataTypes.STRING,
    allowNull: true
  },
  empresa_cliente_cnpj: {
    type: DataTypes.STRING,
    allowNull: true
  },
  empresa_cliente_filial: {
    type: DataTypes.STRING,
    allowNull: true
  },
  empresa_cliente_endereco: {
    type: DataTypes.STRING,
    allowNull: true
  },
  locais_contagem: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: ['Picking', 'Pulmão']
  }
});

Inventario.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Empresa.hasMany(Inventario, { foreignKey: 'empresa_id' });

module.exports = Inventario;

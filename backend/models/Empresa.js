const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Empresa = sequelize.define('Empresa', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cnpj: {
    type: DataTypes.STRING,
    unique: 'uq_empresas_cnpj'
  },
  endereco: DataTypes.STRING,
  telefone: DataTypes.STRING,
  email: DataTypes.STRING
});

module.exports = Empresa;

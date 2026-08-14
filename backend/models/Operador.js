const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Empresa = require('./Empresa');

const Operador = sequelize.define('Operador', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  documento: DataTypes.STRING,
  telefone: DataTypes.STRING,
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

Operador.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Empresa.hasMany(Operador, { foreignKey: 'empresa_id' });

module.exports = Operador;

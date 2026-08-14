const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Empresa = require('./Empresa');

const Localizacao = sequelize.define('Localizacao', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  corredor: DataTypes.STRING,
  rua: DataTypes.STRING,
  prateleira: DataTypes.STRING,
  nivel: DataTypes.STRING
});

Localizacao.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Empresa.hasMany(Localizacao, { foreignKey: 'empresa_id' });

module.exports = Localizacao;

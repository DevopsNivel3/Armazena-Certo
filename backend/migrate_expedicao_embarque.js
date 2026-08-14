require('dotenv').config();
const { DataTypes } = require('sequelize');
const { sequelize, ExpedicaoNota } = require('./models');

async function migrate() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = ExpedicaoNota.getTableName();
  const columns = await queryInterface.describeTable(tableName);

  if (!columns.qtd_volumes_embarcados) {
    await queryInterface.addColumn(tableName, 'qtd_volumes_embarcados', { type: DataTypes.DECIMAL(12, 3), allowNull: true });
  }
  if (!columns.embarcado_em) {
    await queryInterface.addColumn(tableName, 'embarcado_em', { type: DataTypes.DATE, allowNull: true });
  }
  if (!columns.embarcado_por_usuario_id) {
    await queryInterface.addColumn(tableName, 'embarcado_por_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  }

  await queryInterface.changeColumn(tableName, 'status', {
    type: DataTypes.ENUM('pendente', 'apta', 'nao_localizada', 'inbound_divergente', 'embarcada', 'divergencia_embarque'),
    allowNull: false,
    defaultValue: 'pendente'
  });
  console.log('Migração de conferência de embarque concluída.');
}

migrate().then(() => sequelize.close()).catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});

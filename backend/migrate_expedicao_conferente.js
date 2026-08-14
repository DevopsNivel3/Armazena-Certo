require('dotenv').config();
const { DataTypes } = require('sequelize');
const { sequelize, CargaExpedicao } = require('./models');

async function migrate() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = CargaExpedicao.getTableName();
  const columns = await queryInterface.describeTable(tableName);

  if (!columns.conferente_usuario_id) await queryInterface.addColumn(tableName, 'conferente_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  if (!columns.atribuido_por_usuario_id) await queryInterface.addColumn(tableName, 'atribuido_por_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  if (!columns.atribuido_em) await queryInterface.addColumn(tableName, 'atribuido_em', { type: DataTypes.DATE, allowNull: true });

  console.log('Migração de conferente responsável da expedição concluída.');
}

migrate().then(() => sequelize.close()).catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});

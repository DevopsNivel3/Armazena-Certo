require('dotenv').config();
const { DataTypes } = require('sequelize');
const { sequelize, ExpedicaoItemConferencia } = require('./models');

async function migrate() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = ExpedicaoItemConferencia.getTableName();
  let columns;
  try {
    columns = await queryInterface.describeTable(tableName);
  } catch (error) {
    if (error?.original?.code !== 'ER_NO_SUCH_TABLE') throw error;
    await ExpedicaoItemConferencia.sync();
    console.log('Migração do histórico de conferência Outbound concluída.');
    return;
  }
  if (!columns.client_operation_id) {
    await queryInterface.addColumn(tableName, 'client_operation_id', { type: DataTypes.STRING(100), allowNull: true });
  }
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.name === 'uq_expedicao_conferencia_operacao_usuario')) {
    await queryInterface.addIndex(tableName, ['usuario_id', 'client_operation_id'], { unique: true, name: 'uq_expedicao_conferencia_operacao_usuario' });
  }
  console.log('Migração do histórico de conferência Outbound concluída.');
}

migrate().then(() => sequelize.close()).catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});

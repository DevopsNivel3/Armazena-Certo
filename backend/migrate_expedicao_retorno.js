require('dotenv').config();
const { DataTypes } = require('sequelize');
const { sequelize, CargaExpedicao } = require('./models');

async function migrate() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = CargaExpedicao.getTableName();
  const columns = await queryInterface.describeTable(tableName);

  await queryInterface.changeColumn(tableName, 'status', {
    type: DataTypes.ENUM('aguardando_liberacao', 'divergente', 'em_carregamento', 'liberada', 'cancelada', 'retornada'),
    allowNull: true,
    defaultValue: 'aguardando_liberacao'
  });
  if (!columns.retornado_em) await queryInterface.addColumn(tableName, 'retornado_em', { type: DataTypes.DATE, allowNull: true });
  if (!columns.retorno_motivo) await queryInterface.addColumn(tableName, 'retorno_motivo', { type: DataTypes.STRING(500), allowNull: true });
  if (!columns.retorno_destino) await queryInterface.addColumn(tableName, 'retorno_destino', { type: DataTypes.ENUM('reintegracao', 'nova_roteirizacao'), allowNull: true });
  if (!columns.retorno_observacoes) await queryInterface.addColumn(tableName, 'retorno_observacoes', { type: DataTypes.STRING(1000), allowNull: true });
  if (!columns.retornado_por_usuario_id) await queryInterface.addColumn(tableName, 'retornado_por_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  console.log('Migração de retorno da carga Outbound concluída.');
}

migrate().then(() => sequelize.close()).catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});

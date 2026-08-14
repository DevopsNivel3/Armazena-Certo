require('dotenv').config();
const { DataTypes } = require('sequelize');
const { sequelize, CargaExpedicao, CargaExpedicaoItem, ExpedicaoItemConferencia } = require('./models');

async function migrate() {
  const queryInterface = sequelize.getQueryInterface();
  const cargoTable = CargaExpedicao.getTableName();
  const itemTable = CargaExpedicaoItem.getTableName();
  const historyTable = ExpedicaoItemConferencia.getTableName();
  const cargoColumns = await queryInterface.describeTable(cargoTable);
  const itemColumns = await queryInterface.describeTable(itemTable);

  if (!cargoColumns.recontagem_status) await queryInterface.addColumn(cargoTable, 'recontagem_status', { type: DataTypes.ENUM('pendente', 'em_andamento', 'finalizada'), allowNull: true });
  if (!cargoColumns.recontagem_motivo) await queryInterface.addColumn(cargoTable, 'recontagem_motivo', { type: DataTypes.STRING(500), allowNull: true });
  if (!cargoColumns.recontagem_usuario_id) await queryInterface.addColumn(cargoTable, 'recontagem_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  if (!cargoColumns.recontagem_solicitada_por_usuario_id) await queryInterface.addColumn(cargoTable, 'recontagem_solicitada_por_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  if (!cargoColumns.recontagem_solicitada_em) await queryInterface.addColumn(cargoTable, 'recontagem_solicitada_em', { type: DataTypes.DATE, allowNull: true });
  if (!cargoColumns.recontagem_iniciada_em) await queryInterface.addColumn(cargoTable, 'recontagem_iniciada_em', { type: DataTypes.DATE, allowNull: true });
  if (!cargoColumns.recontagem_finalizada_em) await queryInterface.addColumn(cargoTable, 'recontagem_finalizada_em', { type: DataTypes.DATE, allowNull: true });
  if (!itemColumns.requer_recontagem) await queryInterface.addColumn(itemTable, 'requer_recontagem', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  if (!itemColumns.quantidade_primeira_conferencia) await queryInterface.addColumn(itemTable, 'quantidade_primeira_conferencia', { type: DataTypes.DECIMAL(14, 3), allowNull: true });
  if (!itemColumns.recontado_em) await queryInterface.addColumn(itemTable, 'recontado_em', { type: DataTypes.DATE, allowNull: true });
  if (!itemColumns.recontado_por_usuario_id) await queryInterface.addColumn(itemTable, 'recontado_por_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  await queryInterface.changeColumn(historyTable, 'tipo', { type: DataTypes.ENUM('contagem', 'ajuste', 'recontagem'), allowNull: false });
  console.log('Migração da recontagem Outbound concluída.');
}

migrate().then(() => sequelize.close()).catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});

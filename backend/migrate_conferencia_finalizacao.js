require('dotenv').config();
const { DataTypes } = require('sequelize');
const sequelize = require('./config/db');

async function addColumnIfMissing(queryInterface, table, columns, name, definition) {
  if (!columns[name]) await queryInterface.addColumn(table, name, definition);
}

async function migrate() {
  const queryInterface = sequelize.getQueryInterface();
  const loteTable = 'LoteRecebimentos';
  const notaTable = 'RecebimentoNota';
  const [loteColumns, notaColumns] = await Promise.all([
    queryInterface.describeTable(loteTable),
    queryInterface.describeTable(notaTable)
  ]);

  await addColumnIfMissing(queryInterface, loteTable, loteColumns, 'exportacao_codigo', { type: DataTypes.STRING(80), allowNull: true });
  await addColumnIfMissing(queryInterface, loteTable, loteColumns, 'exportado_em', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(queryInterface, loteTable, loteColumns, 'liberado_em', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(queryInterface, loteTable, loteColumns, 'liberado_por_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  await addColumnIfMissing(queryInterface, notaTable, notaColumns, 'situacao_logistica', { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'recebida' });
  await addColumnIfMissing(queryInterface, notaTable, notaColumns, 'exportado_em', { type: DataTypes.DATE, allowNull: true });

  console.log('Migracao de finalizacao da conferencia concluida.');
}

migrate().then(() => sequelize.close()).catch((error) => {
  console.error(error);
  sequelize.close().finally(() => process.exit(1));
});

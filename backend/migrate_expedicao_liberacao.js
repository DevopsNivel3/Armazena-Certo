require('dotenv').config();
const { DataTypes } = require('sequelize');
const { fn, col } = require('sequelize');
const { sequelize, CargaExpedicao, ExpedicaoItemConferencia } = require('./models');

async function migrate() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = CargaExpedicao.getTableName();
  const columns = await queryInterface.describeTable(tableName);

  if (!columns.conferencia_finalizada_em) await queryInterface.addColumn(tableName, 'conferencia_finalizada_em', { type: DataTypes.DATE, allowNull: true });
  if (!columns.conferencia_iniciada_em) await queryInterface.addColumn(tableName, 'conferencia_iniciada_em', { type: DataTypes.DATE, allowNull: true });
  if (!columns.conferencia_finalizada_por_usuario_id) await queryInterface.addColumn(tableName, 'conferencia_finalizada_por_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  if (!columns.liberado_em) await queryInterface.addColumn(tableName, 'liberado_em', { type: DataTypes.DATE, allowNull: true });
  if (!columns.liberado_por_usuario_id) await queryInterface.addColumn(tableName, 'liberado_por_usuario_id', { type: DataTypes.INTEGER, allowNull: true });
  if (!columns.justificativa_liberacao) await queryInterface.addColumn(tableName, 'justificativa_liberacao', { type: DataTypes.STRING(500), allowNull: true });

  const starts = await ExpedicaoItemConferencia.findAll({
    attributes: ['carga_expedicao_id', [fn('MIN', col('registrado_em')), 'iniciada_em']],
    group: ['carga_expedicao_id'],
    raw: true
  });
  for (const start of starts) {
    await CargaExpedicao.update(
      { conferencia_iniciada_em: start.iniciada_em },
      { where: { id: start.carga_expedicao_id, conferencia_iniciada_em: null } }
    );
  }

  console.log('Migração da autorização de liberação da expedição concluída.');
}

migrate().then(() => sequelize.close()).catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});

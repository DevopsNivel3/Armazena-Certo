const { Sequelize } = require('sequelize');
const sequelize = require('./config/db');

async function migrate() {
  try {
    await sequelize.authenticate();
    const queryInterface = sequelize.getQueryInterface();
    const table = await queryInterface.describeTable('Contagems');

    if (!table.client_operation_id) {
      await queryInterface.addColumn('Contagems', 'client_operation_id', {
        type: Sequelize.STRING(64),
        allowNull: true,
        unique: true
      });
      console.log('Coluna client_operation_id adicionada à tabela Contagems.');
    } else {
      console.log('Coluna client_operation_id já existe.');
    }

    const indexes = await queryInterface.showIndex('Contagems');
    const hasOperationIndex = indexes.some((index) =>
      index.unique && index.fields?.some((field) => field.attribute === 'client_operation_id')
    );
    if (!hasOperationIndex) {
      await queryInterface.addIndex('Contagems', ['client_operation_id'], {
        name: 'contagem_client_operation_id_unique',
        unique: true
      });
      console.log('Índice único de idempotência criado.');
    }

    console.log('Migração da sincronização offline concluída.');
    process.exit(0);
  } catch (error) {
    console.error('Erro durante a migração da sincronização offline:', error);
    process.exit(1);
  }
}

migrate();

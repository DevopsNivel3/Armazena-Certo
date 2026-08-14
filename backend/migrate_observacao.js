const { Sequelize } = require('sequelize');
const sequelize = require('./config/db');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');

    const queryInterface = sequelize.getQueryInterface();

    // Adicionar coluna observacao
    try {
      await queryInterface.addColumn('Contagems', 'observacao', {
        type: Sequelize.STRING,
        allowNull: true
      });
      console.log('Coluna "observacao" adicionada com sucesso na tabela Contagems.');
    } catch (err) {
      if (err.message.includes('Duplicate column name') || err.message.includes('already exists')) {
        console.log('Coluna "observacao" já existe. Ignorando.');
      } else {
        throw err;
      }
    }

    console.log('Migração concluída com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('Erro durante a migração:', error);
    process.exit(1);
  }
}

migrate();
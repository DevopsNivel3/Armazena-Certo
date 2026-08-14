const { Sequelize } = require('sequelize');
const sequelize = require('./config/db');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');

    const queryInterface = sequelize.getQueryInterface();

    // Adicionar coluna validade_obrigatoria
    try {
      await queryInterface.addColumn('Inventarios', 'validade_obrigatoria', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      });
      console.log('Coluna "validade_obrigatoria" adicionada com sucesso na tabela Inventarios.');
    } catch (err) {
      if (err.message.includes('Duplicate column name') || err.message.includes('already exists')) {
        console.log('Coluna "validade_obrigatoria" já existe. Ignorando.');
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
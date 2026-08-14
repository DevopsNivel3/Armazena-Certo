require('dotenv').config();
const sequelize = require('./config/db');

async function runMigration() {
  try {
    await sequelize.authenticate();
    console.log('Conectado ao banco de dados.');
    
    // Adicionar colunas se não existirem
    const [results] = await sequelize.query("SHOW COLUMNS FROM Produtos LIKE 'preco_custo'");
    if (results.length === 0) {
      await sequelize.query('ALTER TABLE Produtos ADD COLUMN preco_custo DECIMAL(10,2) DEFAULT 0');
      console.log('Coluna preco_custo adicionada.');
    } else {
      console.log('Coluna preco_custo já existe.');
    }

    const [results2] = await sequelize.query("SHOW COLUMNS FROM Produtos LIKE 'preco_venda'");
    if (results2.length === 0) {
      await sequelize.query('ALTER TABLE Produtos ADD COLUMN preco_venda DECIMAL(10,2) DEFAULT 0');
      console.log('Coluna preco_venda adicionada.');
    } else {
      console.log('Coluna preco_venda já existe.');
    }

    // Verificar se preco existe, se sim, migrar os dados e opcionalmente apagar (ou apenas ignorar)
    const [results3] = await sequelize.query("SHOW COLUMNS FROM Produtos LIKE 'preco'");
    if (results3.length > 0) {
      await sequelize.query('UPDATE Produtos SET preco_custo = preco WHERE preco > 0');
      console.log('Dados migrados de preco para preco_custo.');
      // Opcional: Remover coluna preco antiga
      // await sequelize.query('ALTER TABLE Produtos DROP COLUMN preco');
    }

    console.log('Migração concluída com sucesso!');
  } catch (error) {
    console.error('Erro na migração:', error);
  } finally {
    process.exit(0);
  }
}

runMigration();
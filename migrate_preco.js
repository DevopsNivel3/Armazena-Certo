require('dotenv').config({ path: './backend/.env' });
const sequelize = require('./backend/config/db');

async function migrate() {
  try {
    await sequelize.query(`ALTER TABLE Produtos ADD COLUMN preco DECIMAL(10,2) DEFAULT 0;`);
    console.log("Migration 'preco' added successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    process.exit(0);
  }
}

migrate();
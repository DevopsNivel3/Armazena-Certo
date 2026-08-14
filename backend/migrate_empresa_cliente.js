const { DataTypes } = require('sequelize');
const sequelize = require('./config/db');
const Inventario = require('./models/Inventario');

async function migrate() {
  try {
    const queryInterface = sequelize.getQueryInterface();

    const tableInfo = await queryInterface.describeTable('Inventarios');

    if (!tableInfo.empresa_cliente_nome) {
      await queryInterface.addColumn('Inventarios', 'empresa_cliente_nome', {
        type: DataTypes.STRING,
        allowNull: true
      });
      console.log('Coluna empresa_cliente_nome adicionada');
    }

    if (!tableInfo.empresa_cliente_cnpj) {
      await queryInterface.addColumn('Inventarios', 'empresa_cliente_cnpj', {
        type: DataTypes.STRING,
        allowNull: true
      });
      console.log('Coluna empresa_cliente_cnpj adicionada');
    }

    if (!tableInfo.empresa_cliente_filial) {
      await queryInterface.addColumn('Inventarios', 'empresa_cliente_filial', {
        type: DataTypes.STRING,
        allowNull: true
      });
      console.log('Coluna empresa_cliente_filial adicionada');
    }

    if (!tableInfo.empresa_cliente_endereco) {
      await queryInterface.addColumn('Inventarios', 'empresa_cliente_endereco', {
        type: DataTypes.STRING,
        allowNull: true
      });
      console.log('Coluna empresa_cliente_endereco adicionada');
    }

    console.log('Migração de campos da empresa cliente concluída.');
  } catch (error) {
    console.error('Erro na migração:', error);
  } finally {
    process.exit(0);
  }
}

migrate();
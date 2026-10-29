const { DataTypes, QueryTypes } = require('sequelize');
const sequelize = require('./config/db');
const { DEFAULT_USER_MODULES, normalizeUserModules } = require('./constants/userModules');

async function migrate() {
  try {
    await sequelize.authenticate();
    const queryInterface = sequelize.getQueryInterface();
    const table = await queryInterface.describeTable('Usuarios');
    const serializedDefault = JSON.stringify(DEFAULT_USER_MODULES);

    if (!table.modulos) {
      await queryInterface.addColumn('Usuarios', 'modulos', {
        type: DataTypes.TEXT,
        allowNull: true
      });
      console.log('Coluna modulos adicionada a tabela Usuarios.');
    }

    await sequelize.query(
      'UPDATE `Usuarios` SET `modulos` = :modules WHERE `modulos` IS NULL OR TRIM(`modulos`) = \'\'',
      { replacements: { modules: serializedDefault } }
    );

    // Agrupa os módulos antigos sem alterar vínculos, contagens ou históricos.
    // [] permanece sem acesso; apenas cadastros anteriores sem configuração recebem os dois.
    await sequelize.transaction(async (transaction) => {
      const usuarios = await sequelize.query('SELECT `id`, `modulos` FROM `Usuarios` FOR UPDATE', {
        type: QueryTypes.SELECT,
        transaction
      });
      for (const usuario of usuarios) {
        const modulos = JSON.stringify(normalizeUserModules(usuario.modulos));
        if (modulos !== usuario.modulos) {
          await sequelize.query('UPDATE `Usuarios` SET `modulos` = :modulos WHERE `id` = :id', {
            replacements: { id: usuario.id, modulos },
            transaction
          });
        }
      }
    });

    await queryInterface.changeColumn('Usuarios', 'modulos', {
      type: DataTypes.TEXT,
      allowNull: false
    });

    console.log('Módulos Inventário e Cross Docking configurados. Permissões antigas convertidas e listas vazias preservadas.');
  } catch (error) {
    console.error('Erro durante a migracao de modulos de usuario:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();

const sequelize = require('../config/db');
const Empresa = require('./Empresa');
const Usuario = require('./Usuario');
const Operador = require('./Operador');
const Inventario = require('./Inventario');
const Produto = require('./Produto');
const Localizacao = require('./Localizacao');
const EstoqueImportado = require('./EstoqueImportado');
const TarefaContagem = require('./TarefaContagem');
const Contagem = require('./Contagem');
const Divergencia = require('./Divergencia');
const LiberacaoProduto = require('./LiberacaoProduto');
const InventarioUsuario = require('./InventarioUsuario');
const LoteRecebimento = require('./LoteRecebimento');
const RecebimentoNota = require('./RecebimentoNota');
const CargaExpedicao = require('./CargaExpedicao');
const ExpedicaoNota = require('./ExpedicaoNota');
const CargaExpedicaoItem = require('./CargaExpedicaoItem');
const ExpedicaoItemConferencia = require('./ExpedicaoItemConferencia');

// Associações N:M (Inventário <-> Usuário)
Inventario.belongsToMany(Usuario, { through: InventarioUsuario, foreignKey: 'inventario_id' });
Usuario.belongsToMany(Inventario, { through: InventarioUsuario, foreignKey: 'usuario_id' });

const cleanupDuplicateUniqueIndexes = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const cleanupTargets = [
    { tableName: 'Empresas', columnName: 'cnpj' },
    { tableName: 'Usuarios', columnName: 'email' }
  ];

  for (const { tableName, columnName } of cleanupTargets) {
    const indexes = await queryInterface.showIndex(tableName);
    const duplicateUniqueIndexNames = [...new Set(
      indexes
        .filter((index) => {
          if (!index.unique || index.primary) {
            return false;
          }

          const fields = (index.fields || []).map((field) => field.attribute || field.name);
          return fields.length === 1 && fields[0] === columnName;
        })
        .map((index) => index.name)
    )];

    for (let i = 1; i < duplicateUniqueIndexNames.length; i += 1) {
      try {
        await queryInterface.removeIndex(tableName, duplicateUniqueIndexNames[i]);
        console.log(`Removed duplicate unique index ${duplicateUniqueIndexNames[i]} from ${tableName}.${columnName}`);
      } catch (error) {
        if (error?.original?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
          throw error;
        }
      }
    }
  }
};

const syncDatabase = async () => {
  try {
    const shouldAlterSchema = process.env.DB_AUTO_ALTER === 'true';

    await cleanupDuplicateUniqueIndexes();
    await sequelize.sync(shouldAlterSchema ? { alter: true } : {});

    console.log('Database synced successfully');
  } catch (error) {
    console.error('Error syncing database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  syncDatabase,
  Empresa,
  Usuario,
  Operador,
  Inventario,
  Produto,
  Localizacao,
  EstoqueImportado,
  TarefaContagem,
  Contagem,
  Divergencia,
  LiberacaoProduto,
  InventarioUsuario,
  LoteRecebimento,
  RecebimentoNota,
  CargaExpedicao,
  ExpedicaoNota,
  CargaExpedicaoItem,
  ExpedicaoItemConferencia
};

const { EstoqueImportado, Produto, Inventario } = require('./models');

async function run() {
  try {
    const { count, rows } = await EstoqueImportado.findAndCountAll({
      where: { inventario_id: 2 },
      include: [{
        model: Produto,
        where: {},
        attributes: ['sku', 'nome', 'categoria', 'unidade_medida', 'codigo_barras']
      }],
      order: [[Produto, 'nome', 'ASC']],
      limit: 1,
      offset: 0
    });
    console.log("JSON:", JSON.stringify(rows[0], null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
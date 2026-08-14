require('dotenv').config();
const { sequelize, CargaExpedicao, CargaExpedicaoItem, ExpedicaoNota, RecebimentoNota } = require('./models');
const { parseNFeItems } = require('./services/nfeParser');

const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

async function migrate() {
  await CargaExpedicaoItem.sync();
  const cargas = await CargaExpedicao.findAll({
    include: [{ model: ExpedicaoNota, as: 'notas', include: [{ model: RecebimentoNota, as: 'notaRecebimento' }] }]
  });

  for (const carga of cargas) {
    const existing = await CargaExpedicaoItem.count({ where: { carga_expedicao_id: carga.id } });
    if (existing) continue;

    const aggregated = new Map();
    for (const vinculo of carga.notas || []) {
      if (!vinculo.notaRecebimento?.xml_original || !['apta', 'embarcada', 'divergencia_embarque'].includes(vinculo.status)) continue;
      for (const item of parseNFeItems(vinculo.notaRecebimento.xml_original)) {
        const key = [item.codigo_produto, item.codigo_barras || '', item.unidade_medida].join('::');
        const current = aggregated.get(key);
        if (current) current.quantidade_prevista = roundQuantity(current.quantidade_prevista + item.quantidade);
        else aggregated.set(key, { ...item, quantidade_prevista: roundQuantity(item.quantidade) });
      }
    }

    if (aggregated.size) {
      await CargaExpedicaoItem.bulkCreate([...aggregated.values()].map((item) => ({
        carga_expedicao_id: carga.id,
        codigo_produto: item.codigo_produto,
        codigo_barras: item.codigo_barras,
        descricao: item.descricao,
        unidade_medida: item.unidade_medida,
        quantidade_prevista: item.quantidade_prevista,
        quantidade_conferida: 0,
        status: 'pendente'
      })));
    }
  }

  console.log('Migração de itens da expedição concluída.');
}

migrate().then(() => sequelize.close()).catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});

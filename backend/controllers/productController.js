const { Produto, Empresa } = require('../models');

const normalizeFactorValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

exports.createProduct = async (req, res) => {
  try {
    const { sku, nome, categoria, unidade_medida, codigo_barras } = req.body;
    const { empresa_id } = req.user;

    const produto = await Produto.create({
      sku,
      nome,
      categoria,
      unidade_medida,
      codigo_barras,
      empresa_id
    });

    res.status(201).json(produto);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { empresa_id } = req.user;
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const where = { empresa_id };
    // TODO: Add search logic (Op.like) if needed

    const { count, rows } = await Produto.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['nome', 'ASC']]
    });

    const products = rows.map(p => {
      const json = p.toJSON();
      json.fator_conversao = normalizeFactorValue(json.fator_conversao);
      return json;
    });

    res.json({
      total: count,
      products,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const { empresa_id } = req.user;

    const produto = await Produto.findOne({
      where: { id, empresa_id }
    });

    if (!produto) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const json = produto.toJSON();
    json.fator_conversao = normalizeFactorValue(json.fator_conversao);

    res.json(json);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

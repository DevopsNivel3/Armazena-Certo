const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');
const { Produto, EstoqueImportado, Localizacao } = require('../models');

const parseExcelNumber = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val).trim();
  str = str.replace(/[R$\s]/g, '');
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
          str = str.replace(/\./g, '').replace(',', '.');
      } else {
          str = str.replace(/,/g, '');
      }
  } else if (lastComma > -1) {
      str = str.replace(',', '.');
  }
  return parseFloat(str) || 0;
};

const hasMappedColumn = (value) => typeof value === 'string' && value.trim() !== '';

const getOptionalMappedNumber = (row, mappedColumn) => {
  if (!hasMappedColumn(mappedColumn)) {
    return {
      isMapped: false,
      hasValue: false,
      value: null
    };
  }

  const rawValue = row[mappedColumn];
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return {
      isMapped: true,
      hasValue: false,
      value: null
    };
  }

  return {
    isMapped: true,
    hasValue: true,
    value: parseExcelNumber(rawValue)
  };
};

exports.uploadFile = (req, res) => {
  const filePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhuma planilha foi enviada.' });
    }

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('A planilha não possui nenhuma aba.');
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) {
      throw new Error('A primeira aba da planilha está vazia.');
    }
    
    // Get headers
    const headers = [];
    const range = xlsx.utils.decode_range(sheet['!ref']);
    const C = range.s.c; // Start Column
    const R = range.s.r; // Start Row
    
    for (let c = C; c <= range.e.c; ++c) {
      const cell = sheet[xlsx.utils.encode_cell({ r: R, c: c })];
      let hdr = 'UNKNOWN ' + c;
      if (cell && cell.t) hdr = xlsx.utils.format_cell(cell);
      headers.push(hdr);
    }

    res.json({
      message: 'File uploaded successfully',
      filename: req.file.filename,
      headers: headers
    });
  } catch (error) {
    console.error('Erro ao interpretar a planilha:', error);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(422).json({
      message: error.message || 'Não foi possível interpretar a planilha.'
    });
  }
};

exports.processImport = async (req, res) => {
  try {
    const { filename, mapping, inventario_id } = req.body;
    const { empresa_id } = req.user;
    const filePath = path.join(__dirname, '..', 'uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // 1. Load all existing products for the company into a Map
    const existingProducts = await Produto.findAll({ where: { empresa_id } });
    const productMap = new Map();
    existingProducts.forEach(p => productMap.set(p.sku, p));

    // 2. Load all existing locations for the company into a Map
    const existingLocations = await Localizacao.findAll({ where: { empresa_id } });
    const locationMap = new Map();
    existingLocations.forEach(l => locationMap.set(l.corredor, l.id));

    const hasFactorMapping = hasMappedColumn(mapping.fator_conversao);
    const newProducts = [];
    const productsToUpdate = [];
    const newLocations = [];
    const locationSet = new Set(); // to avoid duplicate new locations

    const estoqueImportadoRecords = [];

    // First pass: identify new products and locations
    for (const row of data) {
      const skuStr = row[mapping.sku];
      if (skuStr === undefined || skuStr === null) continue;
      const sku = String(skuStr).trim();
      if (!sku) continue;

      const nome = row[mapping.nome] || 'Produto sem nome';
      const categoria = row[mapping.categoria] ? String(row[mapping.categoria]).trim() : null;
      const fatorConversaoInfo = getOptionalMappedNumber(row, mapping.fator_conversao);
      const fator_conversao = fatorConversaoInfo.hasValue ? fatorConversaoInfo.value : null;
        const unidade_medida = mapping.unidade_medida && row[mapping.unidade_medida] ? String(row[mapping.unidade_medida]).trim().toUpperCase() : 'UN';
        const codigo_barras = row[mapping.codigo_barras];
      const codigo_referencia = row[mapping.codigo_referencia];
      const localizacaoStr = row[mapping.localizacao] ? String(row[mapping.localizacao]).trim() : null;
      
      const rawPrecoCusto = mapping.preco_custo ? row[mapping.preco_custo] : undefined;
      const preco_custo = (rawPrecoCusto !== undefined && rawPrecoCusto !== '') ? parseExcelNumber(rawPrecoCusto) : undefined;

      const rawPrecoVenda = mapping.preco_venda ? row[mapping.preco_venda] : undefined;
      const preco_venda = (rawPrecoVenda !== undefined && rawPrecoVenda !== '') ? parseExcelNumber(rawPrecoVenda) : undefined;

      let produto = productMap.get(sku);
      
      if (!produto) {
        // We might have already added it to newProducts
        const existingNewProduct = newProducts.find(p => p.sku === sku);
        if (!existingNewProduct) {
          newProducts.push({
            sku,
            nome,
            categoria,
            empresa_id,
            fator_conversao,
            unidade_medida,
            codigo_barras,
            codigo_referencia,
            preco_custo,
            preco_venda
          });
        }
      } else {
         // Update logic
         let updated = false;
         if (nome && nome !== 'Produto sem nome' && produto.nome !== nome) { produto.nome = nome; updated = true; }
         if (categoria && produto.categoria !== categoria) { produto.categoria = categoria; updated = true; }
         if (
           fatorConversaoInfo.hasValue
           && Number(produto.fator_conversao) !== fator_conversao
         ) {
           produto.fator_conversao = fator_conversao;
           updated = true;
         }
         if (unidade_medida && produto.unidade_medida !== unidade_medida) { produto.unidade_medida = unidade_medida; updated = true; }
         if (codigo_barras && produto.codigo_barras !== codigo_barras) { produto.codigo_barras = codigo_barras; updated = true; }
         if (codigo_referencia && produto.codigo_referencia !== codigo_referencia) { produto.codigo_referencia = codigo_referencia; updated = true; }
         if (preco_custo !== undefined && preco_custo !== null && Number(produto.preco_custo) !== preco_custo) { produto.preco_custo = preco_custo; updated = true; }
         if (preco_venda !== undefined && preco_venda !== null && Number(produto.preco_venda) !== preco_venda) { produto.preco_venda = preco_venda; updated = true; }
         
         if (updated) {
            productsToUpdate.push({
               id: produto.id,
               sku: produto.sku,
               empresa_id: produto.empresa_id,
               nome: produto.nome,
               categoria: produto.categoria,
               fator_conversao: produto.fator_conversao,
               unidade_medida: produto.unidade_medida,
               codigo_barras: produto.codigo_barras,
               codigo_referencia: produto.codigo_referencia,
               preco_custo: produto.preco_custo,
               preco_venda: produto.preco_venda
            });
         }
      }

      if (localizacaoStr) {
        if (!locationMap.has(localizacaoStr) && !locationSet.has(localizacaoStr)) {
          locationSet.add(localizacaoStr);
          newLocations.push({
            empresa_id,
            corredor: localizacaoStr
          });
        }
      }
    }

    // Bulk create products
    if (newProducts.length > 0) {
      const createdProducts = await Produto.bulkCreate(newProducts, { returning: true });
      createdProducts.forEach(p => productMap.set(p.sku, p));
    }

    // Bulk update products
    if (productsToUpdate.length > 0) {
        const updateOnDuplicate = ['nome', 'categoria', 'unidade_medida', 'codigo_barras', 'codigo_referencia', 'preco_custo', 'preco_venda'];
        if (hasFactorMapping) {
          updateOnDuplicate.push('fator_conversao');
        }
        await Produto.bulkCreate(productsToUpdate, {
          updateOnDuplicate
        });
      }

    // Bulk create locations
    if (newLocations.length > 0) {
      const createdLocations = await Localizacao.bulkCreate(newLocations, { returning: true });
      createdLocations.forEach(l => locationMap.set(l.corredor, l.id));
    }

    // Load existing EstoqueImportado records for this inventory
    const existingEstoque = await EstoqueImportado.findAll({ where: { inventario_id } });
    const estoqueMap = new Map();
    existingEstoque.forEach(e => estoqueMap.set(e.produto_id, e));

    const newEstoqueRecords = [];
    const updateEstoqueRecords = [];

    // Second pass: create EstoqueImportado records
    for (const row of data) {
      const skuStr = row[mapping.sku];
      if (skuStr === undefined || skuStr === null) continue;
      const sku = String(skuStr).trim();
      if (!sku) continue;

      const saldo_erp = parseExcelNumber(row[mapping.saldo_erp]);
      const fatorConversaoInfo = getOptionalMappedNumber(row, mapping.fator_conversao);
      const fator_conversao = fatorConversaoInfo.hasValue ? fatorConversaoInfo.value : null;
      const localizacaoStr = row[mapping.localizacao] ? String(row[mapping.localizacao]).trim() : null;
      const lote = row[mapping.lote];
      const validade = row[mapping.validade];

      const produto = productMap.get(sku);
      if (!produto) continue; // Should not happen

      let localizacao_id = null;
      if (localizacaoStr) {
        localizacao_id = locationMap.get(localizacaoStr);
      }

      let parsedValidade = null;
      if (validade) {
        if (typeof validade === 'number') {
          // Excel serial date to JS Date
          const excelEpoch = new Date(1899, 11, 30);
          parsedValidade = new Date(excelEpoch.getTime() + validade * 86400000);
        } else {
          // Assume string format
          parsedValidade = new Date(validade);
        }
      }

      const existingRecord = estoqueMap.get(produto.id);

      if (existingRecord) {
        // If it exists, check if it needs updating
        const updatePayload = {
          id: existingRecord.id,
          inventario_id,
          produto_id: produto.id,
          localizacao_id,
          lote,
          validade: parsedValidade,
          saldo_erp
        };
        if (fatorConversaoInfo.hasValue) {
          updatePayload.fator_conversao = fator_conversao;
        }
        updateEstoqueRecords.push(updatePayload);
      } else {
        newEstoqueRecords.push({
          inventario_id,
          produto_id: produto.id,
          localizacao_id,
          lote,
          validade: parsedValidade,
          saldo_erp,
          fator_conversao
        });
      }
    }

    const chunkSize = 1000;
    
    // Bulk create new EstoqueImportado
    for (let i = 0; i < newEstoqueRecords.length; i += chunkSize) {
        const chunk = newEstoqueRecords.slice(i, i + chunkSize);
        await EstoqueImportado.bulkCreate(chunk);
    }

    // Bulk update existing EstoqueImportado
    for (let i = 0; i < updateEstoqueRecords.length; i += chunkSize) {
        const chunk = updateEstoqueRecords.slice(i, i + chunkSize);
        const updateOnDuplicate = ['localizacao_id', 'lote', 'validade', 'saldo_erp'];
        if (hasFactorMapping) {
            updateOnDuplicate.push('fator_conversao');
        }
        await EstoqueImportado.bulkCreate(chunk, {
            updateOnDuplicate
        });
    }

    // Cleanup file
    fs.unlinkSync(filePath);

    res.json({
      message: 'Import completed successfully',
      importedCount: newEstoqueRecords.length + updateEstoqueRecords.length,
      productsCreated: newProducts.length,
      productsUpdated: productsToUpdate.length,
      estoqueUpdated: updateEstoqueRecords.length,
      estoqueCreated: newEstoqueRecords.length
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error processing import' });
  }
};

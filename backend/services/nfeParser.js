const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  trimValues: true,
  // Chaves de acesso da NFe possuem 44 dígitos. Mantê-las como texto evita
  // conversão para notação científica e perda de dígitos durante o parser.
  parseTagValue: false,
  parseAttributeValue: false
});

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumber = (value) => {
  const normalized = String(value ?? '').replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || null;

function findNFeNode(root) {
  if (!root || typeof root !== 'object') return null;
  if (root.NFe) return root.NFe;
  if (root.nfeProc?.NFe) return root.nfeProc.NFe;

  for (const value of Object.values(root)) {
    if (value && typeof value === 'object') {
      const found = findNFeNode(value);
      if (found) return found;
    }
  }

  return null;
}

function findProtocolKey(root) {
  return firstValue(
    root?.nfeProc?.protNFe?.infProt?.chNFe,
    root?.protNFe?.infProt?.chNFe
  );
}

function extractAccessKey(root, infNFe) {
  const fromProtocol = findProtocolKey(root);
  if (fromProtocol) return onlyDigits(fromProtocol);

  const id = infNFe?.Id || infNFe?.id || '';
  const fromId = String(id).replace(/^NFe/i, '');
  return onlyDigits(fromId);
}

function parseNFeXml(xmlContent, arquivoNome = null) {
  const parsed = parser.parse(xmlContent);
  const nfe = findNFeNode(parsed);
  const infNFe = nfe?.infNFe;

  if (!infNFe) {
    throw new Error('XML nao possui estrutura NFe/infNFe valida.');
  }

  const transp = infNFe.transp || {};
  const volumes = asArray(transp.vol);
  const volumeSummary = volumes.reduce((acc, vol) => {
    acc.qtd += toNumber(vol.qVol);
    acc.especies.add(vol.esp);
    acc.marcas.add(vol.marca);
    acc.numeracoes.add(vol.nVol);
    acc.pesoLiquido += toNumber(vol.pesoL);
    acc.pesoBruto += toNumber(vol.pesoB);
    return acc;
  }, {
    qtd: 0,
    especies: new Set(),
    marcas: new Set(),
    numeracoes: new Set(),
    pesoLiquido: 0,
    pesoBruto: 0
  });

  const emit = infNFe.emit || {};
  const dest = infNFe.dest || {};
  const chaveAcesso = extractAccessKey(parsed, infNFe);
  if (chaveAcesso.length !== 44) {
    throw new Error('Chave de acesso da NF-e deve possuir 44 digitos.');
  }

  return {
    arquivo_nome: arquivoNome,
    chave_acesso: chaveAcesso,
    numero_nfe: firstValue(infNFe.ide?.nNF),
    serie: firstValue(infNFe.ide?.serie),
    emitente_nome: firstValue(emit.xNome),
    emitente_cnpj: onlyDigits(firstValue(emit.CNPJ, emit.CPF)),
    destinatario_nome: firstValue(dest.xNome),
    destinatario_cnpj: onlyDigits(firstValue(dest.CNPJ, dest.CPF)),
    qtd_volumes_xml: volumeSummary.qtd,
    especie: Array.from(volumeSummary.especies).filter(Boolean).join(', ') || null,
    marca: Array.from(volumeSummary.marcas).filter(Boolean).join(', ') || null,
    numeracao: Array.from(volumeSummary.numeracoes).filter(Boolean).join(', ') || null,
    peso_liquido: volumeSummary.pesoLiquido || null,
    peso_bruto: volumeSummary.pesoBruto || null,
    xml_original: xmlContent
  };
}

function parseNFeItems(xmlContent) {
  const parsed = parser.parse(xmlContent);
  const nfe = findNFeNode(parsed);
  const infNFe = nfe?.infNFe;

  if (!infNFe) {
    throw new Error('XML nao possui estrutura NFe/infNFe valida.');
  }

  return asArray(infNFe.det).map((det, index) => {
    const produto = det?.prod || {};
    const rawBarcode = firstValue(produto.cEAN, produto.cEANTrib);
    const barcode = rawBarcode && !/^sem\s*gtin$/i.test(String(rawBarcode).trim())
      ? String(rawBarcode).trim()
      : null;

    return {
      sequencia: Number.parseInt(det?.nItem, 10) || index + 1,
      codigo_produto: String(firstValue(produto.cProd) || '').trim(),
      codigo_barras: barcode,
      descricao: String(firstValue(produto.xProd) || '').trim(),
      unidade_medida: String(firstValue(produto.uCom, produto.uTrib) || '').trim().toUpperCase(),
      quantidade: toNumber(firstValue(produto.qCom, produto.qTrib))
    };
  }).filter((item) => item.codigo_produto && item.quantidade > 0);
}

module.exports = {
  parseNFeXml,
  parseNFeItems
};

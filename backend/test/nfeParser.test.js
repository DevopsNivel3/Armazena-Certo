const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNFeItems, parseNFeXml } = require('../services/nfeParser');

const ACCESS_KEY = '12345678901234567890123456789012345678901234';

function volumeXml(volumes = '') {
  return `<nfeProc><NFe><infNFe Id="NFe${ACCESS_KEY}"><ide><nNF>321</nNF><serie>1</serie></ide><emit><CNPJ>12345678000190</CNPJ><xNome>Origem &amp; Cia</xNome></emit><dest><CPF>12345678901</CPF><xNome>Cliente</xNome></dest><transp>${volumes}</transp></infNFe></NFe></nfeProc>`;
}

test('extrai mercadorias, quantidades e unidades comerciais da NF-e', () => {
  const xml = `<nfeProc><NFe><infNFe Id="NFe${'1'.repeat(44)}"><det nItem="1"><prod><cProd>P-10</cProd><cEAN>7891234567890</cEAN><xProd>Produto teste</xProd><uCom>CX</uCom><qCom>12.000</qCom></prod></det><det nItem="2"><prod><cProd>P-20</cProd><cEAN>SEM GTIN</cEAN><xProd>Produto por peso</xProd><uCom>KG</uCom><qCom>2.750</qCom></prod></det></infNFe></NFe></nfeProc>`;

  const items = parseNFeItems(xml);

  assert.deepEqual(items, [
    { sequencia: 1, codigo_produto: 'P-10', codigo_barras: '7891234567890', descricao: 'Produto teste', unidade_medida: 'CX', quantidade: 12 },
    { sequencia: 2, codigo_produto: 'P-20', codigo_barras: null, descricao: 'Produto por peso', unidade_medida: 'KG', quantidade: 2.75 }
  ]);
});

test('preserva a chave de 44 digitos e soma multiplas tags de volume', () => {
  const note = parseNFeXml(volumeXml('<vol><qVol>2</qVol><esp>CAIXA</esp><pesoB>5.5</pesoB></vol><vol><qVol>3</qVol><esp>FARDO</esp><pesoB>7.25</pesoB></vol>'), 'nfe.xml');
  assert.equal(note.chave_acesso, ACCESS_KEY);
  assert.equal(note.qtd_volumes_xml, 5);
  assert.equal(note.peso_bruto, 12.75);
  assert.equal(note.especie, 'CAIXA, FARDO');
  assert.equal(note.emitente_nome, 'Origem & Cia');
});

test('aceita NF-e sem tag de volume com quantidade zero', () => {
  const note = parseNFeXml(volumeXml());
  assert.equal(note.qtd_volumes_xml, 0);
  assert.equal(note.peso_bruto, null);
});

test('rejeita XML sem estrutura NF-e valida', () => {
  assert.throws(() => parseNFeXml('<documento><numero>1</numero></documento>'), /estrutura NFe\/infNFe valida/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { XMLParser } = require('fast-xml-parser');
const { buildInboundExportXml } = require('../services/integracaoXmlService');

const KEY_OK = '12345678901234567890123456789012345678901234';
const KEY_BAD = '98765432109876543210987654321098765432109876';

test('gera pacote XML somente com NF-es OK e preserva o XML original em base64', () => {
  const original = `<nfeProc><NFe><infNFe Id="NFe${KEY_OK}" /></NFe></nfeProc>`;
  const xml = buildInboundExportXml({
    lote: { id: 7, nome: 'Doca & Norte', doca: 'D1', origem: 'CD <01>' },
    exportacaoCodigo: 'AC-7-fixed',
    generatedAt: new Date('2026-08-12T12:00:00.000Z'),
    notas: [
      { status: 'ok', chave_acesso: KEY_OK, numero_nfe: '10', qtd_volumes_xml: 3, arquivo_nome: 'ok.xml', xml_original: original },
      { status: 'falta', chave_acesso: KEY_BAD, numero_nfe: '11', qtd_volumes_xml: 2, arquivo_nome: 'bad.xml', xml_original: '<xml />' }
    ]
  });
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false }).parse(xml);
  const pacote = parsed.pacoteRoteirizacao;
  assert.equal(pacote.identificacao.codigoExportacao, 'AC-7-fixed');
  assert.equal(pacote.identificacao.quantidadeNotas, '1');
  assert.equal(String(pacote.notasFiscais.nfe.chaveAcesso), KEY_OK);
  assert.equal(Buffer.from(pacote.notasFiscais.nfe.arquivo['#text'], 'base64').toString('utf8'), original);
  assert.doesNotMatch(xml, new RegExp(KEY_BAD));
});

test('rejeita exportacao sem NF-e aprovada', () => {
  assert.throws(() => buildInboundExportXml({ lote: { id: 1 }, notas: [], exportacaoCodigo: 'x' }), /nao possui NF-es OK/);
});

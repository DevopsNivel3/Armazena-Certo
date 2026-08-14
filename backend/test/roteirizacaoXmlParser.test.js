const test = require('node:test');
const assert = require('node:assert/strict');
const { extractRouteXml } = require('../services/roteirizacaoXmlParser');

const ACCESS_KEY = '12345678901234567890123456789012345678901234';

test('extrai os dados do XML estruturado de roteirização', () => {
  const xml = `
    <roteirizacaoCarga>
      <transportadora><razaoSocial>Transportes Teste</razaoSocial></transportadora>
      <rota>
        <codigoRota>R-01</codigoRota>
        <descricao>Rota Centro</descricao>
        <quantidadeTotalVolumes>3</quantidadeTotalVolumes>
      </rota>
      <veiculo>
        <placa>ABC1D23</placa>
        <motorista><nome>João</nome></motorista>
      </veiculo>
      <entregas>
        <entrega sequencia="1">
          <notaFiscal>
            <numero>100</numero>
            <chaveAcesso>${ACCESS_KEY}</chaveAcesso>
            <quantidadeVolumes>3</quantidadeVolumes>
          </notaFiscal>
        </entrega>
      </entregas>
    </roteirizacaoCarga>`;

  const result = extractRouteXml(xml);

  assert.equal(result.placa_veiculo, 'ABC1D23');
  assert.equal(result.motorista, 'João');
  assert.equal(result.rota, 'Rota Centro');
  assert.deepEqual(result.chaves_acesso, [ACCESS_KEY]);
  assert.equal(result.detalhes.rota.codigo, 'R-01');
  assert.equal(result.detalhes.entregas[0].sequencia, '1');
  assert.equal(result.detalhes.entregas[0].nota_fiscal.quantidade_volumes, '3');
});

test('aceita formato genérico e elimina chaves repetidas', () => {
  const xml = `<carga><placa>XYZ9Z99</placa><route>Norte</route><chave>${ACCESS_KEY}</chave><outra>${ACCESS_KEY}</outra></carga>`;

  const result = extractRouteXml(xml);

  assert.equal(result.placa_veiculo, 'XYZ9Z99');
  assert.equal(result.rota, 'Norte');
  assert.deepEqual(result.chaves_acesso, [ACCESS_KEY]);
});

test('rejeita XML sem chave de acesso', () => {
  assert.throws(
    () => extractRouteXml('<carga><placa>ABC1D23</placa></carga>'),
    /Nenhuma chave de acesso de 44 dígitos/
  );
});

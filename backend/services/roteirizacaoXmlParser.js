const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false
});

const fieldNames = {
  placa_veiculo: ['placa', 'placaveiculo', 'placa_veiculo', 'plate'],
  motorista: ['motorista', 'xmotorista', 'nomemotorista', 'motoristename'],
  rota: ['rota', 'xrota', 'nomerota', 'codigo_rota', 'codrota', 'route']
};

const normalizeName = (name) => String(name || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
const asArray = (value) => !value ? [] : (Array.isArray(value) ? value : [value]);

function addAccessKeys(value, keys) {
  const text = String(value || '');
  (text.match(/\d{44}/g) || []).forEach((key) => keys.add(key));
  const digits = onlyDigits(text);
  if (digits.length === 44) keys.add(digits);
}

function extractRouteXml(xmlContent) {
  const parsed = parser.parse(xmlContent);
  const result = { placa_veiculo: null, motorista: null, rota: null, chaves_acesso: [] };
  const keys = new Set();

  function visit(value, fieldName = '') {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) return value.forEach((item) => visit(item, fieldName));
    if (typeof value === 'object') return Object.entries(value).forEach(([key, item]) => visit(item, key));

    const text = String(value).trim();
    const name = normalizeName(fieldName);
    addAccessKeys(text, keys);
    Object.entries(fieldNames).forEach(([target, names]) => {
      if (!result[target] && names.includes(name) && text) result[target] = text;
    });
  }

  visit(parsed);
  addAccessKeys(xmlContent, keys);

  // Formato estruturado de carga roteirizada atualmente adotado no projeto.
  // O fallback genérico acima continua aceitando XMLs de outros roteirizadores.
  const carga = parsed?.roteirizacaoCarga;
  if (carga) {
    const rota = carga.rota || {};
    const veiculo = carga.veiculo || {};
    const motorista = veiculo.motorista || {};
    result.placa_veiculo = veiculo.placa || result.placa_veiculo;
    result.motorista = motorista.nome || result.motorista;
    result.rota = rota.descricao || rota.codigoRota || result.rota;
    result.detalhes = {
      identificacao: carga.identificacao || {},
      transportadora: carga.transportadora || {},
      rota: {
        codigo: rota.codigoRota || null,
        descricao: rota.descricao || null,
        data_saida: rota.dataSaida || null,
        hora_prevista_saida: rota.horaPrevistaSaida || null,
        distancia_total_km: rota.distanciaTotalKm || null,
        tempo_estimado_minutos: rota.tempoEstimadoMinutos || null,
        peso_total_kg: rota.pesoTotalKg || null,
        quantidade_total_volumes: rota.quantidadeTotalVolumes || null,
        valor_total_carga: rota.valorTotalCarga || null
      },
      veiculo: {
        placa: veiculo.placa || null,
        tipo: veiculo.tipoVeiculo || null,
        capacidade_peso_kg: veiculo.capacidadePesoKg || null,
        capacidade_volumes: veiculo.capacidadeVolumes || null,
        motorista: {
          codigo: motorista.codigo || null,
          nome: motorista.nome || null,
          cpf: motorista.cpf || null,
          telefone: motorista.telefone || null
        }
      },
      entregas: asArray(carga.entregas?.entrega).map((entrega) => ({
        sequencia: entrega.sequencia || entrega['@_sequencia'] || null,
        codigo_entrega: entrega.codigoEntrega || null,
        pedido: entrega.pedido || null,
        nota_fiscal: {
          numero: entrega.notaFiscal?.numero || null,
          serie: entrega.notaFiscal?.serie || null,
          chave_acesso: onlyDigits(entrega.notaFiscal?.chaveAcesso),
          data_emissao: entrega.notaFiscal?.dataEmissao || null,
          valor: entrega.notaFiscal?.valorNota || null,
          peso_bruto_kg: entrega.notaFiscal?.pesoBrutoKg || null,
          quantidade_volumes: entrega.notaFiscal?.quantidadeVolumes || null
        },
        destinatario: entrega.destinatario || {},
        janela_entrega: entrega.janelaEntrega || {},
        cubagem: entrega.cubagem || {},
        observacoes: entrega.observacoes || null,
        produtos: asArray(entrega.produtos?.produto).map((produto) => ({
          sequencia: produto.sequencia || produto['@_sequencia'] || null,
          codigo: produto.codigoProduto || null,
          codigo_barras: produto.codigoBarras || null,
          descricao: produto.descricao || null,
          unidade: produto.unidade || null,
          quantidade: produto.quantidade || null,
          quantidade_volumes: produto.quantidadeVolumes || null,
          peso_liquido_kg: produto.pesoLiquidoKg || null,
          peso_bruto_kg: produto.pesoBrutoKg || null,
          valor_unitario: produto.valorUnitario || null,
          valor_total: produto.valorTotal || null,
          lote: produto.lote || null,
          validade: produto.validade || null
        }))
      }))
    };
    result.detalhes.entregas.forEach((entrega) => addAccessKeys(entrega.nota_fiscal.chave_acesso, keys));
  }
  result.chaves_acesso = [...keys];
  if (!result.chaves_acesso.length) throw new Error('Nenhuma chave de acesso de 44 dígitos foi encontrada no XML de roteirização.');
  return result;
}

module.exports = { extractRouteXml };

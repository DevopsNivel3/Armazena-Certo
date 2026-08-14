const { sequelize, CargaExpedicao, ExpedicaoNota, CargaExpedicaoItem, ExpedicaoItemConferencia, RecebimentoNota, LoteRecebimento, Usuario } = require('../models');
const { Op } = require('sequelize');
const { extractRouteXml } = require('../services/roteirizacaoXmlParser');
const { parseNFeItems } = require('../services/nfeParser');
const { getIO, getOutboundUserConnectionStatus } = require('../socket');

const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const DISCRETE_UNITS = new Set(['UN', 'UND', 'UNID', 'PC', 'PÇ', 'CX', 'CAIXA', 'FD', 'FARDO', 'PCT', 'PACOTE', 'KIT']);
const resolveItemStatus = (quantity, expected) => quantity > expected
  ? 'sobra'
  : (Math.abs(quantity - expected) < 0.001 ? 'conferido' : (quantity > 0 ? 'parcial' : 'pendente'));
const isOutboundManager = (user) => ['admin', 'gerente'].includes(user?.nivel_acesso);

function cargoAccessWhere({ id, empresaId, user }) {
  const where = { empresa_id: empresaId };
  if (id !== undefined) where.id = id;
  if (!isOutboundManager(user)) {
    where[Op.or] = [
      { conferente_usuario_id: user.id },
      { recontagem_usuario_id: user.id }
    ];
  }
  return where;
}

function conferenceExecutionWhere({ id, empresaId, user }) {
  return { id, empresa_id: empresaId, conferente_usuario_id: user.id };
}

function emitOutboundUpdate({ empresaId, usuarioIds = [], event }) {
  try {
    const io = getIO();
    io.to(`empresa_${empresaId}_outbound_managers`).emit('outboundUpdate', event);
    [...new Set(usuarioIds.filter(Boolean).map(String))].forEach((usuarioId) => {
      io.to(`usuario_${usuarioId}`).emit('outboundUpdate', event);
    });
  } catch (error) {
    console.warn('Não foi possível emitir atualização Outbound:', error.message);
  }
}

function serializeCarga(carga) {
  const json = carga.toJSON ? carga.toJSON() : carga;
  const notas = json.notas || [];
  const itens = json.itens || [];
  const divergencias = notas.filter((nota) => ['nao_localizada', 'inbound_divergente', 'divergencia_embarque'].includes(nota.status));
  const prontaParaLiberacao = itens.length > 0 && itens.every((item) => item.status === 'conferido');
  const divergenciasItens = itens.filter((item) => item.status !== 'conferido');
  const recontagemFinalizada = json.recontagem_status === 'finalizada';
  let roteirizacao = null;
  try {
    roteirizacao = json.xml_original ? extractRouteXml(json.xml_original) : null;
  } catch (_) {
    // Cargas antigas sem XML válido continuam consultáveis.
  }
  return {
    ...json,
    placa_veiculo: json.placa_veiculo || roteirizacao?.placa_veiculo || null,
    motorista: json.motorista || roteirizacao?.motorista || null,
    rota: json.rota || roteirizacao?.rota || null,
    roteirizacao: roteirizacao?.detalhes || null,
    resumo: {
      total_notas: notas.length,
      notas_aptas: notas.filter((nota) => nota.status === 'apta').length,
      notas_embarcadas: notas.filter((nota) => nota.status === 'embarcada').length,
      notas_pendentes_embarque: notas.filter((nota) => nota.status === 'apta').length,
      divergencias: divergencias.length + itens.filter((item) => item.status === 'sobra').length,
      total_itens: itens.length,
      itens_conferidos: itens.filter((item) => item.status === 'conferido').length,
      itens_pendentes: itens.filter((item) => ['pendente', 'parcial'].includes(item.status)).length,
      itens_com_sobra: itens.filter((item) => item.status === 'sobra').length,
      quantidade_prevista: roundQuantity(itens.reduce((total, item) => total + Number(item.quantidade_prevista || 0), 0)),
      quantidade_conferida: roundQuantity(itens.reduce((total, item) => total + Number(item.quantidade_conferida || 0), 0)),
      pronta_para_liberacao: prontaParaLiberacao || recontagemFinalizada,
      conferencia_finalizada: Boolean(json.conferencia_finalizada_em),
      divergencias_documentais: divergencias.length,
      requer_justificativa_liberacao: divergencias.length > 0 || divergenciasItens.length > 0,
      divergencias_itens: divergenciasItens.length,
      itens_recontagem: itens.filter((item) => item.requer_recontagem).length,
      itens_recontados: itens.filter((item) => item.requer_recontagem && item.recontado_em).length
    }
  };
}

exports.importarRoteirizacao = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem importar cargas.' });
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'Envie o XML de roteirização retornado pelo roteirizador.' });

    const xmlOriginal = file.buffer.toString('utf8');
    const roteirizacao = extractRouteXml(xmlOriginal);
    const criada = await sequelize.transaction(async (transaction) => {
      const recebimentos = await RecebimentoNota.findAll({
        include: [{ model: LoteRecebimento, where: { empresa_id: req.user.empresa_id }, attributes: ['id', 'status', 'exportacao_codigo'] }],
        transaction
      });
      const notasPorChave = new Map(recebimentos.map((nota) => [nota.chave_acesso, nota]));
      const recebimentoIds = roteirizacao.chaves_acesso.map((chave) => notasPorChave.get(chave)?.id).filter(Boolean);
      const vinculosAtivos = recebimentoIds.length ? await ExpedicaoNota.findAll({
        where: { recebimento_nota_id: { [Op.in]: recebimentoIds } },
        include: [{
          model: CargaExpedicao,
          where: { empresa_id: req.user.empresa_id, status: { [Op.notIn]: ['cancelada', 'retornada'] } },
          attributes: ['id', 'placa_veiculo', 'rota', 'status']
        }],
        transaction,
        lock: transaction.LOCK.UPDATE
      }) : [];
      if (vinculosAtivos.length) {
        const details = vinculosAtivos.slice(0, 5).map((vinculo) =>
          `${vinculo.chave_acesso} (carga ${vinculo.CargaExpedicao?.id || vinculo.carga_expedicao_id})`
        ).join(', ');
        const error = new Error(`NF-e ja vinculada a carga ativa: ${details}. Cancele ou registre o retorno da carga anterior.`);
        error.statusCode = 409;
        throw error;
      }
      const linhas = roteirizacao.chaves_acesso.map((chave) => {
        const nota = notasPorChave.get(chave);
        if (!nota) return { chave_acesso: chave, status: 'nao_localizada', motivo_divergencia: 'Nota não encontrada no recebimento desta empresa.' };
        if (nota.status !== 'ok') return {
          chave_acesso: chave,
          recebimento_nota_id: nota.id,
          status: 'inbound_divergente',
          motivo_divergencia: `Nota no Inbound está com status ${nota.status}.`
        };
        if (nota.LoteRecebimento?.status !== 'liberado_fusion') return {
          chave_acesso: chave,
          recebimento_nota_id: nota.id,
          status: 'inbound_divergente',
          motivo_divergencia: 'NF-e ainda nao foi liberada no pacote XML do Inbound.'
        };
        return { chave_acesso: chave, recebimento_nota_id: nota.id, status: 'apta' };
      });
      const possuiDivergencia = linhas.some((linha) => linha.status !== 'apta');
      const itensAgregados = new Map();
      linhas.filter((linha) => linha.status === 'apta').forEach((linha) => {
        const nota = notasPorChave.get(linha.chave_acesso);
        const itensNota = parseNFeItems(nota.xml_original);
        if (!itensNota.length) throw new Error(`A NF-e ${nota.numero_nfe || linha.chave_acesso} não possui itens comerciais válidos.`);
        itensNota.forEach((item) => {
          const key = [item.codigo_produto, item.codigo_barras || '', item.unidade_medida].join('::');
          const existing = itensAgregados.get(key);
          if (existing) {
            existing.quantidade_prevista = roundQuantity(existing.quantidade_prevista + item.quantidade);
          } else {
            itensAgregados.set(key, {
              codigo_produto: item.codigo_produto,
              codigo_barras: item.codigo_barras,
              descricao: item.descricao,
              unidade_medida: item.unidade_medida,
              quantidade_prevista: roundQuantity(item.quantidade),
              quantidade_conferida: 0,
              status: 'pendente'
            });
          }
        });
      });
      const carga = await CargaExpedicao.create({
        placa_veiculo: roteirizacao.placa_veiculo,
        motorista: roteirizacao.motorista,
        rota: roteirizacao.rota,
        arquivo_nome: file.originalname,
        xml_original: xmlOriginal,
        status: possuiDivergencia ? 'divergente' : 'aguardando_liberacao',
        empresa_id: req.user.empresa_id,
        importado_por_usuario_id: req.user.id
      }, { transaction });
      await ExpedicaoNota.bulkCreate(
        linhas.map((linha) => ({ ...linha, carga_expedicao_id: carga.id })),
        { transaction }
      );
      if (itensAgregados.size) {
        await CargaExpedicaoItem.bulkCreate(
          [...itensAgregados.values()].map((item) => ({ ...item, carga_expedicao_id: carga.id })),
          { transaction }
        );
      }
      const notasAptasIds = linhas.filter((linha) => linha.status === 'apta').map((linha) => linha.recebimento_nota_id);
      if (notasAptasIds.length) {
        await RecebimentoNota.update(
          { situacao_logistica: 'roteirizada' },
          { where: { id: { [Op.in]: notasAptasIds } }, transaction }
        );
      }
      return CargaExpedicao.findByPk(carga.id, { include: cargoInclude, transaction });
    });
    const resposta = serializeCarga(criada);
    emitOutboundUpdate({ empresaId: req.user.empresa_id, event: { type: 'carga_importada', carga_id: criada.id } });
    return res.status(201).json(resposta);
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 400).json({ message: error.message || 'Não foi possível importar a roteirização.' });
  }
};

const cargoInclude = [{
  model: ExpedicaoNota,
  as: 'notas',
  include: [
    { model: RecebimentoNota, as: 'notaRecebimento', attributes: ['id', 'numero_nfe', 'qtd_volumes_xml', 'emitente_nome', 'destinatario_nome'] },
    { model: Usuario, as: 'embarcadoPor', attributes: ['id', 'nome'], required: false }
  ]
}, {
  model: CargaExpedicaoItem,
  as: 'itens',
  include: [
    { model: Usuario, as: 'conferidoPor', attributes: ['id', 'nome'], required: false },
    { model: Usuario, as: 'recontadoPor', attributes: ['id', 'nome'], required: false }
  ]
}, {
  model: Usuario,
  as: 'conferenteResponsavel',
  attributes: ['id', 'nome', 'email', 'nivel_acesso'],
  required: false
}, {
  model: Usuario,
  as: 'conferenciaFinalizadaPor',
  attributes: ['id', 'nome', 'email'],
  required: false
}, {
  model: Usuario,
  as: 'liberadoPor',
  attributes: ['id', 'nome', 'email'],
  required: false
}, {
  model: Usuario,
  as: 'conferenteRecontagem',
  attributes: ['id', 'nome', 'email', 'nivel_acesso'],
  required: false
}, {
  model: Usuario,
  as: 'recontagemSolicitadaPor',
  attributes: ['id', 'nome', 'email'],
  required: false
}, {
  model: Usuario,
  as: 'retornadoPor',
  attributes: ['id', 'nome', 'email'],
  required: false
}];

async function carregarCarga(id, empresaId, user) {
  return CargaExpedicao.findOne({ where: cargoAccessWhere({ id, empresaId, user }), include: cargoInclude });
}

exports.atualizarCarga = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem editar cargas.' });
    const carga = await CargaExpedicao.findOne({ where: { id: req.params.id, empresa_id: req.user.empresa_id } });
    if (!carga) return res.status(404).json({ message: 'Carga de expedicao nao encontrada.' });
    if (carga.conferencia_iniciada_em || ['liberada', 'cancelada', 'retornada'].includes(carga.status)) {
      return res.status(409).json({ message: 'Somente cargas ainda nao iniciadas podem ser editadas.' });
    }
    const changes = {};
    ['placa_veiculo', 'motorista', 'rota', 'data_rota'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) changes[field] = String(req.body[field] || '').trim() || null;
    });
    await carga.update(changes);
    const resposta = serializeCarga(await carregarCarga(carga.id, req.user.empresa_id, req.user));
    emitOutboundUpdate({ empresaId: req.user.empresa_id, event: { type: 'carga_atualizada', carga_id: carga.id, usuario_id: req.user.id } });
    return res.json(resposta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Nao foi possivel atualizar a carga.' });
  }
};

exports.cancelarCarga = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem cancelar cargas.' });
    const respostaId = await sequelize.transaction(async (transaction) => {
      const carga = await CargaExpedicao.findOne({
        where: { id: req.params.id, empresa_id: req.user.empresa_id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!carga) {
        const error = new Error('Carga de expedicao nao encontrada.');
        error.statusCode = 404;
        throw error;
      }
      if (['liberada', 'retornada'].includes(carga.status)) {
        const error = new Error('Cargas liberadas ou retornadas nao podem ser canceladas.');
        error.statusCode = 409;
        throw error;
      }
      if (carga.status === 'cancelada') return carga.id;
      await carga.update({ status: 'cancelada' }, { transaction });
      const vinculos = await ExpedicaoNota.findAll({ where: { carga_expedicao_id: carga.id }, transaction });
      const recebimentoIds = vinculos.map((nota) => nota.recebimento_nota_id).filter(Boolean);
      if (recebimentoIds.length) {
        await RecebimentoNota.update(
          { situacao_logistica: 'exportada' },
          { where: { id: { [Op.in]: recebimentoIds } }, transaction }
        );
      }
      return carga.id;
    });
    const resposta = serializeCarga(await carregarCarga(respostaId, req.user.empresa_id, req.user));
    emitOutboundUpdate({ empresaId: req.user.empresa_id, event: { type: 'carga_cancelada', carga_id: respostaId, usuario_id: req.user.id } });
    return res.json(resposta);
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Nao foi possivel cancelar a carga.' });
  }
};

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

async function atualizarStatusCarga(carga) {
  if (['liberada', 'cancelada', 'retornada'].includes(carga.status)) return;
  const notas = carga.notas || [];
  const itens = carga.itens || [];
  const possuiDivergencia = notas.some((nota) => ['nao_localizada', 'inbound_divergente'].includes(nota.status))
    || itens.some((item) => item.status === 'sobra');
  const pendentes = itens.length === 0 || itens.some((item) => ['pendente', 'parcial'].includes(item.status));
  const proximo = possuiDivergencia ? 'divergente' : (pendentes ? 'em_carregamento' : 'aguardando_liberacao');
  if (carga.status !== proximo) await carga.update({ status: proximo });
}

exports.registrarConferenciaItem = async (req, res) => {
  try {
    const itemId = Number.parseInt(req.body.item_id, 10);
    const quantidade = toNumber(req.body.quantidade);
    const unidade = String(req.body.unidade_medida || '').trim().toUpperCase();
    const clientOperationId = String(req.body.client_operation_id || '').trim() || null;
    if (!itemId) return res.status(400).json({ message: 'Informe o item da carga.' });
    if (quantidade === null || quantidade <= 0) return res.status(400).json({ message: 'A quantidade deve ser maior que zero.' });
    if (!unidade) return res.status(400).json({ message: 'Informe a unidade de medida da contagem.' });
    if (clientOperationId && clientOperationId.length > 100) return res.status(400).json({ message: 'Identificador da operação inválido.' });

    const transactionResult = await sequelize.transaction(async (transaction) => {
      const carga = await CargaExpedicao.findOne({
        where: conferenceExecutionWhere({ id: req.params.id, empresaId: req.user.empresa_id, user: req.user }),
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!carga) {
        const error = new Error('Carga de expedição não encontrada.');
        error.statusCode = 404;
        throw error;
      }
      if (clientOperationId) {
        const existingOperation = await ExpedicaoItemConferencia.findOne({
          where: { usuario_id: req.user.id, client_operation_id: clientOperationId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (existingOperation) return { duplicada: true };
      }
      if (['liberada', 'cancelada', 'retornada'].includes(carga.status)) {
        const error = new Error('Esta carga está encerrada e não aceita novas conferências.');
        error.statusCode = 400;
        throw error;
      }
      if (carga.conferencia_finalizada_em) {
        const error = new Error('A primeira conferência já foi encerrada e está em auditoria.');
        error.statusCode = 409;
        throw error;
      }
      if (!carga.conferencia_iniciada_em) {
        await carga.update({
          conferencia_iniciada_em: new Date(),
          status: carga.status === 'aguardando_liberacao' ? 'em_carregamento' : carga.status
        }, { transaction });
      }

      const item = await CargaExpedicaoItem.findOne({
        where: { id: itemId, carga_expedicao_id: carga.id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!item) {
        const error = new Error('Mercadoria não encontrada nesta carga.');
        error.statusCode = 404;
        throw error;
      }
      if (String(item.unidade_medida).toUpperCase() !== unidade) {
        const error = new Error(`Este item deve ser conferido em ${item.unidade_medida}.`);
        error.statusCode = 400;
        throw error;
      }
      if (DISCRETE_UNITS.has(unidade) && !Number.isInteger(quantidade)) {
        const error = new Error(`A unidade ${item.unidade_medida} aceita apenas quantidades inteiras.`);
        error.statusCode = 400;
        throw error;
      }
      if (['conferido', 'sobra'].includes(item.status)) {
        const error = new Error(item.status === 'conferido' ? 'Este item já foi totalmente conferido.' : 'Este item possui sobra e precisa de ajuste.');
        error.statusCode = 409;
        throw error;
      }

      const novaQuantidade = roundQuantity(Number(item.quantidade_conferida || 0) + quantidade);
      const quantidadeAnterior = roundQuantity(Number(item.quantidade_conferida || 0));
      const prevista = Number(item.quantidade_prevista || 0);
      const status = resolveItemStatus(novaQuantidade, prevista);
      await item.update({
        quantidade_conferida: novaQuantidade,
        status,
        ultima_conferencia_em: new Date(),
        conferido_por_usuario_id: req.user.id
      }, { transaction });
      await ExpedicaoItemConferencia.create({
        tipo: 'contagem',
        quantidade_informada: roundQuantity(quantidade),
        quantidade_anterior: quantidadeAnterior,
        quantidade_resultante: novaQuantidade,
        unidade_medida: item.unidade_medida,
        registrado_em: new Date(),
        carga_expedicao_id: carga.id,
        carga_expedicao_item_id: item.id,
        usuario_id: req.user.id,
        client_operation_id: clientOperationId
      }, { transaction });
      return { duplicada: false };
    });

    const atualizada = await carregarCarga(req.params.id, req.user.empresa_id, req.user);
    await atualizarStatusCarga(atualizada);
    const resposta = serializeCarga(await carregarCarga(req.params.id, req.user.empresa_id, req.user));
    if (!transactionResult.duplicada) emitOutboundUpdate({ empresaId: req.user.empresa_id, usuarioIds: [resposta.conferente_usuario_id], event: { type: 'item_conferido', carga_id: resposta.id, item_id: itemId, usuario_id: req.user.id } });
    return res.json({ ...resposta, operacao_duplicada: transactionResult.duplicada });
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível registrar a conferência do item.' });
  }
};

exports.ajustarConferenciaItem = async (req, res) => {
  try {
    const itemId = Number.parseInt(req.params.itemId, 10);
    const quantidade = toNumber(req.body.quantidade_conferida);
    const unidade = String(req.body.unidade_medida || '').trim().toUpperCase();
    const motivo = String(req.body.motivo || '').trim();
    if (quantidade === null || quantidade < 0) return res.status(400).json({ message: 'Informe um total conferido válido.' });
    if (!unidade) return res.status(400).json({ message: 'Informe a unidade de medida da contagem.' });
    if (motivo.length < 3) return res.status(400).json({ message: 'Informe o motivo do ajuste.' });

    await sequelize.transaction(async (transaction) => {
      const carga = await CargaExpedicao.findOne({ where: conferenceExecutionWhere({ id: req.params.id, empresaId: req.user.empresa_id, user: req.user }), transaction, lock: transaction.LOCK.UPDATE });
      if (!carga) {
        const error = new Error('Carga de expedição não encontrada.');
        error.statusCode = 404;
        throw error;
      }
      if (['liberada', 'cancelada', 'retornada'].includes(carga.status)) {
        const error = new Error('Esta carga está encerrada e não aceita ajustes.');
        error.statusCode = 400;
        throw error;
      }
      if (carga.conferencia_finalizada_em) {
        const error = new Error('A primeira conferência já foi encerrada. Utilize o fluxo de recontagem.');
        error.statusCode = 409;
        throw error;
      }
      const item = await CargaExpedicaoItem.findOne({ where: { id: itemId, carga_expedicao_id: carga.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!item) {
        const error = new Error('Mercadoria não encontrada nesta carga.');
        error.statusCode = 404;
        throw error;
      }
      if (String(item.unidade_medida).toUpperCase() !== unidade) {
        const error = new Error(`Este item deve ser ajustado em ${item.unidade_medida}.`);
        error.statusCode = 400;
        throw error;
      }
      if (DISCRETE_UNITS.has(unidade) && !Number.isInteger(quantidade)) {
        const error = new Error(`A unidade ${item.unidade_medida} aceita apenas quantidades inteiras.`);
        error.statusCode = 400;
        throw error;
      }
      const quantidadeAnterior = roundQuantity(Number(item.quantidade_conferida || 0));
      const quantidadeResultante = roundQuantity(quantidade);
      await item.update({
        quantidade_conferida: quantidadeResultante,
        status: resolveItemStatus(quantidade, Number(item.quantidade_prevista || 0)),
        ultima_conferencia_em: new Date(),
        conferido_por_usuario_id: req.user.id
      }, { transaction });
      await ExpedicaoItemConferencia.create({
        tipo: 'ajuste',
        quantidade_informada: quantidadeResultante,
        quantidade_anterior: quantidadeAnterior,
        quantidade_resultante: quantidadeResultante,
        unidade_medida: item.unidade_medida,
        motivo,
        registrado_em: new Date(),
        carga_expedicao_id: carga.id,
        carga_expedicao_item_id: item.id,
        usuario_id: req.user.id
      }, { transaction });
    });

    const atualizada = await carregarCarga(req.params.id, req.user.empresa_id, req.user);
    await atualizarStatusCarga(atualizada);
    const resposta = serializeCarga(await carregarCarga(req.params.id, req.user.empresa_id, req.user));
    emitOutboundUpdate({ empresaId: req.user.empresa_id, usuarioIds: [resposta.conferente_usuario_id], event: { type: 'item_ajustado', carga_id: resposta.id, item_id: itemId, usuario_id: req.user.id } });
    return res.json(resposta);
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível ajustar a conferência do item.' });
  }
};

exports.listarCargas = async (req, res) => {
  try {
    const cargas = await CargaExpedicao.findAll({
      where: cargoAccessWhere({ empresaId: req.user.empresa_id, user: req.user }),
      include: cargoInclude,
      order: [['createdAt', 'DESC']]
    });
    res.json(cargas.map(serializeCarga));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Não foi possível listar as cargas de expedição.' });
  }
};

exports.iniciarConferencia = async (req, res) => {
  try {
    const carga = await CargaExpedicao.findOne({
      where: conferenceExecutionWhere({ id: req.params.id, empresaId: req.user.empresa_id, user: req.user })
    });
    if (!carga) return res.status(404).json({ message: 'Tarefa de conferência não encontrada ou não atribuída a este usuário.' });
    if (['liberada', 'cancelada', 'retornada'].includes(carga.status)) return res.status(409).json({ message: 'Esta tarefa já está encerrada.' });
    if (carga.conferencia_finalizada_em) return res.status(409).json({ message: 'Esta conferência já foi enviada para autorização do gestor.' });

    if (!carga.conferencia_iniciada_em) {
      await carga.update({
        conferencia_iniciada_em: new Date(),
        status: carga.status === 'aguardando_liberacao' ? 'em_carregamento' : carga.status
      });
      emitOutboundUpdate({ empresaId: req.user.empresa_id, usuarioIds: [carga.conferente_usuario_id], event: { type: 'conferencia_iniciada', carga_id: carga.id, usuario_id: req.user.id } });
    }
    return res.json(serializeCarga(await carregarCarga(carga.id, req.user.empresa_id, req.user)));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível iniciar a conferência.' });
  }
};

exports.buscarCarga = async (req, res) => {
  try {
    const carga = await carregarCarga(req.params.id, req.user.empresa_id, req.user);
    if (!carga) return res.status(404).json({ message: 'Carga de expedição não encontrada.' });
    return res.json(serializeCarga(carga));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível consultar a carga de expedição.' });
  }
};

exports.listarHistoricoConferencia = async (req, res) => {
  try {
    const carga = await CargaExpedicao.findOne({ where: cargoAccessWhere({ id: req.params.id, empresaId: req.user.empresa_id, user: req.user }) });
    if (!carga) return res.status(404).json({ message: 'Carga de expedição não encontrada.' });
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 100;
    const historico = await ExpedicaoItemConferencia.findAll({
      where: { carga_expedicao_id: carga.id },
      include: [
        { model: CargaExpedicaoItem, as: 'item', attributes: ['id', 'codigo_produto', 'codigo_barras', 'descricao', 'unidade_medida'] },
        { model: Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'] }
      ],
      order: [['registrado_em', 'DESC'], ['id', 'DESC']],
      limit: Math.min(Math.max(requestedLimit, 1), 500)
    });
    return res.json(historico);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível carregar o histórico da conferência.' });
  }
};

exports.listarUsuariosConferencia = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem atribuir cargas.' });
    const carga = await CargaExpedicao.findOne({ where: { id: req.params.id, empresa_id: req.user.empresa_id } });
    if (!carga) return res.status(404).json({ message: 'Carga de expedição não encontrada.' });
    const usuarios = await Usuario.findAll({
      where: { empresa_id: req.user.empresa_id, nivel_acesso: ['operador', 'admin_inventario'] },
      attributes: ['id', 'nome', 'email', 'nivel_acesso'],
      order: [['nome', 'ASC']]
    });
    const connectionStatus = getOutboundUserConnectionStatus(req.user.empresa_id);
    return res.json({
      conferente_usuario_id: carga.conferente_usuario_id || null,
      usuarios: usuarios.map((usuario) => ({
        ...usuario.toJSON(),
        ...(connectionStatus.get(String(usuario.id)) || { online: false, aparelhos_conectados: 0, ultima_conexao_em: null })
      }))
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível listar os conferentes.' });
  }
};

exports.obterProdutividadeConferencia = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem acompanhar a produtividade.' });
    const carga = await CargaExpedicao.findOne({
      where: { id: req.params.id, empresa_id: req.user.empresa_id },
      include: [{
        model: Usuario,
        as: 'conferenteResponsavel',
        attributes: ['id', 'nome', 'email', 'nivel_acesso'],
        required: false
      }]
    });
    if (!carga) return res.status(404).json({ message: 'Carga de expedição não encontrada.' });

    const historico = await ExpedicaoItemConferencia.findAll({
      where: { carga_expedicao_id: carga.id },
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'] },
        { model: CargaExpedicaoItem, as: 'item', attributes: ['id', 'codigo_produto', 'descricao'] }
      ],
      order: [['registrado_em', 'DESC'], ['id', 'DESC']]
    });
    const connectionStatus = getOutboundUserConnectionStatus(req.user.empresa_id);
    const productivityByUser = new Map();

    historico.forEach((registro) => {
      const usuario = registro.usuario;
      const userId = String(registro.usuario_id);
      const current = productivityByUser.get(userId) || {
        usuario: usuario ? usuario.toJSON() : { id: registro.usuario_id, nome: 'Usuário removido', email: null },
        leituras: 0,
        ajustes: 0,
        recontagens: 0,
        itens_distintos: new Set(),
        quantidades_por_unidade: {},
        primeira_atividade_em: registro.registrado_em,
        ultima_atividade_em: registro.registrado_em
      };
      if (registro.tipo === 'contagem') {
        current.leituras += 1;
        const unidade = registro.unidade_medida || 'SEM UNIDADE';
        current.quantidades_por_unidade[unidade] = roundQuantity(
          Number(current.quantidades_por_unidade[unidade] || 0) + Number(registro.quantidade_informada || 0)
        );
      } else if (registro.tipo === 'ajuste') {
        current.ajustes += 1;
      } else if (registro.tipo === 'recontagem') {
        current.recontagens += 1;
      }
      current.itens_distintos.add(registro.carga_expedicao_item_id);
      if (new Date(registro.registrado_em) < new Date(current.primeira_atividade_em)) current.primeira_atividade_em = registro.registrado_em;
      if (new Date(registro.registrado_em) > new Date(current.ultima_atividade_em)) current.ultima_atividade_em = registro.registrado_em;
      productivityByUser.set(userId, current);
    });

    const responsavel = carga.conferenteResponsavel?.toJSON() || null;
    const statusResponsavel = responsavel
      ? (connectionStatus.get(String(responsavel.id)) || { online: false, aparelhos_conectados: 0, ultima_conexao_em: null })
      : { online: false, aparelhos_conectados: 0, ultima_conexao_em: null };
    const ultimaAtividade = historico[0] || null;

    return res.json({
      carga_id: carga.id,
      responsavel: responsavel ? { ...responsavel, ...statusResponsavel } : null,
      total_operacoes: historico.length,
      ultima_atividade: ultimaAtividade,
      usuarios: [...productivityByUser.entries()].map(([userId, item]) => ({
        ...item,
        itens_distintos: item.itens_distintos.size,
        ...(connectionStatus.get(userId) || { online: false, aparelhos_conectados: 0, ultima_conexao_em: null })
      }))
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível carregar a produtividade da conferência.' });
  }
};

exports.atribuirConferente = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem atribuir cargas.' });
    const usuarioId = req.body.usuario_id === null || req.body.usuario_id === '' ? null : Number.parseInt(req.body.usuario_id, 10);
    const carga = await CargaExpedicao.findOne({ where: { id: req.params.id, empresa_id: req.user.empresa_id } });
    if (!carga) return res.status(404).json({ message: 'Carga de expedição não encontrada.' });
    if (['liberada', 'cancelada', 'retornada'].includes(carga.status)) return res.status(409).json({ message: 'Uma carga encerrada não pode ter sua atribuição alterada.' });

    if (usuarioId) {
      const usuario = await Usuario.findOne({ where: { id: usuarioId, empresa_id: req.user.empresa_id } });
      if (!usuario || !['operador', 'admin_inventario'].includes(usuario.nivel_acesso)) {
        return res.status(400).json({ message: 'Selecione um operador válido da empresa.' });
      }
    }

    const responsavelAnteriorId = carga.conferente_usuario_id;
    await carga.update({
      conferente_usuario_id: usuarioId,
      atribuido_por_usuario_id: usuarioId ? req.user.id : null,
      atribuido_em: usuarioId ? new Date() : null
    });
    const resposta = serializeCarga(await carregarCarga(carga.id, req.user.empresa_id, req.user));
    emitOutboundUpdate({ empresaId: req.user.empresa_id, usuarioIds: [responsavelAnteriorId, usuarioId], event: { type: 'conferente_atribuido', carga_id: carga.id } });
    return res.json(resposta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível atribuir o conferente.' });
  }
};

exports.encerrarCarga = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const carga = await CargaExpedicao.findOne({
        where: conferenceExecutionWhere({ id: req.params.id, empresaId: req.user.empresa_id, user: req.user }),
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!carga) {
        const error = new Error('Carga de expedição não encontrada.');
        error.statusCode = 404;
        throw error;
      }
      if (carga.status === 'cancelada') {
        const error = new Error('A carga está cancelada.');
        error.statusCode = 409;
        throw error;
      }
      if (carga.status === 'retornada') {
        const error = new Error('A carga já retornou e não pode ser finalizada novamente.');
        error.statusCode = 409;
        throw error;
      }
      if (carga.status === 'liberada') return { jaLiberada: true, carga };

      const [itens, notas] = await Promise.all([
        CargaExpedicaoItem.findAll({ where: { carga_expedicao_id: carga.id }, transaction, lock: transaction.LOCK.UPDATE }),
        ExpedicaoNota.findAll({ where: { carga_expedicao_id: carga.id }, transaction })
      ]);
      const itensPendentes = itens.filter((item) => item.status !== 'conferido');
      const notasDivergentes = notas.filter((nota) => ['nao_localizada', 'inbound_divergente', 'divergencia_embarque'].includes(nota.status));
      if (!itens.length) {
        const error = new Error('A carga não possui mercadorias para conferência.');
        error.statusCode = 409;
        throw error;
      }
      if (itensPendentes.length && req.body.confirmar_divergencias !== true) {
        const error = new Error(`Conferência física não concluída: ${itensPendentes.length} item(ns) pendente(s).`);
        error.statusCode = 409;
        error.details = { itens_pendentes: itensPendentes.length, divergencias_documentais: notasDivergentes.length, requer_confirmacao_divergencias: true };
        throw error;
      }

      await carga.update({
        status: (notasDivergentes.length || itensPendentes.length) ? 'divergente' : 'aguardando_liberacao',
        conferencia_finalizada_em: new Date(),
        conferencia_finalizada_por_usuario_id: req.user.id
      }, { transaction });
      return { jaLiberada: false, carga };
    });

    const resposta = serializeCarga(await carregarCarga(req.params.id, req.user.empresa_id, req.user));
    if (!resultado.jaLiberada) emitOutboundUpdate({ empresaId: req.user.empresa_id, usuarioIds: [resposta.conferente_usuario_id], event: { type: 'conferencia_finalizada', carga_id: resposta.id, usuario_id: req.user.id } });
    return res.json(resposta);
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível encerrar a carga.', ...(error.details || {}) });
  }
};

exports.atribuirRecontagem = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem solicitar recontagem.' });
    const usuarioId = Number.parseInt(req.body.usuario_id, 10);
    const motivo = String(req.body.motivo || '').trim();
    if (!usuarioId) return res.status(400).json({ message: 'Selecione o conferente da recontagem.' });
    if (motivo.length < 5) return res.status(400).json({ message: 'Informe o motivo da recontagem.' });

    const result = await sequelize.transaction(async (transaction) => {
      const carga = await CargaExpedicao.findOne({ where: { id: req.params.id, empresa_id: req.user.empresa_id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!carga) {
        const error = new Error('Carga de expedição não encontrada.');
        error.statusCode = 404;
        throw error;
      }
      if (!carga.conferencia_finalizada_em || carga.status !== 'divergente') {
        const error = new Error('Finalize a primeira conferência divergente antes de solicitar a recontagem.');
        error.statusCode = 409;
        throw error;
      }
      if (['pendente', 'em_andamento'].includes(carga.recontagem_status)) {
        const error = new Error('Já existe uma recontagem em andamento para esta carga.');
        error.statusCode = 409;
        throw error;
      }
      const usuario = await Usuario.findOne({ where: { id: usuarioId, empresa_id: req.user.empresa_id }, transaction });
      if (!usuario || !['operador', 'admin_inventario'].includes(usuario.nivel_acesso)) {
        const error = new Error('Selecione um conferente válido da empresa.');
        error.statusCode = 400;
        throw error;
      }
      const divergentes = await CargaExpedicaoItem.findAll({ where: { carga_expedicao_id: carga.id, status: { [Op.ne]: 'conferido' } }, transaction, lock: transaction.LOCK.UPDATE });
      if (!divergentes.length) {
        const error = new Error('Não existem itens divergentes para recontagem.');
        error.statusCode = 409;
        throw error;
      }
      await Promise.all(divergentes.map((item) => item.update({
        requer_recontagem: true,
        quantidade_primeira_conferencia: item.quantidade_conferida,
        recontado_em: null,
        recontado_por_usuario_id: null
      }, { transaction })));
      await carga.update({
        recontagem_status: 'pendente',
        recontagem_usuario_id: usuario.id,
        recontagem_solicitada_por_usuario_id: req.user.id,
        recontagem_solicitada_em: new Date(),
        recontagem_iniciada_em: null,
        recontagem_finalizada_em: null,
        recontagem_motivo: motivo
      }, { transaction });
      return { usuario, carga };
    });
    const resposta = serializeCarga(await carregarCarga(result.carga.id, req.user.empresa_id, req.user));
    emitOutboundUpdate({ empresaId: req.user.empresa_id, usuarioIds: [resposta.conferente_usuario_id, result.usuario.id], event: { type: 'recontagem_atribuida', carga_id: resposta.id, usuario_id: result.usuario.id } });
    return res.json(resposta);
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível solicitar a recontagem.' });
  }
};

exports.registrarRecontagemItem = async (req, res) => {
  try {
    const itemId = Number.parseInt(req.body.item_id, 10);
    const quantidade = toNumber(req.body.quantidade);
    const unidade = String(req.body.unidade_medida || '').trim().toUpperCase();
    if (!itemId || quantidade === null || quantidade < 0 || !unidade) return res.status(400).json({ message: 'Informe item, quantidade e unidade da recontagem.' });

    const cargoId = await sequelize.transaction(async (transaction) => {
      const carga = await CargaExpedicao.findOne({
        where: { id: req.params.id, empresa_id: req.user.empresa_id, recontagem_usuario_id: req.user.id, recontagem_status: { [Op.in]: ['pendente', 'em_andamento'] } },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!carga) {
        const error = new Error('Recontagem não encontrada ou não atribuída a este usuário.');
        error.statusCode = 404;
        throw error;
      }
      const item = await CargaExpedicaoItem.findOne({ where: { id: itemId, carga_expedicao_id: carga.id, requer_recontagem: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!item) {
        const error = new Error('Este item não pertence à tarefa de recontagem.');
        error.statusCode = 404;
        throw error;
      }
      if (item.recontado_em) {
        const error = new Error('Este item já foi recontado nesta tarefa.');
        error.statusCode = 409;
        throw error;
      }
      if (String(item.unidade_medida).toUpperCase() !== unidade) {
        const error = new Error(`Este item deve ser recontado em ${item.unidade_medida}.`);
        error.statusCode = 400;
        throw error;
      }
      if (DISCRETE_UNITS.has(unidade) && !Number.isInteger(quantidade)) {
        const error = new Error(`A unidade ${item.unidade_medida} aceita apenas quantidades inteiras.`);
        error.statusCode = 400;
        throw error;
      }
      const anterior = roundQuantity(Number(item.quantidade_conferida || 0));
      const resultante = roundQuantity(quantidade);
      await item.update({
        quantidade_conferida: resultante,
        status: resolveItemStatus(resultante, Number(item.quantidade_prevista || 0)),
        recontado_em: new Date(),
        recontado_por_usuario_id: req.user.id,
        ultima_conferencia_em: new Date()
      }, { transaction });
      await ExpedicaoItemConferencia.create({
        tipo: 'recontagem',
        quantidade_informada: resultante,
        quantidade_anterior: anterior,
        quantidade_resultante: resultante,
        unidade_medida: item.unidade_medida,
        motivo: carga.recontagem_motivo,
        registrado_em: new Date(),
        carga_expedicao_id: carga.id,
        carga_expedicao_item_id: item.id,
        usuario_id: req.user.id
      }, { transaction });
      const pendentes = await CargaExpedicaoItem.count({ where: { carga_expedicao_id: carga.id, requer_recontagem: true, recontado_em: null }, transaction });
      if (!carga.recontagem_iniciada_em) carga.recontagem_iniciada_em = new Date();
      carga.recontagem_status = pendentes ? 'em_andamento' : 'finalizada';
      if (!pendentes) carga.recontagem_finalizada_em = new Date();
      await carga.save({ transaction });
      return carga.id;
    });
    const resposta = serializeCarga(await carregarCarga(cargoId, req.user.empresa_id, req.user));
    emitOutboundUpdate({ empresaId: req.user.empresa_id, usuarioIds: [resposta.conferente_usuario_id, resposta.recontagem_usuario_id], event: { type: 'item_recontado', carga_id: resposta.id, item_id: itemId, usuario_id: req.user.id } });
    return res.json(resposta);
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível registrar a recontagem.' });
  }
};

exports.liberarCarga = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem liberar o veículo.' });
    const justificativa = String(req.body.justificativa || '').trim();
    const resultado = await sequelize.transaction(async (transaction) => {
      const carga = await CargaExpedicao.findOne({
        where: { id: req.params.id, empresa_id: req.user.empresa_id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!carga) {
        const error = new Error('Carga de expedição não encontrada.');
        error.statusCode = 404;
        throw error;
      }
      if (carga.status === 'cancelada') {
        const error = new Error('Uma carga cancelada não pode ser liberada.');
        error.statusCode = 409;
        throw error;
      }
      if (carga.status === 'retornada') {
        const error = new Error('Uma carga retornada não pode ser liberada novamente.');
        error.statusCode = 409;
        throw error;
      }
      if (carga.status === 'liberada') return { jaLiberada: true, carga };
      if (!carga.conferencia_finalizada_em) {
        const error = new Error('O conferente ainda não finalizou esta conferência.');
        error.statusCode = 409;
        throw error;
      }

      const [itens, notas] = await Promise.all([
        CargaExpedicaoItem.findAll({ where: { carga_expedicao_id: carga.id }, transaction, lock: transaction.LOCK.UPDATE }),
        ExpedicaoNota.findAll({ where: { carga_expedicao_id: carga.id }, transaction })
      ]);
      const possuiPendencia = !itens.length || itens.some((item) => item.status !== 'conferido');
      const possuiDivergenciaDocumental = notas.some((nota) => ['nao_localizada', 'inbound_divergente', 'divergencia_embarque'].includes(nota.status));
      if (possuiPendencia && carga.recontagem_status !== 'finalizada') {
        const error = new Error('Os itens divergentes precisam passar pela recontagem antes da liberação.');
        error.statusCode = 409;
        throw error;
      }
      const possuiDivergencia = possuiPendencia || possuiDivergenciaDocumental;
      if (possuiDivergencia && justificativa.length < 5) {
        const error = new Error('Informe uma justificativa para autorizar a carga com divergência após a recontagem.');
        error.statusCode = 400;
        throw error;
      }

      await carga.update({
        status: 'liberada',
        liberado_em: new Date(),
        liberado_por_usuario_id: req.user.id,
        justificativa_liberacao: possuiDivergencia ? justificativa : null
      }, { transaction });
      const recebimentoIds = notas.map((nota) => nota.recebimento_nota_id).filter(Boolean);
      if (recebimentoIds.length) {
        await RecebimentoNota.update(
          { situacao_logistica: 'expedida' },
          { where: { id: { [Op.in]: recebimentoIds } }, transaction }
        );
      }
      return { jaLiberada: false, carga };
    });

    const resposta = serializeCarga(await carregarCarga(req.params.id, req.user.empresa_id, req.user));
    if (!resultado.jaLiberada) emitOutboundUpdate({ empresaId: req.user.empresa_id, usuarioIds: [resposta.conferente_usuario_id], event: { type: 'carga_liberada', carga_id: resposta.id, usuario_id: req.user.id } });
    return res.json(resposta);
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível liberar o veículo.' });
  }
};

exports.registrarRetorno = async (req, res) => {
  try {
    if (!isOutboundManager(req.user)) return res.status(403).json({ message: 'Apenas administradores e gerentes podem registrar o retorno.' });
    const motivo = String(req.body.motivo || '').trim();
    const destino = String(req.body.destino || '').trim();
    const observacoes = String(req.body.observacoes || '').trim();
    if (motivo.length < 5) return res.status(400).json({ message: 'Informe o motivo do retorno da carga.' });
    if (!['reintegracao', 'nova_roteirizacao'].includes(destino)) return res.status(400).json({ message: 'Selecione reintegração ao armazém ou nova roteirização.' });
    if (observacoes.length > 1000) return res.status(400).json({ message: 'As observações devem ter no máximo 1000 caracteres.' });

    const carga = await sequelize.transaction(async (transaction) => {
      const lockedCargo = await CargaExpedicao.findOne({
        where: { id: req.params.id, empresa_id: req.user.empresa_id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!lockedCargo) {
        const error = new Error('Carga de expedição não encontrada.');
        error.statusCode = 404;
        throw error;
      }
      if (lockedCargo.status !== 'liberada') {
        const error = new Error(lockedCargo.status === 'retornada' ? 'O retorno desta carga já foi registrado.' : 'Somente uma carga liberada pode ser registrada como retornada.');
        error.statusCode = 409;
        throw error;
      }
      await lockedCargo.update({
        status: 'retornada',
        retornado_em: new Date(),
        retornado_por_usuario_id: req.user.id,
        retorno_motivo: motivo,
        retorno_destino: destino,
        retorno_observacoes: observacoes || null
      }, { transaction });
      const vinculos = await ExpedicaoNota.findAll({ where: { carga_expedicao_id: lockedCargo.id }, transaction });
      const recebimentoIds = vinculos.map((nota) => nota.recebimento_nota_id).filter(Boolean);
      if (recebimentoIds.length) {
        await RecebimentoNota.update(
          { situacao_logistica: destino === 'nova_roteirizacao' ? 'exportada' : 'retornada' },
          { where: { id: { [Op.in]: recebimentoIds } }, transaction }
        );
      }
      return lockedCargo;
    });

    const resposta = serializeCarga(await carregarCarga(carga.id, req.user.empresa_id, req.user));
    emitOutboundUpdate({
      empresaId: req.user.empresa_id,
      usuarioIds: [resposta.conferente_usuario_id, resposta.recontagem_usuario_id],
      event: { type: 'carga_retornada', carga_id: resposta.id, usuario_id: req.user.id, destino }
    });
    return res.json(resposta);
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível registrar o retorno da carga.' });
  }
};

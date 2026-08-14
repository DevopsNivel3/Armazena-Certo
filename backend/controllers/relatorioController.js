const { CargaExpedicao, ExpedicaoNota, CargaExpedicaoItem, RecebimentoNota, LoteRecebimento, Usuario } = require('../models');
const { extractRouteXml } = require('../services/roteirizacaoXmlParser');
const xlsx = require('xlsx');

function sendWorkbook(res, sheets, filename) {
  const workbook = xlsx.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows.length ? rows : [{ informacao: 'Sem registros' }]), name.slice(0, 31));
  });
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

const cargaInclude = [{
  model: ExpedicaoNota,
  as: 'notas',
  include: [
    { model: RecebimentoNota, as: 'notaRecebimento', attributes: ['numero_nfe', 'qtd_volumes_xml', 'destinatario_nome'] },
    { model: Usuario, as: 'embarcadoPor', attributes: ['nome'], required: false }
  ]
}, {
  model: CargaExpedicaoItem,
  as: 'itens',
  include: [{ model: Usuario, as: 'conferidoPor', attributes: ['nome'], required: false }]
}, {
  model: Usuario,
  as: 'importadoPor',
  attributes: ['id', 'nome'],
  required: false
}, {
  model: Usuario,
  as: 'atribuidoPor',
  attributes: ['id', 'nome'],
  required: false
}, {
  model: Usuario,
  as: 'conferenciaFinalizadaPor',
  attributes: ['id', 'nome'],
  required: false
}, {
  model: Usuario,
  as: 'liberadoPor',
  attributes: ['id', 'nome'],
  required: false
}, {
  model: Usuario,
  as: 'conferenteResponsavel',
  attributes: ['id', 'nome'],
  required: false
}, {
  model: Usuario,
  as: 'retornadoPor',
  attributes: ['id', 'nome'],
  required: false
}];

exports.manifestoCarga = async (req, res) => {
  try {
    const where = { id: req.params.id, empresa_id: req.user.empresa_id };
    if (!['admin', 'gerente'].includes(req.user.nivel_acesso)) where.conferente_usuario_id = req.user.id;
    const carga = await CargaExpedicao.findOne({ where, include: cargaInclude });
    if (!carga) return res.status(404).json({ message: 'Carga não encontrada.' });
    const notas = carga.notas.map((nota) => ({
      chave_acesso: nota.chave_acesso,
      numero_nfe: nota.notaRecebimento?.numero_nfe || null,
      destinatario: nota.notaRecebimento?.destinatario_nome || null,
      status: nota.status,
      divergencia: nota.motivo_divergencia || null
    }));
    const itens = (carga.itens || []).map((item) => ({
      codigo_produto: item.codigo_produto,
      codigo_barras: item.codigo_barras,
      descricao: item.descricao,
      unidade_medida: item.unidade_medida,
      quantidade_prevista: item.quantidade_prevista,
      quantidade_conferida: item.quantidade_conferida,
      status: item.status,
      conferido_em: item.ultima_conferencia_em,
      conferente: item.conferidoPor?.nome || null
    }));
    let roteirizacao = null;
    try {
      roteirizacao = carga.xml_original ? extractRouteXml(carga.xml_original).detalhes : null;
    } catch (_) {
      // O manifesto continua disponível para cargas legadas sem XML estruturado.
    }
    const payload = {
      tipo: 'manifesto_embarque',
      emitido_em: new Date(),
      carga: {
        id: carga.id,
        placa: carga.placa_veiculo,
        motorista: carga.motorista,
        rota: carga.rota,
        status: carga.status,
        conferencia_finalizada_em: carga.conferencia_finalizada_em,
        conferencia_finalizada_por: carga.conferenciaFinalizadaPor?.nome || null,
        liberado_em: carga.liberado_em,
        liberado_por: carga.liberadoPor?.nome || null,
        justificativa_liberacao: carga.justificativa_liberacao,
        retornado_em: carga.retornado_em,
        retornado_por: carga.retornadoPor?.nome || null,
        retorno_motivo: carga.retorno_motivo,
        retorno_destino: carga.retorno_destino,
        retorno_observacoes: carga.retorno_observacoes
      },
      resumo: {
        total_notas: notas.length,
        total_itens: itens.length,
        itens_conferidos: itens.filter((item) => item.status === 'conferido').length,
        itens_pendentes: itens.filter((item) => ['pendente', 'parcial'].includes(item.status)).length,
        divergencias: itens.filter((item) => item.status === 'sobra').length + notas.filter((nota) => ['nao_localizada', 'inbound_divergente'].includes(nota.status)).length
      },
      notas,
      itens,
      roteirizacao
    };
    if (String(req.query.format || '').toLowerCase() === 'xlsx') {
      return sendWorkbook(res, {
        Resumo: [{ ...payload.carga, ...payload.resumo, emitido_em: payload.emitido_em }],
        Notas: notas,
        Itens: itens
      }, `manifesto_carga_${carga.id}.xlsx`);
    }
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível gerar o manifesto.' });
  }
};

exports.termoDivergenciaInbound = async (req, res) => {
  try {
    const lote = await LoteRecebimento.findOne({
      where: { id: req.params.id, empresa_id: req.user.empresa_id },
      include: [{ model: RecebimentoNota, as: 'notas' }]
    });
    if (!lote) return res.status(404).json({ message: 'Lote de recebimento não encontrado.' });
    const divergencias = lote.notas.filter((nota) => ['falta', 'sobra', 'avaria'].includes(nota.status)).map((nota) => ({
      numero_nfe: nota.numero_nfe, chave_acesso: nota.chave_acesso, emitente: nota.emitente_nome,
      volumes_xml: nota.qtd_volumes_xml, volumes_fisicos: nota.qtd_volumes_fisico, status: nota.status, avarias: nota.avarias
    }));
    const payload = { tipo: 'termo_divergencia_recebimento', emitido_em: new Date(), lote: { id: lote.id, nome: lote.nome, doca: lote.doca, origem: lote.origem, status: lote.status }, divergencias };
    if (String(req.query.format || '').toLowerCase() === 'xlsx') {
      return sendWorkbook(res, { Divergencias: divergencias }, `termo_divergencia_lote_${lote.id}.xlsx`);
    }
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível gerar o termo de divergência.' });
  }
};

exports.auditoriaConferencia = async (req, res) => {
  try {
    if (!['admin', 'gerente'].includes(req.user.nivel_acesso)) {
      return res.status(403).json({ message: 'Apenas administradores e gerentes podem consultar a auditoria.' });
    }
    const [lotes, cargas] = await Promise.all([
      LoteRecebimento.findAll({
        where: { empresa_id: req.user.empresa_id },
        include: [
          { model: Usuario, as: 'criadoPor', attributes: ['id', 'nome'], required: false },
          { model: Usuario, as: 'liberadoPor', attributes: ['id', 'nome'], required: false },
          { model: RecebimentoNota, as: 'notas', include: [{ model: Usuario, as: 'conferidoPor', attributes: ['id', 'nome'], required: false }] }
        ]
      }),
      CargaExpedicao.findAll({ where: { empresa_id: req.user.empresa_id }, include: cargaInclude })
    ]);
    const events = [];
    const add = (data, area, acao, entidade, entidadeId, usuario, detalhes = null) => {
      if (data) events.push({ data, area, acao, entidade, entidade_id: entidadeId, usuario: usuario || '-', detalhes });
    };
    lotes.forEach((lote) => {
      add(lote.createdAt, 'inbound', 'lote_criado', 'lote', lote.id, lote.criadoPor?.nome, lote.nome);
      (lote.notas || []).forEach((nota) => add(nota.conferido_em, 'inbound', 'nfe_conferida', 'nfe', nota.id, nota.conferidoPor?.nome, `${nota.chave_acesso} · ${nota.status}`));
      add(lote.encerrado_em, 'inbound', 'lote_encerrado', 'lote', lote.id, null, lote.status);
      add(lote.exportado_em, 'inbound', 'xml_exportado', 'lote', lote.id, lote.liberadoPor?.nome, lote.exportacao_codigo);
    });
    cargas.forEach((carga) => {
      add(carga.importado_em, 'outbound', 'carga_importada', 'carga', carga.id, carga.importadoPor?.nome, carga.placa_veiculo || carga.rota);
      add(carga.atribuido_em, 'outbound', 'conferente_atribuido', 'carga', carga.id, carga.atribuidoPor?.nome, carga.conferenteResponsavel?.nome);
      add(carga.conferencia_iniciada_em, 'outbound', 'conferencia_iniciada', 'carga', carga.id, carga.conferenteResponsavel?.nome);
      add(carga.conferencia_finalizada_em, 'outbound', 'conferencia_finalizada', 'carga', carga.id, carga.conferenciaFinalizadaPor?.nome);
      add(carga.liberado_em, 'outbound', 'carga_liberada', 'carga', carga.id, carga.liberadoPor?.nome, carga.justificativa_liberacao);
      add(carga.retornado_em, 'outbound', 'carga_retornada', 'carga', carga.id, carga.retornadoPor?.nome, `${carga.retorno_destino || ''} · ${carga.retorno_motivo || ''}`);
    });
    const area = String(req.query.area || '').trim();
    const limited = events
      .filter((event) => !area || event.area === area)
      .sort((a, b) => new Date(b.data) - new Date(a.data))
      .slice(0, Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000));
    if (String(req.query.format || '').toLowerCase() === 'xlsx') {
      return sendWorkbook(res, { Auditoria: limited }, 'auditoria_conferencia.xlsx');
    }
    return res.json({ total: limited.length, eventos: limited });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Nao foi possivel carregar a auditoria da conferencia.' });
  }
};

const roundMetric = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
const includesText = (value, term) => !term || String(value || '').toLocaleLowerCase('pt-BR').includes(term);
const minutesBetween = (start, end) => start && end ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000)) : null;

exports.prestacaoContas = async (req, res) => {
  try {
    if (!['admin', 'gerente'].includes(req.user.nivel_acesso)) {
      return res.status(403).json({ message: 'Apenas administradores e gerentes podem consultar a prestação de contas.' });
    }

    const dateFrom = req.query.data_inicio ? new Date(`${req.query.data_inicio}T00:00:00`) : null;
    const dateTo = req.query.data_fim ? new Date(`${req.query.data_fim}T23:59:59.999`) : null;
    if ((dateFrom && Number.isNaN(dateFrom.getTime())) || (dateTo && Number.isNaN(dateTo.getTime()))) {
      return res.status(400).json({ message: 'Informe um período válido.' });
    }
    const tipo = String(req.query.tipo || 'todos');
    const status = String(req.query.status || '').trim();
    const doca = String(req.query.doca || '').trim().toLocaleLowerCase('pt-BR');
    const rota = String(req.query.rota || '').trim().toLocaleLowerCase('pt-BR');
    const placa = String(req.query.placa || '').trim().toLocaleLowerCase('pt-BR');
    const cliente = String(req.query.cliente || '').trim().toLocaleLowerCase('pt-BR');

    const [allInbound, allOutbound] = await Promise.all([
      LoteRecebimento.findAll({
        where: { empresa_id: req.user.empresa_id },
        include: [{ model: RecebimentoNota, as: 'notas', include: [{ model: Usuario, as: 'conferidoPor', attributes: ['id', 'nome'], required: false }] }],
        order: [['data_recebimento', 'DESC']]
      }),
      CargaExpedicao.findAll({
        where: { empresa_id: req.user.empresa_id },
        include: cargaInclude,
        order: [['importado_em', 'DESC']]
      })
    ]);

    const inPeriod = (value) => {
      const date = new Date(value);
      return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    };
    const inbound = tipo === 'outbound' ? [] : allInbound.filter((lote) => {
      if (!inPeriod(lote.data_recebimento || lote.createdAt)) return false;
      if (status && lote.status !== status) return false;
      if (!includesText(lote.doca, doca)) return false;
      if (cliente && !(lote.notas || []).some((nota) => includesText(nota.emitente_nome, cliente) || includesText(nota.destinatario_nome, cliente))) return false;
      return true;
    });
    const outbound = tipo === 'inbound' ? [] : allOutbound.filter((carga) => {
      if (!inPeriod(carga.importado_em || carga.createdAt)) return false;
      if (status && carga.status !== status) return false;
      if (!includesText(carga.rota, rota) || !includesText(carga.placa_veiculo, placa)) return false;
      if (cliente && !(carga.notas || []).some((nota) => includesText(nota.notaRecebimento?.destinatario_nome, cliente))) return false;
      return true;
    });

    const inboundRows = inbound.map((lote) => {
      const notas = lote.notas || [];
      const previstas = notas.reduce((sum, nota) => sum + Number(nota.qtd_volumes_xml || 0), 0);
      const fisicas = notas.reduce((sum, nota) => sum + Number(nota.qtd_volumes_fisico || 0), 0);
      return {
        id: lote.id,
        nome: lote.nome,
        doca: lote.doca,
        origem: lote.origem,
        status: lote.status,
        data: lote.data_recebimento,
        encerrado_em: lote.encerrado_em,
        tempo_conferencia_minutos: minutesBetween(lote.data_recebimento, lote.encerrado_em),
        total_notas: notas.length,
        notas_ok: notas.filter((nota) => nota.status === 'ok').length,
        faltas: notas.filter((nota) => nota.status === 'falta').length,
        sobras: notas.filter((nota) => nota.status === 'sobra').length,
        avarias: notas.filter((nota) => nota.status === 'avaria').length,
        volumes_previstos: roundMetric(previstas),
        volumes_fisicos: roundMetric(fisicas)
      };
    });
    const outboundRows = outbound.map((carga) => {
      const itens = carga.itens || [];
      const notas = carga.notas || [];
      return {
        id: carga.id,
        placa: carga.placa_veiculo,
        rota: carga.rota,
        motorista: carga.motorista,
        status: carga.status,
        data: carga.importado_em,
        conferencia_finalizada_em: carga.conferencia_finalizada_em,
        liberado_em: carga.liberado_em,
        tempo_conferencia_minutos: minutesBetween(carga.importado_em, carga.conferencia_finalizada_em),
        total_notas: notas.length,
        total_itens: itens.length,
        itens_conferidos: itens.filter((item) => item.status === 'conferido').length,
        itens_pendentes: itens.filter((item) => ['pendente', 'parcial'].includes(item.status)).length,
        sobras: itens.filter((item) => item.status === 'sobra').length,
        divergencias_documentais: notas.filter((nota) => ['nao_localizada', 'inbound_divergente', 'divergencia_embarque'].includes(nota.status)).length,
        justificativa_liberacao: carga.justificativa_liberacao,
        retornado_em: carga.retornado_em,
        retorno_destino: carga.retorno_destino,
        retorno_motivo: carga.retorno_motivo,
        retornado_por: carga.retornadoPor?.nome || null,
        conferente: carga.conferenteResponsavel?.nome || null,
        liberado_por: carga.liberadoPor?.nome || null
      };
    });
    const inboundNotes = inboundRows.reduce((sum, row) => sum + row.total_notas, 0);
    const inboundConferred = inboundRows.reduce((sum, row) => sum + row.notas_ok + row.faltas + row.sobras + row.avarias, 0);
    const outboundItems = outboundRows.reduce((sum, row) => sum + row.total_itens, 0);
    const inboundTimes = inboundRows.map((row) => row.tempo_conferencia_minutos).filter((value) => value !== null);
    const outboundTimes = outboundRows.map((row) => row.tempo_conferencia_minutos).filter((value) => value !== null);

    return res.json({
      gerado_em: new Date(),
      filtros: { tipo, status, data_inicio: req.query.data_inicio || null, data_fim: req.query.data_fim || null, doca: req.query.doca || '', rota: req.query.rota || '', placa: req.query.placa || '', cliente: req.query.cliente || '' },
      inbound: {
        indicadores: {
          total_lotes: inboundRows.length,
          total_notas: inboundNotes,
          notas_ok: inboundRows.reduce((sum, row) => sum + row.notas_ok, 0),
          faltas: inboundRows.reduce((sum, row) => sum + row.faltas, 0),
          sobras: inboundRows.reduce((sum, row) => sum + row.sobras, 0),
          avarias: inboundRows.reduce((sum, row) => sum + row.avarias, 0),
          volumes_previstos: roundMetric(inboundRows.reduce((sum, row) => sum + row.volumes_previstos, 0)),
          volumes_fisicos: roundMetric(inboundRows.reduce((sum, row) => sum + row.volumes_fisicos, 0)),
          indice_acerto: inboundConferred ? roundMetric((inboundRows.reduce((sum, row) => sum + row.notas_ok, 0) / inboundConferred) * 100) : 0,
          tempo_medio_minutos: inboundTimes.length ? Math.round(inboundTimes.reduce((sum, value) => sum + value, 0) / inboundTimes.length) : null
        },
        lotes: inboundRows
      },
      outbound: {
        indicadores: {
          total_cargas: outboundRows.length,
          cargas_liberadas: outboundRows.filter((row) => row.status === 'liberada').length,
          cargas_retornadas: outboundRows.filter((row) => row.status === 'retornada').length,
          cargas_divergentes: outboundRows.filter((row) => row.status === 'divergente' || row.divergencias_documentais || row.sobras).length,
          total_itens: outboundItems,
          itens_conferidos: outboundRows.reduce((sum, row) => sum + row.itens_conferidos, 0),
          itens_pendentes: outboundRows.reduce((sum, row) => sum + row.itens_pendentes, 0),
          sobras: outboundRows.reduce((sum, row) => sum + row.sobras, 0),
          divergencias_documentais: outboundRows.reduce((sum, row) => sum + row.divergencias_documentais, 0),
          indice_acerto: outboundItems ? roundMetric((outboundRows.reduce((sum, row) => sum + row.itens_conferidos, 0) / outboundItems) * 100) : 0,
          tempo_medio_minutos: outboundTimes.length ? Math.round(outboundTimes.reduce((sum, value) => sum + value, 0) / outboundTimes.length) : null
        },
        cargas: outboundRows
      },
      opcoes: {
        docas: [...new Set(allInbound.map((lote) => lote.doca).filter(Boolean))].sort(),
        rotas: [...new Set(allOutbound.map((carga) => carga.rota).filter(Boolean))].sort(),
        placas: [...new Set(allOutbound.map((carga) => carga.placa_veiculo).filter(Boolean))].sort()
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Não foi possível consolidar a prestação de contas.' });
  }
};

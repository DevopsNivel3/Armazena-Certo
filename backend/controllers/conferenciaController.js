const { Op } = require('sequelize');
const crypto = require('crypto');
const { sequelize, LoteRecebimento, RecebimentoNota, Usuario } = require('../models');
const { parseNFeXml } = require('../services/nfeParser');
const { buildInboundExportXml } = require('../services/integracaoXmlService');

const isInboundManager = (user) => ['admin', 'gerente'].includes(user?.nivel_acesso);
const publicNoteAttributes = { exclude: ['xml_original'] };

function requireInboundManager(req, res, action) {
  if (isInboundManager(req.user)) return true;
  res.status(403).json({ message: `Apenas administradores e gerentes podem ${action}.` });
  return false;
}

const toNumber = (value) => {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundValue = (value) => Math.round((toNumber(value) + Number.EPSILON) * 1000) / 1000;

function hasAvarias(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;

  const numeric = Number.parseFloat(text.replace(',', '.'));
  // O operador pode informar 0 para indicar que não encontrou avarias.
  if (Number.isFinite(numeric) && /^[-+]?\d+(?:[,.]\d+)?$/.test(text)) {
    return numeric > 0;
  }

  return true;
}

function resolveNotaStatus({ xml, fisico, avarias }) {
  if (fisico === null || fisico === undefined || fisico === '') return 'pendente';
  if (hasAvarias(avarias)) return 'avaria';

  const diff = roundValue(toNumber(fisico) - toNumber(xml));
  if (diff < 0) return 'falta';
  if (diff > 0) return 'sobra';
  return 'ok';
}

function buildResumo(notas) {
  const initial = {
    total_notas: 0,
    notas_pendentes: 0,
    notas_ok: 0,
    notas_divergentes: 0,
    total_volumes_xml: 0,
    total_volumes_fisico: 0,
    divergencia_volumes: 0,
    avarias: 0,
    progresso_percentual: 0
  };

  const resumo = notas.reduce((acc, nota) => {
    const json = nota.toJSON ? nota.toJSON() : nota;
    const fisico = json.qtd_volumes_fisico;
    const status = json.status || 'pendente';

    acc.total_notas += 1;
    acc.total_volumes_xml = roundValue(acc.total_volumes_xml + json.qtd_volumes_xml);

    if (fisico !== null && fisico !== undefined) {
      acc.total_volumes_fisico = roundValue(acc.total_volumes_fisico + fisico);
    }

    if (status === 'pendente') acc.notas_pendentes += 1;
    if (status === 'ok') acc.notas_ok += 1;
    if (status === 'falta' || status === 'sobra' || status === 'avaria') acc.notas_divergentes += 1;
    if (status === 'avaria') acc.avarias += 1;

    return acc;
  }, initial);

  resumo.divergencia_volumes = roundValue(resumo.total_volumes_fisico - resumo.total_volumes_xml);
  resumo.progresso_percentual = resumo.total_notas
    ? Number((((resumo.total_notas - resumo.notas_pendentes) / resumo.total_notas) * 100).toFixed(1))
    : 0;

  return resumo;
}

async function refreshLoteStatus(loteId) {
  const lote = await LoteRecebimento.findByPk(loteId, {
    include: [{ model: RecebimentoNota, as: 'notas', attributes: publicNoteAttributes }]
  });

  if (!lote) return null;

  const resumo = buildResumo(lote.notas || []);
  let nextStatus = lote.status;

  if (lote.status !== 'cancelado' && lote.status !== 'liberado_fusion') {
    if (resumo.notas_pendentes > 0 && resumo.notas_pendentes < resumo.total_notas) {
      nextStatus = 'em_conferencia';
    } else if (resumo.notas_pendentes === 0 && resumo.total_notas > 0) {
      nextStatus = resumo.notas_divergentes > 0 ? 'divergente' : 'conferido';
    } else {
      nextStatus = 'importado';
    }
  }

  if (nextStatus !== lote.status) {
    await lote.update({ status: nextStatus });
  }

  return lote.reload({ include: [{ model: RecebimentoNota, as: 'notas', attributes: publicNoteAttributes }] });
}

function serializeLote(lote) {
  const json = lote.toJSON();
  const notas = json.notas || [];
  return {
    ...json,
    resumo: buildResumo(notas)
  };
}

exports.createInboundBatch = async (req, res) => {
  try {
    if (!requireInboundManager(req, res, 'criar lotes de recebimento')) return;
    const files = req.files || [];
    const { empresa_id, id: usuario_id } = req.user;

    if (!files.length) {
      return res.status(400).json({ message: 'Envie ao menos um arquivo XML.' });
    }

    const parsedNotes = [];
    const errors = [];

    for (const file of files) {
      try {
        const xmlContent = file.buffer.toString('utf8');
        const parsed = parseNFeXml(xmlContent, file.originalname);

        if (!parsed.chave_acesso) {
          throw new Error('Chave de acesso nao encontrada.');
        }

        parsedNotes.push(parsed);
      } catch (error) {
        errors.push({
          arquivo: file.originalname,
          erro: error.message
        });
      }
    }

    if (!parsedNotes.length) {
      return res.status(400).json({
        message: 'Nenhum XML valido foi importado.',
        errors
      });
    }

    const seenKeys = new Set();
    const uniqueNotes = [];
    for (const note of parsedNotes) {
      if (seenKeys.has(note.chave_acesso)) {
        errors.push({ arquivo: note.arquivo_nome, erro: 'XML duplicado no upload.' });
      } else {
        seenKeys.add(note.chave_acesso);
        uniqueNotes.push(note);
      }
    }

    const existingNotes = await RecebimentoNota.findAll({
      where: { chave_acesso: { [Op.in]: uniqueNotes.map((note) => note.chave_acesso) } },
      include: [{
        model: LoteRecebimento,
        where: { empresa_id, status: { [Op.ne]: 'cancelado' } },
        attributes: ['id', 'nome', 'status']
      }]
    });
    const existingByKey = new Map(existingNotes.map((note) => [note.chave_acesso, note]));
    const acceptedNotes = uniqueNotes.filter((note) => {
      const existing = existingByKey.get(note.chave_acesso);
      if (!existing) return true;
      errors.push({
        arquivo: note.arquivo_nome,
        erro: `NF-e ja importada no lote ${existing.LoteRecebimento?.nome || existing.lote_recebimento_id}.`
      });
      return false;
    });

    if (!acceptedNotes.length) {
      return res.status(409).json({ message: 'Todas as NF-es ja existem em lotes ativos.', errors });
    }

    const { created, importedCount } = await sequelize.transaction(async (transaction) => {
      const lote = await LoteRecebimento.create({
        nome: req.body.nome || `Recebimento ${new Date().toLocaleString('pt-BR')}`,
        doca: req.body.doca || null,
        origem: req.body.origem || null,
        observacoes: req.body.observacoes || null,
        empresa_id,
        criado_por_usuario_id: usuario_id,
        status: 'importado'
      }, { transaction });
      const rows = acceptedNotes.map((note) => ({ ...note, lote_recebimento_id: lote.id }));
      await RecebimentoNota.bulkCreate(rows, { transaction });
      const persisted = await LoteRecebimento.findByPk(lote.id, {
        include: [{ model: RecebimentoNota, as: 'notas', attributes: publicNoteAttributes }],
        transaction
      });
      return { created: persisted, importedCount: rows.length };
    });

    res.status(201).json({
      lote: serializeLote(created),
      importados: importedCount,
      rejeitados: errors.length,
      errors
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao importar lote de recebimento.' });
  }
};

exports.getInboundBatches = async (req, res) => {
  try {
    const lotes = await LoteRecebimento.findAll({
      where: { empresa_id: req.user.empresa_id },
      include: [{ model: RecebimentoNota, as: 'notas', attributes: publicNoteAttributes }],
      order: [['createdAt', 'DESC']]
    });

    res.json(lotes.map(serializeLote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao listar lotes de recebimento.' });
  }
};

exports.getInboundBatchById = async (req, res) => {
  try {
    const lote = await LoteRecebimento.findOne({
      where: {
        id: req.params.id,
        empresa_id: req.user.empresa_id
      },
      include: [{
        model: RecebimentoNota,
        as: 'notas',
        attributes: publicNoteAttributes,
        include: [{ model: Usuario, as: 'conferidoPor', attributes: ['id', 'nome', 'email'] }]
      }]
    });

    if (!lote) {
      return res.status(404).json({ message: 'Lote de recebimento nao encontrado.' });
    }

    res.json(serializeLote(lote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao buscar lote de recebimento.' });
  }
};

exports.submitInboundVolumeCount = async (req, res) => {
  try {
    const { id } = req.params;
    const chave = String(req.body.chave_acesso || req.body.codigo || '').replace(/\D/g, '');
    if (req.body.qtd_volumes_fisico === null || req.body.qtd_volumes_fisico === undefined || req.body.qtd_volumes_fisico === '') {
      return res.status(400).json({ message: 'Informe a quantidade fisica de volumes.' });
    }
    const quantidadeFisica = roundValue(req.body.qtd_volumes_fisico);

    if (!chave) {
      return res.status(400).json({ message: 'Informe a chave de acesso da NFe.' });
    }

    if (quantidadeFisica < 0) {
      return res.status(400).json({ message: 'A quantidade fisica nao pode ser negativa.' });
    }

    const lote = await LoteRecebimento.findOne({
      where: {
        id,
        empresa_id: req.user.empresa_id
      }
    });

    if (!lote) {
      return res.status(404).json({ message: 'Lote de recebimento nao encontrado.' });
    }

    if (lote.status === 'cancelado' || lote.status === 'liberado_fusion' || lote.encerrado_em) {
      return res.status(400).json({ message: 'Este lote nao aceita novas contagens.' });
    }

    const nota = await RecebimentoNota.findOne({
      where: {
        lote_recebimento_id: id,
        [Op.or]: [
          { chave_acesso: chave },
          { numero_nfe: req.body.codigo || chave }
        ]
      }
    });

    if (!nota) {
      return res.status(404).json({ message: 'NFe nao pertence a este lote de recebimento.' });
    }

    const avarias = req.body.avarias || null;
    await nota.update({
      qtd_volumes_fisico: quantidadeFisica,
      avarias,
      status: resolveNotaStatus({
        xml: nota.qtd_volumes_xml,
        fisico: quantidadeFisica,
        avarias
      }),
      conferido_em: new Date(),
      conferido_por_usuario_id: req.user.id
    });

    const updated = await refreshLoteStatus(id);
    res.json(serializeLote(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao registrar conferencia de volume.' });
  }
};

exports.closeInboundBatch = async (req, res) => {
  try {
    if (!requireInboundManager(req, res, 'encerrar lotes de recebimento')) return;
    const existing = await LoteRecebimento.findOne({
      where: {
        id: req.params.id,
        empresa_id: req.user.empresa_id
      },
      include: [{ model: RecebimentoNota, as: 'notas', attributes: publicNoteAttributes }]
    });

    if (!existing) {
      return res.status(404).json({ message: 'Lote de recebimento nao encontrado.' });
    }

    if (existing.status === 'cancelado') return res.status(409).json({ message: 'Um lote cancelado nao pode ser encerrado.' });
    if (existing.status === 'liberado_fusion') return res.json(serializeLote(existing));
    const resumo = buildResumo(existing.notas || []);
    if (!resumo.total_notas || resumo.notas_pendentes > 0) {
      return res.status(409).json({
        message: `Nao e possivel encerrar: ${resumo.notas_pendentes} NF-e(s) ainda estao pendentes.`,
        resumo
      });
    }

    await existing.update({
      status: resumo.notas_divergentes ? 'divergente' : 'conferido',
      encerrado_em: existing.encerrado_em || new Date()
    });
    const lote = await existing.reload({ include: [{ model: RecebimentoNota, as: 'notas', attributes: publicNoteAttributes }] });

    res.json(serializeLote(lote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao encerrar lote de recebimento.' });
  }
};

exports.exportInboundBatchXml = async (req, res) => {
  try {
    if (!requireInboundManager(req, res, 'liberar XMLs para roteirizacao')) return;
    const result = await sequelize.transaction(async (transaction) => {
      const lote = await LoteRecebimento.findOne({
        where: { id: req.params.id, empresa_id: req.user.empresa_id },
        include: [{ model: RecebimentoNota, as: 'notas' }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!lote) {
        const error = new Error('Lote de recebimento nao encontrado.');
        error.statusCode = 404;
        throw error;
      }
      if (lote.status === 'cancelado') {
        const error = new Error('Um lote cancelado nao pode ser exportado.');
        error.statusCode = 409;
        throw error;
      }
      const resumo = buildResumo(lote.notas || []);
      if (!lote.encerrado_em || resumo.notas_pendentes > 0) {
        const error = new Error('Encerre a conferencia de todas as NF-es antes de gerar o XML.');
        error.statusCode = 409;
        throw error;
      }
      if (!resumo.notas_ok) {
        const error = new Error('O lote nao possui NF-es OK para roteirizacao.');
        error.statusCode = 409;
        throw error;
      }

      const exportacaoCodigo = lote.exportacao_codigo || `AC-${lote.id}-${crypto.randomUUID()}`;
      const exportadoEm = lote.exportado_em || new Date();
      const xml = buildInboundExportXml({
        lote,
        notas: lote.notas,
        exportacaoCodigo,
        generatedAt: exportadoEm
      });
      await lote.update({
        status: 'liberado_fusion',
        exportacao_codigo: exportacaoCodigo,
        exportado_em: exportadoEm,
        liberado_em: lote.liberado_em || new Date(),
        liberado_por_usuario_id: lote.liberado_por_usuario_id || req.user.id
      }, { transaction });
      await RecebimentoNota.update(
        { situacao_logistica: 'exportada', exportado_em: exportadoEm },
        { where: { lote_recebimento_id: lote.id, status: 'ok' }, transaction }
      );
      return { lote, xml };
    });

    const safeName = String(result.lote.nome || `lote_${result.lote.id}`).replace(/[^a-z0-9_-]+/gi, '_');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roteirizacao_${safeName}.xml"`);
    return res.send(result.xml);
  } catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Nao foi possivel gerar o XML de roteirizacao.' });
  }
};

exports.cancelInboundBatch = async (req, res) => {
  try {
    if (!requireInboundManager(req, res, 'cancelar lotes de recebimento')) return;
    const lote = await LoteRecebimento.findOne({
      where: { id: req.params.id, empresa_id: req.user.empresa_id },
      include: [{ model: RecebimentoNota, as: 'notas', attributes: publicNoteAttributes }]
    });
    if (!lote) return res.status(404).json({ message: 'Lote de recebimento nao encontrado.' });
    if (lote.status === 'liberado_fusion') return res.status(409).json({ message: 'Um lote ja exportado nao pode ser cancelado.' });
    if (lote.status !== 'cancelado') await lote.update({ status: 'cancelado' });
    return res.json(serializeLote(lote));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Nao foi possivel cancelar o lote.' });
  }
};

exports.getRoteirizacaoReadyInboundNotes = async (req, res) => {
  try {
    if (!requireInboundManager(req, res, 'consultar NF-es liberadas para roteirizacao')) return;
    const lote = await LoteRecebimento.findOne({
      where: {
        id: req.params.id,
        empresa_id: req.user.empresa_id
      },
      include: [{
        model: RecebimentoNota,
        as: 'notas',
        attributes: publicNoteAttributes,
        where: { status: 'ok' },
        required: false
      }]
    });

    if (!lote) {
      return res.status(404).json({ message: 'Lote de recebimento nao encontrado.' });
    }

    res.json({
      lote_id: lote.id,
      total_validadas: lote.notas.length,
      notas: lote.notas.map((nota) => ({
        id: nota.id,
        chave_acesso: nota.chave_acesso,
        numero_nfe: nota.numero_nfe,
        arquivo_nome: nota.arquivo_nome,
        situacao_logistica: nota.situacao_logistica
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao listar notas validadas para roteirizacao.' });
  }
};

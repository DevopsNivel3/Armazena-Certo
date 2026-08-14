const { Op, fn, col } = require('sequelize');
const xlsx = require('xlsx');
const { Inventario, EstoqueImportado, Produto, Contagem, Usuario, LiberacaoProduto, InventarioUsuario } = require('../models');
const bcrypt = require('bcrypt');
const { getIO, getInventoryUserConnectionStatus } = require('../socket');

const ROUND_PRECISION = 1000;

const toNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundValue = (value) => Math.round((toNumber(value) + Number.EPSILON) * ROUND_PRECISION) / ROUND_PRECISION;

const escapeCsv = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const stringified = String(value);
  if (stringified.includes(';') || stringified.includes('"') || stringified.includes('\n')) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }

  return stringified;
};

const statusLabelMap = {
  ok: 'Batido',
  pendente: 'Pendente',
  divergente: 'Divergente',
  aguarda_recontagem: 'Aguardando Recontagem'
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeValidityDate = (value) => {
  if (!value) {
    return null;
  }

  const rawValue = String(value).trim();
  const brDateMatch = rawValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDateMatch) {
    const [, day, month, year] = brDateMatch;
    return `${year}-${month}-${day}`;
  }

  return rawValue;
};

const isValidDateOnly = (value) => {
  if (!value) return true;
  const normalized = normalizeValidityDate(value);
  const match = String(normalized).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const normalizeMeasurementUnit = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase();

const resolveCountMultiplier = ({ unidadeMedida, fatorConversao }) => {
  const explicitFactor = toNumber(fatorConversao);
  if (explicitFactor > 0) {
    return explicitFactor;
  }

  const normalizedUnit = normalizeMeasurementUnit(unidadeMedida);
  if (
    normalizedUnit === 'KG'
    || normalizedUnit.startsWith('KG ')
    || normalizedUnit.includes('KILO')
    || normalizedUnit.includes('KILOGRAMA')
  ) {
    return 1000;
  }

  return 1;
};

const INVENTORY_STATUS_TRANSITIONS = {
  criado: ['em_contagem'],
  em_contagem: ['em_recontagem', 'finalizado'],
  em_recontagem: ['finalizado'],
  finalizado: ['em_contagem', 'em_recontagem']
};

function isManagementUser(user) {
  return user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'gerente';
}

async function verifyInventoryManagementAccess(user, inventoryId) {
  if (isManagementUser(user)) return null;

  if (user?.nivel_acesso === 'admin_inventario') {
    const inventario = await Inventario.findByPk(inventoryId);
    if (!inventario) return { status: 404, message: 'Inventory not found' };
    const isAssociated = await inventario.hasUsuario(user.id);
    if (isAssociated) return null; // Has access
  }

  return { status: 403, message: 'Apenas gerentes, administradores ou administradores do inventario podem executar esta operacao.' };
}

async function getAssignedProductIdsForUser({ inventoryId, userId }) {
  const assignments = await LiberacaoProduto.findAll({
    where: {
      inventario_id: inventoryId,
      usuario_id: userId
    },
    attributes: ['produto_id'],
    raw: true
  });

  return assignments.map((item) => item.produto_id);
}

function groupReleaseSummaryByUser(releaseRows) {
  const summaryMap = new Map();

  for (const row of releaseRows) {
    const userId = row.usuario_id;
    if (!summaryMap.has(userId)) {
      summaryMap.set(userId, {
        usuario_id: userId,
        nome: row.usuarioDestino?.nome || null,
        email: row.usuarioDestino?.email || null,
        total_produtos_liberados: 0,
        categorias: new Set(),
        status: new Set()
      });
    }

    const current = summaryMap.get(userId);
    current.total_produtos_liberados += 1;

    if (row.Produto?.categoria) {
      current.categorias.add(row.Produto.categoria);
    }

    if (row.status_contagem_atual) {
      current.status.add(row.status_contagem_atual);
    }
  }

  return Array.from(summaryMap.values()).map((item) => ({
    usuario_id: item.usuario_id,
    nome: item.nome,
    email: item.email,
    total_produtos_liberados: item.total_produtos_liberados,
    categorias: Array.from(item.categorias).sort(),
    status: Array.from(item.status).sort()
  }));
}

function matchesReleaseStatusFilter(row, statusContagem) {
  if (!statusContagem.length) {
    return false;
  }

  return statusContagem.some((status) => {
    if (status === row.status) {
      return true;
    }

    if (status === 'divergente') {
      return row.requer_recontagem === true;
    }

    return false;
  });
}

async function getInventoryWithAccess({ inventoryId, user }) {
  const inventario = await Inventario.findOne({
    where: { id: inventoryId, empresa_id: user.empresa_id }
  });

  if (!inventario) {
    return { error: { status: 404, message: 'Inventory not found' } };
  }

  if (user.nivel_acesso === 'operador' || user.nivel_acesso === 'admin_inventario') {
    const isAssociated = await inventario.hasUsuario(user.id);
    if (!isAssociated) {
      return { error: { status: 403, message: 'Access denied to this inventory' } };
    }
  }

  return { inventario };
}

async function buildInventoryInsights(inventario) {
  const inventarioId = inventario.id;
  const currentStage = inventario.etapa_contagem || 1;
  const [estoqueRows, countRows, countEvents] = await Promise.all([
    EstoqueImportado.findAll({
      where: { inventario_id: inventarioId },
      include: [{
        model: Produto,
        attributes: ['id', 'sku', 'nome', 'categoria', 'unidade_medida', 'codigo_barras', 'codigo_referencia', 'preco_custo', 'preco_venda']
      }],
      order: [[Produto, 'nome', 'ASC']]
    }),
    Contagem.findAll({
      where: { inventario_id: inventarioId },
      attributes: [
        'produto_id',
        'numero_contagem',
        [fn('SUM', col('quantidade_contada')), 'total_contado']
      ],
      group: ['produto_id', 'numero_contagem'],
      raw: true
    }),
    Contagem.findAll({
        where: { inventario_id: inventarioId },
        include: [
          {
            model: Produto,
            attributes: ['id', 'sku', 'nome', 'codigo_referencia', 'codigo_barras', 'unidade_medida']
          },
          {
            model: Usuario,
            attributes: ['id', 'nome', 'email']
          }
        ],
      order: [['data_hora', 'DESC']]
    })
  ]);

  const countMap = {};
  for (const row of countRows) {
    const productId = row.produto_id;
    const stage = Number(row.numero_contagem);

    if (!countMap[productId]) {
      countMap[productId] = {};
    }

    countMap[productId][stage] = roundValue(row.total_contado);
  }

  const latestStageByProduct = {};
  for (const productId in countMap) {
    const countedStages = Object.keys(countMap[productId]).map(Number).sort((a, b) => a - b);
    latestStageByProduct[productId] = countedStages[countedStages.length - 1] || 0;
  }

  const lastEventByProduct = {};
  const activeUserIds = new Set();
  const validadesByProduct = {};
  const locaisByProduct = {};

  for (const event of countEvents) {
    activeUserIds.add(event.usuario_id);

    // Only aggregate validities and locais if this event belongs to the latest counted stage for this product
    // (or the current active stage if we are in it)
    const targetStage = latestStageByProduct[event.produto_id] || 1;
    
    if (event.numero_contagem === targetStage) {
      if (event.validade) {
        if (!validadesByProduct[event.produto_id]) {
          validadesByProduct[event.produto_id] = [];
        }
        const existingVal = validadesByProduct[event.produto_id].find(v => v.data === event.validade);
        if (existingVal) {
          existingVal.quantidade = roundValue(existingVal.quantidade + event.quantidade_contada);
        } else {
          validadesByProduct[event.produto_id].push({
            data: event.validade,
            quantidade: roundValue(event.quantidade_contada)
          });
        }
      }

      const localKey = event.local_contagem || 'Não informado';
      if (!locaisByProduct[event.produto_id]) {
        locaisByProduct[event.produto_id] = [];
      }
      const existingLocal = locaisByProduct[event.produto_id].find(l => l.nome === localKey);
      if (existingLocal) {
        existingLocal.quantidade = roundValue(existingLocal.quantidade + event.quantidade_contada);
      } else {
        locaisByProduct[event.produto_id].push({
          nome: localKey,
          quantidade: roundValue(event.quantidade_contada)
        });
      }
    }

    if (!lastEventByProduct[event.produto_id]) {
      lastEventByProduct[event.produto_id] = {
        usuario_id: event.usuario_id,
        usuario_nome: event.Usuario?.nome || null,
        usuario_email: event.Usuario?.email || null,
        data_hora: event.data_hora,
        quantidade_contada: roundValue(event.quantidade_contada),
        numero_contagem: event.numero_contagem,
        validade: event.validade || null,
        observacao: event.observacao || null
      };
    }
  }

  const reportRows = estoqueRows.map((row) => {
    const productId = row.Produto?.id;
    const historicoContagens = countMap[productId] || {};
    const countedStages = Object.keys(historicoContagens)
      .map(Number)
      .sort((a, b) => a - b);
    const latestStage = countedStages[countedStages.length - 1] || 0;
    const previousStage = currentStage > 1 ? currentStage - 1 : null;
    const latestCount = latestStage ? historicoContagens[latestStage] : 0;
    const currentStageCount = historicoContagens[currentStage];
    const previousCount = previousStage ? historicoContagens[previousStage] : undefined;
    const saldoErp = roundValue(row.saldo_erp);
    const hadAnyCount = countedStages.length > 0;
    const previousDifference = previousCount === undefined ? 0 : roundValue(previousCount - saldoErp);
    const requiresRecount = previousStage !== null && previousCount !== undefined && previousDifference !== 0;
    const recountPending = requiresRecount && currentStageCount === undefined;
    const totalContado = currentStageCount !== undefined ? currentStageCount : latestCount;
    const diferenca = roundValue(totalContado - saldoErp);

    let status = 'pendente';
    if (recountPending) {
      status = 'aguarda_recontagem';
    } else if (hadAnyCount && diferenca === 0) {
      status = 'ok';
    } else if (hadAnyCount) {
      status = 'divergente';
    }

    return {
      id: row.id,
      produto_id: productId,
      produto: row.Produto,
      fator_conversao: row.fator_conversao === null || row.fator_conversao === undefined
        ? null
        : roundValue(row.fator_conversao),
      saldo_erp: saldoErp,
      total_contado: totalContado,
      historico_contagens: historicoContagens,
      validades_contadas: (validadesByProduct[productId] || []).filter(v => v.quantidade !== 0),
      locais_contados: (locaisByProduct[productId] || []).filter(l => l.quantidade !== 0),
      ultima_etapa_contada: latestStage,
      requer_recontagem: requiresRecount,
      recontagem_pendente: recountPending,
      diferenca,
      status,
      ultimo_registro: lastEventByProduct[productId] || null,
      valor_total_erp: roundValue(saldoErp * (row.Produto?.preco_custo || 0)),
      valor_total_contado: roundValue(totalContado * (row.Produto?.preco_custo || 0)),
      valor_diferenca: roundValue(diferenca * (row.Produto?.preco_custo || 0)),
      valor_venda_erp: roundValue(saldoErp * (row.Produto?.preco_venda || 0)),
      valor_venda_contado: roundValue(totalContado * (row.Produto?.preco_venda || 0))
    };
  });

  const summary = reportRows.reduce((acc, row) => {
    acc.total_produtos += 1;
    acc.total_pecas_contadas = roundValue(acc.total_pecas_contadas + row.total_contado);
    acc.valor_total_erp = roundValue(acc.valor_total_erp + row.valor_total_erp);
    acc.valor_total_contado = roundValue(acc.valor_total_contado + row.valor_total_contado);
    acc.valor_diferenca = roundValue(acc.valor_diferenca + row.valor_diferenca);
    acc.valor_venda_erp = roundValue(acc.valor_venda_erp + (row.valor_venda_erp || 0));
    acc.valor_venda_contado = roundValue(acc.valor_venda_contado + (row.valor_venda_contado || 0));

    if (Object.keys(row.historico_contagens).length > 0) {
      acc.produtos_contados += 1;
    } else {
      acc.produtos_pendentes += 1;
    }

    if (row.status === 'ok') {
      acc.produtos_batidos += 1;
    }

    if (row.status === 'divergente') {
      acc.produtos_divergentes += 1;
    }

    if (row.status === 'aguarda_recontagem') {
      acc.produtos_aguardando_recontagem += 1;
    }

    return acc;
  }, {
    total_produtos: 0,
    produtos_contados: 0,
    produtos_pendentes: 0,
    produtos_batidos: 0,
    produtos_divergentes: 0,
    produtos_aguardando_recontagem: 0,
    total_pecas_contadas: 0,
    valor_total_erp: 0,
    valor_total_contado: 0,
    valor_diferenca: 0,
    valor_venda_erp: 0,
    valor_venda_contado: 0
  });

  summary.usuarios_ativos = activeUserIds.size;
  summary.total_registros_contagem = countEvents.length;
  summary.progresso = summary.total_produtos
    ? Number(((summary.produtos_contados / summary.total_produtos) * 100).toFixed(1))
    : 0;

  const recentActivity = countEvents.slice(0, 15).map((event) => ({
      id: event.id,
      produto_id: event.produto_id,
      sku: event.Produto?.sku || null,
      codigo_referencia: event.Produto?.codigo_referencia || null,
      codigo_barras: event.Produto?.codigo_barras || null,
      produto_nome: event.Produto?.nome || null,
      unidade_medida: event.Produto?.unidade_medida || 'UN',
      usuario_id: event.usuario_id,
      usuario_nome: event.Usuario?.nome || null,
    quantidade_contada: roundValue(event.quantidade_contada),
    numero_contagem: event.numero_contagem,
    validade: event.validade || null,
    data_hora: event.data_hora
  }));

  return {
    reportRows,
    summary,
    recentActivity,
    recountPendingProductIds: reportRows
      .filter((row) => row.recontagem_pendente)
      .map((row) => row.produto_id)
  };
}

exports.createInventory = async (req, res) => {
  try {
    const { 
      nome, 
      data_inicio, 
      observacoes, 
      usuarios, 
      validade_obrigatoria,
      empresa_cliente_nome,
      empresa_cliente_cnpj,
      empresa_cliente_filial,
      empresa_cliente_endereco
    } = req.body;
    const { empresa_id } = req.user;

    const inventario = await Inventario.create({
      nome,
      data_inicio,
      observacoes,
      empresa_id,
      status: 'criado',
      validade_obrigatoria: validade_obrigatoria !== undefined ? validade_obrigatoria : true,
      empresa_cliente_nome,
      empresa_cliente_cnpj,
      empresa_cliente_filial,
      empresa_cliente_endereco,
      locais_contagem: req.body.locais_contagem || ['Picking', 'Pulmão']
    });

    if (usuarios && usuarios.length > 0) {
      // usuarios should be an array of user IDs
      await inventario.setUsuarios(usuarios);
    }

    res.status(201).json(inventario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getInventories = async (req, res) => {
  try {
    const { empresa_id, id: usuario_id, nivel_acesso } = req.user;
    
    let inventarios;
    if (nivel_acesso === 'operador' || nivel_acesso === 'admin_inventario') {
      const usuario = await Usuario.findByPk(usuario_id);
      inventarios = await usuario.getInventarios({
        where: { empresa_id },
        order: [['createdAt', 'DESC']]
      });
    } else {
      inventarios = await Inventario.findAll({
        where: { empresa_id },
        order: [['createdAt', 'DESC']]
      });
    }

    if (inventarios.length === 0) {
      return res.json([]);
    }

    const inventarioIds = inventarios.map(i => i.id);

    // Optimized bulk queries
    const [estoqueRows, countRows, usersRows, eventsRows] = await Promise.all([
      EstoqueImportado.findAll({
        where: { inventario_id: { [Op.in]: inventarioIds } },
        attributes: ['inventario_id', 'produto_id', 'saldo_erp'],
        raw: true
      }),
      Contagem.findAll({
        where: { inventario_id: { [Op.in]: inventarioIds } },
        attributes: [
          'inventario_id',
          'produto_id',
          'numero_contagem',
          [fn('SUM', col('quantidade_contada')), 'total_contado']
        ],
        group: ['inventario_id', 'produto_id', 'numero_contagem'],
        raw: true
      }),
      Contagem.findAll({
        where: { inventario_id: { [Op.in]: inventarioIds } },
        attributes: ['inventario_id', [fn('COUNT', fn('DISTINCT', col('usuario_id'))), 'usuarios_ativos']],
        group: ['inventario_id'],
        raw: true
      }),
      Contagem.findAll({
        where: { inventario_id: { [Op.in]: inventarioIds } },
        attributes: ['inventario_id', [fn('COUNT', col('id')), 'total_registros_contagem']],
        group: ['inventario_id'],
        raw: true
      })
    ]);

    const statsByInv = {};
    for (const invId of inventarioIds) {
      statsByInv[invId] = {
        total_produtos: 0,
        produtos_contados: 0,
        produtos_pendentes: 0,
        produtos_batidos: 0,
        produtos_divergentes: 0,
        produtos_aguardando_recontagem: 0,
        usuarios_ativos: 0,
        total_registros_contagem: 0,
        countMap: {}
      };
    }

    for (const row of usersRows) {
      if (statsByInv[row.inventario_id]) {
        statsByInv[row.inventario_id].usuarios_ativos = Number(row.usuarios_ativos) || 0;
      }
    }

    for (const row of eventsRows) {
      if (statsByInv[row.inventario_id]) {
        statsByInv[row.inventario_id].total_registros_contagem = Number(row.total_registros_contagem) || 0;
      }
    }

    for (const row of countRows) {
      const invId = row.inventario_id;
      const productId = row.produto_id;
      const stage = Number(row.numero_contagem);
      
      if (statsByInv[invId]) {
        if (!statsByInv[invId].countMap[productId]) {
          statsByInv[invId].countMap[productId] = {};
        }
        statsByInv[invId].countMap[productId][stage] = roundValue(row.total_contado);
      }
    }

    const invEtapas = {};
    inventarios.forEach(inv => {
      invEtapas[inv.id] = inv.etapa_contagem || 1;
    });

    for (const row of estoqueRows) {
      const invId = row.inventario_id;
      if (!statsByInv[invId]) continue;
      
      const stats = statsByInv[invId];
      const currentStage = invEtapas[invId];
      stats.total_produtos++;

      const productId = row.produto_id;
      const historicoContagens = stats.countMap[productId] || {};
      const countedStages = Object.keys(historicoContagens).map(Number).sort((a,b)=>a-b);
      
      const saldoErp = roundValue(row.saldo_erp);
      const hadAnyCount = countedStages.length > 0;
      
      const latestStage = countedStages[countedStages.length - 1] || 0;
      const previousStage = currentStage > 1 ? currentStage - 1 : null;
      const latestCount = latestStage ? historicoContagens[latestStage] : 0;
      const currentStageCount = historicoContagens[currentStage];
      const previousCount = previousStage ? historicoContagens[previousStage] : undefined;
      
      const previousDifference = previousCount === undefined ? 0 : roundValue(previousCount - saldoErp);
      const requiresRecount = previousStage !== null && previousCount !== undefined && previousDifference !== 0;
      const recountPending = requiresRecount && currentStageCount === undefined;
      const totalContado = currentStageCount !== undefined ? currentStageCount : latestCount;
      const diferenca = roundValue(totalContado - saldoErp);

      if (hadAnyCount) {
        stats.produtos_contados++;
      } else {
        stats.produtos_pendentes++;
      }

      if (recountPending) {
        stats.produtos_aguardando_recontagem++;
      } else if (hadAnyCount && diferenca === 0) {
        stats.produtos_batidos++;
      } else if (hadAnyCount) {
        stats.produtos_divergentes++;
      }
    }

    const enrichedInventories = inventarios.map((inventario) => {
      const invId = inventario.id;
      const stats = statsByInv[invId];
      const baseData = inventario.toJSON ? inventario.toJSON() : inventario;
      if (typeof baseData.locais_contagem === 'string') {
        baseData.locais_contagem = JSON.parse(baseData.locais_contagem);
      }
      const progresso = stats.total_produtos ? Number(((stats.produtos_contados / stats.total_produtos) * 100).toFixed(1)) : 0;

      return {
        ...baseData,
        total_produtos: stats.total_produtos,
        produtos_contados: stats.produtos_contados,
        produtos_pendentes: stats.produtos_pendentes,
        produtos_batidos: stats.produtos_batidos,
        produtos_divergentes: stats.produtos_divergentes,
        produtos_aguardando_recontagem: stats.produtos_aguardando_recontagem,
        total_registros_contagem: stats.total_registros_contagem,
        usuarios_ativos: stats.usuarios_ativos,
        progresso_percentual: progresso
      };
    });

    res.json(enrichedInventories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getInventoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const { empresa_id, id: usuario_id, nivel_acesso } = req.user;

    const inventario = await Inventario.findOne({
      where: { id, empresa_id }
    });

    if (!inventario) {
      return res.status(404).json({ message: 'Inventory not found' });
    }

    let local_atribuido = null;
    const usuarios = await inventario.getUsuarios({ where: { id: usuario_id } });
    const isAssociated = usuarios.length > 0;
    
    if (isAssociated) {
      local_atribuido = usuarios[0].InventarioUsuario?.local_atribuido || null;
    }

    if (nivel_acesso === 'operador' || nivel_acesso === 'admin_inventario') {
      if (!isAssociated) {
        return res.status(403).json({ message: 'Access denied to this inventory' });
      }
    }

    res.json({ 
      ...inventario.toJSON(), 
      locais_contagem: typeof inventario.locais_contagem === 'string' ? JSON.parse(inventario.locais_contagem) : inventario.locais_contagem,
      local_atribuido 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateInventoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, validade_obrigatoria, isReopen } = req.body;
    const { empresa_id } = req.user;

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const inventario = await Inventario.findOne({
      where: { id, empresa_id }
    });

    if (!inventario) {
      return res.status(404).json({ message: 'Inventory not found' });
    }

    // Se estiver atualizando apenas a validade obrigatória
    if (validade_obrigatoria !== undefined && !status) {
      inventario.validade_obrigatoria = validade_obrigatoria;
      await inventario.save();
      
      const io = getIO();
      io.to(`inventory_${id}`).emit('inventoryUpdate', { type: 'settings_changed', validade_obrigatoria });
      return res.json(inventario);
    }

    const allowedStatuses = ['criado', 'em_contagem', 'em_recontagem', 'finalizado'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid inventory status' });
    }

    const currentStatus = inventario.status;
    if (currentStatus === status) {
      return res.status(400).json({ message: 'O inventario ja esta neste status.' });
    }

    const allowedTransitions = INVENTORY_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({
        message: `Transicao invalida de status: ${currentStatus} -> ${status}.`
      });
    }

    if (status === 'em_recontagem' && inventario.status !== 'em_recontagem') {
      if (!isReopen) {
        const { summary } = await buildInventoryInsights(inventario);
        if (!summary.produtos_divergentes) {
          return res.status(400).json({ message: 'Nao existem divergencias para iniciar uma recontagem.' });
        }

        inventario.etapa_contagem = (inventario.etapa_contagem || 1) + 1;
      }
    }

    inventario.status = status;

    if (status === 'finalizado') {
      inventario.data_fim = new Date();
    } else {
      inventario.data_fim = null;
    }

    await inventario.save();

    const io = getIO();
    io.to(`inventory_${id}`).emit('inventoryUpdate', { type: 'status_changed', status });
    io.emit('dashboardUpdate');

    res.json(inventario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getInventoryDashboard = async (req, res) => {
  try {
    const { id } = req.params;
    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const { summary, recentActivity } = await buildInventoryInsights(inventario);

    res.json({
      inventario,
      stats: {
        totalProdutos: summary.total_produtos,
        totalContagens: summary.total_registros_contagem,
        totalDivergencias: summary.produtos_divergentes,
        totalPendentes: summary.produtos_pendentes,
        totalBatidos: summary.produtos_batidos,
        totalAguardandoRecontagem: summary.produtos_aguardando_recontagem,
        usuariosAtivos: summary.usuarios_ativos,
        progresso: summary.progresso
      },
      recentActivity,
      summary
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getInventoryProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;
    const { busca, categoria, codigo } = req.query;
    const apenasDivergentes = req.query.apenasDivergentes !== 'false';
    const assignedProductIds = req.user.nivel_acesso === 'operador'
      ? await getAssignedProductIdsForUser({ inventoryId: id, userId: req.user.id })
      : [];

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const produtoWhere = {};

    if (codigo) {
      const exactCode = String(codigo).replace(/[\u0000-\u001F\u007F]/g, '').trim();
      const exactCodeCandidates = [exactCode];
      if (/^\d{12}$/.test(exactCode)) exactCodeCandidates.push(`0${exactCode}`);
      if (/^0\d{12}$/.test(exactCode)) exactCodeCandidates.push(exactCode.slice(1));

      produtoWhere[Op.or] = [
        { sku: { [Op.in]: exactCodeCandidates } },
        { codigo_barras: { [Op.in]: exactCodeCandidates } },
        { codigo_referencia: { [Op.in]: exactCodeCandidates } }
      ];
    } else if (busca) {
      produtoWhere[Op.or] = [
        { nome: { [Op.like]: `%${busca}%` } },
        { sku: { [Op.like]: `%${busca}%` } },
        { codigo_barras: { [Op.like]: `%${busca}%` } },
        { codigo_referencia: { [Op.like]: `%${busca}%` } }
      ];
    }

    if (categoria) {
      produtoWhere.categoria = categoria;
    }

    const estoqueWhere = { inventario_id: id };
    if (assignedProductIds.length > 0) {
      estoqueWhere.produto_id = { [Op.in]: assignedProductIds };
    }

    const { reportRows } = await buildInventoryInsights(inventario);

    if (inventario.status === 'em_recontagem' && apenasDivergentes) {
      const recountPendingProductIds = reportRows
        .filter((row) => row.recontagem_pendente || row.status === 'pendente')
        .map((row) => row.produto_id);

      if (recountPendingProductIds.length === 0) {
        return res.json({
          total: 0,
          produtos: [],
          totalPages: 0,
          currentPage: page
        });
      }

      const productIdsToUse = assignedProductIds.length > 0
        ? recountPendingProductIds.filter((produtoId) => assignedProductIds.includes(produtoId))
        : recountPendingProductIds;

      if (productIdsToUse.length === 0) {
        return res.json({
          total: 0,
          produtos: [],
          totalPages: 0,
          currentPage: page
        });
      }

      estoqueWhere.produto_id = { [Op.in]: productIdsToUse };
    }

    const { count, rows } = await EstoqueImportado.findAndCountAll({
      where: estoqueWhere,
      include: [{
        model: Produto,
        where: produtoWhere,
        attributes: ['id', 'sku', 'nome', 'categoria', 'unidade_medida', 'codigo_barras', 'codigo_referencia', 'fator_conversao']
      }],
      order: [[Produto, 'nome', 'ASC']],
      limit,
      offset
    });

    const rowsWithCounts = rows.map(row => {
      const rowData = row.toJSON();
      const insight = reportRows.find(r => r.produto_id === rowData.produto_id);
      rowData.total_contado = insight ? insight.total_contado : 0;
      rowData.diferenca = insight ? insight.diferenca : (rowData.total_contado - rowData.saldo_erp);
      rowData.validades_contadas = insight ? insight.validades_contadas : [];
      rowData.locais_contados = insight ? insight.locais_contados : [];
      return rowData;
    });

    res.json({
      total: count,
      produtos: rowsWithCounts,
      totalPages: count > 0 ? Math.ceil(count / limit) : 0,
      currentPage: page,
      validade_obrigatoria: inventario.validade_obrigatoria
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.exportUserHistory = async (req, res) => {
  try {
    const { id: inventario_id, usuario_id } = req.params;
    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: inventario_id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const usuario = await Usuario.findByPk(usuario_id);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario não encontrado.' });
    }

    const historico = await Contagem.findAll({
        where: { inventario_id, usuario_id },
        include: [{ model: Produto, attributes: ['sku', 'nome', 'codigo_barras', 'unidade_medida'] }],
        order: [['data_hora', 'DESC']]
      });

    const exportData = historico.map((item) => ({
        'Data / Hora': new Date(item.data_hora).toLocaleString('pt-BR'),
        'SKU (Cód. Interno)': item.Produto?.sku || '',
        'EAN (Cód. Barras)': item.Produto?.codigo_barras || '',
        'Produto': item.Produto?.nome || '',
        'Unidade': item.Produto?.unidade_medida || 'UN',
        'Quantidade Contada': item.quantidade_contada,
        'Validade': item.validade ? new Date(item.validade).toLocaleDateString('pt-BR') : '',
        'Local': item.local || '',
        'Observação': item.observacao || ''
      }));

    const format = String(req.query.format || 'xlsx').toLowerCase();

    if (exportData.length === 0) {
      return res.status(400).json({ message: 'Nenhuma contagem encontrada para este usuário.' });
    }

    if (format === 'xlsx') {
      const worksheet = xlsx.utils.json_to_sheet(exportData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Historico de Contagens');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="historico_${usuario.nome.replace(/\s+/g, '_')}_inv_${inventario_id}.xlsx"`
      );
      return res.send(buffer);
    }

    return res.status(400).json({ message: 'Formato não suportado' });
  } catch (error) {
    console.error('Error exporting user history:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getInventoryReport = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status || '';
    const searchQuery = String(req.query.busca || '').trim().toLowerCase();
    const categoriaFilter = req.query.categoria || '';
    const tipoDiferencaFilter = req.query.tipoDiferenca || '';
    const usuarioIdFilter = req.query.usuarioId || '';

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const { reportRows, summary, recentActivity } = await buildInventoryInsights(inventario);

    let filteredRows = reportRows;

    if (statusFilter) {
      filteredRows = filteredRows.filter((row) => row.status === statusFilter);
    }

    if (categoriaFilter) {
      filteredRows = filteredRows.filter((row) => row.produto?.categoria === categoriaFilter);
    }

    if (tipoDiferencaFilter) {
      filteredRows = filteredRows.filter((row) => {
        if (tipoDiferencaFilter === 'positiva') return row.diferenca > 0;
        if (tipoDiferencaFilter === 'negativa') return row.diferenca < 0;
        if (tipoDiferencaFilter === 'exata') return row.diferenca === 0;
        return true;
      });
    }

    if (usuarioIdFilter) {
      filteredRows = filteredRows.filter((row) => String(row.ultimo_registro?.usuario_id) === String(usuarioIdFilter));
    }

    if (searchQuery) {
      filteredRows = filteredRows.filter((row) => {
        const produto = row.produto || {};
        return [produto.nome, produto.sku, produto.codigo_barras, produto.codigo_referencia]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchQuery));
      });
    }

    // Extract unique categories and users for frontend filter options
    const availableCategories = [...new Set(reportRows.map(r => r.produto?.categoria).filter(Boolean))].sort();
    const availableUsersMap = new Map();
    reportRows.forEach(r => {
      if (r.ultimo_registro?.usuario_id) {
        availableUsersMap.set(r.ultimo_registro.usuario_id, r.ultimo_registro.usuario_nome);
      }
    });
    const availableUsers = Array.from(availableUsersMap.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));

    const paginatedRows = filteredRows.slice(offset, offset + limit);

    res.json({
      total: filteredRows.length,
      totalGeral: reportRows.length,
      relatorio: paginatedRows,
      totalPages: filteredRows.length > 0 ? Math.ceil(filteredRows.length / limit) : 0,
      currentPage: page,
      etapa_atual: inventario.etapa_contagem,
      summary,
      recentActivity,
      filtrosDestaque: {
        categorias: availableCategories,
        usuarios: availableUsers
      },
      filtros: {
        status: statusFilter || null,
        busca: searchQuery || null,
        categoria: categoriaFilter || null,
        tipoDiferenca: tipoDiferencaFilter || null,
        usuarioId: usuarioIdFilter || null
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getABCCurve = async (req, res) => {
  try {
    const { id } = req.params;
    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const { reportRows } = await buildInventoryInsights(inventario);

    const validRows = reportRows.filter(row => row.valor_total_erp > 0);
    validRows.sort((a, b) => b.valor_total_erp - a.valor_total_erp);

    const totalValue = validRows.reduce((sum, row) => sum + row.valor_total_erp, 0);

    let accumulatedValue = 0;
    const abcCurve = validRows.map(row => {
      accumulatedValue += row.valor_total_erp;
      const accumulatedPercentage = (accumulatedValue / totalValue) * 100;
      
      let classe = 'C';
      if (accumulatedPercentage <= 80) classe = 'A';
      else if (accumulatedPercentage <= 95) classe = 'B';

      return {
          produto_id: row.produto_id,
          sku: row.produto?.sku,
          codigo_referencia: row.produto?.codigo_referencia,
          nome: row.produto?.nome,
          categoria: row.produto?.categoria,
          unidade_medida: row.produto?.unidade_medida || 'UN',
          saldo_erp: row.saldo_erp,
          preco_custo: row.produto?.preco_custo || 0,
          preco_venda: row.produto?.preco_venda || 0,
          valor_total_erp: row.valor_total_erp,
          porcentagem_acumulada: accumulatedPercentage,
          classe
        };
    });

    const summary = {
      A: abcCurve.filter(item => item.classe === 'A').length,
      B: abcCurve.filter(item => item.classe === 'B').length,
      C: abcCurve.filter(item => item.classe === 'C').length,
      total_valor: totalValue
    };

    res.json({ curve: abcCurve, summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getOperatorProductivity = async (req, res) => {
  try {
    const { id } = req.params;
    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }
    
    const countEvents = await Contagem.findAll({
      where: { inventario_id: id },
      include: [
        { model: Usuario, attributes: ['id', 'nome', 'email'] },
        { model: Produto, attributes: ['id', 'preco_custo', 'preco_venda'] }
      ]
    });

    const operatorMap = new Map();

    countEvents.forEach(event => {
      const userId = event.usuario_id;
      if (!operatorMap.has(userId)) {
        operatorMap.set(userId, {
          usuario_id: userId,
          nome: event.Usuario?.nome || 'Desconhecido',
          itens_auditados: 0,
          valor_auditado: 0
        });
      }

      const op = operatorMap.get(userId);
      const qtd = toNumber(event.quantidade_contada);
      const preco_custo = toNumber(event.Produto?.preco_custo || 0);
      
      op.itens_auditados += qtd;
      op.valor_auditado += (qtd * preco_custo);
    });

    const productivity = Array.from(operatorMap.values()).sort((a, b) => b.valor_auditado - a.valor_auditado);

    res.json(productivity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.exportLossReport = async (req, res) => {
  try {
    const { id } = req.params;
    const format = String(req.query.format || 'csv').toLowerCase();

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const { reportRows } = await buildInventoryInsights(inventario);

    const lossRows = reportRows.filter(row => row.diferenca < 0);

    const exportData = lossRows.map((row) => ({
        SKU: row.produto?.sku || '',
        'Codigo de Referencia': row.produto?.codigo_referencia || '',
        'Codigo de Barras': row.produto?.codigo_barras || '',
        Nome: row.produto?.nome || '',
        Categoria: row.produto?.categoria || '',
        Unidade: row.produto?.unidade_medida || 'UN',
        'Saldo ERP': row.saldo_erp,
        'Total Contado': row.total_contado,
      'Diferenca Qtd': row.diferenca,
      'Preço/Custo': row.produto?.preco_custo || 0,
      'Preço/Venda': row.produto?.preco_venda || 0,
      'Valor Perda (Custo)': row.valor_diferenca,
      'Valor Perda (Venda)': roundValue(row.diferenca * (row.produto?.preco_venda || 0)),
      'Observacao': row.ultimo_registro?.observacao || ''
    }));

    if (exportData.length === 0) {
      return res.status(400).json({ message: 'Nenhuma divergencia negativa encontrada para exportar.' });
    }

    if (format === 'xlsx') {
      const worksheet = xlsx.utils.json_to_sheet(exportData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Termo de Quebra');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="termo_quebra_${id}.xlsx"`);
      return res.send(buffer);
    }

    const headers = Object.keys(exportData[0]);
    const csvLines = [
      headers.join(';'),
      ...exportData.map((row) => headers.map((header) => escapeCsv(row[header])).join(';'))
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="termo_quebra_${id}.csv"`);
    return res.send(`\uFEFF${csvLines.join('\n')}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.exportAdjustedSpreadsheet = async (req, res) => {
  try {
    const { id } = req.params;
    const format = String(req.query.format || 'xlsx').toLowerCase();

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const { reportRows } = await buildInventoryInsights(inventario);

    // Mapeamento que reflete a estrutura da importação original, 
    // porém substituindo o Saldo ERP pela quantidade Total Contada
    const exportRows = [];
    
    for (const row of reportRows) {
      const baseRow = {
        SKU: row.produto?.sku || '',
        'Codigo de Referencia': row.produto?.codigo_referencia || '',
        Nome: row.produto?.nome || '',
        Categoria: row.produto?.categoria || '',
        'Fator Conversao': row.fator_conversao ?? '',
        Unidade: row.produto?.unidade_medida || 'UN',
        'Codigo de Barras': row.produto?.codigo_barras || '',
        Observacao: row.ultimo_registro?.observacao || '',
        'Preco Custo': row.produto?.preco_custo || 0,
        'Preco Venda': row.produto?.preco_venda || 0
      };

      if (row.validades_contadas && row.validades_contadas.length > 0) {
        for (const v of row.validades_contadas) {
          exportRows.push({
            ...baseRow,
            'Saldo ERP': v.quantidade, // Exporta a coluna com o nome original da importação, mas com o valor contato para essa validade
            Validade: new Date(v.data).toLocaleDateString('pt-BR')
          });
        }
      } else {
        exportRows.push({
          ...baseRow,
          'Saldo ERP': row.total_contado,
          Validade: ''
        });
      }
    }

    if (format === 'xlsx') {
      const worksheet = xlsx.utils.json_to_sheet(exportRows);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Estoque Ajustado');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventario_${id}_ajustado.xlsx"`
      );
      return res.send(buffer);
    }

    const headers = Object.keys(exportRows[0] || {
      SKU: '',
      'Codigo de Referencia': '',
      Nome: '',
      Categoria: '',
      'Saldo Ajustado': '',
      'Fator Conversao': '',
      Unidade: '',
      'Codigo de Barras': '',
      Validade: '',
      'Preco Custo': '',
      'Preco Venda': ''
    });

    const csvLines = [
      headers.join(';'),
      ...exportRows.map((row) => headers.map((header) => escapeCsv(row[header])).join(';'))
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inventario_${id}_ajustado.csv"`
    );
    return res.send(`\uFEFF${csvLines.join('\n')}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.exportInventoryReport = async (req, res) => {
  try {
    const { id } = req.params;
    const format = String(req.query.format || 'csv').toLowerCase();

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const { reportRows } = await buildInventoryInsights(inventario);
    const maxStage = Math.max(
      inventario.etapa_contagem || 1,
      ...reportRows.map((row) => row.ultima_etapa_contada || 1)
    );

    let locaisContagem = [];
    try {
      locaisContagem = typeof inventario.locais_contagem === 'string' ? JSON.parse(inventario.locais_contagem) : (inventario.locais_contagem || []);
    } catch (e) {
      locaisContagem = [];
    }

    const exportRows = reportRows.map((row) => {
      const baseRow = {
        SKU: row.produto?.sku || '',
        'Codigo de Referencia': row.produto?.codigo_referencia || '',
        'Codigo de Barras': row.produto?.codigo_barras || '',
        Nome: row.produto?.nome || '',
        Categoria: row.produto?.categoria || '',
        Unidade: row.produto?.unidade_medida || '',
        'Preço/Custo': row.produto?.preco_custo || 0,
        'Preço/Venda': row.produto?.preco_venda || 0,
        'Saldo ERP': row.saldo_erp,
        'Fator Conversao': row.fator_conversao ?? ''
      };

      for (let stage = 1; stage <= maxStage; stage += 1) {
        baseRow[`${stage}a Contagem`] = row.historico_contagens?.[stage] ?? '';
      }

      baseRow['Total Validado'] = row.total_contado;
      baseRow.Diferenca = row.diferenca;
      baseRow['Valor Total ERP'] = row.valor_total_erp;
      baseRow['Valor Total Contado'] = row.valor_total_contado;
      baseRow['Valor Diferença'] = row.valor_diferenca;
      baseRow['Valor Venda ERP'] = row.valor_venda_erp;
      baseRow['Valor Venda Contado'] = row.valor_venda_contado;
      baseRow['Valor Diferença Venda'] = roundValue(row.diferenca * (row.produto?.preco_venda || 0));
      baseRow.Status = statusLabelMap[row.status] || row.status;
      baseRow['Ultimo Contador'] = row.ultimo_registro?.usuario_nome || '';
      baseRow['Ultima Data'] = row.ultimo_registro?.data_hora || '';
      baseRow['Observacao'] = row.ultimo_registro?.observacao || '';
      baseRow['Validades'] = row.validades_contadas?.map(v => `${new Date(v.data).toLocaleDateString('pt-BR')} (${v.quantidade} un)`).join(' | ') || '';
      baseRow['Locais de Contagem'] = row.locais_contados?.map(l => `${l.nome} (${l.quantidade} un)`).join(' | ') || '';

      locaisContagem.forEach(local => {
         const localObj = row.locais_contados?.find(l => l.nome === local);
         baseRow[`Setor: ${local}`] = localObj ? localObj.quantidade : 0;
      });

      const localNaoInformado = row.locais_contados?.find(l => l.nome === 'Não informado');
      if (localNaoInformado) {
          baseRow[`Setor: Não informado`] = localNaoInformado.quantidade;
      }

      return baseRow;
    });

    if (format === 'xlsx') {
      const worksheet = xlsx.utils.json_to_sheet(exportRows);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Relatorio');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventario_${id}_relatorio.xlsx"`
      );
      return res.send(buffer);
    }

    const fallbackHeaders = {
      SKU: '',
      'Codigo de Referencia': '',
      'Codigo de Barras': '',
      Nome: '',
      Categoria: '',
      Unidade: '',
      'Preço/Custo': '',
      'Preço/Venda': '',
      'Saldo ERP': '',
      'Fator Conversao': '',
      '1a Contagem': '',
      'Total Validado': '',
      Diferenca: '',
      'Valor Total ERP': '',
      'Valor Total Contado': '',
      'Valor Diferença': '',
      'Valor Venda ERP': '',
      'Valor Venda Contado': '',
      'Valor Diferença Venda': '',
      Status: '',
      'Ultimo Contador': '',
      'Ultima Data': '',
      Observacao: '',
      Validades: '',
      'Locais de Contagem': ''
    };

    locaisContagem.forEach(local => {
      fallbackHeaders[`Setor: ${local}`] = '';
    });
    fallbackHeaders[`Setor: Não informado`] = '';

    const headers = Object.keys(exportRows[0] || fallbackHeaders);

    const csvLines = [
      headers.join(';'),
      ...exportRows.map((row) => headers.map((header) => escapeCsv(row[header])).join(';'))
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="inventario_${id}_relatorio.csv"`);
    return res.send(`\uFEFF${csvLines.join('\n')}`);
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ message: 'Server error during export' });
  }
};

exports.getInventoryUsers = async (req, res) => {
    try {
        const { id } = req.params;
        const { empresa_id } = req.user;

        const managementError = await verifyInventoryManagementAccess(req.user, id);
        if (managementError) {
          return res.status(managementError.status).json({ message: managementError.message });
        }

        const inventario = await Inventario.findOne({ where: { id, empresa_id } });
        if (!inventario) return res.status(404).json({ message: 'Inventory not found' });

        const usuarios = await inventario.getUsuarios({
            attributes: ['id', 'nome', 'email', 'nivel_acesso']
        });

        const connectionStatusMap = getInventoryUserConnectionStatus(id);
        const enrichedUsers = usuarios.map((usuario) => {
          const userData = usuario.toJSON ? usuario.toJSON() : usuario;
          const localAtribuido = userData.InventarioUsuario?.local_atribuido || null;

          const connectionStatus = connectionStatusMap.get(String(userData.id)) || {
            online: false,
            aparelhos_conectados: 0,
            ultima_conexao_em: null
          };

          return {
            ...userData,
            local_atribuido: localAtribuido,
            status_conexao: connectionStatus.online ? 'conectado' : 'desconectado',
            online: connectionStatus.online,
            aparelhos_conectados: connectionStatus.aparelhos_conectados,
            ultima_conexao_em: connectionStatus.ultima_conexao_em
          };
        });

        res.json(enrichedUsers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getInventoryReleaseOptions = async (req, res) => {
  try {
    const { id } = req.params;

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const [usuarios, insights, releaseRows] = await Promise.all([
      inventario.getUsuarios({
        attributes: ['id', 'nome', 'email', 'nivel_acesso'],
        order: [['nome', 'ASC']]
      }),
      buildInventoryInsights(inventario),
      LiberacaoProduto.findAll({
        where: { inventario_id: id },
        include: [
          {
            model: Usuario,
            as: 'usuarioDestino',
            attributes: ['id', 'nome', 'email']
          },
          {
            model: Produto,
            attributes: ['id', 'sku', 'nome', 'categoria']
          }
        ],
        order: [[{ model: Usuario, as: 'usuarioDestino' }, 'nome', 'ASC'], [{ model: Produto }, 'nome', 'ASC']]
      })
    ]);

    const reportMap = new Map(
      insights.reportRows.map((row) => [
        row.produto_id,
        {
          status: row.status,
          categoria: row.produto?.categoria || null,
          nome: row.produto?.nome || null
        }
      ])
    );

    const releaseSummary = groupReleaseSummaryByUser(
      releaseRows.map((row) => {
        const payload = row.toJSON();
        payload.status_contagem_atual = reportMap.get(row.produto_id)?.status || null;
        return payload;
      })
    );

    const categorias = [...new Set(
      insights.reportRows
        .map((row) => row.produto?.categoria)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const liberacoesPorProduto = new Map();
    for (const row of releaseRows) {
      if (!liberacoesPorProduto.has(row.produto_id)) {
        liberacoesPorProduto.set(row.produto_id, new Set());
      }
      liberacoesPorProduto.get(row.produto_id).add(row.usuario_id);
    }

    const produtos = insights.reportRows
      .map((row) => ({
        produto_id: row.produto_id,
        sku: row.produto?.sku || '',
        codigo_referencia: row.produto?.codigo_referencia || '',
        codigo_barras: row.produto?.codigo_barras || '',
        nome: row.produto?.nome || '',
        categoria: row.produto?.categoria || '',
        status: row.status,
        saldo_erp: row.saldo_erp,
        total_contado: row.total_contado,
        diferenca: row.diferenca,
        ultimo_registro_usuario_id: row.ultimo_registro?.usuario_id || null,
        liberado_para: Array.from(liberacoesPorProduto.get(row.produto_id) || [])
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    res.json({
      usuarios,
      categorias,
      statusDisponiveis: [
        { value: 'pendente', label: statusLabelMap.pendente },
        { value: 'ok', label: statusLabelMap.ok },
        { value: 'divergente', label: statusLabelMap.divergente },
        { value: 'aguarda_recontagem', label: statusLabelMap.aguarda_recontagem }
      ],
      produtos,
      liberacoes: releaseSummary
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.saveInventoryRelease = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = Number.parseInt(req.body.usuario_id, 10);
    const categorias = Array.isArray(req.body.categorias) ? req.body.categorias.filter(Boolean) : [];
    const statusContagem = Array.isArray(req.body.status_contagem)
      ? req.body.status_contagem.filter(Boolean)
      : [];
    const produtoIds = Array.isArray(req.body.produto_ids)
      ? req.body.produto_ids.map((value) => Number.parseInt(value, 10)).filter(Number.isInteger)
      : [];
    const apenas_contados_pelo_usuario = req.body.apenas_contados_pelo_usuario === true;

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    if (!usuarioId) {
      return res.status(400).json({ message: 'Selecione um usuario para receber a liberacao.' });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { inventario } = access;
    const usuarioDestino = await Usuario.findOne({
      where: {
        id: usuarioId,
        empresa_id: req.user.empresa_id
      }
    });

    if (!usuarioDestino) {
      return res.status(404).json({ message: 'Usuario de destino nao encontrado.' });
    }

    const isAssociated = await inventario.hasUsuario(usuarioDestino.id);
    if (!isAssociated) {
      return res.status(400).json({ message: 'O usuario precisa estar vinculado a este inventario antes da liberacao.' });
    }

    const { reportRows } = await buildInventoryInsights(inventario);
    const selectedIds = new Set(produtoIds);

    for (const row of reportRows) {
      if (apenas_contados_pelo_usuario && row.ultimo_registro?.usuario_id !== usuarioId) {
        continue;
      }

      const matchesCategory = categorias.length > 0 && categorias.includes(row.produto?.categoria || '');
      const matchesStatus = matchesReleaseStatusFilter(row, statusContagem);

      if (matchesCategory || matchesStatus) {
        selectedIds.add(row.produto_id);
      }
    }

    if (!selectedIds.size) {
      return res.status(400).json({
        message: 'Selecione ao menos um item, categoria ou status para liberar produtos.'
      });
    }

    const validProductIds = new Set(reportRows.map((row) => row.produto_id));
    const finalProductIds = [...selectedIds].filter((produtoId) => validProductIds.has(produtoId));

    if (!finalProductIds.length) {
      return res.status(400).json({ message: 'Nenhum produto valido foi encontrado para esta liberacao.' });
    }

    let origem = 'manual';
    if (categorias.length && statusContagem.length) {
      origem = 'mista';
    } else if (categorias.length) {
      origem = produtoIds.length ? 'mista' : 'categoria';
    } else if (statusContagem.length) {
      origem = produtoIds.length ? 'mista' : 'status';
    }

    await LiberacaoProduto.destroy({
      where: {
        inventario_id: id,
        usuario_id: usuarioDestino.id
      }
    });

    await LiberacaoProduto.bulkCreate(
      finalProductIds.map((produtoId) => ({
        inventario_id: id,
        usuario_id: usuarioDestino.id,
        produto_id: produtoId,
        liberado_por_usuario_id: req.user.id,
        origem
      }))
    );

    const io = getIO();
    io.to(`inventory_${id}`).emit('inventoryUpdate', { type: 'release_changed' });

    res.status(201).json({
      message: 'Liberacao registrada com sucesso.',
      usuario_id: usuarioDestino.id,
      total_produtos_liberados: finalProductIds.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.clearInventoryRelease = async (req, res) => {
  try {
    const { id, usuarioId } = req.params;

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const access = await getInventoryWithAccess({ inventoryId: id, user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    await LiberacaoProduto.destroy({
      where: {
        inventario_id: id,
        usuario_id: usuarioId
      }
    });

    const io = getIO();
    io.to(`inventory_${id}`).emit('inventoryUpdate', { type: 'release_changed' });

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addInventoryUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, senha, nivel_acesso } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const { empresa_id } = req.user;

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Informe um email valido para o operador.' });
    }

    const inventario = await Inventario.findOne({ where: { id, empresa_id } });
    if (!inventario) return res.status(404).json({ message: 'Inventory not found' });

    let usuario = await Usuario.findOne({ where: { email: normalizedEmail } });

    if (!usuario) {
      if (!nome || !senha) {
        return res.status(400).json({ message: 'Nome e senha sao obrigatorios para criar um novo operador.' });
      }

      const salt = await bcrypt.genSalt(10);
      const senha_hash = await bcrypt.hash(senha, salt);

      usuario = await Usuario.create({
        nome,
        email: normalizedEmail,
        senha_hash,
        nivel_acesso: nivel_acesso || 'operador',
        empresa_id
      });
    } else if (usuario.empresa_id !== empresa_id) {
      return res.status(400).json({
        message: 'Ja existe um usuario com este email vinculado a outra empresa.'
      });
    }

    const alreadyAssociated = await inventario.hasUsuario(usuario.id);
    if (alreadyAssociated) {
      return res.status(400).json({ message: 'Este usuario ja esta vinculado a este inventario.' });
    }

    await inventario.addUsuario(usuario);

    const io = getIO();
    io.to(`inventory_${id}`).emit('inventoryUpdate', { type: 'user_added' });

    res.status(201).json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      nivel_acesso: usuario.nivel_acesso
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateInventoryUserLocal = async (req, res) => {
  try {
    const { id, usuarioId } = req.params;
    const { local_atribuido } = req.body;
    
    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    await InventarioUsuario.update(
      { local_atribuido: local_atribuido || null },
      { where: { inventario_id: id, usuario_id: usuarioId } }
    );

    const io = getIO();
    io.to(`inventory_${id}`).emit('inventoryUpdate', { type: 'user_updated' });

    res.json({ message: 'Local atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getValidadeReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { empresa_id } = req.user;

    const inventario = await Inventario.findOne({ where: { id, empresa_id } });
    if (!inventario) return res.status(404).json({ message: 'Inventory not found' });

    const { reportRows } = await buildInventoryInsights(inventario);
    const insightsMap = new Map();
    reportRows.forEach(row => {
      insightsMap.set(row.produto_id, {
        saldo_erp: row.saldo_erp,
        total_contado: row.total_contado,
        valor_total_erp: row.valor_total_erp,
        valor_total_contado: row.valor_total_contado,
        preco_custo: row.produto?.preco_custo || 0,
        preco_venda: row.produto?.preco_venda || 0
      });
    });

    // Buscar produtos com validade (seja do EstoqueImportado ou da Contagem)
    const estoque = await EstoqueImportado.findAll({
      where: { inventario_id: id },
      include: [{ model: Produto, attributes: ['id', 'sku', 'codigo_referencia', 'nome', 'codigo_barras', 'categoria', 'preco_custo', 'preco_venda'] }]
    });

    const validadeMap = new Map();

    // 1. Populate from reportRows (already grouped and scoped to latest stage)
    reportRows.forEach(row => {
      if (row.validades_contadas && row.validades_contadas.length > 0) {
        row.validades_contadas.forEach(v => {
          const validadeStr = new Date(v.data).toISOString().split('T')[0];
          const key = `${row.produto_id}_${validadeStr}`;
          validadeMap.set(key, {
            produto: row.produto,
            validade: new Date(v.data),
            origem: 'contagem',
            quantidade: v.quantidade
          });
        });
      }
    });

    // 2. Add from EstoqueImportado ONLY if the product has NO validade from contagens
    estoque.forEach(item => {
      if (item.validade) {
        const hasContagem = Array.from(validadeMap.values()).some(v => v.produto.id === item.produto_id && v.origem === 'contagem');
        
        if (!hasContagem) {
          const validadeStr = new Date(item.validade).toISOString().split('T')[0];
          const key = `${item.produto_id}_${validadeStr}`;
          
          if (!validadeMap.has(key)) {
            validadeMap.set(key, {
              produto: item.Produto,
              validade: new Date(item.validade),
              origem: 'importacao',
              quantidade: Number(item.saldo_erp || 0)
            });
          }
        }
      }
    });

    const hoje = new Date();
    const relatorio = {
      vencidos: [],
      vence_30_dias: [],
      vence_90_dias: [],
      vence_120_dias: [],
      vence_mais_120_dias: []
    };

    Array.from(validadeMap.values()).forEach(item => {
      const diffTime = item.validade.getTime() - hoje.getTime();
      const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const insights = insightsMap.get(item.produto.id) || {};
      const qtd = item.quantidade; // Use the specific quantity for this validity
      const preco_custo = item.produto.preco_custo || insights.preco_custo || 0;
      const preco_venda = item.produto.preco_venda || insights.preco_venda || 0;
      const valor_total_custo = roundValue(qtd * preco_custo);
      const valor_total_venda = roundValue(qtd * preco_venda);

      const entry = {
        produto_id: item.produto.id,
        sku: item.produto.sku,
        codigo_referencia: item.produto.codigo_referencia,
        nome: item.produto.nome,
        codigo_barras: item.produto.codigo_barras,
        categoria: item.produto.categoria,
        validade: item.validade.toISOString().split('T')[0],
        dias_restantes: diffDias,
        origem: item.origem,
        quantidade: qtd,
        preco_custo: preco_custo,
        preco_venda: preco_venda,
        valor_total: valor_total_custo, // Mantendo valor_total para compatibilidade com frontend (que pode usar como custo)
        valor_total_custo: valor_total_custo,
        valor_total_venda: valor_total_venda
      };

      if (diffDias < 0) {
        relatorio.vencidos.push(entry);
      } else if (diffDias <= 30) {
        relatorio.vence_30_dias.push(entry);
      } else if (diffDias <= 90) {
        relatorio.vence_90_dias.push(entry);
      } else if (diffDias <= 120) {
        relatorio.vence_120_dias.push(entry);
      } else {
        relatorio.vence_mais_120_dias.push(entry);
      }
    });

    res.json(relatorio);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.submitCount = async (req, res) => {
  try {
    const { id } = req.params;
    const code = String(req.body.codigo_barras || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    const codeCandidates = [code];
    // Alguns leitores devolvem UPC-A (12 dígitos) para um EAN-13 iniciado em zero.
    if (/^\d{12}$/.test(code)) codeCandidates.push(`0${code}`);
    if (/^0\d{12}$/.test(code)) codeCandidates.push(code.slice(1));
    const rawQuantity = typeof req.body.quantidade_contada === 'string'
      ? req.body.quantidade_contada.trim().replace(',', '.')
      : req.body.quantidade_contada;
    const quantidadeContada = Number(rawQuantity);
    const { id: usuario_id, empresa_id, nivel_acesso } = req.user;

    if (rawQuantity === '' || rawQuantity === null || rawQuantity === undefined || !Number.isFinite(quantidadeContada)) {
      return res.status(400).json({ message: 'Informe uma quantidade numerica valida.' });
    }

    if (!isValidDateOnly(req.body.validade)) {
      return res.status(400).json({ message: 'Informe uma data de validade valida no formato DD/MM/AAAA.' });
    }

    const inventario = await Inventario.findOne({ where: { id, empresa_id } });
    if (!inventario) return res.status(404).json({ message: 'Inventory not found' });

    if (nivel_acesso === 'operador' || nivel_acesso === 'admin_inventario') {
      const isAssociated = await inventario.hasUsuario(usuario_id);
      if (!isAssociated) {
        return res.status(403).json({ message: 'Access denied to submit count to this inventory' });
      }
    }

    const clientOperationId = String(req.body.client_operation_id || '').trim().slice(0, 64) || null;
    if (clientOperationId) {
      const existingCount = await Contagem.findOne({
        where: {
          inventario_id: id,
          usuario_id,
          client_operation_id: clientOperationId
        }
      });

      if (existingCount) {
        return res.status(200).json({
          ...existingCount.toJSON(),
          duplicada: true,
          message: 'Contagem já sincronizada anteriormente.'
        });
      }
    }

    if (inventario.status !== 'em_contagem' && inventario.status !== 'em_recontagem') {
      return res.status(400).json({ message: 'Inventory is not open for counting' });
    }

    if (!code) {
      return res.status(400).json({ message: 'Informe um codigo de barras ou SKU valido.' });
    }

    if (quantidadeContada === 0) {
      return res.status(400).json({ message: 'A quantidade não pode ser zero.' });
    }

    const estoqueItem = await EstoqueImportado.findOne({
      where: { inventario_id: id },
      include: [{
        model: Produto,
        where: {
          empresa_id,
          [Op.or]: [
            { codigo_barras: { [Op.in]: codeCandidates } },
            { sku: { [Op.in]: codeCandidates } },
            { codigo_referencia: { [Op.in]: codeCandidates } }
          ]
        },
        attributes: ['id', 'sku', 'nome', 'categoria', 'codigo_referencia', 'codigo_barras', 'unidade_medida', 'fator_conversao']
      }]
    });

    if (!estoqueItem?.Produto) {
      return res.status(404).json({ message: 'Produto nao encontrado neste inventario com o codigo informado.' });
    }

    if (inventario.validade_obrigatoria && !req.body.validade) {
      // Permitir bypass da obrigatoriedade se o produto já tiver uma contagem com validade neste inventário
      const hasExistingValidadeCount = await Contagem.count({
        where: {
          inventario_id: id,
          produto_id: estoqueItem.Produto.id,
          validade: { [Op.ne]: null }
        }
      });
      
      if (hasExistingValidadeCount === 0) {
        return res.status(400).json({ message: 'A data de validade é obrigatória para a primeira contagem deste produto.' });
      }
    }

    if (nivel_acesso === 'operador') {
      const assignedProductIds = await getAssignedProductIdsForUser({ inventoryId: id, userId: usuario_id });
      if (assignedProductIds.length > 0 && !assignedProductIds.includes(estoqueItem.Produto.id)) {
        return res.status(403).json({
          message: 'Este produto nao foi liberado para este usuario neste inventario.'
        });
      }
    }

    if (inventario.status === 'em_recontagem') {
      const { reportRows } = await buildInventoryInsights(inventario);
      const targetRow = reportRows.find((row) => row.produto_id === estoqueItem.Produto.id);

      // Permite recontar se era divergente na etapa anterior (requer_recontagem)
      // OU se foi esquecido em todas as etapas anteriores (era pendente).
      const currentStage = inventario.etapa_contagem || 1;
      let contadoAntes = false;
      for (let s = 1; s < currentStage; s++) {
        if (targetRow?.historico_contagens && targetRow.historico_contagens[s] !== undefined) {
          contadoAntes = true;
          break;
        }
      }
      
      const eraPendente = !contadoAntes;

      if (!targetRow?.requer_recontagem && !eraPendente) {
        return res.status(400).json({ message: 'Somente produtos divergentes ou pendentes podem ser recontados nesta etapa.' });
      }
    }

    const numero_contagem = inventario.etapa_contagem || 1;
    const multiplicadorAplicado = resolveCountMultiplier({
      unidadeMedida: estoqueItem.Produto?.unidade_medida,
      fatorConversao: estoqueItem.fator_conversao ?? estoqueItem.Produto?.fator_conversao
    });
    const quantidadePadronizada = roundValue(quantidadeContada * multiplicadorAplicado);

    const contagem = await Contagem.create({
      inventario_id: id,
      produto_id: estoqueItem.Produto.id,
      usuario_id,
      numero_contagem,
      quantidade_contada: quantidadePadronizada,
      validade: normalizeValidityDate(req.body.validade),
      observacao: req.body.observacao || null,
      local_contagem: req.body.local || null,
      client_operation_id: clientOperationId
    });

    const io = getIO();
    io.to(`inventory_${id}`).emit('inventoryUpdate', { type: 'count_submitted', contagem });
    io.emit('dashboardUpdate');

    res.status(201).json({
      ...contagem.toJSON(),
      quantidade_informada: quantidadeContada,
      multiplicador_aplicado: multiplicadorAplicado,
      quantidade_padronizada: quantidadePadronizada
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.manualAdjustment = async (req, res) => {
  try {
    const { id } = req.params;
    const { produto_id, nova_quantidade, validade, observacao } = req.body;
    const { id: usuario_id, empresa_id } = req.user;

    const managementError = await verifyInventoryManagementAccess(req.user, id);
    if (managementError) {
      return res.status(managementError.status).json({ message: managementError.message });
    }

    const inventario = await Inventario.findOne({ where: { id, empresa_id } });
    if (!inventario) return res.status(404).json({ message: 'Inventory not found' });

    if (inventario.status === 'finalizado') {
      return res.status(400).json({ message: 'Não é possível ajustar produtos de um inventário finalizado.' });
    }

    const estoqueItem = await EstoqueImportado.findOne({
      where: { inventario_id: id, produto_id }
    });

    if (!estoqueItem) {
      return res.status(404).json({ message: 'Produto não encontrado neste inventário.' });
    }

    if (nova_quantidade < 0) {
      return res.status(400).json({ message: 'A quantidade ajustada não pode ser negativa.' });
    }

    // Para fazer o ajuste manual que sobreponha todas as outras contagens,
    // o mais seguro é criar uma contagem corretiva na etapa atual ou criar uma etapa nova de correção,
    // mas a abordagem mais simples e rastreável é apagar as contagens antigas desse produto
    // neste inventário e inserir o valor ajustado como uma única contagem oficial do administrador.
    
    await Contagem.destroy({
      where: {
        inventario_id: id,
        produto_id
      }
    });

    // Só insere nova contagem se a quantidade ajustada for > 0
    if (nova_quantidade > 0) {
      await Contagem.create({
        inventario_id: id,
        produto_id,
        usuario_id,
        numero_contagem: inventario.etapa_contagem || 1,
        quantidade_contada: nova_quantidade,
        validade: normalizeValidityDate(validade),
        observacao: observacao || null
      });
    }

    const io = getIO();
    io.to(`inventory_${id}`).emit('inventoryUpdate', { type: 'manual_adjustment' });
    io.emit('dashboardUpdate');

    res.status(200).json({ message: 'Ajuste manual realizado com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

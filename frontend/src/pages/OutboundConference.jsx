import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  History,
  Layers3,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Search,
  Send,
  ShoppingCart,
  CloudUpload,
  WifiOff
} from 'lucide-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import ScannerModal from '../components/ScannerModal';
import { useAuth } from '../context/AuthContext';
import { connectSocketWithToken, socket } from '../services/socket';
import {
  appendOutboundOperation,
  applyPendingOutboundOperations,
  createOutboundOperationId,
  readOutboundCache,
  readOutboundQueue,
  writeOutboundCache,
  writeOutboundQueue
} from '../services/outboundOffline';

const CARGO_STATUS = {
  aguardando_liberacao: { label: 'Aguardando conferência', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  divergente: { label: 'Com divergência', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  em_carregamento: { label: 'Em carregamento', className: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  liberada: { label: 'Liberada', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  cancelada: { label: 'Cancelada', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  retornada: { label: 'Retornada', className: 'bg-orange-50 text-orange-700 ring-orange-200' }
};

const ITEM_STATUS = {
  pendente: { label: 'Pendente', className: 'bg-amber-50 text-amber-700' },
  parcial: { label: 'Parcial', className: 'bg-indigo-50 text-indigo-700' },
  conferido: { label: 'Conferido', className: 'bg-emerald-50 text-emerald-700' },
  sobra: { label: 'Sobra', className: 'bg-rose-50 text-rose-700' }
};

const DISCRETE_UNITS = new Set(['UN', 'UND', 'UNID', 'PC', 'PÇ', 'CX', 'CAIXA', 'FD', 'FARDO', 'PCT', 'PACOTE', 'KIT']);
const WORKFLOW_STEPS = ['Tarefa atribuída', 'Em conferência', 'Enviada ao gestor', 'Carga liberada'];
const normalizeCode = (value) => String(value || '').trim();

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function StatCard({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700'
  };
  return <div className={`rounded-2xl p-4 ${tones[tone]}`}><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">{label}</p><Icon className="h-4 w-4 opacity-70" /></div><p className="mt-2 text-2xl font-bold">{value}</p></div>;
}

export default function OutboundConference() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const codeInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const [carga, setCarga] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ codigo: '', item_id: '', quantidade: '' });
  const [entryMode, setEntryMode] = useState('somar');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [history, setHistory] = useState([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState(() => readOutboundQueue(user?.id, id));
  const [syncingOffline, setSyncingOffline] = useState(false);
  const syncingRef = useRef(false);
  const [filter, setFilter] = useState('pendentes');
  const [search, setSearch] = useState('');

  const loadCarga = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [cargaResponse, historyResponse] = await Promise.all([
        api.get(`/expedicao/cargas/${id}`),
        api.get(`/expedicao/cargas/${id}/historico`, { params: { limit: 100 } })
      ]);
      const queuedOperations = readOutboundQueue(user?.id, id);
      setOfflineQueue(queuedOperations);
      writeOutboundCache(user?.id, id, { carga: cargaResponse.data, history: historyResponse.data });
      setCarga(applyPendingOutboundOperations(cargaResponse.data, queuedOperations));
      setHistory(historyResponse.data);
      if (!silent) setMessage(null);
    } catch (error) {
      const cached = readOutboundCache(user?.id, id);
      if (!error.response && cached?.carga) {
        const queuedOperations = readOutboundQueue(user?.id, id);
        setOfflineQueue(queuedOperations);
        setCarga(applyPendingOutboundOperations(cached.carga, queuedOperations));
        setHistory(cached.history || []);
        setMessage({ type: 'error', text: 'Sem conexão. Exibindo a última versão salva desta carga.' });
      } else {
        setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível carregar a carga.' });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, user?.id]);

  const syncOfflineQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    let remaining = readOutboundQueue(user?.id, id);
    if (!remaining.length) return;

    syncingRef.current = true;
    setSyncingOffline(true);
    let latestCarga = null;
    try {
      while (remaining.length) {
        const operation = remaining[0];
        if (operation.sync_status === 'blocked') break;
        try {
          const { data } = await api.post(`/expedicao/cargas/${id}/itens/conferencia`, {
            item_id: operation.item_id,
            quantidade: operation.quantidade,
            unidade_medida: operation.unidade_medida,
            client_operation_id: operation.client_operation_id
          });
          latestCarga = data;
          remaining = remaining.slice(1);
          writeOutboundQueue(user?.id, id, remaining);
          setOfflineQueue(remaining);
        } catch (error) {
          const status = error.response?.status;
          if (status && status < 500 && status !== 408 && status !== 429) {
            remaining = [{ ...operation, sync_status: 'blocked', last_error: error.response?.data?.message || 'Operação rejeitada.' }, ...remaining.slice(1)];
            writeOutboundQueue(user?.id, id, remaining);
            setOfflineQueue(remaining);
            setMessage({ type: 'error', text: `Sincronização bloqueada: ${remaining[0].last_error}` });
          }
          break;
        }
      }

      if (latestCarga) {
        const { data: latestHistory } = await api.get(`/expedicao/cargas/${id}/historico`, { params: { limit: 100 } });
        writeOutboundCache(user?.id, id, { carga: latestCarga, history: latestHistory });
        setCarga(applyPendingOutboundOperations(latestCarga, remaining));
        setHistory(latestHistory);
        if (!remaining.length) setMessage({ type: 'success', text: 'Todas as leituras offline foram sincronizadas.' });
      }
    } finally {
      syncingRef.current = false;
      setSyncingOffline(false);
    }
  }, [id, user?.id]);

  useEffect(() => { loadCarga(); }, [loadCarga]);
  useEffect(() => { if (!loading) codeInputRef.current?.focus(); }, [loading]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) syncOfflineQueue();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineQueue]);

  useEffect(() => {
    connectSocketWithToken();
    const handleConnect = () => setLiveConnected(true);
    const handleDisconnect = () => setLiveConnected(false);
    const handleOutboundUpdate = (event) => {
      if (String(event?.carga_id) === String(id)) loadCarga({ silent: true });
    };
    if (socket.connected) handleConnect();
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('outboundUpdate', handleOutboundUpdate);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('outboundUpdate', handleOutboundUpdate);
      socket.disconnect();
    };
  }, [id, loadCarga]);

  const isRecountTask = Boolean(
    carga
    && ['pendente', 'em_andamento'].includes(carga.recontagem_status)
    && String(carga.recontagem_usuario_id) === String(user?.id)
  );
  const eligibleItems = useMemo(
    () => isRecountTask ? (carga?.itens || []).filter((item) => item.requer_recontagem) : (carga?.itens || []),
    [carga?.itens, isRecountTask]
  );

  const matchingItems = useMemo(() => {
    const code = normalizeCode(form.codigo).toLowerCase();
    if (!code) return [];
    return eligibleItems.filter((item) =>
      String(item.codigo_produto || '').toLowerCase() === code
      || String(item.codigo_barras || '').toLowerCase() === code
    );
  }, [eligibleItems, form.codigo]);

  const selectedItem = useMemo(
    () => (carga?.itens || []).find((item) => item.id === Number(form.item_id)) || null,
    [carga?.itens, form.item_id]
  );

  const metrics = useMemo(() => {
    const itens = carga?.itens || [];
    const conferidos = itens.filter((item) => item.status === 'conferido').length;
    const pendentes = itens.filter((item) => ['pendente', 'parcial'].includes(item.status)).length;
    const sobras = itens.filter((item) => item.status === 'sobra').length;
    return {
      total: itens.length,
      conferidos,
      pendentes,
      sobras,
      progresso: itens.length ? Math.round((conferidos / itens.length) * 100) : 0
    };
  }, [carga?.itens]);

  const totalsByUnit = useMemo(() => {
    const groups = new Map();
    (carga?.itens || []).forEach((item) => {
      const unit = item.unidade_medida || 'SEM UN.';
      const current = groups.get(unit) || { prevista: 0, conferida: 0 };
      current.prevista += Number(item.quantidade_prevista || 0);
      current.conferida += Number(item.quantidade_conferida || 0);
      groups.set(unit, current);
    });
    return [...groups.entries()].map(([unidade, totals]) => ({ unidade, ...totals }));
  }, [carga?.itens]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return eligibleItems.filter((item) => {
      if (isRecountTask && filter === 'pendentes' && item.recontado_em) return false;
      const matchesFilter = filter === 'todos'
        || (filter === 'pendentes' && ['pendente', 'parcial'].includes(item.status))
        || (filter === 'conferidos' && item.status === 'conferido')
        || (filter === 'divergencias' && item.status === 'sobra');
      if (!matchesFilter) return false;
      if (!term) return true;
      return [item.codigo_produto, item.codigo_barras, item.descricao, item.unidade_medida]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [eligibleItems, filter, isRecountTask, search]);

  const activeRecount = ['pendente', 'em_andamento'].includes(carga?.recontagem_status);
  const canExecute = isRecountTask || Boolean(carga && !activeRecount && String(carga.conferente_usuario_id) === String(user?.id));
  const locked = !canExecute || ['liberada', 'cancelada', 'retornada'].includes(carga?.status);
  const addingLocked = locked;

  function acceptCode(rawCode) {
    const code = normalizeCode(rawCode);
    const matches = eligibleItems.filter((item) =>
      String(item.codigo_produto || '').toLowerCase() === code.toLowerCase()
      || String(item.codigo_barras || '').toLowerCase() === code.toLowerCase()
    );
    setEntryMode('somar');
    setForm((current) => ({ ...current, codigo: code, item_id: matches.length === 1 ? String(matches[0].id) : '' }));

    if (!code) {
      setMessage({ type: 'error', text: 'Bipe ou informe o código da mercadoria.' });
      return;
    }
    if (!matches.length) {
      setMessage({ type: 'error', text: 'Esta mercadoria não pertence à carga selecionada.' });
      window.setTimeout(() => codeInputRef.current?.select(), 0);
      return;
    }
    if (matches.length > 1) {
      setMessage({ type: 'error', text: 'O código existe em mais de uma unidade. Selecione abaixo a unidade que está sendo conferida.' });
      return;
    }
    if (isRecountTask && matches[0].recontado_em) {
      setMessage({ type: 'error', text: 'Este item já foi recontado nesta tarefa.' });
      return;
    }
    if (!isRecountTask && ['conferido', 'sobra'].includes(matches[0].status)) {
      setMessage({ type: 'error', text: matches[0].status === 'conferido' ? 'Esta mercadoria já foi totalmente conferida.' : 'Esta mercadoria está com sobra e precisa de ajuste.' });
      return;
    }
    setMessage(null);
    window.setTimeout(() => quantityInputRef.current?.focus(), 0);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedItem) return setMessage({ type: 'error', text: 'Localize e selecione uma mercadoria da carga.' });
    const quantity = Number(String(form.quantidade).replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity < 0 || (!isRecountTask && entryMode === 'somar' && quantity === 0)) {
      return setMessage({ type: 'error', text: entryMode === 'ajustar' ? 'Informe um total válido.' : 'Informe uma quantidade maior que zero.' });
    }
    if (entryMode === 'ajustar' && adjustmentReason.trim().length < 3) return setMessage({ type: 'error', text: 'Informe o motivo do ajuste.' });
    if (DISCRETE_UNITS.has(String(selectedItem.unidade_medida).toUpperCase()) && !Number.isInteger(quantity)) {
      return setMessage({ type: 'error', text: `A unidade ${selectedItem.unidade_medida} aceita apenas quantidades inteiras.` });
    }

    if (!isOnline) {
      if (isRecountTask) return setMessage({ type: 'error', text: 'A recontagem exige conexão com o servidor para preservar a auditoria.' });
      if (entryMode === 'ajustar') return setMessage({ type: 'error', text: 'Ajustes exigem conexão com o servidor.' });
      const cached = readOutboundCache(user?.id, id);
      if (!cached?.carga) return setMessage({ type: 'error', text: 'Esta carga ainda não possui dados suficientes para contagem offline.' });
      const operation = {
        client_operation_id: createOutboundOperationId(),
        item_id: selectedItem.id,
        quantidade: quantity,
        unidade_medida: selectedItem.unidade_medida,
        descricao: selectedItem.descricao,
        created_at: new Date().toISOString(),
        sync_status: 'pending'
      };
      const nextQueue = appendOutboundOperation(user?.id, id, operation);
      setOfflineQueue(nextQueue);
      setCarga(applyPendingOutboundOperations(cached.carga, nextQueue));
      setForm({ codigo: '', item_id: '', quantidade: '' });
      setMessage({ type: 'success', text: `${selectedItem.descricao}: leitura salva no dispositivo e aguardando sincronização.` });
      window.setTimeout(() => codeInputRef.current?.focus(), 0);
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const clientOperationId = entryMode === 'somar' ? createOutboundOperationId() : null;
    try {
      const payload = isRecountTask
        ? { item_id: selectedItem.id, quantidade: quantity, unidade_medida: selectedItem.unidade_medida }
        : entryMode === 'ajustar'
        ? { quantidade_conferida: quantity, unidade_medida: selectedItem.unidade_medida, motivo: adjustmentReason.trim() }
        : { item_id: selectedItem.id, quantidade: quantity, unidade_medida: selectedItem.unidade_medida, client_operation_id: clientOperationId };
      const { data } = isRecountTask
        ? await api.post(`/expedicao/cargas/${id}/recontagem/itens`, payload)
        : entryMode === 'ajustar'
        ? await api.patch(`/expedicao/cargas/${id}/itens/${selectedItem.id}`, payload)
        : await api.post(`/expedicao/cargas/${id}/itens/conferencia`, payload);
      const updated = data.itens?.find((item) => item.id === selectedItem.id);
      const { data: entries } = await api.get(`/expedicao/cargas/${id}/historico`, { params: { limit: 100 } });
      writeOutboundCache(user?.id, id, { carga: data, history: entries });
      setCarga(data);
      setHistory(entries);
      setForm({ codigo: '', item_id: '', quantidade: '' });
      setEntryMode('somar');
      setAdjustmentReason('');
      setMessage({
        type: updated?.status === 'sobra' ? 'error' : 'success',
        text: updated?.status === 'sobra'
          ? `${updated.descricao}: quantidade acima do previsto.`
          : `${updated?.descricao || 'Mercadoria'}: ${formatNumber(updated?.quantidade_conferida)} ${updated?.unidade_medida} ${isRecountTask ? 'recontados' : 'conferidos'}.`
      });
      window.setTimeout(() => codeInputRef.current?.focus(), 0);
    } catch (error) {
      if (!isRecountTask && entryMode === 'somar' && !error.response) {
        const cached = readOutboundCache(user?.id, id);
        const operation = {
          client_operation_id: clientOperationId,
          item_id: selectedItem.id,
          quantidade: quantity,
          unidade_medida: selectedItem.unidade_medida,
          descricao: selectedItem.descricao,
          created_at: new Date().toISOString(),
          sync_status: 'pending'
        };
        const nextQueue = appendOutboundOperation(user?.id, id, operation);
        setOfflineQueue(nextQueue);
        if (cached?.carga) setCarga(applyPendingOutboundOperations(cached.carga, nextQueue));
        setForm({ codigo: '', item_id: '', quantidade: '' });
        setMessage({ type: 'success', text: 'A confirmação do servidor não chegou. A leitura foi preservada para sincronização segura.' });
        return;
      }
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível registrar a mercadoria.' });
      window.setTimeout(() => quantityInputRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCloseCargo() {
    if (!isOnline) return setMessage({ type: 'error', text: 'Conecte-se à internet para finalizar a carga.' });
    if (offlineQueue.length) return setMessage({ type: 'error', text: 'Sincronize todas as leituras pendentes antes de finalizar.' });
    setClosing(true);
    setMessage(null);
    try {
      const { data } = await api.post(`/expedicao/cargas/${id}/encerrar`);
      setCarga(data);
      setMessage({
        type: 'success',
        text: data.status === 'liberada'
          ? 'Esta carga já está liberada.'
          : data.resumo?.divergencias_documentais
            ? `Conferência física concluída. ${data.resumo.divergencias_documentais} divergência(s) documental(is) seguirá(ão) para justificativa e autorização do gestor.`
            : 'Conferência concluída e enviada para autorização do gestor.'
      });
    } catch (error) {
      if (error.response?.data?.requer_confirmacao_divergencias) {
        const confirmed = window.confirm(`${error.response.data.itens_pendentes} item(ns) não fecharam com a quantidade prevista. Deseja encerrar a primeira conferência e enviar esses itens para auditoria do gestor?`);
        if (confirmed) {
          try {
            const { data } = await api.post(`/expedicao/cargas/${id}/encerrar`, { confirmar_divergencias: true });
            setCarga(data);
            setMessage({ type: 'success', text: `Primeira conferência encerrada com ${data.resumo?.divergencias_itens || 0} item(ns) divergente(s). Aguardando auditoria e recontagem.` });
          } catch (confirmationError) {
            setMessage({ type: 'error', text: confirmationError.response?.data?.message || 'Não foi possível enviar a divergência para auditoria.' });
          }
        } else {
          setMessage({ type: 'error', text: 'Finalização cancelada. Continue a conferência ou revise as quantidades.' });
        }
      } else {
        setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível finalizar a carga.' });
      }
    } finally {
      setClosing(false);
    }
  }

  const cargoMeta = carga?.status === 'aguardando_liberacao' && carga?.conferencia_finalizada_em
    ? { label: 'Aguardando autorização', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' }
    : (CARGO_STATUS[carga?.status] || CARGO_STATUS.aguardando_liberacao);
  const workflowStep = ['liberada', 'retornada'].includes(carga?.status)
    ? 4
    : carga?.conferencia_finalizada_em
      ? 3
      : carga?.conferencia_iniciada_em
        ? 2
        : 1;
  const backPath = ['admin', 'gerente'].includes(user?.nivel_acesso) ? '/conferencia/outbound' : '/conferencia/outbound/minhas-cargas';
  const remaining = selectedItem ? Number(selectedItem.quantidade_prevista) - Number(selectedItem.quantidade_conferida) : 0;
  const quantityStep = selectedItem && DISCRETE_UNITS.has(String(selectedItem.unidade_medida).toUpperCase()) ? '1' : '0.001';

  function prepareAdjustment(item) {
    if (!isOnline) {
      setMessage({ type: 'error', text: 'Ajustes exigem conexão com o servidor.' });
      return;
    }
    setEntryMode('ajustar');
    setAdjustmentReason('');
    setForm({
      codigo: item.codigo_barras || item.codigo_produto,
      item_id: String(item.id),
      quantidade: String(Number(item.quantidade_conferida || 0))
    });
    setMessage({ type: 'success', text: `Ajuste aberto para ${item.descricao}. Informe o novo total conferido.` });
    window.scrollTo({ top: 360, behavior: 'smooth' });
    window.setTimeout(() => quantityInputRef.current?.select(), 250);
  }

  function handleManualSync() {
    const retryQueue = offlineQueue.map((operation) => ({ ...operation, sync_status: 'pending', last_error: null }));
    writeOutboundQueue(user?.id, id, retryQueue);
    setOfflineQueue(retryQueue);
    window.setTimeout(() => syncOfflineQueue(), 0);
  }

  const blockedOperation = offlineQueue.find((operation) => operation.sync_status === 'blocked');

  return <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
    <Sidebar />
    <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-xl">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <button onClick={() => navigate(backPath)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Voltar para cargas</button>
                <div className="mt-5 flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-indigo-200"><ShoppingCart className="h-4 w-4" /> Conferência de mercadorias</span>{carga && <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${cargoMeta.className}`}>{cargoMeta.label}</span>}<span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${isOnline && liveConnected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}><span className={`h-2 w-2 rounded-full ${isOnline && liveConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />{!isOnline ? 'Modo offline' : liveConnected ? 'Tempo real' : 'Reconectando'}</span></div>
                <h1 className="mt-4 text-3xl font-bold tracking-tight">{carga?.placa_veiculo || 'Carregando carga...'}</h1>
                <p className="mt-2 text-sm text-slate-300">Rota {carga?.rota || '-'} · Motorista {carga?.motorista || '-'} · Conferente {carga?.conferenteResponsavel?.nome || 'não atribuído'}</p>
              </div>
              <div className="flex flex-wrap gap-3"><button onClick={() => loadCarga()} disabled={loading || !isOnline} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20 disabled:opacity-60"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button><button onClick={handleCloseCargo} disabled={closing || locked || !isOnline || offlineQueue.length > 0 || Boolean(carga?.conferencia_finalizada_em)} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">{closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {carga?.conferencia_finalizada_em ? 'Aguardando gestor' : 'Finalizar conferência'}</button></div>
            </div>
            {carga && <div className="mt-7"><div className="flex items-center justify-between text-xs font-semibold text-slate-300"><span>Itens totalmente conferidos</span><span>{metrics.progresso}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${metrics.progresso}%` }} /></div><div className="mt-5 grid grid-cols-4 gap-2">{WORKFLOW_STEPS.map((label, index) => { const number = index + 1; const active = number <= workflowStep; return <div key={label} className="min-w-0"><div className={`h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-white/10'}`} /><p className={`mt-2 text-[10px] font-bold sm:text-xs ${active ? 'text-white' : 'text-slate-500'}`}>{number}. {label}</p></div>; })}</div></div>}
          </div>
        </section>

        {message && <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 text-sm font-semibold ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{message.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}{message.text}</div>}

        {carga && !canExecute && <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-800"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Modo de acompanhamento</p><p className="mt-1">Esta tarefa está vinculada a {carga.conferenteResponsavel?.nome || 'outro conferente'}. Leituras, ajustes e finalização ficam disponíveis somente para o usuário habilitado.</p></div></div>}

        {isRecountTask && <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm text-violet-800"><RefreshCcw className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Tarefa de recontagem</p><p className="mt-1">Confira novamente somente os {carga.resumo?.itens_recontagem || 0} item(ns) liberados pelo gestor. Informe o total físico encontrado, sem somar à primeira contagem.</p><p className="mt-2 text-xs font-semibold">Motivo: {carga.recontagem_motivo}</p></div></div>}

        {offlineQueue.length > 0 && <section className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${blockedOperation ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-3">{blockedOperation ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" /> : <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}<div><h2 className={`font-bold ${blockedOperation ? 'text-rose-800' : 'text-amber-800'}`}>{offlineQueue.length} leitura(s) aguardando sincronização</h2><p className={`mt-1 text-sm ${blockedOperation ? 'text-rose-700' : 'text-amber-700'}`}>{blockedOperation ? blockedOperation.last_error : 'As quantidades estão salvas neste dispositivo.'}</p></div></div><button onClick={handleManualSync} disabled={!isOnline || syncingOffline} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{syncingOffline ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} Sincronizar agora</button></section>}

        {loading && !carga ? <div className="flex min-h-80 items-center justify-center rounded-[24px] bg-white"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> : carga && <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard icon={Layers3} label="Itens distintos" value={metrics.total} /><StatCard icon={PackageCheck} label="Conferidos" value={metrics.conferidos} tone="emerald" /><StatCard icon={ClipboardCheck} label="Pendentes" value={metrics.pendentes} tone="amber" /><StatCard icon={AlertTriangle} label="Com sobra" value={metrics.sobras} tone={metrics.sobras ? 'rose' : 'slate'} /></section>

          {!carga.itens?.length && <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-6 text-amber-800"><h2 className="font-bold">Carga sem mercadorias preparadas</h2><p className="mt-1 text-sm">Execute a migração de itens ou importe novamente a roteirização para iniciar esta conferência.</p></div>}

          {!!carga.itens?.length && <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <form onSubmit={handleSubmit} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Posto de conferência</p><h2 className="mt-1 text-xl font-bold text-slate-900">Bipe a mercadoria</h2><p className="mt-1 text-sm text-slate-500">Use o código de barras ou o código interno do produto.</p></div><button type="button" onClick={() => setScannerOpen(true)} disabled={addingLocked} className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"><Camera className="h-4 w-4" /><span className="hidden sm:inline">Câmera</span></button></div>
              <div className="mt-6 space-y-4">
                {entryMode === 'ajustar' && <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800"><span>Modo de ajuste: substitui o total já conferido.</span><button type="button" onClick={() => { setEntryMode('somar'); setAdjustmentReason(''); setForm({ codigo: '', item_id: '', quantidade: '' }); }} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold">Cancelar</button></div>}
                <div><label className="mb-2 block text-sm font-semibold text-slate-700">Código da mercadoria</label><input ref={codeInputRef} value={form.codigo} onChange={(event) => { setEntryMode('somar'); setForm((current) => ({ ...current, codigo: event.target.value, item_id: '' })); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); acceptCode(event.currentTarget.value); } }} disabled={addingLocked || entryMode === 'ajustar'} placeholder="Bipe ou digite o código" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-base tracking-wide outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60" /></div>

                {matchingItems.length > 1 && <div><label className="mb-2 block text-sm font-semibold text-slate-700">Selecione a unidade</label><div className="grid gap-2 sm:grid-cols-2">{matchingItems.map((item) => <button type="button" key={item.id} onClick={() => { setForm((current) => ({ ...current, item_id: String(item.id) })); setMessage(null); window.setTimeout(() => quantityInputRef.current?.focus(), 0); }} className={`rounded-2xl border p-3 text-left ${Number(form.item_id) === item.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><p className="font-bold text-slate-900">{item.unidade_medida}</p><p className="mt-1 truncate text-xs text-slate-500">{item.descricao}</p></button>)}</div></div>}

                {selectedItem && <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Mercadoria localizada</p><h3 className="mt-1 text-lg font-bold text-slate-900">{selectedItem.descricao}</h3><p className="mt-1 text-xs text-slate-500">Cód. {selectedItem.codigo_produto} {selectedItem.codigo_barras ? `· EAN ${selectedItem.codigo_barras}` : ''}</p></div><span className="inline-flex w-fit rounded-xl bg-indigo-600 px-4 py-2 text-lg font-black text-white">{selectedItem.unidade_medida}</span></div><div className="mt-4 grid grid-cols-3 gap-3 border-t border-indigo-100 pt-4 text-center"><div><p className="text-xs text-slate-500">Previsto</p><p className="mt-1 font-bold text-slate-900">{formatNumber(selectedItem.quantidade_prevista)}</p></div><div><p className="text-xs text-slate-500">Conferido</p><p className="mt-1 font-bold text-emerald-700">{formatNumber(selectedItem.quantidade_conferida)}</p></div><div><p className="text-xs text-slate-500">Saldo</p><p className="mt-1 font-bold text-indigo-700">{formatNumber(remaining)}</p></div></div></div>}

                <div><label className="mb-2 block text-sm font-semibold text-slate-700">{entryMode === 'ajustar' ? 'Novo total conferido' : 'Quantidade nesta leitura'} {selectedItem && <span className="text-indigo-600">({selectedItem.unidade_medida})</span>}</label><div className="relative"><input ref={quantityInputRef} type="number" min={entryMode === 'ajustar' ? '0' : quantityStep} step={quantityStep} value={form.quantidade} onChange={(event) => setForm((current) => ({ ...current, quantidade: event.target.value }))} disabled={locked || (!selectedItem) || (addingLocked && entryMode !== 'ajustar')} placeholder="Quantidade física" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 pr-20 text-lg font-bold outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60" />{selectedItem && <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-slate-200 px-2 py-1 text-xs font-black text-slate-700">{selectedItem.unidade_medida}</span>}</div></div>
                {entryMode === 'ajustar' && <div><label className="mb-2 block text-sm font-semibold text-slate-700">Motivo do ajuste</label><textarea value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} rows="2" maxLength="500" placeholder="Ex.: quantidade digitada incorretamente" className="w-full resize-none rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10" /></div>}
                <button disabled={submitting || syncingOffline || locked || !selectedItem || (addingLocked && entryMode !== 'ajustar')} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : !isOnline ? <WifiOff className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />} {entryMode === 'ajustar' ? 'Salvar novo total' : isOnline ? 'Somar à conferência' : 'Salvar leitura offline'}</button>
              </div>
            </form>

            <aside className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Quantidades por unidade</p><h2 className="mt-2 text-xl font-bold text-slate-900">Resumo da carga</h2><div className="mt-5 space-y-3">{totalsByUnit.map((group) => <div key={group.unidade} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between"><span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black text-white">{group.unidade}</span><span className="text-xs font-semibold text-slate-500">Falta {formatNumber(group.prevista - group.conferida)}</span></div><div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-xs text-slate-500">Conferido</p><p className="text-xl font-bold text-emerald-700">{formatNumber(group.conferida)}</p></div><div className="text-right"><p className="text-xs text-slate-500">Previsto</p><p className="text-lg font-bold text-slate-900">{formatNumber(group.prevista)}</p></div></div></div>)}</div>{metrics.pendentes > 0 && <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800"><b>{metrics.pendentes} mercadoria(s)</b> ainda possuem saldo pendente.</div>}{!metrics.pendentes && !metrics.sobras && <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">Todas as mercadorias foram conferidas. A carga está pronta.</div>}</aside>
          </section>}

          {!!carga.itens?.length && <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-bold text-slate-900">Mercadorias da carga</h2><p className="mt-1 text-sm text-slate-500">Quantidades separadas pela unidade comercial da NF-e.</p></div><div className="relative w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar código ou descrição" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-indigo-500 focus:bg-white" /></div></div><div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-5 py-3">{[['pendentes', 'Pendentes'], ['conferidos', 'Conferidos'], ['divergencias', 'Divergências'], ['todos', 'Todos']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-xs font-bold ${filter === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}</div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3">Mercadoria</th><th className="px-5 py-3">Un.</th><th className="px-5 py-3 text-right">Previsto</th><th className="px-5 py-3 text-right">Conferido</th><th className="px-5 py-3 text-right">Saldo</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{filteredItems.map((item) => { const meta = ITEM_STATUS[item.status] || ITEM_STATUS.pendente; const saldo = Number(item.quantidade_prevista) - Number(item.quantidade_conferida); return <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold text-slate-900">{item.descricao}</p><p className="mt-1 text-xs text-slate-500">{item.codigo_produto}{item.codigo_barras ? ` · ${item.codigo_barras}` : ''}</p></td><td className="px-5 py-4"><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{item.unidade_medida}</span></td><td className="px-5 py-4 text-right font-semibold text-slate-700">{formatNumber(item.quantidade_prevista)}</td><td className="px-5 py-4 text-right font-semibold text-emerald-700">{formatNumber(item.quantidade_conferida)}</td><td className={`px-5 py-4 text-right font-bold ${saldo < 0 ? 'text-rose-700' : 'text-slate-700'}`}>{formatNumber(saldo)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${meta.className}`}>{meta.label}</span></td><td className="px-5 py-4 text-right"><button type="button" disabled={locked || !isOnline} onClick={() => prepareAdjustment(item)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50">Ajustar</button></td></tr>; })}{!filteredItems.length && <tr><td colSpan="7" className="px-5 py-10 text-center text-slate-500">Nenhuma mercadoria encontrada neste filtro.</td></tr>}</tbody></table></div></section>}

          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-200 p-5"><div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><History className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-slate-900">Histórico da conferência</h2><p className="mt-1 text-sm text-slate-500">Últimas leituras e ajustes realizados nesta carga.</p></div></div><div className="divide-y divide-slate-100">{history.map((entry) => <div key={entry.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 rounded-xl p-2 ${entry.tipo === 'ajuste' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{entry.tipo === 'ajuste' ? <RefreshCcw className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{entry.item?.descricao || 'Mercadoria'}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${entry.tipo === 'ajuste' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{entry.tipo}</span></div><p className="mt-1 text-sm text-slate-600">{entry.tipo === 'ajuste' ? `Total alterado de ${formatNumber(entry.quantidade_anterior)} para ${formatNumber(entry.quantidade_resultante)}` : `+${formatNumber(entry.quantidade_informada)} ${entry.unidade_medida} · total ${formatNumber(entry.quantidade_resultante)}`}</p>{entry.motivo && <p className="mt-1 text-xs font-semibold text-amber-700">Motivo: {entry.motivo}</p>}</div></div><div className="shrink-0 text-left text-xs text-slate-500 sm:text-right"><p className="font-semibold text-slate-700">{entry.usuario?.nome || '-'}</p><p className="mt-1 inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {new Date(entry.registrado_em).toLocaleString('pt-BR')}</p></div></div>)}{!history.length && <div className="p-10 text-center text-sm text-slate-500">Nenhuma leitura registrada nesta carga.</div>}</div></section>
        </>}
      </div>
    </main>
    <ScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={(code) => { acceptCode(code); return true; }} />
  </div>;
}

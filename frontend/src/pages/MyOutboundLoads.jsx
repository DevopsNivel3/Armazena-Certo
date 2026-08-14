import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Clock3, Loader2, PackageCheck, PlayCircle, RefreshCcw, Search, Truck } from 'lucide-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { connectSocketWithToken, socket } from '../services/socket';

function taskStage(carga, userId) {
  if (carga.status === 'cancelada') return 'cancelada';
  if (carga.status === 'retornada') return 'retornada';
  if (carga.status === 'liberada') return 'concluida';
  if (['pendente', 'em_andamento'].includes(carga.recontagem_status) && String(carga.recontagem_usuario_id) === String(userId)) return 'recontagem';
  if (carga.conferencia_finalizada_em) return 'aguardando_gestor';
  if (carga.conferencia_iniciada_em) return 'em_andamento';
  return 'atribuida';
}

const STAGES = {
  atribuida: { label: 'Aguardando início', className: 'bg-amber-50 text-amber-700', action: 'Iniciar conferência' },
  em_andamento: { label: 'Em conferência', className: 'bg-indigo-50 text-indigo-700', action: 'Continuar conferência' },
  recontagem: { label: 'Recontagem', className: 'bg-violet-50 text-violet-700', action: 'Abrir recontagem' },
  aguardando_gestor: { label: 'Enviada ao gestor', className: 'bg-cyan-50 text-cyan-700', action: 'Consultar conferência' },
  concluida: { label: 'Concluída', className: 'bg-emerald-50 text-emerald-700', action: 'Consultar conferência' },
  cancelada: { label: 'Cancelada', className: 'bg-slate-100 text-slate-600', action: 'Consultar carga' },
  retornada: { label: 'Retornada', className: 'bg-orange-50 text-orange-700', action: 'Consultar retorno' }
};

export default function MyOutboundLoads() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cargas, setCargas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);
  const [message, setMessage] = useState('');
  const [liveConnected, setLiveConnected] = useState(false);
  const [tab, setTab] = useState('ativas');
  const [search, setSearch] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/expedicao/cargas');
      setCargas(data);
      if (!silent) setMessage('');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível carregar suas tarefas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    connectSocketWithToken();
    const handleConnect = () => setLiveConnected(true);
    const handleDisconnect = () => setLiveConnected(false);
    const refresh = () => load({ silent: true });
    if (socket.connected) handleConnect();
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('outboundUpdate', refresh);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('outboundUpdate', refresh);
      socket.disconnect();
    };
  }, [load]);

  const summary = useMemo(() => ({
    atribuidas: cargas.filter((carga) => taskStage(carga, user?.id) === 'atribuida').length,
    em_andamento: cargas.filter((carga) => ['em_andamento', 'recontagem'].includes(taskStage(carga, user?.id))).length,
    aguardando_gestor: cargas.filter((carga) => taskStage(carga, user?.id) === 'aguardando_gestor').length,
    concluidas: cargas.filter((carga) => ['concluida', 'retornada'].includes(taskStage(carga, user?.id))).length
  }), [cargas, user?.id]);

  const visibleCargas = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cargas.filter((carga) => {
      const stage = taskStage(carga, user?.id);
      const matchesTab = tab === 'todas'
        || (tab === 'ativas' && ['atribuida', 'em_andamento', 'recontagem'].includes(stage))
        || (tab === 'aguardando' && stage === 'aguardando_gestor')
        || (tab === 'concluidas' && ['concluida', 'cancelada', 'retornada'].includes(stage));
      const matchesSearch = !term || [carga.placa_veiculo, carga.rota, carga.motorista, carga.id].some((value) => String(value || '').toLowerCase().includes(term));
      return matchesTab && matchesSearch;
    }).sort((a, b) => {
      const order = { recontagem: 0, em_andamento: 1, atribuida: 2, aguardando_gestor: 3, concluida: 4, retornada: 5, cancelada: 6 };
      return order[taskStage(a, user?.id)] - order[taskStage(b, user?.id)];
    });
  }, [cargas, search, tab, user?.id]);

  async function openTask(carga) {
    if (taskStage(carga, user?.id) !== 'atribuida') {
      navigate(`/conferencia/outbound/${carga.id}`);
      return;
    }
    setStartingId(carga.id);
    setMessage('');
    try {
      await api.post(`/expedicao/cargas/${carga.id}/iniciar`);
      navigate(`/conferencia/outbound/${carga.id}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível iniciar esta tarefa.');
    } finally {
      setStartingId(null);
    }
  }

  return <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
    <Sidebar />
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-indigo-200"><ClipboardCheck className="h-4 w-4" /> Minhas tarefas</span><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${liveConnected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}><span className={`h-2 w-2 rounded-full ${liveConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />{liveConnected ? 'Sincronizado' : 'Reconectando'}</span></div><h1 className="mt-4 text-3xl font-bold">Conferências atribuídas</h1><p className="mt-2 text-sm text-slate-300">Olá, {user?.nome}. Assim como na contagem de inventário, você visualiza somente as tarefas habilitadas para o seu usuário.</p></div><button onClick={() => load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20 disabled:opacity-50"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button></div></section>

        {message && <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700"><AlertTriangle className="h-5 w-5" />{message}</div>}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">A iniciar</p><p className="mt-2 text-2xl font-black text-amber-700">{summary.atribuidas}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Em andamento</p><p className="mt-2 text-2xl font-black text-indigo-700">{summary.em_andamento}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Aguardando gestor</p><p className="mt-2 text-2xl font-black text-cyan-700">{summary.aguardando_gestor}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Concluídas</p><p className="mt-2 text-2xl font-black text-emerald-700">{summary.concluidas}</p></div></section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-2 overflow-x-auto">{[['ativas', 'Minhas ativas'], ['aguardando', 'Aguardando gestor'], ['concluidas', 'Concluídas'], ['todas', 'Todas']].map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${tab === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div><div className="relative w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar placa, rota ou motorista" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm" /></div></div></section>

        {loading ? <div className="flex min-h-64 items-center justify-center rounded-[24px] bg-white"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> : visibleCargas.length ? <section className="grid gap-4 md:grid-cols-2">{visibleCargas.map((carga) => {
          const stage = taskStage(carga, user?.id);
          const meta = STAGES[stage];
          const total = Number(carga.resumo?.total_itens || 0);
          const complete = Number(carga.resumo?.itens_conferidos || 0);
          const progress = total ? Math.round((complete / total) * 100) : 0;
          return <article key={carga.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="rounded-2xl bg-slate-950 p-3 text-white"><Truck className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase text-slate-400">Tarefa #{carga.id}</p><h2 className="mt-1 text-xl font-bold text-slate-900">{carga.placa_veiculo || 'Sem placa'}</h2><p className="mt-1 text-sm text-slate-500">{carga.rota || 'Rota não informada'}</p></div></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.className}`}>{meta.label}</span></div><dl className="mt-5 grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Mercadorias</dt><dd className="mt-1 font-bold text-slate-900">{total}</dd></div><div className="rounded-xl bg-emerald-50 p-3"><dt className="text-xs text-emerald-700">Conferidas</dt><dd className="mt-1 font-bold text-emerald-800">{complete}</dd></div><div className="rounded-xl bg-amber-50 p-3"><dt className="text-xs text-amber-700">Pendentes</dt><dd className="mt-1 font-bold text-amber-800">{carga.resumo?.itens_pendentes || 0}</dd></div></dl><div className="mt-5"><div className="flex justify-between text-xs font-semibold text-slate-500"><span>Progresso da tarefa</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div></div><div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4" />{stage === 'atribuida' ? `Atribuída em ${carga.atribuido_em ? new Date(carga.atribuido_em).toLocaleString('pt-BR') : '-'}` : `Iniciada em ${carga.conferencia_iniciada_em ? new Date(carga.conferencia_iniciada_em).toLocaleString('pt-BR') : '-'}`}</div><button onClick={() => openTask(carga)} disabled={startingId === carga.id} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">{startingId === carga.id ? <Loader2 className="h-4 w-4 animate-spin" /> : stage === 'atribuida' ? <PlayCircle className="h-4 w-4" /> : stage === 'concluida' ? <CheckCircle2 className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}{meta.action}<ArrowRight className="h-4 w-4" /></button></article>;
        })}</section> : <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Truck className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-bold text-slate-900">Nenhuma tarefa nesta etapa</h2><p className="mt-2 text-sm text-slate-500">Novas cargas habilitadas para seu usuário aparecerão aqui.</p></div>}
      </div>
    </main>
  </div>;
}

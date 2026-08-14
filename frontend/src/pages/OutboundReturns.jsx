import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCcw,
  RotateCcw,
  Search,
  Truck,
  Wifi
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import api from '../services/api';
import { connectSocketWithToken, socket } from '../services/socket';

const initialForm = {
  destino: 'reintegracao',
  motivo: '',
  observacoes: ''
};

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function destinationLabel(value) {
  return value === 'nova_roteirizacao' ? 'Nova roteirização' : 'Reintegração ao armazém';
}

function cargoSearchText(carga) {
  return [
    carga.id,
    carga.placa_veiculo,
    carga.motorista,
    carga.rota,
    carga.roteirizacao?.rota?.codigo,
    carga.roteirizacao?.rota?.descricao,
    carga.retorno_motivo,
    carga.retornadoPor?.nome
  ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
}

export default function OutboundReturns() {
  const [cargas, setCargas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('disponiveis');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [message, setMessage] = useState(null);

  const loadCargas = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/expedicao/cargas');
      setCargas(data);
      setSelectedId((current) => data.some((carga) => carga.id === current && carga.status === 'liberada') ? current : null);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível carregar os retornos.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCargas();
  }, [loadCargas]);

  useEffect(() => {
    connectSocketWithToken();
    const handleConnect = () => setLiveConnected(true);
    const handleDisconnect = () => setLiveConnected(false);
    const handleOutboundUpdate = () => loadCargas({ silent: true });
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
  }, [loadCargas]);

  const availableLoads = useMemo(() => cargas.filter((carga) => carga.status === 'liberada'), [cargas]);
  const returnedLoads = useMemo(() => cargas
    .filter((carga) => carga.status === 'retornada')
    .sort((a, b) => new Date(b.retornado_em || 0) - new Date(a.retornado_em || 0)), [cargas]);
  const selected = availableLoads.find((carga) => carga.id === selectedId) || null;
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleLoads = (activeTab === 'disponiveis' ? availableLoads : returnedLoads)
    .filter((carga) => !normalizedSearch || cargoSearchText(carga).includes(normalizedSearch));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selected) {
      setMessage({ type: 'error', text: 'Selecione a carga que retornou.' });
      return;
    }
    if (form.motivo.trim().length < 5) {
      setMessage({ type: 'error', text: 'Informe o motivo do retorno com pelo menos 5 caracteres.' });
      return;
    }
    if (!window.confirm(`Confirma o retorno da carga ${selected.placa_veiculo || `#${selected.id}`}?`)) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const { data } = await api.post(`/expedicao/cargas/${selected.id}/retorno`, {
        destino: form.destino,
        motivo: form.motivo.trim(),
        observacoes: form.observacoes.trim()
      });
      setCargas((current) => current.map((carga) => carga.id === data.id ? data : carga));
      setSelectedId(null);
      setForm(initialForm);
      setActiveTab('retornadas');
      setMessage({ type: 'success', text: `Retorno da carga ${data.placa_veiculo || `#${data.id}`} registrado com sucesso.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível registrar o retorno.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-200"><RotateCcw className="h-4 w-4" /> Pós-expedição</span>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${liveConnected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}><Wifi className="h-3.5 w-3.5" />{liveConnected ? 'Tempo real ativo' : 'Reconectando'}</span>
                </div>
                <h1 className="mt-4 text-3xl font-bold">Retornos Outbound</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">Registre cargas que voltaram após a liberação e defina o próximo destino operacional.</p>
              </div>
              <button type="button" onClick={() => loadCargas()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20"><RefreshCcw className="h-4 w-4" /> Atualizar</button>
            </div>
          </section>

          {message && <div className={`rounded-2xl px-5 py-4 text-sm font-medium ${message.type === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</div>}

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Aguardando registro</p><p className="mt-2 text-3xl font-bold text-orange-600">{availableLoads.length}</p><p className="mt-1 text-sm text-slate-500">cargas liberadas</p></div>
            <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Retornos registrados</p><p className="mt-2 text-3xl font-bold text-slate-900">{returnedLoads.length}</p><p className="mt-1 text-sm text-slate-500">histórico total</p></div>
            <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Para reintegração</p><p className="mt-2 text-3xl font-bold text-emerald-600">{returnedLoads.filter((carga) => carga.retorno_destino === 'reintegracao').length}</p><p className="mt-1 text-sm text-slate-500">cargas direcionadas</p></div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex rounded-2xl bg-slate-100 p-1">
                  <button type="button" onClick={() => setActiveTab('disponiveis')} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === 'disponiveis' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Aguardando registro ({availableLoads.length})</button>
                  <button type="button" onClick={() => setActiveTab('retornadas')} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === 'retornadas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Histórico ({returnedLoads.length})</button>
                </div>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Placa, rota ou motorista" className="min-w-0 bg-transparent text-sm outline-none" /></label>
              </div>

              <div className="mt-5 space-y-3">
                {loading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Carregando cargas...</div>}
                {!loading && visibleLoads.length === 0 && <div className="rounded-2xl bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{activeTab === 'disponiveis' ? 'Nenhuma carga liberada aguardando retorno.' : 'Nenhum retorno registrado.'}</div>}
                {!loading && visibleLoads.map((carga) => activeTab === 'disponiveis' ? (
                  <button key={carga.id} type="button" onClick={() => setSelectedId(carga.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === carga.id ? 'border-orange-300 bg-orange-50 ring-2 ring-orange-100' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/40'}`}>
                    <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold text-slate-900"><Truck className="h-4 w-4 text-orange-600" />{carga.placa_veiculo || `Carga #${carga.id}`}</p><p className="mt-2 text-sm text-slate-600">{carga.rota || carga.roteirizacao?.rota?.descricao || 'Rota não informada'} · {carga.motorista || 'Motorista não informado'}</p><p className="mt-2 text-xs text-slate-500">Liberada em {formatDateTime(carga.liberado_em)} por {carga.liberadoPor?.nome || '-'}</p></div><ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" /></div>
                  </button>
                ) : (
                  <article key={carga.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold text-slate-900"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{carga.placa_veiculo || `Carga #${carga.id}`}</p><p className="mt-1 text-sm text-slate-600">{carga.rota || 'Rota não informada'} · {carga.motorista || 'Motorista não informado'}</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">{destinationLabel(carga.retorno_destino)}</span></div>
                    <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><p><span className="block text-xs font-bold uppercase text-slate-400">Motivo</span><span className="mt-1 block text-slate-700">{carga.retorno_motivo}</span></p><p><span className="block text-xs font-bold uppercase text-slate-400">Registro</span><span className="mt-1 block text-slate-700">{formatDateTime(carga.retornado_em)} · {carga.retornadoPor?.nome || '-'}</span></p>{carga.retorno_observacoes && <p className="sm:col-span-2"><span className="block text-xs font-bold uppercase text-slate-400">Observações</span><span className="mt-1 block text-slate-700">{carga.retorno_observacoes}</span></p>}</div>
                  </article>
                ))}
              </div>
            </div>

            <aside className="h-fit rounded-[24px] border border-orange-200 bg-orange-50 p-5 shadow-sm xl:sticky xl:top-6">
              <div className="flex items-start gap-3"><div className="rounded-2xl bg-orange-600 p-3 text-white"><RotateCcw className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-orange-950">Registrar retorno</h2><p className="mt-1 text-sm text-orange-700">Selecione uma carga liberada na lista.</p></div></div>
              {selected ? (
                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-orange-200 bg-white p-4"><p className="font-bold text-slate-900">{selected.placa_veiculo || `Carga #${selected.id}`}</p><p className="mt-1 text-sm text-slate-500">{selected.rota || 'Rota não informada'} · {selected.motorista || 'Motorista não informado'}</p><p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><Clock3 className="h-4 w-4" /> Liberada em {formatDateTime(selected.liberado_em)}</p></div>
                  <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-orange-900">Destino operacional</span><select value={form.destino} onChange={(event) => setForm((current) => ({ ...current, destino: event.target.value }))} className="mt-2 w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm font-semibold"><option value="reintegracao">Reintegração ao armazém</option><option value="nova_roteirizacao">Nova roteirização</option></select></label>
                  <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-orange-900">Motivo do retorno</span><input value={form.motivo} onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))} placeholder="Ex.: cliente recusou a entrega" className="mt-2 w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm" /></label>
                  <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-orange-900">Observações</span><textarea value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Informações adicionais para a operação" className="mt-2 min-h-28 w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm" /></label>
                  <button disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-700 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}{submitting ? 'Registrando...' : 'Confirmar retorno da carga'}</button>
                </form>
              ) : <div className="mt-5 rounded-2xl border border-dashed border-orange-300 bg-white/60 px-5 py-10 text-center text-sm text-orange-700">Escolha uma carga em “Aguardando registro” para abrir o formulário.</div>}
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}

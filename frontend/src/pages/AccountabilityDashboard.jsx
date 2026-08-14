import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Download, Filter, History, Loader2, PackageCheck, RefreshCcw, Truck } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import api from '../services/api';

const initialFilters = { tipo: 'todos', status: '', data_inicio: '', data_fim: '', doca: '', rota: '', placa: '', cliente: '' };

function number(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '-';
}

function duration(value) {
  if (value === null || value === undefined) return '-';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function Metric({ icon: Icon, label, value, detail, tone = 'slate' }) {
  const tones = { slate: 'bg-slate-50 text-slate-800', emerald: 'bg-emerald-50 text-emerald-800', amber: 'bg-amber-50 text-amber-800', rose: 'bg-rose-50 text-rose-800', indigo: 'bg-indigo-50 text-indigo-800' };
  return <div className={`rounded-2xl p-4 ${tones[tone]}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p><Icon className="h-4 w-4 opacity-70" /></div><p className="mt-2 text-2xl font-black">{value}</p>{detail && <p className="mt-1 text-xs opacity-70">{detail}</p>}</div>;
}

export default function AccountabilityDashboard() {
  const [filters, setFilters] = useState(initialFilters);
  const [report, setReport] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const loadReport = useCallback(async (values = initialFilters) => {
    setLoading(true);
    setMessage(null);
    try {
      const params = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
      const [reportResponse, auditResponse] = await Promise.all([
        api.get('/relatorios/prestacao-contas', { params }),
        api.get('/relatorios/auditoria-conferencia', { params: { limit: 100 } })
      ]);
      setReport(reportResponse.data);
      setAudit(auditResponse.data.eventos || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível carregar a prestação de contas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReport(initialFilters); }, [loadReport]);

  function submit(event) {
    event.preventDefault();
    loadReport(filters);
  }

  function clearFilters() {
    setFilters(initialFilters);
    loadReport(initialFilters);
  }

  async function downloadAudit() {
    try {
      const response = await api.get('/relatorios/auditoria-conferencia', { params: { format: 'xlsx', limit: 2000 }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'auditoria_conferencia.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Nao foi possivel exportar a auditoria.');
    }
  }

  const inbound = report?.inbound?.indicadores || {};
  const outbound = report?.outbound?.indicadores || {};

  return <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
    <Sidebar />
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><span className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-200"><Activity className="h-4 w-4" /> Prestação de contas</span><h1 className="mt-4 text-3xl font-bold">Indicadores logísticos</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">Consolidação do recebimento por volumes e da expedição por mercadorias, preservando a rastreabilidade de cada operação.</p></div><button onClick={() => loadReport(filters)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20 disabled:opacity-50"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button></div></section>

        <form onSubmit={submit} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Filter className="h-5 w-5 text-indigo-600" /><h2 className="font-bold text-slate-900">Filtros gerenciais</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select value={filters.tipo} onChange={(event) => setFilters((current) => ({ ...current, tipo: event.target.value, status: '' }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm"><option value="todos">Inbound e Outbound</option><option value="inbound">Somente Inbound</option><option value="outbound">Somente Outbound</option></select><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm"><option value="">Todos os status</option>{filters.tipo !== 'outbound' && <><option value="importado">Inbound: importado</option><option value="em_conferencia">Inbound: em conferência</option><option value="conferido">Inbound: conferido</option><option value="divergente">Divergente</option></>}{filters.tipo !== 'inbound' && <><option value="aguardando_liberacao">Outbound: aguardando</option><option value="em_carregamento">Outbound: carregamento</option><option value="liberada">Outbound: liberada</option><option value="cancelada">Cancelada</option></>}</select><input type="date" value={filters.data_inicio} onChange={(event) => setFilters((current) => ({ ...current, data_inicio: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" aria-label="Data inicial" /><input type="date" value={filters.data_fim} onChange={(event) => setFilters((current) => ({ ...current, data_fim: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" aria-label="Data final" /><input value={filters.doca} onChange={(event) => setFilters((current) => ({ ...current, doca: event.target.value }))} placeholder="Doca" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" /><input value={filters.rota} onChange={(event) => setFilters((current) => ({ ...current, rota: event.target.value }))} placeholder="Rota" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" /><input value={filters.placa} onChange={(event) => setFilters((current) => ({ ...current, placa: event.target.value }))} placeholder="Placa" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" /><input value={filters.cliente} onChange={(event) => setFilters((current) => ({ ...current, cliente: event.target.value }))} placeholder="Cliente / emitente" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" /></div><div className="mt-4 flex flex-wrap gap-2"><button className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white">Aplicar filtros</button><button type="button" onClick={clearFilters} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600">Limpar</button></div></form>

        {message && <div className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{message}</div>}
        {loading && !report ? <div className="flex min-h-64 items-center justify-center rounded-[24px] bg-white"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> : report && <>
          <section className="space-y-4"><div><h2 className="text-xl font-bold text-slate-900">Inbound · Recebimento</h2><p className="text-sm text-slate-500">Conferência por volumes totais das NF-es.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric icon={Truck} label="Lotes" value={number(inbound.total_lotes)} /><Metric icon={PackageCheck} label="Volumes" value={`${number(inbound.volumes_fisicos)} / ${number(inbound.volumes_previstos)}`} detail="físico / previsto" tone="indigo" /><Metric icon={CheckCircle2} label="Índice de acerto" value={`${number(inbound.indice_acerto)}%`} tone="emerald" /><Metric icon={AlertTriangle} label="Ocorrências" value={number((inbound.faltas || 0) + (inbound.sobras || 0) + (inbound.avarias || 0))} detail={`${number(inbound.faltas)} faltas · ${number(inbound.sobras)} sobras · ${number(inbound.avarias)} avarias`} tone="rose" /><Metric icon={Clock3} label="Tempo médio" value={duration(inbound.tempo_medio_minutos)} /></div><div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white shadow-sm"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Lote</th><th className="px-4 py-3">Doca / origem</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">NF-es</th><th className="px-4 py-3 text-right">Volumes</th><th className="px-4 py-3 text-right">F/S/A</th><th className="px-4 py-3">Tempo</th></tr></thead><tbody className="divide-y divide-slate-100">{report.inbound.lotes.map((row) => <tr key={row.id}><td className="px-4 py-3"><p className="font-bold text-slate-900">{row.nome}</p><p className="text-xs text-slate-500">{dateTime(row.data)}</p></td><td className="px-4 py-3">{row.doca || '-'} · {row.origem || '-'}</td><td className="px-4 py-3 font-semibold">{row.status}</td><td className="px-4 py-3 text-right">{row.notas_ok}/{row.total_notas}</td><td className="px-4 py-3 text-right">{number(row.volumes_fisicos)}/{number(row.volumes_previstos)}</td><td className="px-4 py-3 text-right">{row.faltas}/{row.sobras}/{row.avarias}</td><td className="px-4 py-3">{duration(row.tempo_conferencia_minutos)}</td></tr>)}{!report.inbound.lotes.length && <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-500">Nenhum recebimento encontrado.</td></tr>}</tbody></table></div></section>

          <section className="space-y-4"><div><h2 className="text-xl font-bold text-slate-900">Outbound · Expedição</h2><p className="text-sm text-slate-500">Conferência item a item, respeitando a unidade de medida.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric icon={Truck} label="Cargas" value={number(outbound.total_cargas)} /><Metric icon={PackageCheck} label="Itens conferidos" value={`${number(outbound.itens_conferidos)} / ${number(outbound.total_itens)}`} tone="indigo" /><Metric icon={CheckCircle2} label="Índice de acerto" value={`${number(outbound.indice_acerto)}%`} tone="emerald" /><Metric icon={AlertTriangle} label="Divergências" value={number((outbound.sobras || 0) + (outbound.divergencias_documentais || 0))} detail={`${number(outbound.sobras)} sobras · ${number(outbound.divergencias_documentais)} documentais`} tone="rose" /><Metric icon={Clock3} label="Tempo médio" value={duration(outbound.tempo_medio_minutos)} /></div><div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white shadow-sm"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Carga</th><th className="px-4 py-3">Rota / motorista</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Itens</th><th className="px-4 py-3 text-right">Pend./sobra/doc.</th><th className="px-4 py-3">Conferente</th><th className="px-4 py-3">Tempo</th></tr></thead><tbody className="divide-y divide-slate-100">{report.outbound.cargas.map((row) => <tr key={row.id}><td className="px-4 py-3"><p className="font-bold text-slate-900">{row.placa || `Carga ${row.id}`}</p><p className="text-xs text-slate-500">{dateTime(row.data)}</p></td><td className="px-4 py-3">{row.rota || '-'} · {row.motorista || '-'}</td><td className="px-4 py-3 font-semibold">{row.status}</td><td className="px-4 py-3 text-right">{row.itens_conferidos}/{row.total_itens}</td><td className="px-4 py-3 text-right">{row.itens_pendentes}/{row.sobras}/{row.divergencias_documentais}</td><td className="px-4 py-3">{row.conferente || '-'}</td><td className="px-4 py-3">{duration(row.tempo_conferencia_minutos)}</td></tr>)}{!report.outbound.cargas.length && <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-500">Nenhuma carga encontrada.</td></tr>}</tbody></table></div></section>

          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5"><div className="flex items-center gap-3"><History className="h-5 w-5 text-indigo-600" /><div><h2 className="font-bold text-slate-900">Auditoria da conferencia</h2><p className="text-sm text-slate-500">Ultimos eventos de Inbound e Outbound.</p></div></div><button type="button" onClick={downloadAudit} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-700"><Download className="h-4 w-4" />Excel</button></div><div className="max-h-[420px] overflow-auto"><table className="min-w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Area</th><th className="px-4 py-3">Acao</th><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Detalhes</th></tr></thead><tbody className="divide-y divide-slate-100">{audit.map((event, index) => <tr key={`${event.area}-${event.entidade_id}-${event.acao}-${index}`}><td className="whitespace-nowrap px-4 py-3">{dateTime(event.data)}</td><td className="px-4 py-3 font-bold">{event.area}</td><td className="px-4 py-3">{event.acao}</td><td className="px-4 py-3">{event.usuario}</td><td className="max-w-md truncate px-4 py-3 text-slate-500">{event.detalhes || '-'}</td></tr>)}{!audit.length && <tr><td colSpan="5" className="px-4 py-10 text-center text-slate-500">Nenhum evento encontrado.</td></tr>}</tbody></table></div></section>
        </>}
      </div>
    </main>
  </div>;
}

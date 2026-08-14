import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Ban,
  Camera,
  Download,
  FileCheck2,
  FileText,
  FileUp,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Search,
  Truck,
  XCircle
} from 'lucide-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import ScannerModal from '../components/ScannerModal';

const STATUS_META = {
  importado: { label: 'Importado', className: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200' },
  em_conferencia: { label: 'Em conferencia', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  conferido: { label: 'Conferido', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  divergente: { label: 'Divergente', className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' },
  liberado_fusion: { label: 'Liberado para roteirização', className: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
  cancelado: { label: 'Cancelado', className: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300' }
};

const NOTE_STATUS_META = {
  pendente: { label: 'Pendente', className: 'bg-slate-100 text-slate-700' },
  ok: { label: 'OK', className: 'bg-emerald-50 text-emerald-700' },
  falta: { label: 'Falta', className: 'bg-rose-50 text-rose-700' },
  sobra: { label: 'Sobra', className: 'bg-amber-50 text-amber-700' },
  avaria: { label: 'Avaria', className: 'bg-orange-50 text-orange-700' }
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function StatTile({ label, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-white text-slate-900 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-900 ring-rose-100',
    amber: 'bg-amber-50 text-amber-900 ring-amber-100'
  }[tone];

  return (
    <div className={`rounded-2xl p-4 ring-1 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function InboundConference() {
  const { user } = useAuth();
  const isManager = ['admin', 'gerente'].includes(user?.nivel_acesso);
  const [lotes, setLotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedLote, setSelectedLote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [counting, setCounting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState(null);
  const [uploadForm, setUploadForm] = useState({
    nome: '',
    doca: '',
    origem: '',
    observacoes: '',
    files: []
  });
  const [countForm, setCountForm] = useState({
    codigo: '',
    qtd_volumes_fisico: '',
    avarias: ''
  });

  const loadLotes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/conferencia/inbound/lotes');
      setLotes(response.data);
      setSelectedId((current) => current || response.data[0]?.id || null);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel carregar os lotes.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLoteDetails = useCallback(async (id) => {
    if (!id) {
      setSelectedLote(null);
      return;
    }

    setDetailsLoading(true);
    try {
      const response = await api.get(`/conferencia/inbound/lotes/${id}`);
      setSelectedLote(response.data);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel abrir o lote.' });
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLotes();
  }, [loadLotes]);

  useEffect(() => {
    loadLoteDetails(selectedId);
  }, [selectedId, loadLoteDetails]);

  const filteredNotas = useMemo(() => {
    const notas = selectedLote?.notas || [];
    const term = searchTerm.trim().toLowerCase();

    if (!term) return notas;

    return notas.filter((nota) => (
      nota.chave_acesso?.toLowerCase().includes(term)
      || nota.numero_nfe?.toLowerCase().includes(term)
      || nota.emitente_nome?.toLowerCase().includes(term)
      || nota.destinatario_nome?.toLowerCase().includes(term)
    ));
  }, [selectedLote, searchTerm]);

  async function handleUpload(event) {
    event.preventDefault();
    setMessage(null);

    if (!uploadForm.files.length) {
      setMessage({ type: 'error', text: 'Selecione ao menos um XML.' });
      return;
    }

    const formData = new FormData();
    formData.append('nome', uploadForm.nome);
    formData.append('doca', uploadForm.doca);
    formData.append('origem', uploadForm.origem);
    formData.append('observacoes', uploadForm.observacoes);
    uploadForm.files.forEach((file) => formData.append('xmls', file));

    setUploading(true);
    try {
      const response = await api.post('/conferencia/inbound/lotes', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage({
        type: 'success',
        text: `Lote importado com ${response.data.importados} XMLs validos. Rejeitados: ${response.data.rejeitados}.`
      });
      setUploadForm({ nome: '', doca: '', origem: '', observacoes: '', files: [] });
      setSelectedId(response.data.lote.id);
      await loadLotes();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Falha na importacao dos XMLs.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleCount(event) {
    event.preventDefault();
    setMessage(null);

    if (!selectedId) return;

    setCounting(true);
    try {
      const response = await api.post(`/conferencia/inbound/lotes/${selectedId}/conferencia`, countForm);
      setSelectedLote(response.data);
      setCountForm({ codigo: '', qtd_volumes_fisico: '', avarias: '' });
      await loadLotes();
      setMessage({ type: 'success', text: 'Conferencia registrada.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel registrar a conferencia.' });
    } finally {
      setCounting(false);
    }
  }

  async function handleCloseBatch() {
    if (!selectedId || !window.confirm('Encerrar este lote? Depois do encerramento as contagens ficam bloqueadas.')) return;
    setProcessing(true);
    setMessage(null);
    try {
      const { data } = await api.post(`/conferencia/inbound/lotes/${selectedId}/encerrar`);
      setSelectedLote(data);
      await loadLotes();
      setMessage({ type: 'success', text: 'Lote encerrado e pronto para a exportacao das NF-es OK.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel encerrar o lote.' });
    } finally {
      setProcessing(false);
    }
  }

  async function handleExportXml() {
    if (!selectedId) return;
    setProcessing(true);
    setMessage(null);
    try {
      const response = await api.get(`/conferencia/inbound/lotes/${selectedId}/exportar-xml`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `roteirizacao_lote_${selectedId}.xml`;
      link.click();
      URL.revokeObjectURL(url);
      await Promise.all([loadLotes(), loadLoteDetails(selectedId)]);
      setMessage({ type: 'success', text: 'Pacote XML gerado. Somente as NF-es OK foram exportadas.' });
    } catch (error) {
      let text = 'Nao foi possivel gerar o XML.';
      if (error.response?.data instanceof Blob) {
        try { text = JSON.parse(await error.response.data.text()).message || text; } catch { /* resposta nao JSON */ }
      }
      setMessage({ type: 'error', text });
    } finally {
      setProcessing(false);
    }
  }

  async function handleDownloadTerm() {
    if (!selectedId) return;
    setProcessing(true);
    try {
      const response = await api.get(`/relatorios/inbound/${selectedId}/termo-divergencia`, { params: { format: 'xlsx' }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `termo_divergencia_lote_${selectedId}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel exportar o termo.' });
    } finally {
      setProcessing(false);
    }
  }

  async function handlePrintTerm() {
    if (!selectedId) return;
    const popup = window.open('', '_blank', 'width=950,height=700');
    if (!popup) return setMessage({ type: 'error', text: 'Permita a abertura da janela de impressao.' });
    popup.document.write('<p style="font-family:Arial;padding:24px">Preparando termo...</p>');
    try {
      const { data } = await api.get(`/relatorios/inbound/${selectedId}/termo-divergencia`);
      const esc = (value) => String(value ?? '-').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
      const rows = data.divergencias.map((item) => `<tr><td>${esc(item.numero_nfe)}</td><td>${esc(item.chave_acesso)}</td><td>${esc(item.emitente)}</td><td>${esc(item.volumes_xml)}</td><td>${esc(item.volumes_fisicos)}</td><td>${esc(item.status)}</td><td>${esc(item.avarias)}</td></tr>`).join('');
      popup.document.open();
      popup.document.write(`<!doctype html><html><head><title>Termo de divergencia ${esc(data.lote.id)}</title><style>body{font-family:Arial;padding:28px;color:#111}h1{margin-bottom:4px}p{color:#444}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:11px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}@media print{body{padding:0}}</style></head><body><h1>Termo de Divergencia de Recebimento</h1><p>Lote ${esc(data.lote.nome)} · Doca ${esc(data.lote.doca)} · Origem ${esc(data.lote.origem)}</p><p>Emitido em ${new Date(data.emitido_em).toLocaleString('pt-BR')} · Total de ocorrencias: ${data.divergencias.length}</p><table><thead><tr><th>NF-e</th><th>Chave</th><th>Emitente</th><th>XML</th><th>Fisico</th><th>Status</th><th>Avarias</th></tr></thead><tbody>${rows}</tbody></table><script>window.print()</script></body></html>`);
      popup.document.close();
    } catch (error) {
      popup.close();
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel gerar o termo.' });
    }
  }

  async function handleCancelBatch() {
    if (!selectedId || !window.confirm('Cancelar este lote? As NF-es poderao ser importadas novamente em outro lote.')) return;
    setProcessing(true);
    try {
      const { data } = await api.post(`/conferencia/inbound/lotes/${selectedId}/cancelar`);
      setSelectedLote(data);
      await loadLotes();
      setMessage({ type: 'success', text: 'Lote cancelado.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel cancelar o lote.' });
    } finally {
      setProcessing(false);
    }
  }

  const resumo = selectedLote?.resumo || {};
  const statusMeta = STATUS_META[selectedLote?.status] || STATUS_META.importado;

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      <Sidebar />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <section className="rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-300/30 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                  <Truck className="h-4 w-4" />
                  Conferencia XML
                </div>
                <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Recebimento por volumetria</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Importe XMLs de NFe, conte volumes fisicos por nota e separe rapidamente o que pode seguir para roteirizacao.
                </p>
              </div>
              <button
                type="button"
                onClick={loadLotes}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Atualizar
              </button>
            </div>
          </section>

          {message && (
            <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                : 'bg-rose-50 text-rose-800 ring-1 ring-rose-100'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
            <div className="flex flex-col gap-6">
              {isManager ? <form onSubmit={handleUpload} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <FileUp className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Novo lote</p>
                    <h2 className="text-lg font-bold text-slate-900">Importar XMLs</h2>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <input
                    type="text"
                    value={uploadForm.nome}
                    onChange={(e) => setUploadForm((prev) => ({ ...prev, nome: e.target.value }))}
                    placeholder="Nome do lote"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={uploadForm.doca}
                      onChange={(e) => setUploadForm((prev) => ({ ...prev, doca: e.target.value }))}
                      placeholder="Doca"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                    />
                    <input
                      type="text"
                      value={uploadForm.origem}
                      onChange={(e) => setUploadForm((prev) => ({ ...prev, origem: e.target.value }))}
                      placeholder="Origem"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <textarea
                    value={uploadForm.observacoes}
                    onChange={(e) => setUploadForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                    placeholder="Observacoes"
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                  <input
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    multiple
                    onChange={(e) => setUploadForm((prev) => ({ ...prev, files: Array.from(e.target.files || []) }))}
                    className="w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                  />
                  <button
                    type="submit"
                    disabled={uploading}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                    Importar lote
                  </button>
                </div>
              </form> : <div className="rounded-[24px] border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-800"><FileCheck2 className="h-5 w-5" /><p className="mt-3 font-bold">Perfil operacional</p><p className="mt-1">Selecione um lote criado pelo gestor e registre a conferencia fisica.</p></div>}

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">Lotes recentes</h2>
                <div className="mt-4 flex flex-col gap-2">
                  {loading ? (
                    <div className="flex justify-center py-8 text-slate-500">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : lotes.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum lote importado.</p>
                  ) : lotes.map((lote) => {
                    const meta = STATUS_META[lote.status] || STATUS_META.importado;
                    const active = lote.id === selectedId;

                    return (
                      <button
                        key={lote.id}
                        type="button"
                        onClick={() => setSelectedId(lote.id)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{lote.nome}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {lote.resumo?.total_notas || 0} notas - {formatNumber(lote.resumo?.total_volumes_xml)} volumes XML
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}>
                            {meta.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              {!selectedLote && !detailsLoading ? (
                <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
                  <PackageCheck className="mx-auto h-10 w-10 text-slate-400" />
                  <h2 className="mt-4 text-lg font-bold text-slate-900">Selecione ou importe um lote</h2>
                  <p className="mt-2 text-sm text-slate-500">Os detalhes da conferencia aparecem aqui.</p>
                </section>
              ) : detailsLoading ? (
                <section className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </section>
              ) : (
                <>
                  <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-2xl font-bold text-slate-900">{selectedLote.nome}</h2>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {selectedLote.doca || 'Sem doca'} - {selectedLote.origem || 'Origem nao informada'}
                        </p>
                      </div>
                      {isManager && <div className="flex flex-wrap gap-2">
                        {!selectedLote.encerrado_em && !['cancelado', 'liberado_fusion'].includes(selectedLote.status) && <button type="button" onClick={handleCloseBatch} disabled={processing} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><FileCheck2 className="h-4 w-4" />Encerrar</button>}
                        {selectedLote.encerrado_em && selectedLote.resumo?.notas_ok > 0 && <button type="button" onClick={handleExportXml} disabled={processing} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Download className="h-4 w-4" />XML roteirizacao</button>}
                        {selectedLote.resumo?.notas_divergentes > 0 && <><button type="button" onClick={handlePrintTerm} disabled={processing} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><FileText className="h-4 w-4" />Termo / PDF</button><button type="button" onClick={handleDownloadTerm} disabled={processing} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><Download className="h-4 w-4" />Excel</button></>}
                        {!selectedLote.encerrado_em && selectedLote.status !== 'cancelado' && <button type="button" onClick={handleCancelBatch} disabled={processing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"><Ban className="h-4 w-4" />Cancelar</button>}
                      </div>}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <StatTile label="Notas" value={resumo.total_notas || 0} />
                      <StatTile label="Vol. XML" value={formatNumber(resumo.total_volumes_xml)} />
                      <StatTile label="Vol. fisico" value={formatNumber(resumo.total_volumes_fisico)} tone="emerald" />
                      <StatTile label="Divergencia" value={formatNumber(resumo.divergencia_volumes)} tone={resumo.divergencia_volumes ? 'rose' : 'slate'} />
                      <StatTile label="Pendentes" value={resumo.notas_pendentes || 0} tone={resumo.notas_pendentes ? 'amber' : 'slate'} />
                    </div>
                  </section>

                  <form onSubmit={handleCount} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <ClipboardCheck className="h-5 w-5 text-indigo-600" />
                      <h2 className="text-lg font-bold text-slate-900">Registrar conferencia fisica</h2>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_auto_0.6fr_1fr_auto]">
                      <input
                        type="text"
                        value={countForm.codigo}
                        onChange={(e) => setCountForm((prev) => ({ ...prev, codigo: e.target.value }))}
                        placeholder="Chave de acesso ou numero da NFe"
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      />
                      <button type="button" onClick={() => setScannerOpen(true)} disabled={Boolean(selectedLote.encerrado_em) || ['cancelado', 'liberado_fusion'].includes(selectedLote.status)} className="inline-flex items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-700 disabled:opacity-50" title="Ler chave pela camera"><Camera className="h-5 w-5" /></button>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={countForm.qtd_volumes_fisico}
                        onChange={(e) => setCountForm((prev) => ({ ...prev, qtd_volumes_fisico: e.target.value }))}
                        placeholder="Volumes"
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      />
                      <input
                        type="text"
                        value={countForm.avarias}
                        onChange={(e) => setCountForm((prev) => ({ ...prev, avarias: e.target.value }))}
                        placeholder="Avarias visiveis"
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      />
                      <button
                        type="submit"
                        disabled={counting || Boolean(selectedLote.encerrado_em) || ['cancelado', 'liberado_fusion'].includes(selectedLote.status)}
                        className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {counting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </form>

                  <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">Notas do lote</h2>
                        <p className="mt-1 text-sm text-slate-500">Somente notas OK devem seguir para roteirizacao.</p>
                      </div>
                      <div className="relative w-full max-w-md">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Buscar nota, chave ou cliente"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          <tr>
                            <th className="px-5 py-3">NFe</th>
                            <th className="px-5 py-3">Emitente</th>
                            <th className="px-5 py-3">Destinatario</th>
                            <th className="px-5 py-3 text-right">XML</th>
                            <th className="px-5 py-3 text-right">Fisico</th>
                            <th className="px-5 py-3 text-right">Dif.</th>
                            <th className="px-5 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {filteredNotas.map((nota) => {
                            const noteMeta = NOTE_STATUS_META[nota.status] || NOTE_STATUS_META.pendente;
                            const diff = Number(nota.qtd_volumes_fisico ?? nota.qtd_volumes_xml) - Number(nota.qtd_volumes_xml || 0);

                            return (
                              <tr key={nota.id} className="hover:bg-slate-50">
                                <td className="px-5 py-4">
                                  <p className="font-semibold text-slate-900">{nota.numero_nfe || '-'}</p>
                                  <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">{nota.chave_acesso}</p>
                                </td>
                                <td className="px-5 py-4 text-slate-600">{nota.emitente_nome || '-'}</td>
                                <td className="px-5 py-4 text-slate-600">{nota.destinatario_nome || '-'}</td>
                                <td className="px-5 py-4 text-right font-semibold text-slate-900">{formatNumber(nota.qtd_volumes_xml)}</td>
                                <td className="px-5 py-4 text-right font-semibold text-slate-900">
                                  {nota.qtd_volumes_fisico === null || nota.qtd_volumes_fisico === undefined ? '-' : formatNumber(nota.qtd_volumes_fisico)}
                                </td>
                                <td className={`px-5 py-4 text-right font-semibold ${diff === 0 ? 'text-slate-700' : 'text-rose-700'}`}>
                                  {nota.qtd_volumes_fisico === null || nota.qtd_volumes_fisico === undefined ? '-' : formatNumber(diff)}
                                </td>
                                <td className="px-5 py-4">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${noteMeta.className}`}>
                                    {nota.status === 'avaria' ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                                    {noteMeta.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
      <ScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={(code) => { setCountForm((current) => ({ ...current, codigo: code })); setScannerOpen(false); return true; }} />
    </div>
  );
}

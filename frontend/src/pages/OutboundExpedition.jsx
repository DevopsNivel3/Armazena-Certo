import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, Ban, ClipboardCheck, Clock3, Download, FileUp, Loader2, Pencil, RefreshCcw, ShieldCheck, Truck, Wifi } from 'lucide-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { connectSocketWithToken, socket } from '../services/socket';

const statusLabel = {
  aguardando_liberacao: 'Aguardando liberação',
  divergente: 'Com divergência',
  em_carregamento: 'Em carregamento',
  liberada: 'Liberada',
  cancelada: 'Cancelada',
  retornada: 'Retornada'
};

const notaStatusMeta = {
  apta: { label: 'Apta', className: 'text-emerald-700' },
  embarcada: { label: 'Embarcada', className: 'text-indigo-700' },
  pendente: { label: 'Pendente', className: 'text-amber-700' },
  nao_localizada: { label: 'Não localizada', className: 'text-rose-700' },
  inbound_divergente: { label: 'Divergente no Inbound', className: 'text-rose-700' },
  divergencia_embarque: { label: 'Divergência no embarque', className: 'text-rose-700' }
};

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function formatDateTime(value) {
  if (!value) return 'Sem atividade registrada';
  return new Date(value).toLocaleString('pt-BR');
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function RoteirizacaoDetails({ roteirizacao }) {
  if (!roteirizacao) return null;
  const { rota = {}, veiculo = {}, transportadora = {}, entregas = [] } = roteirizacao;
  return <div className="space-y-4 border-t border-slate-200 p-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">Rota</p><p className="mt-1 font-semibold text-slate-900">{formatValue(rota.codigo)} · {formatValue(rota.descricao)}</p><p className="mt-1 text-slate-600">{formatValue(rota.distancia_total_km)} km · {formatValue(rota.tempo_estimado_minutos)} min</p></div>
      <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">Carga</p><p className="mt-1 font-semibold text-slate-900">{formatValue(rota.quantidade_total_volumes)} volumes</p><p className="mt-1 text-slate-600">{formatValue(rota.peso_total_kg)} kg · R$ {formatValue(rota.valor_total_carga)}</p></div>
      <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">Veículo</p><p className="mt-1 font-semibold text-slate-900">{formatValue(veiculo.tipo)}</p><p className="mt-1 text-slate-600">Capacidade: {formatValue(veiculo.capacidade_peso_kg)} kg / {formatValue(veiculo.capacidade_volumes)} vol.</p></div>
      <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">Transportadora</p><p className="mt-1 font-semibold text-slate-900">{formatValue(transportadora.razaoSocial)}</p><p className="mt-1 text-slate-600">{formatValue(transportadora.cnpj)}</p></div>
    </div>
    <div><h3 className="text-base font-bold text-slate-900">Entregas roteirizadas</h3><div className="mt-3 space-y-3">{entregas.map((entrega, index) => <details key={`${entrega.codigo_entrega}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="mr-2 rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">#{formatValue(entrega.sequencia)}</span><span className="font-semibold text-slate-900">NF {formatValue(entrega.nota_fiscal?.numero)} · Pedido {formatValue(entrega.pedido)}</span></div><span className="text-sm text-slate-600">{formatValue(entrega.destinatario?.razaoSocial)}</span></div></summary><div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-sm md:grid-cols-2"><div><p><b>Cliente:</b> {formatValue(entrega.destinatario?.razaoSocial)}</p><p className="mt-1"><b>Endereço:</b> {formatValue(entrega.destinatario?.endereco?.logradouro)}, {formatValue(entrega.destinatario?.endereco?.numero)} — {formatValue(entrega.destinatario?.endereco?.municipio)}/{formatValue(entrega.destinatario?.endereco?.uf)}</p><p className="mt-1"><b>Coordenadas:</b> {formatValue(entrega.destinatario?.endereco?.latitude)}, {formatValue(entrega.destinatario?.endereco?.longitude)}</p></div><div><p><b>Janela:</b> {formatValue(entrega.janela_entrega?.inicio)} até {formatValue(entrega.janela_entrega?.fim)}</p><p className="mt-1"><b>Volumes/Peso:</b> {formatValue(entrega.nota_fiscal?.quantidade_volumes)} / {formatValue(entrega.nota_fiscal?.peso_bruto_kg)} kg</p><p className="mt-1"><b>Cubagem:</b> {formatValue(entrega.cubagem?.volumeM3)} m³ · {formatValue(entrega.cubagem?.pesoCubadoKg)} kg cubados</p><p className="mt-1"><b>Observações:</b> {formatValue(entrega.observacoes)}</p></div></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-2">Produto</th><th className="p-2">Cód. barras</th><th className="p-2 text-right">Qtd.</th><th className="p-2 text-right">Volumes</th><th className="p-2 text-right">Valor</th></tr></thead><tbody>{(entrega.produtos || []).map((produto, productIndex) => <tr key={`${produto.codigo}-${productIndex}`} className="border-t border-slate-100"><td className="p-2">{formatValue(produto.descricao)}</td><td className="p-2 font-mono">{formatValue(produto.codigo_barras)}</td><td className="p-2 text-right">{formatValue(produto.quantidade)}</td><td className="p-2 text-right">{formatValue(produto.quantidade_volumes)}</td><td className="p-2 text-right">R$ {formatValue(produto.valor_total)}</td></tr>)}</tbody></table></div></details>)}</div></div>
  </div>;
}

export default function OutboundExpedition() {
  const [cargas, setCargas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [assigningRecount, setAssigningRecount] = useState(false);
  const [recountForm, setRecountForm] = useState({ usuario_id: '', motivo: '' });
  const [assignment, setAssignment] = useState({ conferente_usuario_id: '', usuarios: [] });
  const [productivity, setProductivity] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [message, setMessage] = useState(null);

  const loadCargas = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/expedicao/cargas');
      setCargas(data);
      setSelected((current) => data.find((carga) => carga.id === current?.id) || data[0] || null);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível carregar as cargas.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadSupervision = useCallback(async (cargoId) => {
    if (!cargoId) return;
    try {
      const [assignmentResponse, productivityResponse] = await Promise.all([
        api.get(`/expedicao/cargas/${cargoId}/usuarios`),
        api.get(`/expedicao/cargas/${cargoId}/produtividade`)
      ]);
      const assignmentData = assignmentResponse.data;
      setAssignment({
        conferente_usuario_id: assignmentData.conferente_usuario_id ? String(assignmentData.conferente_usuario_id) : '',
        usuarios: assignmentData.usuarios || []
      });
      setProductivity(productivityResponse.data);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível carregar a supervisão da conferência.' });
    }
  }, []);

  useEffect(() => { loadCargas(); }, [loadCargas]);

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

  useEffect(() => {
    if (!selected?.id) {
      setProductivity(null);
      return;
    }
    loadSupervision(selected.id);
  }, [loadSupervision, selected?.id]);

  useEffect(() => {
    if (!selected?.id) return undefined;
    const refreshSupervision = () => loadSupervision(selected.id);
    const handleConferenceUpdate = (event) => {
      if (String(event?.carga_id) === String(selected.id)) refreshSupervision();
    };
    socket.on('outboundPresenceUpdate', refreshSupervision);
    socket.on('outboundUpdate', handleConferenceUpdate);
    return () => {
      socket.off('outboundPresenceUpdate', refreshSupervision);
      socket.off('outboundUpdate', handleConferenceUpdate);
    };
  }, [loadSupervision, selected?.id]);

  async function handleImport(event) {
    event.preventDefault();
    if (!file) return setMessage({ type: 'error', text: 'Selecione o XML retornado pelo roteirizador.' });
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('xml', file);
      const { data } = await api.post('/expedicao/cargas/importar-roteirizacao', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCargas((current) => [data, ...current]);
      setSelected(data);
      setFile(null);
      event.target.reset();
      setMessage({ type: 'success', text: `Roteirização importada: ${data.resumo.notas_aptas} nota(s) apta(s) e ${data.resumo.divergencias} divergência(s).` });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível importar a roteirização.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleManifest() {
    if (!selected) return;
    const popup = window.open('', '_blank', 'width=1000,height=700');
    if (!popup) {
      setMessage({ type: 'error', text: 'Permita a abertura da janela de impressão.' });
      return;
    }
    popup.document.write('<!doctype html><html><body style="font-family:Arial;padding:28px">Preparando manifesto...</body></html>');
    popup.document.close();
    try {
      const { data } = await api.get(`/relatorios/cargas/${selected.id}/manifesto`);
      const esc = (value) => String(value ?? '-').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
      const noteRows = data.notas.map((nota) => `<tr><td>${esc(nota.numero_nfe)}</td><td>${esc(nota.chave_acesso)}</td><td>${esc(nota.destinatario)}</td><td>${esc(nota.status)}</td></tr>`).join('');
      const itemRows = (data.itens || []).map((item) => `<tr><td>${esc(item.codigo_produto)}</td><td>${esc(item.codigo_barras)}</td><td>${esc(item.descricao)}</td><td>${esc(item.unidade_medida)}</td><td>${esc(item.quantidade_prevista)}</td><td>${esc(item.quantidade_conferida)}</td><td>${esc(item.status)}</td></tr>`).join('');
      const rota = data.roteirizacao?.rota || {};
      const veiculo = data.roteirizacao?.veiculo || {};
      const transportadora = data.roteirizacao?.transportadora || {};
      const entregas = (data.roteirizacao?.entregas || []).map((entrega) => {
        const endereco = entrega.destinatario?.endereco || {};
        const produtos = (entrega.produtos || []).map((produto) => `<tr><td>${esc(produto.codigo)}</td><td>${esc(produto.codigo_barras)}</td><td>${esc(produto.descricao)}</td><td>${esc(produto.quantidade)}</td><td>${esc(produto.quantidade_volumes)}</td><td>R$ ${esc(produto.valor_total)}</td></tr>`).join('');
        return `<section class="entrega"><h3>Entrega ${esc(entrega.sequencia)} · NF ${esc(entrega.nota_fiscal?.numero)} · Pedido ${esc(entrega.pedido)}</h3><p><b>Cliente:</b> ${esc(entrega.destinatario?.razaoSocial)} · ${esc(endereco.logradouro)}, ${esc(endereco.numero)} — ${esc(endereco.municipio)}/${esc(endereco.uf)} · CEP ${esc(endereco.cep)}</p><p><b>Janela:</b> ${esc(entrega.janela_entrega?.inicio)} até ${esc(entrega.janela_entrega?.fim)} · <b>Coordenadas:</b> ${esc(endereco.latitude)}, ${esc(endereco.longitude)}</p><p><b>Volumes/Peso:</b> ${esc(entrega.nota_fiscal?.quantidade_volumes)} / ${esc(entrega.nota_fiscal?.peso_bruto_kg)} kg · <b>Cubagem:</b> ${esc(entrega.cubagem?.volumeM3)} m³ / ${esc(entrega.cubagem?.pesoCubadoKg)} kg · <b>Obs.:</b> ${esc(entrega.observacoes)}</p><table><thead><tr><th>Cód.</th><th>Cód. barras</th><th>Produto</th><th>Qtd.</th><th>Vol.</th><th>Valor</th></tr></thead><tbody>${produtos}</tbody></table></section>`;
      }).join('');
      popup.document.open();
      popup.document.write(`<!doctype html><html><head><title>Manifesto ${data.carga.id}</title><style>body{font-family:Arial;padding:28px;color:#111;font-size:12px}h1{margin:0 0 4px}h2{margin-top:28px}h3{margin:0 0 8px;font-size:14px}p{margin:5px 0;color:#333}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.card{border:1px solid #bbb;padding:8px}.entrega{border:1px solid #aaa;padding:12px;margin:16px 0;break-inside:avoid}@media print{body{padding:0}}</style></head><body><h1>Manifesto de Embarque</h1><p>Carga ${esc(data.carga.id)} · Status: ${esc(data.carga.status)} · Emitido em ${new Date(data.emitido_em).toLocaleString('pt-BR')}</p><p><b>Conferência finalizada:</b> ${esc(data.carga.conferencia_finalizada_por)} · ${esc(data.carga.conferencia_finalizada_em ? new Date(data.carga.conferencia_finalizada_em).toLocaleString('pt-BR') : null)} &nbsp; <b>Liberação:</b> ${esc(data.carga.liberado_por)} · ${esc(data.carga.liberado_em ? new Date(data.carga.liberado_em).toLocaleString('pt-BR') : null)}</p><div class="grid"><div class="card"><b>Veículo</b><br>Placa: ${esc(data.carga.placa)}<br>Tipo: ${esc(veiculo.tipo)}<br>Motorista: ${esc(data.carga.motorista)}</div><div class="card"><b>Rota</b><br>${esc(rota.codigo)} · ${esc(rota.descricao)}<br>${esc(rota.distancia_total_km)} km · ${esc(rota.tempo_estimado_minutos)} min<br>Saída: ${esc(rota.data_saida)} ${esc(rota.hora_prevista_saida)}</div><div class="card"><b>Carga/Transportadora</b><br>${esc(rota.quantidade_total_volumes)} volumes · ${esc(rota.peso_total_kg)} kg<br>R$ ${esc(rota.valor_total_carga)}<br>${esc(transportadora.razaoSocial)}</div></div><h2>Mercadorias conferidas</h2><table><thead><tr><th>Código</th><th>Cód. barras</th><th>Mercadoria</th><th>Un.</th><th>Previsto</th><th>Conferido</th><th>Status</th></tr></thead><tbody>${itemRows}</tbody></table><h2>Documentos da carga</h2><table><thead><tr><th>NF-e</th><th>Chave</th><th>Destinatário</th><th>Status</th></tr></thead><tbody>${noteRows}</tbody></table><h2>Entregas roteirizadas</h2>${entregas}<script>window.print()</script></body></html>`);
      popup.document.close();
    } catch (error) {
      popup.close();
      setMessage({ type: 'error', text: error.response?.data?.message || error.message || 'Não foi possível gerar o manifesto.' });
    }
  }

  async function handleManifestExcel() {
    if (!selected) return;
    try {
      const response = await api.get(`/relatorios/cargas/${selected.id}/manifesto`, { params: { format: 'xlsx' }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `manifesto_carga_${selected.id}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel exportar o manifesto.' });
    }
  }

  async function handleEditCargo() {
    if (!selected) return;
    const placa = window.prompt('Placa do veiculo:', selected.placa_veiculo || '');
    if (placa === null) return;
    const motorista = window.prompt('Motorista:', selected.motorista || '');
    if (motorista === null) return;
    const rota = window.prompt('Rota:', selected.rota || '');
    if (rota === null) return;
    try {
      const { data } = await api.put(`/expedicao/cargas/${selected.id}`, { placa_veiculo: placa, motorista, rota });
      setSelected(data);
      setCargas((current) => current.map((carga) => carga.id === data.id ? data : carga));
      setMessage({ type: 'success', text: 'Dados operacionais da carga atualizados.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel editar a carga.' });
    }
  }

  async function handleCancelCargo() {
    if (!selected || !window.confirm(`Cancelar a carga ${selected.placa_veiculo || selected.id}? As NF-es voltarao a ficar disponiveis para outra roteirizacao.`)) return;
    try {
      const { data } = await api.post(`/expedicao/cargas/${selected.id}/cancelar`);
      setSelected(data);
      setCargas((current) => current.map((carga) => carga.id === data.id ? data : carga));
      setMessage({ type: 'success', text: 'Carga cancelada e NF-es liberadas para nova roteirizacao.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Nao foi possivel cancelar a carga.' });
    }
  }

  async function handleAssign(event) {
    event.preventDefault();
    if (!selected) return;
    setAssigning(true);
    setMessage(null);
    try {
      const { data } = await api.put(`/expedicao/cargas/${selected.id}/conferente`, {
        usuario_id: assignment.conferente_usuario_id || null
      });
      setSelected(data);
      setCargas((current) => current.map((carga) => carga.id === data.id ? data : carga));
      await loadSupervision(data.id);
      setMessage({ type: 'success', text: data.conferenteResponsavel ? `Carga atribuída para ${data.conferenteResponsavel.nome}.` : 'Atribuição da carga removida.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível atribuir a carga.' });
    } finally {
      setAssigning(false);
    }
  }

  async function handleRelease() {
    if (!selected) return;
    let justificativa = '';
    if (selected.resumo?.requer_justificativa_liberacao) {
      const informedReason = window.prompt(`Esta carga possui ${selected.resumo.divergencias_itens || 0} divergência(s) de item e ${selected.resumo.divergencias_documentais || 0} documental(is). Informe a justificativa para autorizar a saída:`);
      if (informedReason === null) return;
      justificativa = informedReason.trim();
      if (justificativa.length < 5) {
        setMessage({ type: 'error', text: 'A justificativa deve ter pelo menos 5 caracteres.' });
        return;
      }
    } else if (!window.confirm(`Confirma a liberação do veículo ${selected.placa_veiculo || `carga ${selected.id}`} para viagem?`)) {
      return;
    }
    setReleasing(true);
    setMessage(null);
    try {
      const { data } = await api.post(`/expedicao/cargas/${selected.id}/liberar`, { justificativa });
      setSelected(data);
      setCargas((current) => current.map((carga) => carga.id === data.id ? data : carga));
      await loadSupervision(data.id);
      setMessage({ type: 'success', text: `Veículo liberado por ${data.liberadoPor?.nome || 'gestor responsável'}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível liberar o veículo.' });
    } finally {
      setReleasing(false);
    }
  }

  async function handleAssignRecount(event) {
    event.preventDefault();
    if (!selected) return;
    if (!recountForm.usuario_id) return setMessage({ type: 'error', text: 'Selecione o conferente da recontagem.' });
    if (recountForm.motivo.trim().length < 5) return setMessage({ type: 'error', text: 'Informe o motivo da recontagem.' });
    setAssigningRecount(true);
    setMessage(null);
    try {
      const { data } = await api.post(`/expedicao/cargas/${selected.id}/recontagem`, {
        usuario_id: recountForm.usuario_id,
        motivo: recountForm.motivo.trim()
      });
      setSelected(data);
      setCargas((current) => current.map((carga) => carga.id === data.id ? data : carga));
      setRecountForm({ usuario_id: '', motivo: '' });
      await loadSupervision(data.id);
      setMessage({ type: 'success', text: `Recontagem enviada para ${data.conferenteRecontagem?.nome || 'o conferente selecionado'}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Não foi possível atribuir a recontagem.' });
    } finally {
      setAssigningRecount(false);
    }
  }

  return <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
    <Sidebar />
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider"><Truck className="h-4 w-4" /> Outbound</div><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${liveConnected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}><span className={`h-2 w-2 rounded-full ${liveConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />{liveConnected ? 'Tempo real ativo' : 'Reconectando'}</span></div><h1 className="mt-4 text-3xl font-bold">Expedição por veículo</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Importe o XML de roteirização. As chaves retornadas são validadas contra as notas aprovadas no Inbound.</p></div>
            <button onClick={() => loadCargas()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20"><RefreshCcw className="h-4 w-4" /> Atualizar</button>
          </div>
        </section>
        {message && <div className={`rounded-2xl px-5 py-4 text-sm font-medium ${message.type === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</div>}
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Importar XML de roteirização</h2><p className="mt-1 text-sm text-slate-500">O XML precisa conter as chaves de acesso das NF-es da carga.</p>
          <form onSubmit={handleImport} className="mt-5 flex flex-col gap-3 sm:flex-row"><input type="file" accept=".xml,text/xml,application/xml" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" /><button disabled={uploading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Importar XML</button></form>
        </section>
        {selected && <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div className="flex items-start gap-3"><div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><ClipboardCheck className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-slate-900">Responsável pela conferência</h2><p className="mt-1 text-sm text-slate-500">Vincule a carga {selected.placa_veiculo || 'sem placa'} ao usuário que realizará a conferência das mercadorias.</p>{selected.conferenteResponsavel && <p className="mt-2 text-sm font-bold text-emerald-700">Atual: {selected.conferenteResponsavel.nome}</p>}</div></div><form onSubmit={handleAssign} className="flex w-full flex-col gap-2 sm:flex-row xl:max-w-3xl"><select disabled={['liberada', 'retornada', 'cancelada'].includes(selected.status)} value={assignment.conferente_usuario_id} onChange={(event) => setAssignment((current) => ({ ...current, conferente_usuario_id: event.target.value }))} className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><option value="">Sem responsável</option>{assignment.usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nome} · {usuario.online ? 'online' : 'offline'} · {usuario.email}</option>)}</select><button disabled={assigning || ['liberada', 'retornada', 'cancelada'].includes(selected.status)} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{assigning ? 'Salvando...' : 'Atribuir carga'}</button><button type="button" onClick={handleManifest} className="rounded-2xl border border-indigo-200 px-3 py-3 text-sm font-semibold text-indigo-700">Manifesto</button><button type="button" onClick={handleManifestExcel} className="rounded-2xl border border-indigo-200 px-3 py-3 text-indigo-700" title="Exportar Excel"><Download className="h-4 w-4" /></button>{!selected.conferencia_iniciada_em && !['liberada', 'retornada', 'cancelada'].includes(selected.status) && <button type="button" onClick={handleEditCargo} className="rounded-2xl border border-slate-200 px-3 py-3 text-slate-600" title="Editar carga"><Pencil className="h-4 w-4" /></button>}{!['liberada', 'retornada', 'cancelada'].includes(selected.status) && <button type="button" onClick={handleCancelCargo} className="rounded-2xl border border-rose-200 px-3 py-3 text-rose-700" title="Cancelar carga"><Ban className="h-4 w-4" /></button>}<Link to={`/conferencia/outbound/${selected.id}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">Acompanhar <ArrowRight className="h-4 w-4" /></Link></form></div></section>}
        {selected && <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 text-indigo-700"><Activity className="h-5 w-5" /><h2 className="text-lg font-bold text-slate-900">Supervisão da conferência</h2></div><p className="mt-1 text-sm text-slate-500">Presença e produção atualizadas em tempo real para esta carga.</p></div>
            <div className="flex flex-wrap items-center gap-2">{productivity?.responsavel && <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${productivity.responsavel.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><span className={`h-2 w-2 rounded-full ${productivity.responsavel.online ? 'bg-emerald-500' : 'bg-slate-400'}`} />{productivity.responsavel.online ? `Online · ${productivity.responsavel.aparelhos_conectados} aparelho(s)` : 'Offline'}</span>}<button type="button" onClick={handleRelease} disabled={releasing || ['liberada', 'retornada'].includes(selected.status) || !selected.resumo?.conferencia_finalizada || !selected.resumo?.pronta_para_liberacao} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{selected.status === 'retornada' ? 'Carga retornada' : selected.status === 'liberada' ? 'Veículo liberado' : 'Autorizar liberação'}</button></div>
          </div>
          {selected.conferencia_finalizada_em && !['liberada', 'retornada'].includes(selected.status) && <div className={`mt-4 rounded-2xl border p-4 text-sm ${selected.resumo?.requer_justificativa_liberacao ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-cyan-200 bg-cyan-50 text-cyan-800'}`}><b>Conferência física concluída por {selected.conferenciaFinalizadaPor?.nome || 'usuário responsável'}.</b> Finalizada em {formatDateTime(selected.conferencia_finalizada_em)}. {selected.resumo?.requer_justificativa_liberacao ? `${selected.resumo.divergencias_documentais} divergência(s) documental(is) exige(m) justificativa na autorização.` : 'Aguardando autorização gerencial.'}</div>}
          {selected.status === 'liberada' && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><b>Veículo autorizado para viagem por {selected.liberadoPor?.nome || 'gestor responsável'}.</b> Liberação registrada em {formatDateTime(selected.liberado_em)}.{selected.justificativa_liberacao && <span className="mt-1 block"><b>Justificativa:</b> {selected.justificativa_liberacao}</span>}</div>}
          {!productivity?.responsavel ? <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800">Atribua um conferente para iniciar o acompanhamento individual.</div> : <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Conferente</p><p className="mt-2 font-bold text-slate-900">{productivity.responsavel.nome}</p><p className="mt-1 text-xs text-slate-500">{productivity.responsavel.email}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="flex items-center gap-1 text-xs font-bold uppercase text-slate-500"><Wifi className="h-3.5 w-3.5" /> Leituras</p><p className="mt-2 text-2xl font-bold text-slate-900">{productivity.usuarios.find((item) => item.usuario.id === productivity.responsavel.id)?.leituras || 0}</p><p className="mt-1 text-xs text-slate-500">operações de contagem</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Itens / ajustes</p><p className="mt-2 text-2xl font-bold text-slate-900">{productivity.usuarios.find((item) => item.usuario.id === productivity.responsavel.id)?.itens_distintos || 0} / {productivity.usuarios.find((item) => item.usuario.id === productivity.responsavel.id)?.ajustes || 0}</p><p className="mt-1 text-xs text-slate-500">mercadorias distintas / correções</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="flex items-center gap-1 text-xs font-bold uppercase text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Última atividade</p><p className="mt-2 text-sm font-bold text-slate-900">{formatDateTime(productivity.usuarios.find((item) => item.usuario.id === productivity.responsavel.id)?.ultima_atividade_em)}</p></div>
          </div>}
          {!!productivity?.usuarios?.length && <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Presença</th><th className="px-4 py-3 text-right">Leituras</th><th className="px-4 py-3 text-right">Itens</th><th className="px-4 py-3 text-right">Ajustes</th><th className="px-4 py-3">Quantidades por unidade</th><th className="px-4 py-3">Última atividade</th></tr></thead><tbody className="divide-y divide-slate-100">{productivity.usuarios.map((item) => <tr key={item.usuario.id}><td className="px-4 py-3 font-semibold text-slate-900">{item.usuario.nome}</td><td className="px-4 py-3"><span className={item.online ? 'font-bold text-emerald-700' : 'text-slate-500'}>{item.online ? `Online (${item.aparelhos_conectados})` : 'Offline'}</span></td><td className="px-4 py-3 text-right">{item.leituras}</td><td className="px-4 py-3 text-right">{item.itens_distintos}</td><td className="px-4 py-3 text-right">{item.ajustes}</td><td className="px-4 py-3">{Object.entries(item.quantidades_por_unidade).map(([unidade, quantidade]) => `${formatQuantity(quantidade)} ${unidade}`).join(' · ') || '-'}</td><td className="px-4 py-3 text-slate-600">{formatDateTime(item.ultima_atividade_em)}</td></tr>)}</tbody></table></div>}
        </section>}
        {selected?.resumo?.conferencia_finalizada && selected.resumo.divergencias_itens > 0 && !['liberada', 'retornada'].includes(selected.status) && <section className="rounded-[24px] border border-violet-200 bg-violet-50 p-5 shadow-sm"><div className="flex items-start gap-3"><div className="rounded-2xl bg-violet-600 p-3 text-white"><RefreshCcw className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-violet-950">Auditoria e recontagem</h2><p className="mt-1 text-sm text-violet-700">A primeira conferência possui {selected.resumo.divergencias_itens} item(ns) divergente(s). A primeira quantidade será preservada no histórico.</p></div></div>{['pendente', 'em_andamento'].includes(selected.recontagem_status) ? <div className="mt-4 rounded-2xl bg-white/70 p-4 text-sm text-violet-900"><b>Recontagem {selected.recontagem_status === 'pendente' ? 'aguardando início' : 'em andamento'} com {selected.conferenteRecontagem?.nome || 'conferente atribuído'}.</b><p className="mt-1">{selected.resumo.itens_recontados}/{selected.resumo.itens_recontagem} itens recontados · Motivo: {selected.recontagem_motivo}</p></div> : selected.recontagem_status === 'finalizada' ? <div className="mt-4 rounded-2xl bg-white/70 p-4 text-sm text-violet-900"><b>Recontagem finalizada.</b> Revise o resultado e autorize a liberação com justificativa caso a divergência permaneça.</div> : <form onSubmit={handleAssignRecount} className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.4fr)_auto]"><select value={recountForm.usuario_id} onChange={(event) => setRecountForm((current) => ({ ...current, usuario_id: event.target.value }))} className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold"><option value="">Selecionar conferente</option>{assignment.usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nome} · {usuario.online ? 'online' : 'offline'}</option>)}</select><input value={recountForm.motivo} onChange={(event) => setRecountForm((current) => ({ ...current, motivo: event.target.value }))} placeholder="Motivo e orientação para a recontagem" className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm" /><button disabled={assigningRecount} className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{assigningRecount ? 'Enviando...' : 'Enviar para recontagem'}</button></form>}</section>}
        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><h2 className="px-2 text-lg font-bold text-slate-900">Cargas importadas</h2><div className="mt-3 space-y-2">{loading ? <p className="p-2 text-sm text-slate-500">Carregando...</p> : cargas.map((carga) => <button key={carga.id} onClick={() => setSelected(carga)} className={`w-full rounded-2xl p-3 text-left ${selected?.id === carga.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'}`}><p className="font-semibold text-slate-900">{carga.placa_veiculo || 'Veículo não informado'}</p><p className="mt-1 text-xs text-slate-500">{carga.rota || 'Rota não informada'} · {carga.resumo?.total_itens || 0} mercadorias</p><p className="mt-1 text-xs font-semibold text-indigo-700">{carga.status === 'aguardando_liberacao' && carga.resumo?.conferencia_finalizada ? 'Aguardando autorização' : (statusLabel[carga.status] || carga.status)}</p><p className={`mt-1 text-xs ${carga.conferenteResponsavel ? 'text-emerald-700' : 'text-amber-700'}`}>{carga.conferenteResponsavel ? `Responsável: ${carga.conferenteResponsavel.nome}` : 'Aguardando atribuição'}</p></button>)}</div></div>
          <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm">{selected ? <><div className="border-b border-slate-200 p-5"><h2 className="text-lg font-bold text-slate-900">{selected.placa_veiculo || 'Veículo não informado'}</h2><p className="mt-1 text-sm text-slate-500">Rota: {selected.rota || '-'} · Motorista: {selected.motorista || '-'}</p></div><div className="grid grid-cols-2 gap-3 p-5 text-center sm:grid-cols-4"><div><p className="text-2xl font-bold">{selected.resumo?.total_notas}</p><p className="text-xs text-slate-500">NF-es</p></div><div><p className="text-2xl font-bold text-slate-900">{selected.resumo?.total_itens}</p><p className="text-xs text-slate-500">Mercadorias</p></div><div><p className="text-2xl font-bold text-emerald-600">{selected.resumo?.itens_conferidos}</p><p className="text-xs text-slate-500">Conferidas</p></div><div><p className="text-2xl font-bold text-rose-600">{selected.resumo?.divergencias}</p><p className="text-xs text-slate-500">Divergências</p></div></div><RoteirizacaoDetails roteirizacao={selected.roteirizacao} /><div className="overflow-x-auto border-t border-slate-200"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Chave de acesso</th><th className="px-5 py-3">Validação documental</th><th className="px-5 py-3">Motivo</th></tr></thead><tbody className="divide-y divide-slate-100">{(selected.notas || []).map((nota) => {
            const meta = notaStatusMeta[nota.status] || { label: nota.status, className: 'text-slate-700' };
            const divergente = ['nao_localizada', 'inbound_divergente', 'divergencia_embarque'].includes(nota.status);
            return <tr key={nota.id}><td className="px-5 py-3 font-mono text-xs text-slate-700">{nota.chave_acesso}</td><td className="px-5 py-3"><span className={`inline-flex items-center gap-1 font-semibold ${meta.className}`}>{divergente && <AlertTriangle className="h-3.5 w-3.5" />}{meta.label}</span></td><td className="px-5 py-3 text-slate-600">{nota.motivo_divergencia || '-'}</td></tr>;
          })}</tbody></table></div></> : <div className="p-8 text-sm text-slate-500">Nenhuma carga importada.</div>}</div>
        </section>
      </div>
    </main>
  </div>;
}

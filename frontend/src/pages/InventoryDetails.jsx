import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  Clock3,
  Download,
  FileSpreadsheet,
  Package,
  Play,
  RefreshCw,
  Unlock,
  Upload,
  UserPlus,
  Users,
  Settings2,
  X,
  History,
  Wifi,
  WifiOff
} from 'lucide-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import ReimportModal from '../components/ReimportModal';
import { connectSocketWithToken, socket } from '../services/socket';

const STATUS_STYLES = {
  criado: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  em_contagem: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  em_recontagem: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  finalizado: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  ok: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  pendente: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  divergente: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  aguarda_recontagem: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
};

const STATUS_LABELS = {
  criado: 'Criado',
  em_contagem: 'Em Contagem',
  em_recontagem: 'Em Recontagem',
  finalizado: 'Finalizado',
  ok: 'Batido',
  pendente: 'Pendente',
  divergente: 'Divergente',
  aguarda_recontagem: 'Aguardando Recontagem'
};

const formatNumber = (value) => Number(value || 0).toLocaleString('pt-BR');
const formatDate = (value) => (value ? new Date(value).toLocaleString('pt-BR') : '-');

const normalizeSortableValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return { type: 'empty', value: null };
  }

  if (value instanceof Date) {
    return { type: 'date', value: value.getTime() };
  }

  if (typeof value === 'number') {
    return { type: 'number', value };
  }

  if (typeof value === 'boolean') {
    return { type: 'number', value: value ? 1 : 0 };
  }

  const textValue = String(value).trim();
  if (!textValue) {
    return { type: 'empty', value: null };
  }

  const isoDateMatch = textValue.match(/^\d{4}-\d{2}-\d{2}/);
  const brDateMatch = textValue.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoDateMatch || brDateMatch) {
    const parsedDate = brDateMatch
      ? new Date(
          Number(brDateMatch[3]),
          Number(brDateMatch[2]) - 1,
          Number(brDateMatch[1]),
          Number(brDateMatch[4] || 0),
          Number(brDateMatch[5] || 0),
          Number(brDateMatch[6] || 0)
        )
      : new Date(textValue);

    if (!Number.isNaN(parsedDate.getTime())) {
      return { type: 'date', value: parsedDate.getTime() };
    }
  }

  return { type: 'string', value: textValue.toLocaleLowerCase('pt-BR') };
};

const compareSortableEntries = (left, right) => {
  const normalizedLeft = normalizeSortableValue(left);
  const normalizedRight = normalizeSortableValue(right);

  if (normalizedLeft.type === 'empty' && normalizedRight.type === 'empty') {
    return 0;
  }
  if (normalizedLeft.type === 'empty') {
    return 1;
  }
  if (normalizedRight.type === 'empty') {
    return -1;
  }

  if (normalizedLeft.type === normalizedRight.type) {
    if (normalizedLeft.value < normalizedRight.value) return -1;
    if (normalizedLeft.value > normalizedRight.value) return 1;
    return 0;
  }

  const priority = { number: 0, date: 1, string: 2 };
  return (priority[normalizedLeft.type] ?? 99) - (priority[normalizedRight.type] ?? 99);
};

function StatCard({ title, value, subtitle, icon: Icon, iconClassName }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        <div className={`rounded-2xl p-3 ${iconClassName}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function InventoryDetails() {
  const { id } = useParams();

  const [inventory, setInventory] = useState(null);
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [totalProducts, setTotalProducts] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [isReimportModalOpen, setIsReimportModalOpen] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ nome: '', email: '', senha: '', nivel_acesso: 'operador' });
  const [releaseOptions, setReleaseOptions] = useState({
    usuarios: [],
    categorias: [],
    statusDisponiveis: [],
    produtos: [],
    liberacoes: []
  });
  const [loadingReleaseOptions, setLoadingReleaseOptions] = useState(false);
  const [savingRelease, setSavingRelease] = useState(false);
  const [releaseForm, setReleaseForm] = useState({
    usuario_id: '',
    categorias: [],
    status_contagem: [],
    produto_ids: [],
    busca: '',
    apenas_contados_pelo_usuario: false
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [feedback, setFeedback] = useState('');

  const [reportData, setReportData] = useState([]);
  const [reportSummary, setReportSummary] = useState(null);
  const [reportSearch, setReportSearch] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState('');
  const [reportCategoriaFilter, setReportCategoriaFilter] = useState('');
  const [reportTipoDiferencaFilter, setReportTipoDiferencaFilter] = useState('');
  const [reportUsuarioFilter, setReportUsuarioFilter] = useState('');
  const [reportFiltrosDisponiveis, setReportFiltrosDisponiveis] = useState({ categorias: [], usuarios: [] });
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const [reportTotalPages, setReportTotalPages] = useState(1);

  const [validadeReport, setValidadeReport] = useState(null);
  const [loadingValidade, setLoadingValidade] = useState(false);

  const [abcCurve, setAbcCurve] = useState(null);
  const [loadingAbc, setLoadingAbc] = useState(false);

  const [productivity, setProductivity] = useState([]);
  const [loadingProductivity, setLoadingProductivity] = useState(false);
  const [tableSorts, setTableSorts] = useState({});

  const [isManualAdjustmentModalOpen, setIsManualAdjustmentModalOpen] = useState(false);
  const [selectedProductForAdjustment, setSelectedProductForAdjustment] = useState(null);
  const [manualAdjustmentForm, setManualAdjustmentForm] = useState({ nova_quantidade: '', validade: '', observacao: '' });
  const [savingManualAdjustment, setSavingManualAdjustment] = useState(false);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [userHistory, setUserHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState(null);
  const activeTabRef = useRef(activeTab);
  const currentPageRef = useRef(currentPage);
  const productSearchRef = useRef(productSearch);
  const reportPageRef = useRef(reportPage);
  const reportSearchRef = useRef(reportSearch);
  const reportStatusFilterRef = useRef(reportStatusFilter);
  const reportCategoriaFilterRef = useRef(reportCategoriaFilter);
  const reportTipoDiferencaFilterRef = useRef(reportTipoDiferencaFilter);
  const reportUsuarioFilterRef = useRef(reportUsuarioFilter);
  const loadInventoryDetailsRef = useRef(null);
  const loadProductsRef = useRef(null);
  const loadUsersRef = useRef(null);
  const loadReleaseOptionsRef = useRef(null);
  const loadReportRef = useRef(null);
  const loadValidadeReportRef = useRef(null);
  const loadAbcCurveRef = useRef(null);
  const loadProductivityRef = useRef(null);
  const realtimeRefreshTimersRef = useRef({});

  const consolidatedSummary = reportSummary || summary;
  const releaseSummaryMap = useMemo(
    () => new Map((releaseOptions.liberacoes || []).map((item) => [Number(item.usuario_id), item])),
    [releaseOptions.liberacoes]
  );
  const selectedReleaseSummary = releaseForm.usuario_id
    ? releaseSummaryMap.get(Number(releaseForm.usuario_id))
    : null;
  const filteredReleaseProducts = useMemo(() => {
    const search = releaseForm.busca.trim().toLowerCase();

    return (releaseOptions.produtos || []).filter((produto) => {
      const matchesSearch = !search || [produto.nome, produto.sku, produto.categoria, produto.codigo_referencia, produto.codigo_barras]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));

      const matchesCategories = releaseForm.categorias.length === 0
        || releaseForm.categorias.includes(produto.categoria);

      const matchesStatus = releaseForm.status_contagem.length === 0
        || releaseForm.status_contagem.some((status) => {
          if (status === produto.status) {
            return true;
          }

          return inventory?.status === 'em_recontagem'
            && status === 'divergente'
            && produto.status === 'aguarda_recontagem';
        });

      const matchesUser = !releaseForm.apenas_contados_pelo_usuario 
        || (releaseForm.usuario_id && (
            String(produto.ultimo_registro_usuario_id) === String(releaseForm.usuario_id) ||
            (produto.liberado_para && produto.liberado_para.includes(Number(releaseForm.usuario_id)))
        ));

      return matchesSearch && matchesCategories && matchesStatus && matchesUser;
    });
  }, [inventory?.status, releaseForm, releaseOptions.produtos]);

  const toggleTableSort = useCallback((tableKey, columnKey) => {
    setTableSorts((current) => {
      const currentSort = current[tableKey];
      if (!currentSort || currentSort.column !== columnKey) {
        return {
          ...current,
          [tableKey]: { column: columnKey, direction: 'desc' }
        };
      }

      return {
        ...current,
        [tableKey]: {
          column: columnKey,
          direction: currentSort.direction === 'desc' ? 'asc' : 'desc'
        }
      };
    });
  }, []);

  const getSortedRows = useCallback((rows, tableKey, accessors) => {
    const currentSort = tableSorts[tableKey];
    if (!currentSort || !accessors[currentSort.column]) {
      return rows;
    }

    const accessor = accessors[currentSort.column];
    return [...rows].sort((left, right) => {
      const comparison = compareSortableEntries(accessor(left), accessor(right));
      return currentSort.direction === 'asc' ? comparison : -comparison;
    });
  }, [tableSorts]);

  const renderSortableHeader = useCallback((tableKey, columnKey, label, className = '') => {
    const currentSort = tableSorts[tableKey];
    const isActive = currentSort?.column === columnKey;
    const Icon = !isActive ? ArrowUpDown : currentSort.direction === 'asc' ? ArrowUp : ArrowDown;

    return (
      <button
        type="button"
        onClick={() => toggleTableSort(tableKey, columnKey)}
        className="inline-flex items-center gap-1.5 font-semibold text-slate-600 transition-colors hover:text-indigo-600"
        title={`Ordenar por ${label}`}
      >
        <span className={className}>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
      </button>
    );
  }, [tableSorts, toggleTableSort]);

  const sortedProducts = useMemo(() => getSortedRows(products, 'products', {
    sku: (item) => item.Produto?.sku || '',
    referencia: (item) => item.Produto?.codigo_referencia || '',
    nome: (item) => item.Produto?.nome || '',
    codigo_barras: (item) => item.Produto?.codigo_barras || '',
    saldo_erp: (item) => Number(item.saldo_erp || 0),
    fator: (item) => Number(item.fator_conversao || 0)
  }), [products, getSortedRows]);

  const sortedReportData = useMemo(() => getSortedRows(reportData, 'report', {
    produto: (item) => item.produto?.nome || '',
    contagem1: (item) => Number(item.historico_contagens?.[1] ?? -Infinity),
    contagem2: (item) => Number(item.historico_contagens?.[2] ?? -Infinity),
    total_contado: (item) => Number(item.total_contado || 0),
    saldo_erp: (item) => Number(item.saldo_erp || 0),
    diferenca: (item) => Number(item.diferenca || 0),
    auditoria: (item) => item.ultimo_registro?.data_hora || item.ultimo_registro?.usuario_nome || ''
  }), [reportData, getSortedRows]);

  const validadeSectionKeys = useMemo(() => ['vencidos', 'vence_30_dias', 'vence_90_dias', 'vence_120_dias', 'vence_mais_120_dias'], []);
  const sortedValidadeSections = useMemo(() => {
    const report = validadeReport || {};
    return Object.fromEntries(validadeSectionKeys.map((sectionKey) => [
      sectionKey,
      getSortedRows(report[sectionKey] || [], `validade_${sectionKey}`, {
        produto: (item) => item.nome || '',
        codigo: (item) => item.sku || item.codigo_referencia || item.codigo_barras || '',
        quantidade: (item) => Number(item.quantidade || 0),
        preco_custo: (item) => Number(item.preco_custo || 0),
        preco_venda: (item) => Number(item.preco_venda || 0),
        valor_total_custo: (item) => Number(item.valor_total_custo || item.valor_total || 0),
        valor_total_venda: (item) => Number(item.valor_total_venda || 0),
        validade: (item) => item.validade || '',
        dias_restantes: (item) => Number(item.dias_restantes || 0),
        origem: (item) => item.origem || ''
      })
    ]));
  }, [validadeReport, getSortedRows, validadeSectionKeys]);

  const sortedAbcCurve = useMemo(() => getSortedRows(abcCurve?.curve || [], 'abc', {
    classe: (item) => item.classe || '',
    produto: (item) => item.nome || '',
    saldo_erp: (item) => Number(item.saldo_erp || 0),
    preco_custo: (item) => Number(item.preco_custo || 0),
    valor_total_erp: (item) => Number(item.valor_total_erp || 0),
    porcentagem_acumulada: (item) => Number(item.porcentagem_acumulada || 0)
  }), [abcCurve, getSortedRows]);

  const sortedProductivity = useMemo(() => getSortedRows(productivity, 'productivity', {
    posicao: (item) => Number(item.itens_auditados || 0),
    operador: (item) => item.nome || '',
    itens_auditados: (item) => Number(item.itens_auditados || 0),
    valor_auditado: (item) => Number(item.valor_auditado || 0)
  }), [productivity, getSortedRows]);

  const tabOptions = useMemo(
    () => [
      { key: 'overview', label: 'Visao Geral' },
      { key: 'products', label: 'Produtos' },
      { key: 'users', label: 'Usuarios' },
      { key: 'reports', label: 'Relatorios' },
      { key: 'validade', label: 'Validade' },
      { key: 'abc', label: 'Curva ABC' },
      { key: 'produtividade', label: 'Produtividade' }
    ],
    []
  );

  const loadInventoryDetails = useCallback(async () => {
    try {
      const response = await api.get(`/inventories/${id}/dashboard`);
      setInventory(response.data.inventario);
      setStats(response.data.stats);
      setSummary(response.data.summary);
      setRecentActivity(response.data.recentActivity || []);
    } catch (error) {
      console.error('Error loading inventory details:', error);
      setFeedback('Nao foi possivel carregar os detalhes do inventario.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadProducts = useCallback(
    async (page = 1, search = productSearch, options = {}) => {
      const { silent = false } = options;
      try {
        if (!silent) {
          setLoadingProducts(true);
        }
        const response = await api.get(`/inventories/${id}/produtos`, {
          params: {
            page,
            limit: 50,
            busca: search || undefined,
            apenasDivergentes: false
          }
        });

        setProducts(response.data.produtos);
        setTotalProducts(response.data.total);
        setCurrentPage(response.data.currentPage);
        setTotalPages(response.data.totalPages || 1);
      } catch (error) {
        console.error('Error loading inventory products:', error);
        setFeedback('Nao foi possivel carregar os produtos do inventario.');
      } finally {
        if (!silent) {
          setLoadingProducts(false);
        }
      }
    },
    [id, productSearch]
  );

  const loadUsers = useCallback(async (options = {}) => {
    const { silent = false } = options;
    try {
      if (!silent) {
        setLoadingUsers(true);
      }
      const response = await api.get(`/inventories/${id}/usuarios`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error loading inventory users:', error);
      setFeedback('Nao foi possivel carregar os usuarios vinculados.');
    } finally {
      if (!silent) {
        setLoadingUsers(false);
      }
    }
  }, [id]);

  const loadReleaseOptions = useCallback(async (options = {}) => {
    const { silent = false } = options;
    try {
      if (!silent) {
        setLoadingReleaseOptions(true);
      }
      const response = await api.get(`/inventories/${id}/liberacoes`);
      const availableUserIds = (response.data.usuarios || []).map((usuario) => usuario.id.toString());
      setReleaseOptions(response.data);
      setReleaseForm((current) => ({
        ...current,
        usuario_id: availableUserIds.includes(current.usuario_id)
          ? current.usuario_id
          : response.data.usuarios?.[0]?.id?.toString() || ''
      }));
    } catch (error) {
      console.error('Error loading release options:', error);
      setFeedback(error.response?.data?.message || 'Nao foi possivel carregar as opcoes de liberacao.');
    } finally {
      if (!silent) {
        setLoadingReleaseOptions(false);
      }
    }
  }, [id]);

  const loadReport = useCallback(
    async (page = 1, search = reportSearch, status = reportStatusFilter, categoria = reportCategoriaFilter, tipoDiferenca = reportTipoDiferencaFilter, usuarioId = reportUsuarioFilter, options = {}) => {
      const { silent = false } = options;
      try {
        if (!silent) {
          setLoadingReport(true);
        }
        const response = await api.get(`/inventories/${id}/relatorio`, {
          params: {
            page,
            limit: 50,
            busca: search || undefined,
            status: status || undefined,
            categoria: categoria || undefined,
            tipoDiferenca: tipoDiferenca || undefined,
            usuarioId: usuarioId || undefined
          }
        });

        setReportData(response.data.relatorio);
        setReportSummary(response.data.summary);
        setRecentActivity(response.data.recentActivity || []);
        setReportPage(response.data.currentPage);
        setReportTotalPages(response.data.totalPages || 1);
        if (response.data.filtrosDestaque) {
          setReportFiltrosDisponiveis(response.data.filtrosDestaque);
        }
      } catch (error) {
        console.error('Error loading inventory report:', error);
        setFeedback('Nao foi possivel carregar o relatorio do inventario.');
      } finally {
        if (!silent) {
          setLoadingReport(false);
        }
      }
    },
    [id, reportSearch, reportStatusFilter, reportCategoriaFilter, reportTipoDiferencaFilter, reportUsuarioFilter]
  );

  const loadValidadeReport = useCallback(async (options = {}) => {
    const { silent = false } = options;
    try {
      if (!silent) {
        setLoadingValidade(true);
      }
      const response = await api.get(`/inventories/${id}/validade-report`);
      setValidadeReport(response.data);
    } catch (error) {
      console.error('Error loading validade report:', error);
      setFeedback('Não foi possível carregar o relatório de validade.');
    } finally {
      if (!silent) {
        setLoadingValidade(false);
      }
    }
  }, [id]);

  const loadAbcCurve = useCallback(async (options = {}) => {
    const { silent = false } = options;
    try {
      if (!silent) {
        setLoadingAbc(true);
      }
      const response = await api.get(`/inventories/${id}/abc-curve`);
      setAbcCurve(response.data);
    } catch (error) {
      console.error('Error loading ABC curve:', error);
      setFeedback('Não foi possível carregar a Curva ABC.');
    } finally {
      if (!silent) {
        setLoadingAbc(false);
      }
    }
  }, [id]);

  const loadProductivity = useCallback(async (options = {}) => {
    const { silent = false } = options;
    try {
      if (!silent) {
        setLoadingProductivity(true);
      }
      const response = await api.get(`/inventories/${id}/productivity`);
      setProductivity(response.data);
    } catch (error) {
      console.error('Error loading productivity:', error);
      setFeedback('Não foi possível carregar a produtividade.');
    } finally {
      if (!silent) {
        setLoadingProductivity(false);
      }
    }
  }, [id]);

  const scheduleRealtimeRefresh = useCallback((key, callback, delay = 350) => {
    const timers = realtimeRefreshTimersRef.current;
    if (timers[key]) {
      window.clearTimeout(timers[key]);
    }

    timers[key] = window.setTimeout(() => {
      delete timers[key];
      callback();
    }, delay);
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
    currentPageRef.current = currentPage;
    productSearchRef.current = productSearch;
    reportPageRef.current = reportPage;
    reportSearchRef.current = reportSearch;
    reportStatusFilterRef.current = reportStatusFilter;
    reportCategoriaFilterRef.current = reportCategoriaFilter;
    reportTipoDiferencaFilterRef.current = reportTipoDiferencaFilter;
    reportUsuarioFilterRef.current = reportUsuarioFilter;
    loadInventoryDetailsRef.current = loadInventoryDetails;
    loadProductsRef.current = loadProducts;
    loadUsersRef.current = loadUsers;
    loadReleaseOptionsRef.current = loadReleaseOptions;
    loadReportRef.current = loadReport;
    loadValidadeReportRef.current = loadValidadeReport;
    loadAbcCurveRef.current = loadAbcCurve;
    loadProductivityRef.current = loadProductivity;
  }, [
    activeTab,
    currentPage,
    productSearch,
    reportPage,
    reportSearch,
    reportStatusFilter,
    reportCategoriaFilter,
    reportTipoDiferencaFilter,
    reportUsuarioFilter,
    loadInventoryDetails,
    loadProducts,
    loadUsers,
    loadReleaseOptions,
    loadReport,
    loadValidadeReport,
    loadAbcCurve,
    loadProductivity
  ]);

  useEffect(() => {
    loadInventoryDetails();
  }, [loadInventoryDetails]);

  useEffect(() => {
    if (activeTab !== 'products') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      loadProducts(1, productSearch);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, loadProducts, productSearch]);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
      loadReleaseOptions();
    }
  }, [activeTab, loadUsers, loadReleaseOptions]);

  useEffect(() => {
    if (activeTab !== 'reports') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      loadReport(1, reportSearch, reportStatusFilter, reportCategoriaFilter, reportTipoDiferencaFilter, reportUsuarioFilter);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, loadReport, reportSearch, reportStatusFilter, reportCategoriaFilter, reportTipoDiferencaFilter, reportUsuarioFilter]);

  useEffect(() => {
    if (activeTab === 'validade') {
      loadValidadeReport();
    }
  }, [activeTab, loadValidadeReport]);

  useEffect(() => {
    if (activeTab === 'abc') {
      loadAbcCurve();
    }
  }, [activeTab, loadAbcCurve]);

  useEffect(() => {
    if (activeTab === 'produtividade') {
      loadProductivity();
    }
  }, [activeTab, loadProductivity]);

  useEffect(() => () => {
    Object.values(realtimeRefreshTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    realtimeRefreshTimersRef.current = {};
  }, []);

  useEffect(() => {
    connectSocketWithToken();
    
    const handleConnect = () => {
      socket.emit('joinInventory', id);
    };

    if (socket.connected) {
      handleConnect();
    }
    
    socket.on('connect', handleConnect);

    const handleInventoryUpdate = (event) => {
      console.log('Real-time update received:', event);
      const eventType = event?.type || '';
      const isCountEvent = eventType === 'count_submitted';

      if (isCountEvent) {
        if (activeTabRef.current === 'overview') {
          scheduleRealtimeRefresh('overview-details', () => {
            loadInventoryDetailsRef.current?.();
          }, 300);
        } else if (activeTabRef.current === 'products') {
          scheduleRealtimeRefresh('products-refresh', () => {
            loadProductsRef.current?.(currentPageRef.current, productSearchRef.current, { silent: true });
          }, 300);
        } else if (activeTabRef.current === 'reports') {
          scheduleRealtimeRefresh('report-refresh', () => {
            loadReportRef.current?.(
              reportPageRef.current,
              reportSearchRef.current,
              reportStatusFilterRef.current,
              reportCategoriaFilterRef.current,
              reportTipoDiferencaFilterRef.current,
              reportUsuarioFilterRef.current,
              { silent: true }
            );
          }, 300);
        } else if (activeTabRef.current === 'validade') {
          scheduleRealtimeRefresh('validade-refresh', () => {
            loadValidadeReportRef.current?.({ silent: true });
          }, 350);
        } else if (activeTabRef.current === 'abc') {
          scheduleRealtimeRefresh('abc-refresh', () => {
            loadAbcCurveRef.current?.({ silent: true });
          }, 400);
        } else if (activeTabRef.current === 'produtividade') {
          scheduleRealtimeRefresh('productivity-refresh', () => {
            loadProductivityRef.current?.({ silent: true });
          }, 400);
        }
        return;
      }

      const shouldRefreshDetails = activeTabRef.current !== 'users'
        || ['status_changed', 'settings_changed', 'user_added', 'release_changed'].includes(eventType);

      if (shouldRefreshDetails) {
        scheduleRealtimeRefresh('details-refresh', () => {
          loadInventoryDetailsRef.current?.();
        }, 150);
      }

      if (activeTabRef.current === 'products') {
        scheduleRealtimeRefresh('products-refresh', () => {
          loadProductsRef.current?.(currentPageRef.current, productSearchRef.current, { silent: true });
        }, 150);
      } else if (activeTabRef.current === 'users') {
        if (eventType === 'user_added') {
          scheduleRealtimeRefresh('users-refresh', () => {
            loadUsersRef.current?.({ silent: true });
            loadReleaseOptionsRef.current?.({ silent: true });
          }, 150);
        }

        if (eventType === 'release_changed') {
          scheduleRealtimeRefresh('release-options-refresh', () => {
            loadReleaseOptionsRef.current?.({ silent: true });
          }, 150);
        }
      } else if (activeTabRef.current === 'reports') {
        scheduleRealtimeRefresh('report-refresh', () => {
          loadReportRef.current?.(
            reportPageRef.current,
            reportSearchRef.current,
            reportStatusFilterRef.current,
            reportCategoriaFilterRef.current,
            reportTipoDiferencaFilterRef.current,
            reportUsuarioFilterRef.current,
            { silent: true }
          );
        }, 150);
      } else if (activeTabRef.current === 'validade') {
        scheduleRealtimeRefresh('validade-refresh', () => {
          loadValidadeReportRef.current?.({ silent: true });
        }, 150);
      } else if (activeTabRef.current === 'abc') {
        scheduleRealtimeRefresh('abc-refresh', () => {
          loadAbcCurveRef.current?.({ silent: true });
        }, 150);
      } else if (activeTabRef.current === 'produtividade') {
        scheduleRealtimeRefresh('productivity-refresh', () => {
          loadProductivityRef.current?.({ silent: true });
        }, 150);
      }
    };

    const handleInventoryPresenceUpdate = () => {
      if (activeTabRef.current === 'users') {
        scheduleRealtimeRefresh('users-presence-refresh', () => {
          loadUsersRef.current?.({ silent: true });
        }, 150);
      }
    };

    socket.on('inventoryUpdate', handleInventoryUpdate);
    socket.on('inventoryPresenceUpdate', handleInventoryPresenceUpdate);

    return () => {
      socket.emit('leaveInventory', id);
      socket.off('connect', handleConnect);
      socket.off('inventoryUpdate', handleInventoryUpdate);
      socket.off('inventoryPresenceUpdate', handleInventoryPresenceUpdate);
      socket.disconnect();
    };
  }, [id, scheduleRealtimeRefresh]);

  const refreshAll = async () => {
    await loadInventoryDetails();

    if (activeTab === 'products') {
      await loadProducts(currentPage);
    }

    if (activeTab === 'users') {
      await Promise.all([loadUsers(), loadReleaseOptions()]);
    }

    if (activeTab === 'reports') {
      await loadReport(reportPage);
    }

    if (activeTab === 'validade') {
      await loadValidadeReport();
    }

    if (activeTab === 'abc') {
      await loadAbcCurve();
    }

    if (activeTab === 'produtividade') {
      await loadProductivity();
    }
  };

  const updateInventoryStatus = async (status, isReopen = false) => {
    try {
      await api.put(`/inventories/${id}/status`, { status, isReopen });
      await refreshAll();
      setFeedback('');
    } catch (error) {
      console.error('Error updating inventory status:', error);
      setFeedback(
        error.response?.data?.message || 'Nao foi possivel atualizar o status do inventario.'
      );
    }
  };

  const handleStartCount = async () => {
    if (!window.confirm('Deseja iniciar a 1a contagem deste inventario?')) {
      return;
    }

    await updateInventoryStatus('em_contagem');
  };

  const handleStartRecount = async () => {
    if (!window.confirm('Deseja iniciar a 2a contagem apenas para os itens divergentes?')) {
      return;
    }

    await updateInventoryStatus('em_recontagem');
  };

  const handleFinalize = async () => {
    if (!window.confirm('Deseja finalizar este inventario e bloquear novas contagens?')) {
      return;
    }

    await updateInventoryStatus('finalizado');
  };

  const handleReopenCount = async () => {
    if (!window.confirm('Deseja reabrir a contagem deste inventário?')) {
      return;
    }

    const previousStatus = inventory.etapa_contagem > 1 ? 'em_recontagem' : 'em_contagem';
    await updateInventoryStatus(previousStatus, true);
  };

  const handleImportSuccess = async (data) => {
    setFeedback(`Planilha atualizada com sucesso. Produtos criados: ${data.productsCreated}, Produtos atualizados: ${data.productsUpdated}, Estoques criados: ${data.estoqueCreated}, Estoques atualizados: ${data.estoqueUpdated}`);
    await refreshAll();
  };

  const handleAddUser = async (event) => {
    event.preventDefault();

    try {
      setAddingUser(true);
      await api.post(`/inventories/${id}/usuarios`, newUser);
      setShowAddUserModal(false);
      setNewUser({ nome: '', email: '', senha: '', nivel_acesso: 'operador' });
      await Promise.all([loadUsers(), loadReleaseOptions()]);
    } catch (error) {
      console.error('Error adding user:', error);
      setFeedback(error.response?.data?.message || 'Nao foi possivel adicionar o usuario.');
    } finally {
      setAddingUser(false);
    }
  };

  const handleViewUserHistory = async (user) => {
    setSelectedUserForHistory(user);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setUserHistory([]);

    try {
      const response = await api.get(`/usuarios/${user.id}/history`, {
        params: { inventario_id: id }
      });
      setUserHistory(response.data);
    } catch (error) {
      console.error('Error loading user history:', error);
      setFeedback('Erro ao carregar o histórico de contagens deste usuário.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExportUserHistory = async () => {
    if (!selectedUserForHistory) return;
    try {
      const response = await api.get(`/inventories/${id}/usuarios/${selectedUserForHistory.id}/export-history`, {
        params: { format: 'xlsx' },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `historico_${selectedUserForHistory.nome.replace(/\s+/g, '_')}_inv_${id}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting user history:', error);
      setFeedback('Não foi possível exportar o histórico.');
    }
  };

  const handleExportReport = async (format) => {
    try {
      const response = await api.get(`/inventories/${id}/export`, {
        params: { format },
        responseType: 'blob'
      });

      const extension = format === 'xlsx' ? 'xlsx' : 'csv';
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventario_${id}_relatorio.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting report:', error);
      setFeedback('Nao foi possivel exportar o relatorio.');
    }
  };

  const handleExportAdjusted = async (format) => {
    try {
      const response = await api.get(`/inventories/${id}/export-adjusted`, {
        params: { format },
        responseType: 'blob'
      });

      const extension = format === 'xlsx' ? 'xlsx' : 'csv';
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventario_${id}_ajustado.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting adjusted spreadsheet:', error);
      setFeedback('Nao foi possivel exportar a planilha ajustada.');
    }
  };

  const handleExportLoss = async (format) => {
    try {
      const response = await api.get(`/inventories/${id}/export-loss`, {
        params: { format },
        responseType: 'blob'
      });

      const extension = format === 'xlsx' ? 'xlsx' : 'csv';
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `termo_quebra_${id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting loss report:', error);
      setFeedback('Nao foi possivel exportar o termo de quebra. Verifique se existem divergencias negativas.');
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('Link de acesso copiado com sucesso.');
    } catch (error) {
      console.error('Error copying link:', error);
      setFeedback('Nao foi possivel copiar o link.');
    }
  };

  const toggleReleaseArrayField = (field, value) => {
    setReleaseForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value]
    }));
  };

  const toggleReleaseProduct = (produtoId) => {
    setReleaseForm((current) => ({
      ...current,
      produto_ids: current.produto_ids.includes(produtoId)
        ? current.produto_ids.filter((item) => item !== produtoId)
        : [...current.produto_ids, produtoId]
    }));
  };

  const handleSelectFilteredProducts = () => {
    setReleaseForm((current) => ({
      ...current,
      produto_ids: [...new Set([...current.produto_ids, ...filteredReleaseProducts.map((produto) => produto.produto_id)])]
    }));
  };

  const handleClearSelectedProducts = () => {
    setReleaseForm((current) => ({
      ...current,
      produto_ids: []
    }));
  };

  const handleResetReleaseForm = () => {
    setReleaseForm((current) => ({
      ...current,
      categorias: [],
      status_contagem: [],
      produto_ids: [],
      busca: '',
      apenas_contados_pelo_usuario: false
    }));
  };

  const handleSaveRelease = async () => {
    if (!releaseForm.usuario_id) {
      setFeedback('Selecione um usuario para registrar a liberacao.');
      return;
    }

    try {
      setSavingRelease(true);
      await api.post(`/inventories/${id}/liberacoes`, {
        usuario_id: Number(releaseForm.usuario_id),
        categorias: releaseForm.categorias,
        status_contagem: releaseForm.status_contagem,
        produto_ids: releaseForm.produto_ids,
        apenas_contados_pelo_usuario: releaseForm.apenas_contados_pelo_usuario
      });
      setFeedback('Liberacao registrada com sucesso.');
      await loadReleaseOptions();
    } catch (error) {
      console.error('Error saving release:', error);
      setFeedback(error.response?.data?.message || 'Nao foi possivel salvar a liberacao.');
    } finally {
      setSavingRelease(false);
    }
  };

  const handleClearRelease = async (usuarioId) => {
    if (!window.confirm('Deseja remover todas as liberacoes deste usuario neste inventario?')) {
      return;
    }

    try {
      await api.delete(`/inventories/${id}/liberacoes/${usuarioId}`);
      setFeedback('Liberacoes removidas com sucesso.');
      await loadReleaseOptions();
    } catch (error) {
      console.error('Error clearing release:', error);
      setFeedback(error.response?.data?.message || 'Nao foi possivel remover as liberacoes.');
    }
  };

  const handleToggleValidadeObrigatoria = async () => {
    try {
      const novoValor = !inventory.validade_obrigatoria;
      await api.put(`/inventories/${id}/status`, { validade_obrigatoria: novoValor });
      setInventory({ ...inventory, validade_obrigatoria: novoValor });
      setFeedback(`Validade Obrigatória ${novoValor ? 'ativada' : 'desativada'} com sucesso.`);
    } catch (error) {
      console.error('Error updating validade obrigatoria:', error);
      setFeedback('Erro ao atualizar a obrigatoriedade da validade.');
    }
  };

  const handleUpdateUserLocal = async (usuarioId, local) => {
    try {
      await api.put(`/inventories/${id}/usuarios/${usuarioId}/local`, { local_atribuido: local });
      setFeedback('Local de contagem atualizado com sucesso.');
      await loadUsers();
    } catch (error) {
      console.error('Error updating user local:', error);
      setFeedback('Erro ao atualizar o local de contagem.');
    }
  };

  const handleOpenManualAdjustment = (item) => {
    setSelectedProductForAdjustment(item);
    setManualAdjustmentForm({
      nova_quantidade: item.total_contado,
      validade: item.ultimo_registro?.validade || '',
      observacao: item.ultimo_registro?.observacao || ''
    });
    setIsManualAdjustmentModalOpen(true);
  };

  const handleCloseManualAdjustment = () => {
    setIsManualAdjustmentModalOpen(false);
    setSelectedProductForAdjustment(null);
    setManualAdjustmentForm({ nova_quantidade: '', validade: '', observacao: '' });
  };

  const handleSaveManualAdjustment = async (e) => {
    e.preventDefault();
    if (!selectedProductForAdjustment) return;

    try {
      setSavingManualAdjustment(true);
      await api.post(`/inventories/${id}/ajuste-manual`, {
        produto_id: selectedProductForAdjustment.produto_id,
        nova_quantidade: Number(manualAdjustmentForm.nova_quantidade),
        validade: manualAdjustmentForm.validade || null,
        observacao: manualAdjustmentForm.observacao || null
      });
      setFeedback('Ajuste manual realizado com sucesso.');
      handleCloseManualAdjustment();
      loadReport(reportPage, reportSearch, reportStatusFilter);
      loadInventoryDetails();
    } catch (error) {
      console.error('Error saving manual adjustment:', error);
      setFeedback(error.response?.data?.message || 'Erro ao realizar o ajuste manual.');
    } finally {
      setSavingManualAdjustment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-slate-100">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" />
            <p className="mt-4 text-slate-500">Carregando detalhes...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!inventory) {
    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-slate-100">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="rounded-[28px] border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">Inventário não encontrado</h2>
            <Link to="/inventarios" className="mt-4 inline-block text-indigo-600 hover:underline">
              Voltar para a lista
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const countLink = `${window.location.origin}/contagem/${id}`;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-100">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="px-4 pb-0 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 shadow-2xl shadow-slate-300/30">
            <div className="px-6 py-7 sm:px-8 lg:px-10">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-4">
                  <Link to="/inventarios" className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-300 transition-colors hover:bg-white/10 hover:text-white">
                    <ArrowLeft className="h-5 w-5" />
                  </Link>

                  <div>
                    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                      Detalhes do inventário
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <h1 className="text-3xl font-bold tracking-tight text-white">{inventory.nome}</h1>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          STATUS_STYLES[inventory.status] || STATUS_STYLES.criado
                        }`}
                      >
                        {STATUS_LABELS[inventory.status] || inventory.status}
                      </span>
                      {inventory.etapa_contagem > 1 ? (
                        <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/20">
                          {inventory.etapa_contagem}a contagem
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                      <span>ID #{inventory.id}</span>
                      <span>Criado em {formatDate(inventory.createdAt)}</span>
                      {inventory.data_fim ? <span>Finalizado em {formatDate(inventory.data_fim)}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setIsReimportModalOpen(true)}
                    className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10"
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Reimportar
                  </button>
                  <button
                    type="button"
                    onClick={refreshAll}
                    className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Atualizar
                  </button>

                  {inventory.status === 'criado' ? (
                    <button
                      type="button"
                      onClick={handleStartCount}
                      className="inline-flex items-center rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Iniciar Contagem
                    </button>
                  ) : null}

                  {inventory.status === 'em_contagem' && consolidatedSummary?.produtos_divergentes > 0 ? (
                    <button
                      type="button"
                      onClick={handleStartRecount}
                      className="inline-flex items-center rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-400"
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Iniciar 2a Contagem
                    </button>
                  ) : null}

                  {inventory.status === 'em_contagem' || inventory.status === 'em_recontagem' ? (
                    <button
                      type="button"
                      onClick={handleFinalize}
                      className="inline-flex items-center rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-400"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Finalizar
                    </button>
                  ) : null}
                  
                  {inventory.status === 'finalizado' ? (
                    <button
                      type="button"
                      onClick={handleReopenCount}
                      className="inline-flex items-center rounded-2xl border border-indigo-500/30 bg-indigo-500/20 px-4 py-2.5 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/30"
                    >
                      <Unlock className="mr-2 h-4 w-4" />
                      Reabrir Contagem
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                {tabOptions.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition-all ${
                      activeTab === tab.key
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
          {feedback ? (
            <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800">
              {feedback}
            </div>
          ) : null}

          {activeTab === 'overview' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Produtos no Inventário"
                  value={stats?.totalProdutos || 0}
                  subtitle="Base importada do ERP"
                  icon={Package}
                  iconClassName="bg-indigo-50 text-indigo-700"
                />
                <StatCard
                  title="Registros de Contagem"
                  value={stats?.totalContagens || 0}
                  subtitle="Lançamentos realizados"
                  icon={CheckCircle}
                  iconClassName="bg-emerald-50 text-emerald-700"
                />
                <StatCard
                  title="Divergências"
                  value={stats?.totalDivergencias || 0}
                  subtitle={`${stats?.totalAguardandoRecontagem || 0} aguardando recontagem`}
                  icon={AlertTriangle}
                  iconClassName="bg-rose-50 text-rose-700"
                />
                <StatCard
                  title="Usuários Ativos"
                  value={stats?.usuariosAtivos || 0}
                  subtitle={`${stats?.progresso || 0}% do inventário contado`}
                  icon={Users}
                  iconClassName="bg-violet-50 text-violet-700"
                />
              </div>

              {(inventory.empresa_cliente_nome || inventory.empresa_cliente_cnpj || inventory.empresa_cliente_filial || inventory.empresa_cliente_endereco) && (
                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3">Informações da Empresa/Cliente</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {inventory.empresa_cliente_nome && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Nome</p>
                        <p className="font-semibold text-slate-800">{inventory.empresa_cliente_nome}</p>
                      </div>
                    )}
                    {inventory.empresa_cliente_cnpj && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">CNPJ</p>
                        <p className="font-semibold text-slate-800">{inventory.empresa_cliente_cnpj}</p>
                      </div>
                    )}
                    {inventory.empresa_cliente_filial && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Filial/Loja</p>
                        <p className="font-semibold text-slate-800">{inventory.empresa_cliente_filial}</p>
                      </div>
                    )}
                    {inventory.empresa_cliente_endereco && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Endereço</p>
                        <p className="font-semibold text-slate-800">{inventory.empresa_cliente_endereco}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Configurações do Inventário</h3>
                <div className="flex items-center">
                  <input
                    id="toggle_validade"
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={inventory.validade_obrigatoria}
                    onChange={handleToggleValidadeObrigatoria}
                  />
                  <label htmlFor="toggle_validade" className="ml-3 block text-sm font-semibold text-slate-900 cursor-pointer select-none">
                    Validade Obrigatória na Contagem
                  </label>
                </div>
                <p className="mt-1 text-sm text-slate-500 ml-8">
                  Quando ativo, os operadores são obrigados a informar a validade de cada produto bipado. Esta configuração tem efeito imediato nos aplicativos de contagem.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Auditoria</p>
                      <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Progresso da operação</h2>
                      <p className="mt-2 text-sm text-slate-500">
                        Acompanhe o andamento da contagem e os volumes pendentes.
                      </p>
                    </div>
                    <span className="rounded-2xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
                      {consolidatedSummary?.progresso || 0}% concluído
                    </span>
                  </div>

                  <div className="mt-6 h-3 w-full rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${consolidatedSummary?.progresso || 0}%` }}
                    />
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Contados</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">{consolidatedSummary?.produtos_contados || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Pendentes</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">{consolidatedSummary?.produtos_pendentes || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Batidos</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">{consolidatedSummary?.produtos_batidos || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Ações sugeridas</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Próximos passos</h2>
                  <div className="mt-5 space-y-3 text-sm text-slate-600">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">1. Compartilhar o link de contagem</p>
                      <p className="mt-1">Envie o acesso web diretamente para os operadores deste inventário.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">2. Monitorar divergências</p>
                      <p className="mt-1">Use a aba de relatórios para filtrar itens divergentes e pendentes.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">3. Exportar resultados</p>
                      <p className="mt-1">Ao final, exporte o saldo validado em CSV ou XLSX para o ERP.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Histórico</p>
                    <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Atividade recente</h2>
                  </div>
                </div>

                {recentActivity.length === 0 ? (
                  <div className="px-6 py-10 text-center text-slate-500">
                    Nenhuma atividade registrada até o momento.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Produto</th>
                          <th className="px-6 py-4 font-semibold">Operador</th>
                          <th className="px-6 py-4 text-right font-semibold">Qtde</th>
                          <th className="px-6 py-4 text-center font-semibold">Etapa</th>
                          <th className="px-6 py-4 font-semibold">Data/Hora</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {recentActivity.map((activity) => (
                          <tr key={activity.id} className="hover:bg-slate-50/70">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-900">{activity.produto_nome || '-'}</div>
                              <div className="text-xs text-slate-500">
                                {activity.sku || '-'} | REF: {activity.codigo_referencia || '-'} | {activity.codigo_barras || 'sem EAN'}
                              </div>
                            </td>
                            <td className="px-6 py-4">{activity.usuario_nome || '-'}</td>
                            <td className="px-6 py-4 text-right font-semibold">{formatNumber(activity.quantidade_contada)} {activity.unidade_medida || 'UN'}</td>
                            <td className="px-6 py-4 text-center">{activity.numero_contagem}a</td>
                            <td className="px-6 py-4">{formatDate(activity.data_hora)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'products' ? (
            <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Base importada</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Produtos vinculados</h2>
                  <p className="mt-1 text-sm text-slate-500">{totalProducts} itens vinculados a este inventário.</p>
                </div>

                <input
                  type="text"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Buscar por nome, SKU, ref ou código"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 lg:max-w-sm"
                />
              </div>

              {loadingProducts ? (
                <div className="px-6 py-10 text-center text-slate-500">Carregando produtos...</div>
              ) : sortedProducts.length === 0 ? (
                <div className="px-6 py-10 text-center text-slate-500">Nenhum produto encontrado para este filtro.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <tr>
                          <th className="px-6 py-4 font-semibold">{renderSortableHeader('products', 'sku', 'SKU')}</th>
                          <th className="px-6 py-4 font-semibold">{renderSortableHeader('products', 'referencia', 'Referência')}</th>
                          <th className="px-6 py-4 font-semibold">{renderSortableHeader('products', 'nome', 'Produto')}</th>
                          <th className="px-6 py-4 font-semibold">{renderSortableHeader('products', 'codigo_barras', 'Código de Barras')}</th>
                          <th className="px-6 py-4 text-right font-semibold">{renderSortableHeader('products', 'saldo_erp', 'Saldo ERP')}</th>
                          <th className="px-6 py-4 text-right font-semibold">{renderSortableHeader('products', 'fator', 'Fator')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {sortedProducts.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="px-6 py-4 font-semibold text-slate-900">{item.Produto?.sku}</td>
                            <td className="px-6 py-4 font-medium text-slate-600">{item.Produto?.codigo_referencia || '-'}</td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-900">{item.Produto?.nome}</div>
                              <div className="text-xs text-slate-500">{item.Produto?.categoria || '-'}</div>
                            </td>
                            <td className="px-6 py-4">{item.Produto?.codigo_barras || '-'}</td>
                            <td className="px-6 py-4 text-right font-semibold">{formatNumber(item.saldo_erp)} {item.Produto?.unidade_medida || 'UN'}</td>
                            <td className="px-6 py-4 text-right">{item.fator_conversao == null ? '-' : formatNumber(item.fator_conversao)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm text-slate-500">
                    <span>Página {currentPage} de {totalPages}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => loadProducts(Math.max(1, currentPage - 1))}
                        disabled={currentPage <= 1}
                        className="rounded-2xl border border-slate-200 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => loadProducts(Math.min(totalPages || 1, currentPage + 1))}
                        disabled={currentPage >= totalPages}
                        className="rounded-2xl border border-slate-200 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {activeTab === 'users' ? (
            <div className="space-y-6">
              <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Equipe vinculada</p>
                    <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Operadores vinculados</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Compartilhe o link web e acompanhe quem pode contar este inventário.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(countLink)}
                      className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Copiar link de acesso
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddUserModal(true)}
                      className="inline-flex items-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Adicionar contador
                    </button>
                  </div>
                </div>

                {loadingUsers ? (
                  <div className="px-6 py-10 text-center text-slate-500">Carregando usuários...</div>
                ) : users.length === 0 ? (
                  <div className="px-6 py-10 text-center text-slate-500">Nenhum usuário vinculado a este inventário.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Nome</th>
                          <th className="px-6 py-4 font-semibold">Email</th>
                          <th className="px-6 py-4 font-semibold">Perfil</th>
                          <th className="px-6 py-4 font-semibold">Local de Contagem</th>
                          <th className="px-6 py-4 font-semibold">Status</th>
                          <th className="px-6 py-4 text-right font-semibold">Itens liberados</th>
                          <th className="px-6 py-4 text-right font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {users.map((user) => {
                          const userReleaseSummary = releaseSummaryMap.get(user.id);

                          return (
                            <tr key={user.id} className="hover:bg-slate-50/70">
                              <td className="px-6 py-4 font-semibold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleViewUserHistory(user)} title="Ver histórico de contagens deste usuário neste inventário">
                                {user.nome}
                              </td>
                              <td className="px-6 py-4">{user.email}</td>
                              <td className="px-6 py-4">
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                  {user.nivel_acesso || 'operador'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <select
                                  value={user.local_atribuido || ''}
                                  onChange={(e) => handleUpdateUserLocal(user.id, e.target.value)}
                                  className="w-full min-w-[120px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/10"
                                >
                                    <option value="">Nenhum (Livre)</option>
                                    {(() => {
                                      let locais = ['Picking', 'Pulmão'];
                                      if (Array.isArray(inventory?.locais_contagem)) {
                                        locais = inventory.locais_contagem;
                                      } else if (typeof inventory?.locais_contagem === 'string') {
                                        try { locais = JSON.parse(inventory.locais_contagem); } catch { /* mantem os locais padrao */ }
                                      }
                                      return locais;
                                    })().map((local) => (
                                      <option key={local} value={local}>
                                        {local}
                                      </option>
                                    ))}
                                  </select>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <span
                                    className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                                      user.online
                                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                        : 'bg-slate-100 text-slate-600 ring-slate-200'
                                    }`}
                                  >
                                    {user.online ? (
                                      <Wifi className="mr-1.5 h-3.5 w-3.5" />
                                    ) : (
                                      <WifiOff className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    {user.online ? 'Conectado' : 'Desconectado'}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {user.online
                                      ? `${user.aparelhos_conectados || 1} aparelho(s) online`
                                      : 'Nenhum aparelho conectado'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="font-semibold text-slate-900">
                                  {userReleaseSummary?.total_produtos_liberados || 0}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleViewUserHistory(user)}
                                  className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
                                  title="Ver Histórico"
                                >
                                  <History className="mr-1 h-3.5 w-3.5" />
                                  Ver Contagens
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Liberação direcionada</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Liberar produtos por usuário</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Escolha um operador e monte a liberação por categoria, status da contagem ou itens específicos.
                  </p>
                </div>

                {loadingReleaseOptions ? (
                  <div className="px-6 py-10 text-center text-slate-500">Carregando opções de liberação...</div>
                ) : releaseOptions.usuarios.length === 0 ? (
                  <div className="px-6 py-10 text-center text-slate-500">
                    Vincule ao menos um usuário ao inventário para criar liberações.
                  </div>
                ) : (
                  <div className="space-y-6 px-6 py-6">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <label className="block text-sm font-semibold text-slate-700">Usuário de destino</label>
                          <select
                            value={releaseForm.usuario_id}
                            onChange={(event) =>
                              setReleaseForm((current) => ({ ...current, usuario_id: event.target.value }))
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                          >
                            {releaseOptions.usuarios.map((usuario) => (
                              <option key={usuario.id} value={usuario.id}>
                                {usuario.nome} ({usuario.nivel_acesso || 'operador'})
                              </option>
                            ))}
                          </select>
                          
                          <label className="flex items-start gap-3 mt-2 cursor-pointer group rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 hover:bg-indigo-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={releaseForm.apenas_contados_pelo_usuario}
                              onChange={(e) => setReleaseForm(curr => ({ ...curr, apenas_contados_pelo_usuario: e.target.checked }))}
                              className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-indigo-900">
                                Restringir aos itens contados/atribuídos a este usuário
                              </span>
                              <span className="text-xs text-indigo-700/80 mt-0.5">
                                Libera apenas os produtos onde o último lançamento foi feito por este operador ou que já estavam liberados para ele (ideal para retrabalhar as próprias divergências ou pendências).
                              </span>
                            </div>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Categorias</p>
                                <p className="text-xs text-slate-500">Qualquer produto das categorias marcadas entra na liberação.</p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                {releaseForm.categorias.length} selecionadas
                              </span>
                            </div>
                            <div className="mt-4 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                              {releaseOptions.categorias.length === 0 ? (
                                <span className="text-sm text-slate-500">Nenhuma categoria encontrada.</span>
                              ) : (
                                releaseOptions.categorias.map((categoria) => {
                                  const isActive = releaseForm.categorias.includes(categoria);
                                  return (
                                    <button
                                      key={categoria}
                                      type="button"
                                      onClick={() => toggleReleaseArrayField('categorias', categoria)}
                                      className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                                        isActive
                                          ? 'bg-indigo-600 text-white'
                                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      {categoria}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Status da contagem</p>
                                <p className="text-xs text-slate-500">Inclui automaticamente todos os produtos com os status marcados.</p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                {releaseForm.status_contagem.length} selecionados
                              </span>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {releaseOptions.statusDisponiveis.map((status) => {
                                const isActive = releaseForm.status_contagem.includes(status.value);
                                return (
                                  <button
                                    key={status.value}
                                    type="button"
                                    onClick={() => toggleReleaseArrayField('status_contagem', status.value)}
                                    className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                                      isActive
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {status.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-semibold text-slate-900">Resumo da seleção</p>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Itens manuais</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">{releaseForm.produto_ids.length}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Visíveis no filtro</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">{filteredReleaseProducts.length}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Já liberados</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">
                              {selectedReleaseSummary?.total_produtos_liberados || 0}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Base total</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">{releaseOptions.produtos.length}</p>
                          </div>
                        </div>

                        {selectedReleaseSummary ? (
                          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-sm text-indigo-900">
                            <p className="font-semibold">Liberação atual do usuário selecionado</p>
                            <p className="mt-1">
                              {selectedReleaseSummary.total_produtos_liberados} itens liberados para {selectedReleaseSummary.nome}.
                            </p>
                            <p className="mt-2 text-xs text-indigo-700">
                              Categorias: {selectedReleaseSummary.categorias.length > 0 ? selectedReleaseSummary.categorias.join(', ') : 'nenhuma'}
                            </p>
                            <p className="mt-1 text-xs text-indigo-700">
                              Status: {selectedReleaseSummary.status.length > 0
                                ? selectedReleaseSummary.status.map((status) => STATUS_LABELS[status] || status).join(', ')
                                : 'nenhum'}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                            Este usuário ainda não possui produtos liberados neste inventário.
                          </div>
                        )}

                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={handleSaveRelease}
                            disabled={savingRelease || !releaseForm.usuario_id}
                            className="inline-flex items-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                          >
                            {savingRelease ? 'Salvando...' : 'Salvar liberação'}
                          </button>
                          <button
                            type="button"
                            onClick={handleResetReleaseForm}
                            className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                          >
                            Limpar seleção
                          </button>
                          {selectedReleaseSummary ? (
                            <button
                              type="button"
                              onClick={() => handleClearRelease(selectedReleaseSummary.usuario_id)}
                              className="rounded-2xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                            >
                              Remover liberação atual
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-slate-50">
                      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Seleção por item</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Filtre a base e marque manualmente os produtos que deseja complementar na liberação.
                          </p>
                        </div>

                        <div className="flex flex-1 flex-col gap-3 xl:max-w-3xl xl:flex-row">
                          <input
                            type="text"
                            value={releaseForm.busca}
                            onChange={(event) =>
                              setReleaseForm((current) => ({ ...current, busca: event.target.value }))
                            }
                            placeholder="Buscar por nome, SKU ou categoria"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                          />

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleSelectFilteredProducts}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                            >
                              Selecionar filtrados
                            </button>
                            <button
                              type="button"
                              onClick={handleClearSelectedProducts}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                            >
                              Limpar itens
                            </button>
                          </div>
                        </div>
                      </div>

                      {filteredReleaseProducts.length === 0 ? (
                        <div className="px-6 py-10 text-center text-slate-500">
                          Nenhum produto encontrado com os filtros atuais.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead className="bg-white text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                              <tr>
                                <th className="px-5 py-4 font-semibold">Selecionar</th>
                                <th className="px-5 py-4 font-semibold">Produto</th>
                                <th className="px-5 py-4 font-semibold">Categoria</th>
                                <th className="px-5 py-4 text-center font-semibold">Status</th>
                                <th className="px-5 py-4 text-right font-semibold">Saldo ERP</th>
                                <th className="px-5 py-4 text-right font-semibold">Validado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-sm text-slate-700">
                              {filteredReleaseProducts.slice(0, 200).map((produto) => {
                                const checked = releaseForm.produto_ids.includes(produto.produto_id);

                                return (
                                  <tr key={produto.produto_id} className="hover:bg-white/80">
                                    <td className="px-5 py-4">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleReleaseProduct(produto.produto_id)}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="font-semibold text-slate-900">{produto.nome}</div>
                                      <div className="text-xs text-slate-500">
                                        {produto.sku || 'Sem SKU'} | REF: {produto.codigo_referencia || '-'} | {produto.codigo_barras || 'sem EAN'}
                                      </div>
                                    </td>
                                    <td className="px-5 py-4">{produto.categoria || '-'}</td>
                                    <td className="px-5 py-4 text-center">
                                      <span
                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                          STATUS_STYLES[produto.status] || STATUS_STYLES.pendente
                                        }`}
                                      >
                                        {STATUS_LABELS[produto.status] || produto.status}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4 text-right font-semibold">
                                      {formatNumber(produto.saldo_erp)}
                                    </td>
                                    <td className="px-5 py-4 text-right">{formatNumber(produto.total_contado)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {filteredReleaseProducts.length > 200 ? (
                        <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
                          Exibindo os primeiros 200 itens do filtro atual para manter a navegação rápida.
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">Liberações salvas</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Resumo dos operadores que já possuem produtos liberados neste inventário.
                        </p>
                      </div>

                      {releaseOptions.liberacoes.length === 0 ? (
                        <div className="px-6 py-10 text-center text-slate-500">
                          Nenhuma liberação foi registrada até o momento.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                              <tr>
                                <th className="px-5 py-4 font-semibold">Usuário</th>
                                <th className="px-5 py-4 text-right font-semibold">Produtos</th>
                                <th className="px-5 py-4 font-semibold">Categorias</th>
                                <th className="px-5 py-4 font-semibold">Status</th>
                                <th className="px-5 py-4 text-right font-semibold">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                              {releaseOptions.liberacoes.map((liberacao) => (
                                <tr key={liberacao.usuario_id} className="hover:bg-slate-50/70">
                                  <td className="px-5 py-4">
                                    <div className="font-semibold text-slate-900">{liberacao.nome || `Usuário #${liberacao.usuario_id}`}</div>
                                    <div className="text-xs text-slate-500">{liberacao.email || '-'}</div>
                                  </td>
                                  <td className="px-5 py-4 text-right font-semibold">
                                    {liberacao.total_produtos_liberados}
                                  </td>
                                  <td className="px-5 py-4">
                                    {liberacao.categorias.length > 0 ? liberacao.categorias.join(', ') : '-'}
                                  </td>
                                  <td className="px-5 py-4">
                                    {liberacao.status.length > 0
                                      ? liberacao.status.map((status) => STATUS_LABELS[status] || status).join(', ')
                                      : '-'}
                                  </td>
                                  <td className="px-5 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setReleaseForm((current) => ({
                                            ...current,
                                            usuario_id: liberacao.usuario_id.toString()
                                          }))
                                        }
                                        className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleClearRelease(liberacao.usuario_id)}
                                        className="rounded-2xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                                      >
                                        Remover
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'reports' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  title="Progresso"
                  value={`${consolidatedSummary?.progresso || 0}%`}
                  subtitle={`${consolidatedSummary?.produtos_contados || 0} de ${consolidatedSummary?.total_produtos || 0} itens`}
                  icon={Clock3}
                  iconClassName="bg-indigo-50 text-indigo-700"
                />
                <StatCard
                  title="Pendentes"
                  value={consolidatedSummary?.produtos_pendentes || 0}
                  subtitle="Sem nenhuma contagem"
                  icon={Package}
                  iconClassName="bg-amber-50 text-amber-700"
                />
                <StatCard
                  title="Batidos"
                  value={consolidatedSummary?.produtos_batidos || 0}
                  subtitle="Sem diferença"
                  icon={CheckCircle}
                  iconClassName="bg-emerald-50 text-emerald-700"
                />
                <StatCard
                  title="Divergentes"
                  value={consolidatedSummary?.produtos_divergentes || 0}
                  subtitle="Precisam de análise"
                  icon={AlertTriangle}
                  iconClassName="bg-rose-50 text-rose-700"
                />
                <StatCard
                  title="Aguardando Recontagem"
                  value={consolidatedSummary?.produtos_aguardando_recontagem || 0}
                  subtitle="Pendentes na etapa atual"
                  icon={RefreshCw}
                  iconClassName="bg-orange-50 text-orange-700"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Valor Total (ERP Custo)"
                  value={`R$ ${formatNumber(consolidatedSummary?.valor_total_erp || 0)}`}
                  subtitle="Baseado no saldo ERP"
                  icon={FileSpreadsheet}
                  iconClassName="bg-blue-50 text-blue-700"
                />
                <StatCard
                  title="Valor Total (ERP Venda)"
                  value={`R$ ${formatNumber(consolidatedSummary?.valor_venda_erp || 0)}`}
                  subtitle="Baseado no saldo ERP"
                  icon={FileSpreadsheet}
                  iconClassName="bg-blue-50 text-blue-700"
                />
                <StatCard
                  title="Valor Contado (Custo)"
                  value={`R$ ${formatNumber(consolidatedSummary?.valor_total_contado || 0)}`}
                  subtitle="Baseado no total validado"
                  icon={CheckCircle}
                  iconClassName="bg-emerald-50 text-emerald-700"
                />
                <StatCard
                  title="Valor Contado (Venda)"
                  value={`R$ ${formatNumber(consolidatedSummary?.valor_venda_contado || 0)}`}
                  subtitle="Baseado no total validado"
                  icon={CheckCircle}
                  iconClassName="bg-emerald-50 text-emerald-700"
                />
                <StatCard
                  title="Valor de Diferença (Custo)"
                  value={`R$ ${formatNumber(consolidatedSummary?.valor_diferenca || 0)}`}
                  subtitle="Diferença financeira"
                  icon={AlertTriangle}
                  iconClassName={consolidatedSummary?.valor_diferenca < 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}
                />
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Relatório</p>
                      <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Divergências e auditoria</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Filtre por status, revise os últimos operadores e exporte o resultado final.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => loadReport(reportPage)}
                        className="inline-flex items-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Atualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportReport('xlsx')}
                        className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Relatório (XLSX)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportAdjusted('xlsx')}
                        className="inline-flex items-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Planilha Ajustada (XLSX)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportLoss('xlsx')}
                        className="inline-flex items-center rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700"
                      >
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Termo de Quebra (XLSX)
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row flex-wrap">
                    <input
                      type="text"
                      value={reportSearch}
                      onChange={(event) => setReportSearch(event.target.value)}
                      placeholder="Buscar por nome, SKU ou código..."
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 lg:max-w-xs flex-1"
                    />

                    <select
                      value={reportStatusFilter}
                      onChange={(event) => setReportStatusFilter(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 min-w-[160px]"
                    >
                      <option value="">Todos os status</option>
                      <option value="pendente">Pendente</option>
                      <option value="ok">Batido</option>
                      <option value="divergente">Divergente</option>
                      <option value="aguarda_recontagem">Aguardando Recontagem</option>
                    </select>

                    <select
                      value={reportTipoDiferencaFilter}
                      onChange={(event) => setReportTipoDiferencaFilter(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 min-w-[160px]"
                    >
                      <option value="">Qualquer Diferença</option>
                      <option value="positiva">Positiva (+)</option>
                      <option value="negativa">Negativa (-)</option>
                      <option value="exata">Exata (=)</option>
                    </select>

                    <select
                      value={reportCategoriaFilter}
                      onChange={(event) => setReportCategoriaFilter(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 min-w-[160px] max-w-xs"
                    >
                      <option value="">Todas as Categorias</option>
                      {reportFiltrosDisponiveis.categorias.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>

                    <select
                      value={reportUsuarioFilter}
                      onChange={(event) => setReportUsuarioFilter(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 min-w-[160px] max-w-xs"
                    >
                      <option value="">Qualquer Operador</option>
                      {reportFiltrosDisponiveis.usuarios.map(user => (
                        <option key={user.id} value={user.id}>{user.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {loadingReport ? (
                  <div className="px-6 py-10 text-center text-slate-500">Carregando relatório...</div>
                ) : sortedReportData.length === 0 ? (
                  <div className="px-6 py-10 text-center text-slate-500">
                    Nenhum item encontrado com os filtros atuais.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.22em] text-slate-500 whitespace-nowrap">
                          <tr>
                            <th className="px-4 py-4 font-semibold w-1/4">{renderSortableHeader('report', 'produto', 'Produto')}</th>
                            <th className="px-4 py-4 font-semibold text-center bg-slate-100/50">{renderSortableHeader('report', 'contagem1', '1a Cont')}</th>
                            {inventory.etapa_contagem > 1 ? (
                              <th className="px-4 py-4 font-semibold text-center bg-slate-100/50">{renderSortableHeader('report', 'contagem2', '2a Cont')}</th>
                            ) : null}
                            <th className="px-4 py-4 text-right font-semibold bg-indigo-50/50">{renderSortableHeader('report', 'total_contado', 'Qtd. Final Validada')}</th>
                            <th className="px-4 py-4 text-right font-semibold bg-slate-100/50">{renderSortableHeader('report', 'saldo_erp', 'Saldo ERP')}</th>
                            <th className="px-4 py-4 text-right font-semibold bg-amber-50/50">{renderSortableHeader('report', 'diferenca', 'Diferença')}</th>
                            <th className="px-4 py-4 font-semibold text-center">{renderSortableHeader('report', 'auditoria', 'Auditoria')}</th>
                            <th className="px-4 py-4 text-center font-semibold">Ajuste</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700 whitespace-nowrap">
                          {sortedReportData.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3 whitespace-normal">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="font-bold text-base text-slate-900 leading-tight mb-1">{item.produto?.nome}</div>
                                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                      <span className="font-mono bg-slate-100 px-1.5 rounded text-slate-600">{item.produto?.sku || 'S/SKU'}</span>
                                      <span title="Referência">REF: {item.produto?.codigo_referencia || '-'}</span>
                                      <span title="EAN">{item.produto?.codigo_barras || 'S/EAN'}</span>
                                    </div>
                                    {item.ultimo_registro?.observacao && (
                                      <div className="mt-2 inline-flex items-start gap-1 rounded-md bg-amber-50/80 px-2 py-1 border border-amber-100">
                                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mt-0.5">OBS:</span>
                                        <span className="text-xs text-amber-900 italic">{item.ultimo_registro.observacao}</span>
                                      </div>
                                    )}
                                    {item.validades_contadas && item.validades_contadas.length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {item.validades_contadas.map((val, idx) => (
                                          <div key={idx} className="inline-flex items-center gap-1 rounded-md bg-slate-100/80 px-2 py-0.5 border border-slate-200" title="Validade Contada">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">VAL:</span>
                                            <span className="text-[11px] text-slate-700 font-medium">{new Date(val.data).toLocaleDateString('pt-BR')} ({val.quantidade} {item.produto?.unidade_medida || 'UN'})</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {item.locais_contados && item.locais_contados.length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {item.locais_contados.map((localObj, idx) => (
                                          <div key={idx} className="inline-flex items-center gap-1 rounded-md bg-indigo-50/80 px-2 py-0.5 border border-indigo-100" title="Local de Contagem">
                                            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5">LOC:</span>
                                            <span className="text-[11px] text-indigo-700 font-medium">{localObj.nome} ({localObj.quantidade} {item.produto?.unidade_medida || 'UN'})</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              
                              <td className="px-4 py-3 text-center bg-slate-50/30">
                                <span className="font-medium text-slate-700">{item.historico_contagens?.[1] ?? '-'}</span>
                              </td>
                              
                              {inventory.etapa_contagem > 1 ? (
                                <td className="px-4 py-3 text-center bg-slate-50/30">
                                  <span className="font-medium text-slate-700">{item.historico_contagens?.[2] ?? '-'}</span>
                                </td>
                              ) : null}
                              
                              <td className="px-4 py-3 text-right bg-indigo-50/30">
                                  <div className="font-bold text-lg text-indigo-700">{formatNumber(item.total_contado)} {item.produto?.unidade_medida || 'UN'}</div>
                                <div className="text-[10px] text-slate-500" title="Valor Validado Custo/Venda">
                                  R$ {formatNumber(item.valor_total_contado)} / R$ {formatNumber(item.valor_venda_contado)}
                                </div>
                              </td>
                              
                              <td className="px-4 py-3 text-right bg-slate-50/30">
                                  <div className="font-semibold text-slate-700">{formatNumber(item.saldo_erp)} {item.produto?.unidade_medida || 'UN'}</div>
                                <div className="text-[10px] text-slate-400" title="Valor ERP Custo/Venda">
                                  R$ {formatNumber(item.valor_total_erp)} / R$ {formatNumber(item.valor_venda_erp)}
                                </div>
                              </td>
                              
                              <td className={`px-4 py-3 text-right bg-amber-50/20 ${item.diferenca === 0 ? 'text-emerald-600' : item.diferenca > 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                                <div className="font-bold">
                                    {item.diferenca > 0 ? '+' : ''}{formatNumber(item.diferenca)} {item.produto?.unidade_medida || 'UN'}
                                  </div>
                                <div className="text-[10px] font-medium opacity-80">
                                  {item.valor_diferenca > 0 ? '+' : ''}R$ {formatNumber(item.valor_diferenca)}
                                </div>
                              </td>
                              
                              <td className="px-4 py-3 whitespace-normal text-center min-w-[140px]">
                                <span className={`inline-block mb-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[item.status] || STATUS_STYLES.pendente}`}>
                                  {STATUS_LABELS[item.status] || item.status}
                                </span>
                                <div className="text-[11px] font-medium text-slate-700 truncate" title={item.ultimo_registro?.usuario_nome}>{item.ultimo_registro?.usuario_nome || '-'}</div>
                                <div className="text-[9px] text-slate-400">{formatDate(item.ultimo_registro?.data_hora)}</div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenManualAdjustment(item)}
                                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                  title="Ajustar Saldo Manualmente"
                                >
                                  <Settings2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm text-slate-500">
                      <span>Página {reportPage} de {reportTotalPages}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => loadReport(Math.max(1, reportPage - 1))}
                          disabled={reportPage <= 1}
                          className="rounded-2xl border border-slate-200 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => loadReport(Math.min(reportTotalPages || 1, reportPage + 1))}
                          disabled={reportPage >= reportTotalPages}
                          className="rounded-2xl border border-slate-200 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'validade' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Produtos Vencidos"
                  value={validadeReport?.vencidos?.length || 0}
                  subtitle={
                    validadeReport?.vencidos?.length > 0 
                      ? `R$ ${formatNumber(validadeReport.vencidos.reduce((acc, curr) => acc + (curr.valor_total || 0), 0))}` 
                      : "Atenção imediata requerida"
                  }
                  icon={AlertTriangle}
                  iconClassName="bg-rose-50 text-rose-700"
                />
                <StatCard
                  title="Vence em 30 dias"
                  value={validadeReport?.vence_30_dias?.length || 0}
                  subtitle={
                    validadeReport?.vence_30_dias?.length > 0 
                      ? `R$ ${formatNumber(validadeReport.vence_30_dias.reduce((acc, curr) => acc + (curr.valor_total || 0), 0))}` 
                      : "Curto prazo"
                  }
                  icon={Clock3}
                  iconClassName="bg-orange-50 text-orange-700"
                />
                <StatCard
                  title="Vence em 90 dias"
                  value={validadeReport?.vence_90_dias?.length || 0}
                  subtitle={
                    validadeReport?.vence_90_dias?.length > 0 
                      ? `R$ ${formatNumber(validadeReport.vence_90_dias.reduce((acc, curr) => acc + (curr.valor_total || 0), 0))}` 
                      : "Médio prazo"
                  }
                  icon={Clock3}
                  iconClassName="bg-amber-50 text-amber-700"
                />
                <StatCard
                  title="Vence em 120 dias"
                  value={validadeReport?.vence_120_dias?.length || 0}
                  subtitle={
                    validadeReport?.vence_120_dias?.length > 0 
                      ? `R$ ${formatNumber(validadeReport.vence_120_dias.reduce((acc, curr) => acc + (curr.valor_total || 0), 0))}` 
                      : "Longo prazo"
                  }
                  icon={Clock3}
                  iconClassName="bg-emerald-50 text-emerald-700"
                />
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Validade</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Controle de Vencimento</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Acompanhe os produtos próximos ao vencimento mapeados neste inventário.
                  </p>
                </div>

                {loadingValidade ? (
                  <div className="px-6 py-10 text-center text-slate-500">Carregando relatório de validade...</div>
                ) : !validadeReport || Object.values(validadeReport).every(arr => arr.length === 0) ? (
                  <div className="px-6 py-10 text-center text-slate-500">
                    Nenhum produto com data de validade mapeada encontrado.
                  </div>
                ) : (
                  <div className="p-6 space-y-8">
                    {[
                      { key: 'vencidos', label: 'Produtos Vencidos', color: 'rose' },
                      { key: 'vence_30_dias', label: 'Vence em até 30 dias', color: 'orange' },
                      { key: 'vence_90_dias', label: 'Vence em até 90 dias', color: 'amber' },
                      { key: 'vence_120_dias', label: 'Vence em até 120 dias', color: 'emerald' },
                      { key: 'vence_mais_120_dias', label: 'Vence em mais de 120 dias', color: 'indigo' }
                    ].map((section) => (
                      sortedValidadeSections[section.key]?.length > 0 && (
                        <div key={section.key} className="space-y-4">
                          <h3 className={`text-lg font-semibold text-${section.color}-700 border-b border-${section.color}-100 pb-2`}>
                            {section.label} ({sortedValidadeSections[section.key].length})
                          </h3>
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="min-w-full">
                              <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                <tr>
                                  <th className="px-6 py-3 font-semibold">{renderSortableHeader(`validade_${section.key}`, 'produto', 'Produto')}</th>
                                  <th className="px-6 py-3 font-semibold">{renderSortableHeader(`validade_${section.key}`, 'codigo', 'Código')}</th>
                                  <th className="px-6 py-3 text-right font-semibold">{renderSortableHeader(`validade_${section.key}`, 'quantidade', 'Quantidade')}</th>
                                  <th className="px-6 py-3 text-right font-semibold">{renderSortableHeader(`validade_${section.key}`, 'preco_custo', 'Preço Custo')}</th>
                                  <th className="px-6 py-3 text-right font-semibold">{renderSortableHeader(`validade_${section.key}`, 'preco_venda', 'Preço Venda')}</th>
                                  <th className="px-6 py-3 text-right font-semibold">{renderSortableHeader(`validade_${section.key}`, 'valor_total_custo', 'Valor Total Custo')}</th>
                                  <th className="px-6 py-3 text-right font-semibold">{renderSortableHeader(`validade_${section.key}`, 'valor_total_venda', 'Valor Total Venda')}</th>
                                  <th className="px-6 py-3 text-center font-semibold">{renderSortableHeader(`validade_${section.key}`, 'validade', 'Validade')}</th>
                                  <th className="px-6 py-3 text-center font-semibold">{renderSortableHeader(`validade_${section.key}`, 'dias_restantes', 'Dias Restantes')}</th>
                                  <th className="px-6 py-3 text-center font-semibold">{renderSortableHeader(`validade_${section.key}`, 'origem', 'Origem')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                                {sortedValidadeSections[section.key].map((item) => (
                                  <tr key={`${item.produto_id}-${item.validade}`} className="hover:bg-slate-50/70">
                                    <td className="px-6 py-3">
                                      <div className="font-medium text-slate-900">{item.nome}</div>
                                      <div className="text-xs text-slate-500">{item.categoria || '-'}</div>
                                    </td>
                                    <td className="px-6 py-3">
                                      <div className="text-slate-900">{item.sku || 'Sem SKU'}</div>
                                      <div className="text-xs text-slate-500">REF: {item.codigo_referencia || '-'}</div>
                                      <div className="text-xs text-slate-500">{item.codigo_barras || 'sem EAN'}</div>
                                    </td>
                                    <td className="px-6 py-3 text-right font-medium">
                                      {formatNumber(item.quantidade || 0)}
                                    </td>
                                    <td className="px-6 py-3 text-right text-xs text-slate-500">
                                      R$ {formatNumber(item.preco_custo || 0)}
                                    </td>
                                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                                      R$ {formatNumber(item.preco_venda || 0)}
                                    </td>
                                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                                      R$ {formatNumber(item.valor_total_custo || item.valor_total || 0)}
                                    </td>
                                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                                      R$ {formatNumber(item.valor_total_venda || 0)}
                                    </td>
                                    <td className="px-6 py-3 text-center font-semibold">
                                      {item.validade.split('-').reverse().join('/')}
                                    </td>
                                    <td className={`px-6 py-3 text-center font-bold ${item.dias_restantes < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                                      {item.dias_restantes} dias
                                    </td>
                                    <td className="px-6 py-3 text-center">
                                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                        item.origem === 'contagem' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-800'
                                      }`}>
                                        {item.origem === 'contagem' ? 'Contagem' : 'ERP'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'abc' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard
                  title="Produtos Classe A"
                  value={abcCurve?.summary?.A || 0}
                  subtitle="Até 80% do valor total"
                  icon={Package}
                  iconClassName="bg-emerald-50 text-emerald-700"
                />
                <StatCard
                  title="Produtos Classe B"
                  value={abcCurve?.summary?.B || 0}
                  subtitle="De 80% a 95% do valor total"
                  icon={Package}
                  iconClassName="bg-amber-50 text-amber-700"
                />
                <StatCard
                  title="Produtos Classe C"
                  value={abcCurve?.summary?.C || 0}
                  subtitle="De 95% a 100% do valor total"
                  icon={Package}
                  iconClassName="bg-slate-50 text-slate-700"
                />
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Priorização Financeira</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Curva ABC</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    A Curva ABC classifica seus produtos baseados no valor total em estoque (Saldo ERP x Preço Unitário). 
                    Foque seus esforços de auditoria na Classe A. Valor Total da Base: R$ {formatNumber(abcCurve?.summary?.total_valor || 0)}
                  </p>
                </div>

                {loadingAbc ? (
                  <div className="px-6 py-10 text-center text-slate-500">Carregando Curva ABC...</div>
                ) : !abcCurve || !abcCurve.curve || sortedAbcCurve.length === 0 ? (
                  <div className="px-6 py-10 text-center text-slate-500">
                    Não foi possível gerar a Curva ABC. Verifique se os produtos possuem preço e saldo.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <tr>
                          <th className="px-6 py-4 font-semibold">{renderSortableHeader('abc', 'classe', 'Classe')}</th>
                          <th className="px-6 py-4 font-semibold">{renderSortableHeader('abc', 'produto', 'Produto')}</th>
                          <th className="px-6 py-4 text-right font-semibold">{renderSortableHeader('abc', 'saldo_erp', 'Saldo ERP')}</th>
                          <th className="px-6 py-4 text-right font-semibold">{renderSortableHeader('abc', 'preco_custo', 'Preço Unit. (Custo)')}</th>
                          <th className="px-6 py-4 text-right font-semibold">{renderSortableHeader('abc', 'valor_total_erp', 'Valor Total ERP (Custo)')}</th>
                          <th className="px-6 py-4 text-right font-semibold">{renderSortableHeader('abc', 'porcentagem_acumulada', '% Acumulada')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {sortedAbcCurve.map((item) => (
                          <tr key={item.produto_id} className="hover:bg-slate-50/70">
                            <td className="px-6 py-4">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  item.classe === 'A'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.classe === 'B'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-800'
                                }`}
                              >
                                Classe {item.classe}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-900">{item.nome}</div>
                              <div className="text-xs text-slate-500">
                                {item.sku || 'Sem SKU'} | REF: {item.codigo_referencia || '-'}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">{formatNumber(item.saldo_erp)} {item.unidade_medida || 'UN'}</td>
                            <td className="px-6 py-4 text-right text-slate-500">R$ {formatNumber(item.preco_custo || 0)}</td>
                            <td className="px-6 py-4 text-right font-semibold text-slate-900">R$ {formatNumber(item.valor_total_erp)}</td>
                            <td className="px-6 py-4 text-right text-slate-500">{Number(item.porcentagem_acumulada).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'produtividade' ? (
            <div className="space-y-6">
              <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Gamificação e Engajamento</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Produtividade Baseada em Valor</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Acompanhe o desempenho dos operadores com base no valor financeiro e na quantidade de itens auditados neste inventário.
                  </p>
                </div>

                {loadingProductivity ? (
                  <div className="px-6 py-10 text-center text-slate-500">Carregando métricas de produtividade...</div>
                ) : !productivity || sortedProductivity.length === 0 ? (
                  <div className="px-6 py-10 text-center text-slate-500">
                    Nenhum dado de contagem encontrado para este inventário.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <tr>
                          <th className="px-6 py-4 font-semibold text-center w-16">{renderSortableHeader('productivity', 'posicao', 'Posição')}</th>
                          <th className="px-6 py-4 font-semibold">{renderSortableHeader('productivity', 'operador', 'Operador')}</th>
                          <th className="px-6 py-4 text-right font-semibold">{renderSortableHeader('productivity', 'itens_auditados', 'Itens Auditados')}</th>
                          <th className="px-6 py-4 text-right font-semibold">{renderSortableHeader('productivity', 'valor_auditado', 'Valor Financeiro Auditado')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {sortedProductivity.map((item, index) => (
                          <tr key={item.usuario_id} className="hover:bg-slate-50/70">
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                                index === 0 ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-200' :
                                index === 1 ? 'bg-slate-200 text-slate-700 ring-2 ring-slate-300' :
                                index === 2 ? 'bg-orange-100 text-orange-800 ring-2 ring-orange-200' :
                                'bg-slate-50 text-slate-500'
                              }`}>
                                {index + 1}º
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-900 text-base">{item.nome}</div>
                            </td>
                            <td className="px-6 py-4 text-right text-base font-medium">{formatNumber(item.itens_auditados)} itens</td>
                            <td className="px-6 py-4 text-right text-base font-bold text-indigo-700">R$ {formatNumber(item.valor_auditado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
          </div>
        </main>
      </div>

      {showAddUserModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Novo acesso</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Adicionar contador</h3>
              <p className="mt-2 text-sm text-slate-500">
                O operador acessará a tela web de contagem com este e-mail e senha.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Nome</label>
                  <input
                    type="text"
                    required
                    value={newUser.nome}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, nome: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">E-mail</label>
                  <input
                    type="email"
                    required
                    value={newUser.email}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, email: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Senha provisória</label>
                  <input
                    type="password"
                    required
                    value={newUser.senha}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, senha: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Nível de acesso</label>
                  <select
                    value={newUser.nivel_acesso}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, nivel_acesso: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option value="operador">Operador (Apenas Conta)</option>
                    <option value="admin_inventario">Admin do Inventário (Acesso Total)</option>
                  </select>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={addingUser}
                    className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {addingUser ? 'Salvando...' : 'Adicionar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <ReimportModal
        isOpen={isReimportModalOpen}
        onClose={() => setIsReimportModalOpen(false)}
        inventarioId={id}
        onImportSuccess={handleImportSuccess}
      />

      {isManualAdjustmentModalOpen && selectedProductForAdjustment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-100 px-6 py-5">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuste Manual</p>
                  <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Sobrescrever Saldo</h3>
                </div>
                <button onClick={handleCloseManualAdjustment} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-sm font-semibold text-slate-900">{selectedProductForAdjustment.produto?.nome}</p>
                <p className="text-xs text-slate-500 mt-1">SKU: {selectedProductForAdjustment.produto?.sku} | EAN: {selectedProductForAdjustment.produto?.codigo_barras}</p>
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block text-xs">Saldo ERP</span>
                  <span className="font-semibold text-slate-700">{selectedProductForAdjustment.saldo_erp}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Contado Atual</span>
                  <span className="font-semibold text-indigo-700">{selectedProductForAdjustment.total_contado}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <form onSubmit={handleSaveManualAdjustment} className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-4">
                  <strong>Atenção:</strong> Este ajuste manual irá substituir todas as contagens anteriores deste produto por este novo valor final.
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Novo Saldo Final Validado</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={manualAdjustmentForm.nova_quantidade}
                    onChange={(e) => setManualAdjustmentForm({ ...manualAdjustmentForm, nova_quantidade: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-bold text-center outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Validade (Opcional)</label>
                  <input
                    type="date"
                    value={manualAdjustmentForm.validade}
                    onChange={(e) => setManualAdjustmentForm({ ...manualAdjustmentForm, validade: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Observação (Opcional)</label>
                  <input
                    type="text"
                    value={manualAdjustmentForm.observacao}
                    onChange={(e) => setManualAdjustmentForm({ ...manualAdjustmentForm, observacao: e.target.value })}
                    placeholder="Motivo do ajuste ou estado do produto..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCloseManualAdjustment}
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingManualAdjustment || manualAdjustmentForm.nova_quantidade === ''}
                    className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-600/20"
                  >
                    {savingManualAdjustment ? 'Salvando...' : 'Confirmar Ajuste'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedUserForHistory && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Histórico no Inventário
                </p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {selectedUserForHistory.nome}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportUserHistory}
                  disabled={historyLoading || userHistory.length === 0}
                  className="inline-flex items-center rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                  title="Exportar para Excel"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar XLSX
                </button>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 bg-slate-50/50">
              {historyLoading ? (
                <div className="flex justify-center items-center py-12">
                  <p className="text-slate-500">Carregando histórico de contagens...</p>
                </div>
              ) : userHistory.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-16 text-center">
                  <Package className="h-12 w-12 text-slate-300 mb-4" />
                  <h4 className="text-lg font-medium text-slate-900">Nenhuma contagem encontrada</h4>
                  <p className="text-slate-500 mt-1 max-w-md">
                    Este usuário ainda não realizou nenhuma contagem de produtos neste inventário.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="bg-slate-50/80 border-b border-slate-100">
                          <tr>
                            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                              Data / Hora
                            </th>
                            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                              Produto
                            </th>
                            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                              Qtd Contada
                            </th>
                            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                              Validade
                            </th>
                            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                              Observação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {userHistory.map((item) => (
                            <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                              <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">
                                {new Date(item.data_hora).toLocaleString('pt-BR', {
                                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'
                                })}
                              </td>
                              <td className="px-5 py-3">
                                <div className="font-medium text-slate-900 text-sm">{item.Produto?.nome}</div>
                                <div className="text-xs text-slate-500">SKU: {item.Produto?.sku} | EAN: {item.Produto?.codigo_barras}</div>
                              </td>
                              <td className="px-5 py-3 text-right text-sm font-bold text-indigo-700">
                                  {formatNumber(item.quantidade_contada)} {item.Produto?.unidade_medida || 'UN'}
                                </td>
                              <td className="px-5 py-3 text-right text-sm text-slate-600">
                                {item.validade ? new Date(item.validade).toLocaleDateString('pt-BR') : '-'}
                              </td>
                              <td className="px-5 py-3 text-right text-sm text-slate-600 truncate max-w-[150px]" title={item.observacao}>
                                {item.observacao || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

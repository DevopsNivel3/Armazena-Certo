import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Package, Search, CheckCircle2, Filter, X, Box, Barcode, ChevronDown, ChevronUp, Camera, RefreshCw, Wifi, WifiOff, CloudOff, CloudUpload, CheckCheck, AlertCircle, ClipboardList, ScanLine, Zap, ShieldCheck } from 'lucide-react';
import ScannerModal from '../components/ScannerModal';
import Sidebar from '../components/Sidebar';
import { connectSocketWithToken, socket } from '../services/socket';

const OFFLINE_QUEUE_KEY = 'inventory_offline_queue';
const OFFLINE_INVENTORY_CACHE_KEY = 'inventory_offline_cache';
const OFFLINE_PRODUCTS_CACHE_KEY = 'inventory_products_offline_cache';
const QUICK_SCAN_MINIMIZED_KEY = 'inventory_quick_scan_minimized';
const QUICK_SCAN_MODE_KEY = 'inventory_quick_scan_mode';
const MAX_AUTO_SYNC_ATTEMPTS = 4;
const SYNC_RETRY_BASE_DELAY_MS = 3000;

function readOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function readCachedUserId() {
  try {
    return JSON.parse(localStorage.getItem('user_cache') || 'null')?.id ?? null;
  } catch {
    return null;
  }
}

function readCachedInventory(inventoryId) {
  try {
    const cache = JSON.parse(localStorage.getItem(OFFLINE_INVENTORY_CACHE_KEY) || '{}');
    return cache[inventoryId] || null;
  } catch {
    return null;
  }
}

function writeCachedInventory(inventoryId, inventory) {
  try {
    const cache = JSON.parse(localStorage.getItem(OFFLINE_INVENTORY_CACHE_KEY) || '{}');
    cache[inventoryId] = {
      data: inventory,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(OFFLINE_INVENTORY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignora falhas de cache local
  }
}

function readCachedProducts(inventoryId) {
  try {
    const cache = JSON.parse(localStorage.getItem(OFFLINE_PRODUCTS_CACHE_KEY) || '{}');
    return cache[inventoryId] || null;
  } catch {
    return null;
  }
}

function writeCachedProducts(inventoryId, payload) {
  try {
    const cache = JSON.parse(localStorage.getItem(OFFLINE_PRODUCTS_CACHE_KEY) || '{}');
    cache[inventoryId] = {
      ...payload,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(OFFLINE_PRODUCTS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignora falhas de cache local
  }
}

function formatValidityInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isValidValidityInput(value) {
  if (!value) return true;
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const [, day, month, year] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 1900
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function formatQuantityInput(value, unit) {
  if (value === undefined || value === null) return '';
  let cleaned = String(value).replace(/[^0-9.,]/g, '').replace(',', '.');
  
  const normalizedUnit = normalizeMeasurementUnit(unit);
  const isDecimal = normalizedUnit === 'KG' || normalizedUnit.startsWith('KG ') || normalizedUnit.includes('KILO');

  if (!isDecimal) {
    // Apenas números inteiros
    return cleaned.replace(/\./g, '');
  }

  // Permitir decimais (apenas um ponto, até 3 casas)
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }
  if (cleaned.includes('.')) {
    const [intPart, decPart] = cleaned.split('.');
    cleaned = `${intPart}.${decPart.slice(0, 3)}`;
  }
  
  return cleaned;
}

function parseQuantityValue(value) {
  if (!value) return '';
  const parsed = parseFloat(String(value).replace(',', '.'));
  return isNaN(parsed) ? '' : parsed;
}

function roundInventoryQuantity(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function normalizeLookupCode(value) {
  return Array.from(String(value || ''))
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('')
    .trim();
}

function productMatchesCode(product, value) {
  const normalizedValue = normalizeLookupCode(value).toLocaleUpperCase('pt-BR');
  if (!normalizedValue || !product) return false;

  const candidates = [normalizedValue];
  if (/^\d{12}$/.test(normalizedValue)) candidates.push(`0${normalizedValue}`);
  if (/^0\d{12}$/.test(normalizedValue)) candidates.push(normalizedValue.slice(1));

  return [product.codigo_barras, product.sku, product.codigo_referencia]
    .filter(Boolean)
    .some((code) => candidates.includes(normalizeLookupCode(code).toLocaleUpperCase('pt-BR')));
}

function normalizeMeasurementUnit(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function resolveCountMultiplier(item) {
  const explicitFactor = Number(item?.fator_conversao);
  if (Number.isFinite(explicitFactor) && explicitFactor > 0) {
    return explicitFactor;
  }

  const normalizedUnit = normalizeMeasurementUnit(item?.Produto?.unidade_medida);
  if (
    normalizedUnit === 'KG'
    || normalizedUnit.startsWith('KG ')
    || normalizedUnit.includes('KILO')
    || normalizedUnit.includes('KILOGRAMA')
  ) {
    return 1000;
  }

  return 1;
}

function IdentifiedProductDetails({ item }) {
  const product = item?.Produto;
  if (!product) return null;

  return (
    <section className="w-full rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 text-cyan-950 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-700">Produto identificado</p>
          <h3 className="mt-1 text-base font-bold leading-tight text-slate-900">{product.nome}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-cyan-100 bg-white p-2.5">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">SKU</span>
              <span className="mt-1 block break-all font-mono text-xs font-bold text-slate-800">{product.sku || '-'}</span>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-white p-2.5">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Referência</span>
              <span className="mt-1 block break-all font-mono text-xs font-bold text-slate-800">{product.codigo_referencia || '-'}</span>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-white p-2.5">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Código de barras</span>
              <span className="mt-1 block break-all font-mono text-xs font-bold text-slate-800">{product.codigo_barras || '-'}</span>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-white p-2.5">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Categoria</span>
              <span className="mt-1 block text-xs font-bold text-slate-800">{product.categoria || 'Sem categoria'}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">Unidade: {product.unidade_medida || 'UN'}</span>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">Fator: {item.fator_conversao ?? product.fator_conversao ?? 1}</span>
            <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-700">Já contado: {item.total_contado || 0}</span>
            <span className={`rounded-lg px-2.5 py-1 ${(item.diferenca || 0) === 0 ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-800'}`}>Diferença: {item.diferenca > 0 ? '+' : ''}{item.diferenca || 0}</span>
          </div>
          {(item.validades_contadas?.length > 0 || item.locais_contados?.length > 0) && (
            <div className="mt-3 border-t border-cyan-100 pt-3 text-xs text-slate-600">
              {item.locais_contados?.length > 0 && <p><strong>Locais:</strong> {item.locais_contados.map((entry) => `${entry.nome} (${entry.quantidade})`).join(' · ')}</p>}
              {item.validades_contadas?.length > 0 && <p className="mt-1"><strong>Validades:</strong> {item.validades_contadas.map((entry) => `${new Date(entry.data).toLocaleDateString('pt-BR')} (${entry.quantidade})`).join(' · ')}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function InventoryCount() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // List state
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  
  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  // Quick Scan State
  const [quickBarcode, setQuickBarcode] = useState('');
  const [quickQuantity, setQuickQuantity] = useState(1);
  const [quickValidade, setQuickValidade] = useState('');
  const [quickObservacao, setQuickObservacao] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [quickProduct, setQuickProduct] = useState(null);
  const [activeTab, setActiveTab] = useState('count');
  const [isQuickScanMinimized, setIsQuickScanMinimized] = useState(false);
  const [scanMode, setScanMode] = useState(() => {
    try {
      return localStorage.getItem(`${QUICK_SCAN_MODE_KEY}_${id}`) === 'auto' ? 'auto' : 'review';
    } catch {
      return 'review';
    }
  });
  const [recentScans, setRecentScans] = useState([]);

  // Expanded Product Form State
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [productQuantity, setProductQuantity] = useState({});
  const [productValidade, setProductValidade] = useState({});
  const [productObservacao, setProductObservacao] = useState({});
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);

  // Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [selectedLocal, setSelectedLocal] = useState('');

  const [message, setMessage] = useState({ text: '', type: '' });
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [lastSyncReport, setLastSyncReport] = useState(null);
  const quickBarcodeInputRef = useRef(null);
  const audioContextRef = useRef(null);
  const hideMessageTimeoutRef = useRef(null);
  const pageRef = useRef(page);
  const searchQueryRef = useRef(searchQuery);
  const categoryFilterRef = useRef(categoryFilter);
  const productsRef = useRef(products);
  const categoriesRef = useRef(categories);
  const syncInProgressRef = useRef(false);
  const syncRetryTimeoutRef = useRef(null);
  const flushOfflineQueueRef = useRef(null);
  const submitLockRef = useRef(false);

  const getInventoryQueue = useCallback(() => {
    return readOfflineQueue().filter((item) => item.inventoryId === id);
  }, [id]);

  const refreshQueueState = useCallback(() => {
    setPendingQueueCount(getInventoryQueue().length);
  }, [getInventoryQueue]);

  const showTemporaryMessage = useCallback((nextMessage, timeout = 3000) => {
    setMessage(nextMessage);

    if (hideMessageTimeoutRef.current) {
      clearTimeout(hideMessageTimeoutRef.current);
    }

    if (timeout > 0) {
      hideMessageTimeoutRef.current = setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, timeout);
    }
  }, []);

  const applyCountLocally = useCallback((barcode, quantityToSubmit, validadeToSubmit = null, localToSubmit = null) => {
    const normalizedBarcode = normalizeLookupCode(barcode);

    if (!normalizedBarcode || !Number.isFinite(quantityToSubmit)) {
      return;
    }

    setProducts((prevProducts) => prevProducts.map((item) => {
      const produto = item?.Produto;
      if (!produto) {
        return item;
      }

      const isTargetProduct = productMatchesCode(produto, normalizedBarcode);

      if (!isTargetProduct) {
        return item;
      }

      const standardizedQuantity = roundInventoryQuantity(quantityToSubmit * resolveCountMultiplier(item));
      const nextTotal = Number(item.total_contado || 0) + standardizedQuantity;
      const nextDifference = Number(item.diferenca || 0) + standardizedQuantity;
      let nextValidades = Array.isArray(item.validades_contadas) ? [...item.validades_contadas] : [];
      let nextLocais = Array.isArray(item.locais_contados) ? [...item.locais_contados] : [];

      if (validadeToSubmit) {
        const existingIndex = nextValidades.findIndex((entry) => entry.data === validadeToSubmit);
        if (existingIndex >= 0) {
          nextValidades[existingIndex] = {
            ...nextValidades[existingIndex],
            quantidade: Number(nextValidades[existingIndex].quantidade || 0) + standardizedQuantity
          };
        } else {
          nextValidades.push({
            data: validadeToSubmit,
            quantidade: standardizedQuantity
          });
        }

        nextValidades = nextValidades.filter((entry) => Number(entry.quantidade || 0) !== 0);
      }

      const localKey = localToSubmit || 'Não informado';
      const existingLocalIndex = nextLocais.findIndex((entry) => entry.nome === localKey);
      if (existingLocalIndex >= 0) {
        nextLocais[existingLocalIndex] = {
          ...nextLocais[existingLocalIndex],
            quantidade: Number(nextLocais[existingLocalIndex].quantidade || 0) + standardizedQuantity
        };
      } else {
        nextLocais.push({
          nome: localKey,
            quantidade: standardizedQuantity
        });
      }
      nextLocais = nextLocais.filter((entry) => Number(entry.quantidade || 0) !== 0);

      return {
        ...item,
        total_contado: nextTotal,
        diferenca: nextDifference,
        validades_contadas: nextValidades,
        locais_contados: nextLocais
      };
    }));
  }, []);

  const playTone = useCallback((type) => {
    if (typeof window === 'undefined') {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const context = audioContextRef.current;
    if (context.state === 'suspended') {
      void context.resume();
    }
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const now = context.currentTime;

    oscillator.type = type === 'error' ? 'square' : 'sine';
    oscillator.frequency.setValueAtTime(type === 'error' ? 190 : type === 'identified' ? 1040 : 880, now);
    if (type === 'success') oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);

    if (navigator.vibrate) {
      navigator.vibrate(type === 'error' ? [80, 50, 80] : type === 'identified' ? 35 : 60);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const response = await api.get(`/inventories/${id}`);
      setInventory(response.data);
      writeCachedInventory(id, response.data);
    } catch (error) {
      console.error('Error loading inventory:', error);

      const cachedInventory = readCachedInventory(id);
      if (cachedInventory?.data) {
        setInventory(cachedInventory.data);
        showTemporaryMessage({
          text: 'Sem conexão. Exibindo os dados offline do inventário.',
          type: 'success'
        }, 4000);
        return;
      }

      setMessage({ text: 'Erro ao carregar o inventário.', type: 'error' });
    }
  }, [id, showTemporaryMessage]);

  const fetchProducts = useCallback(async (pageNum = 1, append = false, options = {}) => {
    const { refreshLoaded = false, silent = false } = options;
    setLoadingProducts(true);
    try {
      const params = {
        page: refreshLoaded ? 1 : pageNum,
        limit: refreshLoaded ? Math.max(pageNum, 1) * 20 : 20,
        apenasDivergentes: false
      };
      if (searchQueryRef.current) params.busca = searchQueryRef.current;
      if (categoryFilterRef.current) params.categoria = categoryFilterRef.current;

      const response = await api.get(`/inventories/${id}/produtos`, { params });
      const existingProductIds = new Set(productsRef.current.map((item) => item.produto_id));
      const newProducts = append
        ? response.data.produtos.filter((item) => !existingProductIds.has(item.produto_id))
        : response.data.produtos;
      const nextProducts = append ? [...productsRef.current, ...newProducts] : newProducts;
      const nextTotalPages = refreshLoaded
        ? Math.ceil(Number(response.data.total || 0) / 20)
        : response.data.totalPages;
      const nextCurrentPage = refreshLoaded ? pageNum : response.data.currentPage;
      const nextCategories = categoriesRef.current.length === 0
        && !searchQueryRef.current
        && !categoryFilterRef.current
        && response.data.produtos.length > 0
        ? [...new Set(response.data.produtos.map((p) => p?.Produto?.categoria).filter(Boolean))]
        : categoriesRef.current;
      
      setProducts(nextProducts);
      
      setTotalPages(nextTotalPages);
      setPage(nextCurrentPage);
      writeCachedProducts(id, {
        produtos: nextProducts,
        totalPages: nextTotalPages,
        currentPage: nextCurrentPage,
        categories: nextCategories
      });
      
      // Update inventory validade_obrigatoria state if available
      if (response.data.validade_obrigatoria !== undefined) {
        setInventory(prev => prev ? { ...prev, validade_obrigatoria: response.data.validade_obrigatoria } : prev);
      }

      // Extract unique categories from products if not set
      if (nextCategories !== categoriesRef.current) {
        setCategories(nextCategories);
      }
    } catch (error) {
      console.error('Error fetching products:', error);

      if (silent) return;

      const isNetworkFailure = !error.response;
      if (!isNetworkFailure) {
        showTemporaryMessage({
          text: append
            ? 'O servidor não conseguiu carregar a próxima página. Os itens atuais foram mantidos.'
            : (error.response?.data?.message || 'O servidor não conseguiu atualizar a lista de produtos.'),
          type: 'error'
        }, 5000);
        return;
      }

      if (append) {
        showTemporaryMessage({
          text: 'Não foi possível carregar mais itens agora. Os itens já exibidos foram mantidos.',
          type: 'error'
        }, 5000);
        return;
      }

      const cachedProducts = readCachedProducts(id);
      if (cachedProducts?.produtos?.length) {
        let offlineProducts = cachedProducts.produtos;

        if (searchQueryRef.current) {
          const normalizedSearch = searchQueryRef.current.toLowerCase();
          offlineProducts = offlineProducts.filter((item) => {
            const produto = item?.Produto || {};
            return [
              produto.nome,
              produto.sku,
              produto.codigo_barras,
              produto.codigo_referencia
            ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch));
          });
        }

        if (categoryFilterRef.current) {
          offlineProducts = offlineProducts.filter((item) => item?.Produto?.categoria === categoryFilterRef.current);
        }

        setProducts(offlineProducts);
        setTotalPages(1);
        setPage(1);

        if (cachedProducts.categories?.length) {
          setCategories(cachedProducts.categories);
        }

        showTemporaryMessage({
          text: navigator.onLine
            ? 'Servidor indisponível. Exibindo temporariamente os produtos salvos no dispositivo.'
            : 'Sem conexão. Exibindo os produtos salvos offline.',
          type: 'success'
        }, 4000);
      } else {
        showTemporaryMessage({
          text: 'Não foi possível acessar os produtos e ainda não há uma cópia offline neste dispositivo.',
          type: 'error'
        }, 5000);
      }
    } finally {
      setLoadingProducts(false);
      setLoading(false);
    }
  }, [id, showTemporaryMessage]);

  const scheduleQueueRetry = useCallback((delayMs) => {
    if (syncRetryTimeoutRef.current) clearTimeout(syncRetryTimeoutRef.current);
    syncRetryTimeoutRef.current = setTimeout(() => {
      syncRetryTimeoutRef.current = null;
      void flushOfflineQueueRef.current?.();
    }, Math.max(250, delayMs));
  }, []);

  const flushOfflineQueue = useCallback(async ({ manual = false } = {}) => {
    if (syncInProgressRef.current) return;

    if (!navigator.onLine) {
      const offlinePendingCount = getInventoryQueue().length;
      setLastSyncReport({
        status: 'offline',
        sent: 0,
        failed: offlinePendingCount,
        verified: false,
        checkedAt: new Date().toISOString()
      });
      return;
    }

    const queue = readOfflineQueue();
    const inventoryItems = queue.filter((item) => item.inventoryId === id);
    const now = Date.now();
    const pendingItems = inventoryItems.filter((item) => {
      if (manual) return true;
      if (item.syncStatus === 'blocked') return false;
      return !item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= now;
    });

    if (!pendingItems.length) {
      refreshQueueState();
      const nextRetryAt = inventoryItems
        .filter((item) => item.syncStatus !== 'blocked' && item.nextRetryAt)
        .map((item) => new Date(item.nextRetryAt).getTime())
        .filter((timestamp) => timestamp > now)
        .sort((a, b) => a - b)[0];
      if (nextRetryAt) scheduleQueueRetry(nextRetryAt - now);
      return;
    }

    syncInProgressRef.current = true;
    setSyncingQueue(true);
    setLastSyncReport({
      status: 'syncing',
      sent: 0,
      failed: 0,
      total: pendingItems.length,
      verified: false,
      checkedAt: new Date().toISOString()
    });

    const remainingQueue = [...queue];
    let successCount = 0;
    let failedCount = 0;
    let blockedCount = 0;
    let permanentFailureCount = 0;

    try {
      for (const item of pendingItems) {
        try {
          await api.post(`/inventories/${id}/contagem`, item.payload, { timeout: 15000 });
          successCount += 1;

          const index = remainingQueue.findIndex((queued) => queued.localId === item.localId);
          if (index >= 0) {
            remainingQueue.splice(index, 1);
          }
        } catch (itemError) {
          failedCount += 1;
          console.error('Error syncing offline item:', itemError);

          const index = remainingQueue.findIndex((queued) => queued.localId === item.localId);
          if (index >= 0) {
            const status = itemError.response?.status;
            const attemptCount = Number(item.attemptCount || 0) + 1;
            const isRetryable = !status || status === 408 || status === 429 || status >= 500;
            const isBlocked = !isRetryable || attemptCount >= MAX_AUTO_SYNC_ATTEMPTS;
            const retryDelay = Math.min(SYNC_RETRY_BASE_DELAY_MS * (2 ** (attemptCount - 1)), 60000);

            remainingQueue[index] = {
              ...remainingQueue[index],
              attemptCount,
              syncStatus: isBlocked ? 'blocked' : 'retrying',
              nextRetryAt: isBlocked ? null : new Date(Date.now() + retryDelay).toISOString(),
              lastError: itemError.response?.data?.message || itemError.message || 'Falha ao sincronizar'
            };
            if (isBlocked) blockedCount += 1;
            if (!isRetryable) permanentFailureCount += 1;
          }
        }
      }

      // Preserva contagens adicionadas enquanto este lote aguardava respostas da rede.
      const processedIds = new Set(pendingItems.map((item) => item.localId));
      const updatedItemsById = new Map(remainingQueue.map((item) => [item.localId, item]));
      const queueAfterSync = readOfflineQueue().flatMap((item) => {
        if (!processedIds.has(item.localId)) return [item];
        const updatedItem = updatedItemsById.get(item.localId);
        return updatedItem ? [updatedItem] : [];
      });
      writeOfflineQueue(queueAfterSync);
      refreshQueueState();
      if (successCount > 0 || permanentFailureCount > 0) {
        await fetchInventory();
        await fetchProducts(1, false);
      }

      const remainingItemsAfterSync = readOfflineQueue().filter((item) => item.inventoryId === id).length;
      const syncVerified = remainingItemsAfterSync === 0 && failedCount === 0;

      setLastSyncReport({
        status: syncVerified ? 'verified' : 'partial',
        sent: successCount,
        failed: remainingItemsAfterSync || failedCount,
        total: pendingItems.length,
        verified: syncVerified,
        checkedAt: new Date().toISOString()
      });

      if (syncVerified) {
        showTemporaryMessage({ text: 'Pendências offline sincronizadas e verificadas com sucesso.', type: 'success' }, 4000);
        playTone('success');
      } else {
        setMessage({
          text: blockedCount > 0
            ? `${blockedCount} contagem(ns) exige(m) revisão manual. O envio automático foi interrompido.`
            : 'Parte das contagens foi enviada. Uma nova tentativa será feita com intervalo seguro.',
          type: 'error'
        });
        playTone('error');
      }

      const retryableItems = queueAfterSync.filter((item) => item.inventoryId === id && item.syncStatus !== 'blocked');
      const nextRetryAt = retryableItems
        .map((item) => item.nextRetryAt ? new Date(item.nextRetryAt).getTime() : Date.now())
        .sort((a, b) => a - b)[0];
      if (nextRetryAt) scheduleQueueRetry(nextRetryAt - Date.now());
    } catch (error) {
      console.error('Error syncing offline queue:', error);
      setLastSyncReport({
        status: 'error',
        sent: successCount,
        failed: pendingItems.length - successCount,
        total: pendingItems.length,
        verified: false,
        checkedAt: new Date().toISOString()
      });
      setMessage({ text: 'Não foi possível sincronizar todas as pendências offline.', type: 'error' });
      playTone('error');
    } finally {
      syncInProgressRef.current = false;
      setSyncingQueue(false);
    }
  }, [id, getInventoryQueue, refreshQueueState, playTone, fetchInventory, fetchProducts, showTemporaryMessage, scheduleQueueRetry]);

  useEffect(() => {
    flushOfflineQueueRef.current = flushOfflineQueue;
  }, [flushOfflineQueue]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
    categoryFilterRef.current = categoryFilter;
    productsRef.current = products;
    categoriesRef.current = categories;
  }, [searchQuery, categoryFilter, products, categories]);

  useEffect(() => {
    try {
      localStorage.setItem(`${QUICK_SCAN_MINIMIZED_KEY}_${id}`, isQuickScanMinimized ? '1' : '0');
    } catch {
      // Ignora falhas de persistência local
    }
  }, [id, isQuickScanMinimized]);

  useEffect(() => {
    try {
      localStorage.setItem(`${QUICK_SCAN_MODE_KEY}_${id}`, scanMode);
    } catch {
      // A preferência é opcional; a contagem continua funcionando sem ela.
    }
  }, [id, scanMode]);

  useEffect(() => {
    if (inventory?.validade_obrigatoria && scanMode === 'auto') setScanMode('review');
  }, [inventory?.validade_obrigatoria, scanMode]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const fetchInventoryRef = useRef(fetchInventory);
  const fetchProductsRef = useRef(fetchProducts);

  useEffect(() => {
    fetchInventoryRef.current = fetchInventory;
    fetchProductsRef.current = fetchProducts;
  }, [fetchInventory, fetchProducts]);

  useEffect(() => {
    connectSocketWithToken();
    
    const handleConnect = () => {
      if (id) socket.emit('joinInventory', id);
    };

    if (socket.connected) {
      handleConnect();
    }
    
    socket.on('connect', handleConnect);

    const handleInventoryUpdate = (event) => {
      console.log('Real-time update in Count:', event);
      if (
        event?.type === 'count_submitted'
        && String(event.contagem?.usuario_id) === String(readCachedUserId())
      ) {
        // A própria contagem já foi aplicada de forma otimista na tela.
        return;
      }
      fetchInventoryRef.current();
      fetchProductsRef.current(pageRef.current, false, { refreshLoaded: true, silent: true });
    };

    socket.on('inventoryUpdate', handleInventoryUpdate);

    return () => {
      if (id) {
        socket.emit('leaveInventory', id);
      }
      socket.off('connect', handleConnect);
      socket.off('inventoryUpdate', handleInventoryUpdate);
      socket.disconnect();
    };
  }, [id]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showTemporaryMessage({ text: 'Conexão restabelecida. Sincronizando contagens...', type: 'success' }, 4000);
      flushOfflineQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setLastSyncReport({
        status: 'offline',
        sent: 0,
        failed: getInventoryQueue().length,
        verified: false,
        checkedAt: new Date().toISOString()
      });
    };

    refreshQueueState();
    if (navigator.onLine && getInventoryQueue().length > 0) {
      scheduleQueueRetry(1000);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushOfflineQueue, refreshQueueState, showTemporaryMessage, getInventoryQueue, scheduleQueueRetry]);

  useEffect(() => {
    return () => {
      if (hideMessageTimeoutRef.current) {
        clearTimeout(hideMessageTimeoutRef.current);
      }
      if (syncRetryTimeoutRef.current) {
        clearTimeout(syncRetryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (inventory) {
      writeCachedInventory(id, inventory);
      if (!selectedLocal) {
        if (inventory.local_atribuido) {
          setSelectedLocal(inventory.local_atribuido);
        } else if (inventory.locais_contagem && inventory.locais_contagem.length > 0) {
          setSelectedLocal(inventory.locais_contagem[0]);
        }
      }
    }
  }, [id, inventory, selectedLocal]);

  useEffect(() => {
    if (products.length > 0) {
      writeCachedProducts(id, {
        produtos: products,
        totalPages,
        currentPage: page,
        categories
      });
    }
  }, [id, products, totalPages, page, categories]);

  useEffect(() => {
    // Debounce search
    const timeoutId = setTimeout(() => {
      fetchProducts(1, false);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, categoryFilter, fetchProducts]);

  const handleLoadMore = () => {
    if (page < totalPages) {
      fetchProducts(page + 1, true);
    }
  };

  const submitCount = async (barcode, quantityToSubmit, validadeToSubmit = null, observacaoToSubmit = null, isQuick = false, resolvedProduct = null) => {
    const normalizedBarcode = normalizeLookupCode(barcode);

    if (!normalizedBarcode) {
      setMessage({ text: 'Informe o código de barras ou SKU', type: 'error' });
      playTone('error');
      return false;
    }

    if (!Number.isFinite(Number(quantityToSubmit))) {
      setMessage({ text: 'Informe uma quantidade válida', type: 'error' });
      playTone('error');
      return false;
    }

    if (validadeToSubmit && !isValidValidityInput(validadeToSubmit)) {
      setMessage({ text: 'Informe uma validade real no formato DD/MM/AAAA', type: 'error' });
      playTone('error');
      return false;
    }

    if (submitLockRef.current) return false;
    
    // Quick scan should check for != 0
    if (isQuick && (!quantityToSubmit || quantityToSubmit === 0)) {
      setMessage({ text: 'A quantidade não pode ser zero na bipagem', type: 'error' });
      playTone('error');
      return false;
    }
    
    if (!isQuick && quantityToSubmit === 0) {
      setMessage({ text: 'A quantidade informada não pode ser zero', type: 'error' });
      playTone('error');
      return false;
    }

    if (inventory?.validade_obrigatoria && !validadeToSubmit) {
      // Check if product already has validade
      const targetProduct = products.find(item => {
        const p = item?.Produto;
        if (!p) return false;
        return productMatchesCode(p, normalizedBarcode);
      });
      
      const hasExistingValidade = targetProduct && 
        Array.isArray(targetProduct.validades_contadas) && 
        targetProduct.validades_contadas.length > 0;

      if (!hasExistingValidade) {
        setMessage({ text: 'A data de validade é obrigatória para a primeira contagem deste produto', type: 'error' });
        playTone('error');
        return false;
      }
    }

    submitLockRef.current = true;
    if (isQuick) setIsSubmittingQuick(true);
    else setIsSubmittingProduct(true);
    
    setMessage({ text: '', type: '' });

    const operationId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      codigo_barras: normalizedBarcode,
      quantidade_contada: quantityToSubmit,
      local: selectedLocal || null,
      client_operation_id: operationId
    };

    const targetProduct = resolvedProduct || products.find((item) => {
      const p = item?.Produto;
      if (!p) return false;
      return productMatchesCode(p, normalizedBarcode);
    });
    const standardizedQuantity = targetProduct
      ? roundInventoryQuantity(quantityToSubmit * resolveCountMultiplier(targetProduct))
      : roundInventoryQuantity(quantityToSubmit);

    if (validadeToSubmit) {
      payload.validade = validadeToSubmit;
    }
    if (observacaoToSubmit) {
      payload.observacao = observacaoToSubmit;
    }

    const queueOfflinePayload = () => {
      const queue = readOfflineQueue();
      if (queue.some((item) => item.localId === operationId)) return;
      queue.push({
        localId: operationId,
        inventoryId: id,
        payload,
        createdAt: new Date().toISOString(),
        attemptCount: 0,
        syncStatus: 'pending',
        nextRetryAt: null
      });
      writeOfflineQueue(queue);
      refreshQueueState();
    };

    const resetAfterSubmit = () => {
      if (isQuick) {
        setQuickBarcode('');
        setQuickQuantity(1);
        setQuickValidade('');
        setQuickObservacao('');
        setQuickProduct(null);
        if (quickBarcodeInputRef.current) quickBarcodeInputRef.current.focus();
      } else {
        setExpandedProductId(null);
      }
    };

    try {
      // Local-first: a operação é protegida no dispositivo antes de qualquer envio.
      queueOfflinePayload();
      applyCountLocally(normalizedBarcode, quantityToSubmit, validadeToSubmit, selectedLocal);
      showTemporaryMessage({
        text: navigator.onLine
          ? `Contagem registrada. ${normalizedBarcode} entrou na fila de envio (${standardizedQuantity > 0 ? '+' : ''}${standardizedQuantity}).`
          : `Sem internet. A contagem de ${normalizedBarcode} foi salva localmente.`,
        type: 'success'
      }, 4000);
      playTone('success');
      setRecentScans((current) => [{
        id: operationId,
        code: normalizedBarcode,
        product: targetProduct?.Produto?.nome || normalizedBarcode,
        quantity: standardizedQuantity,
        offline: !navigator.onLine,
        at: new Date().toISOString()
      }, ...current].slice(0, 5));
      resetAfterSubmit();

      if (navigator.onLine) scheduleQueueRetry(250);

      return true;
    } catch (error) {
      console.error('Error saving count locally:', error);
      setMessage({ text: 'Não foi possível proteger a contagem no armazenamento local do dispositivo.', type: 'error' });
      playTone('error');
      return false;
    } finally {
      submitLockRef.current = false;
      if (isQuick) setIsSubmittingQuick(false);
      else setIsSubmittingProduct(false);
    }
  };

  const locateProduct = async (barcode) => {
    const normalizedBarcode = normalizeLookupCode(barcode);
    if (!normalizedBarcode) return null;
    const matchesBarcode = (item) => {
      const produto = item?.Produto;
      return produto && productMatchesCode(produto, normalizedBarcode);
    };

    let matchedItem = products.find(matchesBarcode);

    try {
      if (!matchedItem && navigator.onLine) {
        const response = await api.get(`/inventories/${id}/produtos`, {
          params: { page: 1, limit: 5, apenasDivergentes: false, codigo: normalizedBarcode }
        });
        matchedItem = response.data.produtos?.find(matchesBarcode);
        if (matchedItem?.Produto) {
          setProducts((current) => current.some((item) => item.produto_id === matchedItem.produto_id)
            ? current
            : [matchedItem, ...current]);
        }
      }
    } catch (error) {
      console.error('Error locating scanned product:', error);
    }

    return matchedItem?.Produto ? matchedItem : null;
  };

  const findQuickProduct = async (barcode = quickBarcode) => {
    const normalizedBarcode = normalizeLookupCode(barcode);

    if (!normalizedBarcode) {
      setMessage({ text: 'Bipe ou informe o código do produto primeiro.', type: 'error' });
      playTone('error');
      return false;
    }

    const matchedItem = await locateProduct(normalizedBarcode);

    if (!matchedItem?.Produto) {
      setQuickProduct(null);
      setMessage({ text: 'Produto não encontrado', type: 'error' });
      playTone('error');
      return false;
    }

    setQuickBarcode(normalizedBarcode);
    setQuickProduct(matchedItem);
    setQuickQuantity(1);
    setIsQuickScanMinimized(false);
    setActiveTab('count');
    setExpandedProductId(matchedItem.Produto.sku);
    setProductQuantity((prev) => ({
      ...prev,
      [matchedItem.Produto.sku]: prev[matchedItem.Produto.sku] ?? 1
    }));
    setMessage({ text: '', type: '' });
    playTone('identified');
    return true;
  };

  const handleQuickSubmit = async (e) => {
    e.preventDefault();

    if (!quickProduct) {
      await findQuickProduct();
      return;
    }

    const qtyToSubmit = parseQuantityValue(quickQuantity);
    await submitCount(quickBarcode, qtyToSubmit, quickValidade, quickObservacao, true);
  };

  const handleScanComplete = async (decodedText) => {
    const normalizedBarcode = normalizeLookupCode(decodedText);
    const matchedItem = await locateProduct(normalizedBarcode);

    if (!matchedItem?.Produto) {
      setQuickProduct(null);
      playTone('error');
      return { accepted: false, keepOpen: true, message: 'Produto não encontrado neste inventário.' };
    }

    if (scanMode === 'auto' && !inventory?.validade_obrigatoria) {
      const saved = await submitCount(normalizedBarcode, 1, null, 'Leitura rápida por câmera', true, matchedItem);
      return {
        accepted: saved,
        keepOpen: saved,
        message: saved ? `+1 em ${matchedItem.Produto.nome}` : 'A leitura não pôde ser registrada.'
      };
    }

    setQuickBarcode(normalizedBarcode);
    setQuickProduct(matchedItem);
    setQuickQuantity(1);
    setIsQuickScanMinimized(false);
    setActiveTab('count');
    setExpandedProductId(matchedItem.Produto.sku);
    setProductQuantity((prev) => ({ ...prev, [matchedItem.Produto.sku]: 1 }));
    setMessage({ text: '', type: '' });
    playTone('identified');
    return { accepted: true, keepOpen: false, message: `${matchedItem.Produto.nome} identificado.` };
  };

  const handleProductSubmit = async (produto) => {
    const rawQty = productQuantity[produto.sku];
    const qtyToSubmit = rawQty !== undefined && rawQty !== '' ? parseQuantityValue(rawQty) : 1;

    const val = productValidade[produto.sku] || null;
    const obs = productObservacao[produto.sku] || null;
    const submitted = await submitCount(produto.codigo_barras || produto.sku, qtyToSubmit, val, obs, false);

    if (submitted) {
      setProductQuantity((prev) => ({
        ...prev,
        [produto.sku]: 1
      }));
      setProductValidade((prev) => ({
        ...prev,
        [produto.sku]: ''
      }));
      setProductObservacao((prev) => ({
        ...prev,
        [produto.sku]: ''
      }));
    }
  };

  const toggleExpandProduct = (sku) => {
    if (expandedProductId === sku) {
      setExpandedProductId(null);
    } else {
      setExpandedProductId(sku);
      if (productQuantity[sku] === undefined) {
        setProductQuantity(prev => ({ 
          ...prev, 
          [sku]: 1 
        }));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!inventory) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-slate-50 p-4 text-center">
        <div className="p-4 bg-white rounded-full shadow-sm mb-4 border border-slate-100">
          <Package className="h-12 w-12 text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Inventário não encontrado</h2>
        <p className="text-slate-600 mb-6 max-w-sm">O inventário solicitado não existe ou você não tem permissão para acessá-lo.</p>
        <button onClick={() => navigate('/dashboard')} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors shadow-md shadow-indigo-600/20">
          Voltar ao Início
        </button>
      </div>
    );
  }

  const isCountingActive = inventory.status === 'em_contagem' || inventory.status === 'em_recontagem';
  const blockedQueueCount = getInventoryQueue().filter((item) => item.syncStatus === 'blocked').length;
  const headerStatus = syncingQueue
    ? {
        label: 'Sincronizando contagem',
        description: pendingQueueCount > 0
          ? `Enviando ${pendingQueueCount} pendência(s) para o sistema principal.`
          : 'Conferindo o envio das contagens com o sistema principal.',
        icon: RefreshCw,
        containerClass: 'border-indigo-200/70 bg-indigo-50 text-indigo-900',
        badgeClass: 'bg-indigo-600 text-white'
      }
    : !isOnline
      ? {
          label: 'Desconectado',
          description: pendingQueueCount > 0
            ? `${pendingQueueCount} contagem(ns) aguardando sincronização automática.`
            : 'As novas contagens serão salvas localmente até a conexão voltar.',
          icon: WifiOff,
          containerClass: 'border-amber-200/70 bg-amber-50 text-amber-900',
          badgeClass: 'bg-amber-600 text-white'
        }
      : pendingQueueCount > 0
        ? blockedQueueCount > 0
          ? {
              label: 'Sincronização requer atenção',
              description: `${blockedQueueCount} contagem(ns) foi(ram) bloqueada(s) após falhas. Revise e use Sincronizar para tentar novamente.`,
              icon: AlertCircle,
              containerClass: 'border-rose-200/70 bg-rose-50 text-rose-900',
              badgeClass: 'bg-rose-600 text-white'
            }
          : {
              label: 'Conectado com pendências',
              description: `${pendingQueueCount} contagem(ns) aguardando uma tentativa programada de envio.`,
              icon: CloudUpload,
              containerClass: 'border-orange-200/70 bg-orange-50 text-orange-900',
              badgeClass: 'bg-orange-600 text-white'
            }
        : lastSyncReport?.verified
          ? {
              label: 'Conectado e sincronizado',
              description: `Última verificação confirmou ${lastSyncReport.sent} contagem(ns) sincronizada(s) corretamente.`,
              icon: CheckCheck,
              containerClass: 'border-emerald-200/70 bg-emerald-50 text-emerald-900',
              badgeClass: 'bg-emerald-600 text-white'
            }
          : {
              label: 'Conectado',
              description: 'Sistema online e pronto para registrar contagens em tempo real.',
              icon: Wifi,
              containerClass: 'border-emerald-200/70 bg-emerald-50 text-emerald-900',
              badgeClass: 'bg-emerald-600 text-white'
            };
  const HeaderStatusIcon = headerStatus.icon;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 pb-24 font-sans selection:bg-indigo-100 selection:text-indigo-900 relative">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 lg:py-8 flex flex-col gap-4">
        {!isCountingActive ? (
          <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-6 text-center shadow-sm">
            <h3 className="text-lg font-bold text-amber-800 mb-2">Atenção</h3>
            <p className="text-amber-700">Este inventário não está aberto para contagem. Status atual: <span className="font-semibold uppercase tracking-wide">{inventory.status.replace('_', ' ')}</span></p>
          </div>
        ) : (
          <>
            <div className={`rounded-2xl border p-4 shadow-sm ${headerStatus.containerClass}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white/70 p-2.5 shadow-sm">
                    <HeaderStatusIcon className={`h-5 w-5 ${syncingQueue ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold uppercase tracking-wide">{headerStatus.label}</p>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${headerStatus.badgeClass}`}>
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm opacity-90">{headerStatus.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs sm:min-w-[220px]">
                  <div className="rounded-xl bg-white/70 px-3 py-2 shadow-sm">
                    <span className="font-semibold">Fila local:</span> {pendingQueueCount} pendência(s)
                  </div>
                  {lastSyncReport && (
                    <div className="rounded-xl bg-white/70 px-3 py-2 shadow-sm">
                      <span className="font-semibold">Última conferência:</span>{' '}
                      {lastSyncReport.verified
                        ? `${lastSyncReport.sent} enviada(s) e verificada(s)`
                        : lastSyncReport.status === 'syncing'
                          ? `sincronizando ${lastSyncReport.total || 0} contagem(ns)`
                          : `${lastSyncReport.failed || 0} pendência(s) ainda precisam de atenção`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Global Message Alert */}
            {message.text && (
              <div className={`fixed top-4 left-4 right-4 md:static md:mb-0 p-4 rounded-2xl flex items-start space-x-3 shadow-lg md:shadow-sm z-50 transition-all animate-in fade-in slide-in-from-top-4 md:animate-none ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/60'
                  : 'bg-rose-50 text-rose-900 border border-rose-200/60'
              }`}>
                {message.type === 'success' ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5 text-emerald-600" /> : <X className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-600" />}
                <p className="font-medium text-sm md:text-base">{message.text}</p>
              </div>
            )}

            {(!isOnline || pendingQueueCount > 0) && (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/60 bg-amber-50 p-4 text-amber-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {isOnline ? <CloudOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" /> : <WifiOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />}
                  <div>
                    <p className="font-semibold text-amber-900">
                      {isOnline
                        ? `${pendingQueueCount} pendência(s) aguardando sincronização.`
                        : 'Você está offline. As contagens serão salvas localmente.'}
                    </p>
                    <p className="text-sm text-amber-700/80 mt-0.5">
                      {isOnline
                        ? 'Use o botão abaixo para forçar a sincronização ou aguarde o envio automático.'
                        : 'Quando a conexão voltar, o sistema vai sincronizar automaticamente e conferir o resultado.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => flushOfflineQueue({ manual: true })}
                  disabled={!isOnline || syncingQueue || pendingQueueCount === 0}
                  className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 focus:ring-4 focus:ring-amber-500/20 disabled:opacity-50 transition-all"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncingQueue ? 'animate-spin' : ''}`} />
                  Sincronizar
                </button>
              </div>
            )}

            {lastSyncReport && !lastSyncReport.verified && lastSyncReport.status !== 'syncing' && lastSyncReport.status !== 'offline' && (
              <div className="rounded-2xl border border-rose-200/70 bg-rose-50 p-4 text-rose-900 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600" />
                  <div>
                    <p className="font-semibold">Atenção na sincronização</p>
                    <p className="mt-1 text-sm text-rose-800/90">
                      Nem todas as contagens foram confirmadas no sistema principal. Restam {lastSyncReport.failed || 0} pendência(s) na fila local.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {inventory?.etapa_contagem > 1 && (
              <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/50 p-4 text-sm text-indigo-900 shadow-sm flex items-center gap-3">
                <Filter className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                <p>Esta etapa exibe todos os itens na lista, mas apenas os divergentes ou pendentes podem ser recontados.</p>
              </div>
            )}

            {activeTab === 'count' && (
              <div className="rounded-2xl bg-cyan-600 px-5 py-5 text-white shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">Coletar produtos</p>
                    <h1 className="mt-1 text-xl font-bold">Bipe primeiro, informe depois</h1>
                    <p className="mt-1 text-sm text-cyan-50">Use o leitor ou a câmera para identificar a mercadoria e concluir a contagem rapidamente.</p>
                  </div>
                  <Barcode className="h-9 w-9 shrink-0 text-cyan-100" />
                </div>
              </div>
            )}

            {activeTab === 'count' && (
              <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Modo de leitura">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScanMode('review')}
                    className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left transition-colors ${scanMode === 'review' ? 'border-cyan-500 bg-cyan-50 text-cyan-900' : 'border-slate-200 text-slate-600'}`}
                  >
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <span><b className="block text-sm">Conferir</b><span className="text-[11px]">revisar quantidade</span></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanMode('auto')}
                    disabled={inventory?.validade_obrigatoria}
                    className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${scanMode === 'auto' ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-200 text-slate-600'}`}
                  >
                    <Zap className="h-5 w-5 shrink-0" />
                    <span><b className="block text-sm">Contínuo +1</b><span className="text-[11px]">salvar a cada bip</span></span>
                  </button>
                </div>
                <p className="mt-2 px-1 text-xs text-slate-500">
                  {inventory?.validade_obrigatoria
                    ? 'O modo +1 fica desativado porque este inventário exige validade na primeira contagem.'
                    : scanMode === 'auto'
                      ? 'A câmera permanecerá aberta e cada código válido somará 1. Leituras repetidas acidentais são bloqueadas por alguns instantes.'
                      : 'Cada leitura identifica o produto para você conferir quantidade, validade e observação antes de salvar.'}
                </p>
              </section>
            )}

            {/* Quick Scan Section (Mobile - flutuante com minimizar) */}
            <div className={`${activeTab === 'count' ? 'lg:hidden' : 'hidden'} rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm`}>
              <div className={`flex items-center justify-between ${isQuickScanMinimized ? '' : 'mb-4'}`}>
                <h2 className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                  <Barcode className="mr-2 h-4 w-4" />
                  Bipagem Rápida
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="flex items-center rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-600 transition-colors hover:text-indigo-800"
                  >
                    <Camera className="mr-1.5 h-4 w-4" />
                    Câmera
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQuickScanMinimized((prev) => !prev)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
                    title={isQuickScanMinimized ? 'Expandir bipagem rápida' : 'Minimizar bipagem rápida'}
                  >
                    {isQuickScanMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {!isQuickScanMinimized && (
                <form onSubmit={handleQuickSubmit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {quickProduct && <IdentifiedProductDetails item={quickProduct} />}
                  <div className="group relative flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 transition-colors group-focus-within:text-indigo-500">
                      <Search className="h-5 w-5" />
                    </div>
                    <input
                      ref={quickBarcodeInputRef}
                       type="text"
                       inputMode="text"
                       autoComplete="off"
                       autoCapitalize="none"
                       spellCheck="false"
                       enterKeyHint="go"
                      value={quickBarcode}
                      onChange={(e) => {
                        setQuickBarcode(e.target.value);
                        setQuickProduct(null);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-3 text-base font-medium text-slate-800 outline-none transition-all placeholder-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:text-lg"
                      placeholder="Código, SKU ou REF..."
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      required={inventory?.validade_obrigatoria}
                      value={quickValidade}
                      onChange={(e) => setQuickValidade(formatValidityInput(e.target.value))}
                      placeholder="DD/MM/AAAA"
                      maxLength={10}
                      className="min-w-[120px] flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3 text-base text-slate-800 outline-none transition-all hover:bg-slate-50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:w-40 sm:text-lg"
                      title={inventory?.validade_obrigatoria ? "Validade (Obrigatório)" : "Validade (Opcional)"}
                    />
                    <input
                      type="text"
                      value={quickObservacao}
                      onChange={(e) => setQuickObservacao(e.target.value)}
                      placeholder="Obs (Opcional)"
                      className="min-w-[120px] flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3 text-sm text-slate-800 outline-none transition-all hover:bg-slate-50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:w-40 sm:text-base"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={quickQuantity}
                      onChange={(e) => setQuickQuantity(formatQuantityInput(e.target.value, quickProduct?.Produto?.unidade_medida))}
                      aria-label="Quantidade"
                      className="w-20 rounded-xl border border-slate-200 bg-slate-50/50 py-3 text-center text-base font-bold text-slate-800 outline-none transition-all hover:bg-slate-50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:w-24 sm:text-lg"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingQuick || !quickBarcode}
                      className="min-w-[100px] flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 disabled:opacity-50 active:scale-[0.98] sm:flex-none sm:px-8 sm:text-base"
                    >
                      {isSubmittingQuick ? <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div> : quickProduct ? 'Salvar' : 'Identificar'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Quick Scan Section (Desktop - fixo na página) */}
            <div className={`${activeTab === 'count' ? 'hidden lg:block' : 'hidden'} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                  <Barcode className="mr-2 h-4 w-4" />
                  Bipagem Rápida
                </h2>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="flex items-center rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-600 transition-colors hover:text-indigo-800"
                >
                  <Camera className="mr-1.5 h-4 w-4" />
                  Câmera
                </button>
              </div>
              <form onSubmit={handleQuickSubmit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {quickProduct && <IdentifiedProductDetails item={quickProduct} />}
                <div className="group relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 transition-colors group-focus-within:text-indigo-500">
                    <Search className="h-5 w-5" />
                  </div>
                  <input
                    ref={quickBarcodeInputRef}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    enterKeyHint="go"
                    value={quickBarcode}
                    onChange={(e) => {
                      setQuickBarcode(e.target.value);
                      setQuickProduct(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-3 text-base font-medium text-slate-800 outline-none transition-all placeholder-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:text-lg"
                    placeholder="Código, SKU ou REF..."
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    required={inventory?.validade_obrigatoria}
                    value={quickValidade}
                    onChange={(e) => setQuickValidade(formatValidityInput(e.target.value))}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    className="min-w-[120px] flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3 text-base text-slate-800 outline-none transition-all hover:bg-slate-50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:w-40 sm:text-lg"
                    title={inventory?.validade_obrigatoria ? "Validade (Obrigatório)" : "Validade (Opcional)"}
                  />
                  <input
                    type="text"
                    value={quickObservacao}
                    onChange={(e) => setQuickObservacao(e.target.value)}
                    placeholder="Obs (Opcional)"
                    className="min-w-[120px] flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3 text-sm text-slate-800 outline-none transition-all hover:bg-slate-50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:w-40 sm:text-base"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={quickQuantity}
                    onChange={(e) => setQuickQuantity(formatQuantityInput(e.target.value, quickProduct?.Produto?.unidade_medida))}
                    aria-label="Quantidade"
                    className="w-20 rounded-xl border border-slate-200 bg-slate-50/50 py-3 text-center text-base font-bold text-slate-800 outline-none transition-all hover:bg-slate-50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:w-24 sm:text-lg"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingQuick || !quickBarcode}
                    className="min-w-[100px] flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 disabled:opacity-50 active:scale-[0.98] sm:flex-none sm:px-8 sm:text-base"
                  >
                    {isSubmittingQuick ? <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div> : quickProduct ? 'Salvar' : 'Identificar'}
                  </button>
                </div>
              </form>
            </div>

            {activeTab === 'count' && recentScans.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Últimas leituras neste aparelho</h2>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">Protegidas</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {recentScans.map((scan) => (
                    <li key={scan.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{scan.product}</p>
                        <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{scan.code} · {new Date(scan.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-emerald-700">{scan.quantity > 0 ? '+' : ''}{scan.quantity}</p>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">{scan.offline ? 'fila offline' : 'fila de envio'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* List & Search Section */}
            <div className={`${activeTab === 'consult' ? 'flex' : 'hidden'} bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex-col flex-1`}>
              {/* Search Header */}
              <div className="p-4 border-b border-slate-100 bg-white">
                <div className="flex gap-3">
                  <div className="relative flex-1 group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none transition-colors group-focus-within:text-indigo-500 text-slate-400">
                      <Search className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por nome, SKU, referência ou código..."
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all bg-slate-50/50 hover:bg-slate-50"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-medium flex items-center transition-all ${
                      showFilters || categoryFilter ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-inner' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
                    }`}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filtros
                  </button>
                </div>

                {/* Filters Drawer */}
                {showFilters && (
                  <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Categoria</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full sm:w-64 p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all shadow-sm"
                    >
                      <option value="">Todas as categorias</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Products List */}
              <div className="flex-1 overflow-y-auto bg-slate-50/30">
                {products.length === 0 && !loadingProducts ? (
                  <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                    <div className="bg-slate-100 p-4 rounded-full mb-4">
                      <Box className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="font-medium text-slate-600">Nenhum produto encontrado com os filtros atuais.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100/80">
                    {products.map((item, index) => {
                      const p = item?.Produto;
                      if (!p) return null;
                      const isExpanded = expandedProductId === p.sku;
                      
                      return (
                        <li key={p.sku || index} className={`transition-colors ${isExpanded ? 'bg-indigo-50/30' : 'hover:bg-slate-50/80 bg-white'}`}>
                          <div 
                            onClick={() => toggleExpandProduct(p.sku)}
                            className="p-4 sm:p-5 flex items-center justify-between cursor-pointer group"
                          >
                            <div className="flex-1 pr-4">
                              <h3 className="font-bold text-slate-800 text-base leading-tight mb-2 group-hover:text-indigo-700 transition-colors">{p.nome}</h3>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-slate-500">
                                <span className="font-mono text-[11px] font-semibold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-slate-600 tracking-wide" title="Código Interno">SKU: {p.sku}</span>
                                {p.codigo_referencia && <span className="font-mono text-[11px] font-semibold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-slate-600 tracking-wide" title="Código do Fornecedor">REF: {p.codigo_referencia}</span>}
                                {p.codigo_barras && <span className="flex items-center text-[11px] font-medium bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-slate-600" title="Código de Barras EAN13"><Barcode className="h-3 w-3 mr-1" /> {p.codigo_barras}</span>}
                                {p.categoria && <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md tracking-wide">{p.categoria}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mr-2">
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contado</span>
                                <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md text-sm min-w-[32px] text-center">{item.total_contado || 0}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dif.</span>
                                <span className={`font-bold border px-2 py-0.5 rounded-md text-xs min-w-[32px] text-center ${
                                  item.diferenca > 0 
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                                    : item.diferenca < 0 
                                      ? 'text-rose-700 bg-rose-50 border-rose-200'
                                      : 'text-slate-700 bg-slate-50 border-slate-200'
                                }`}>
                                  {item.diferenca > 0 ? '+' : ''}{item.diferenca || 0}
                                </span>
                              </div>
                            </div>
                            <div className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'text-indigo-500' : 'group-hover:text-indigo-400'}`}>
                              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                          </div>

                          {/* Expanded Count Action */}
                          {isExpanded && (
                            <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-indigo-100/50 bg-indigo-50/20">
                              <div className="flex flex-col gap-5 mt-2">
                                
                                {/* Info Extras */}
                                <div className="bg-white p-3.5 rounded-xl border border-indigo-100/60 shadow-sm text-sm">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-widest mb-1">Unidade</span>
                                      <span className="font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md inline-block">{p.unidade_medida || 'UN'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-widest mb-1">Fator Conversão</span>
                                      <span className="font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md inline-block">{item.fator_conversao ?? '-'}</span>
                                    </div>
                                  </div>
                                  
                                  {item.validades_contadas && item.validades_contadas.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-indigo-100/50">
                                      <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-widest mb-1.5">Validades Contadas</span>
                                      <div className="flex flex-wrap gap-2">
                                        {item.validades_contadas.map((val, idx) => (
                                          <div key={idx} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">
                                            <span className="text-xs font-semibold text-slate-700">{new Date(val.data).toLocaleDateString('pt-BR')}</span>
                                            <span className="text-[10px] font-bold text-slate-400 bg-white px-1.5 rounded-sm border border-slate-100">{val.quantidade}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {item.locais_contados && item.locais_contados.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-indigo-100/50">
                                      <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-widest mb-1.5">Locais Contados</span>
                                      <div className="flex flex-wrap gap-2">
                                        {item.locais_contados.map((localObj, idx) => (
                                          <div key={idx} className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-md">
                                            <span className="text-xs font-semibold text-indigo-700">{localObj.nome}</span>
                                            <span className="text-[10px] font-bold text-indigo-400 bg-white px-1.5 rounded-sm border border-indigo-100">{localObj.quantidade}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                                  {/* Validade */}
                                  <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">
                                      {inventory?.validade_obrigatoria ? 'Validade (Obrigatório)' : 'Validade (Opcional)'}
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      required={inventory?.validade_obrigatoria}
                                      value={productValidade[p.sku] || ''}
                                      onChange={(e) => setProductValidade(prev => ({ ...prev, [p.sku]: formatValidityInput(e.target.value) }))}
                                      placeholder="DD/MM/AAAA"
                                      maxLength={10}
                                      className="w-full h-12 px-4 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white text-slate-700 shadow-sm transition-all"
                                    />
                                  </div>

                                  {/* Observação */}
                                  <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Observação (Opcional)</label>
                                    <input
                                      type="text"
                                      value={productObservacao[p.sku] || ''}
                                      onChange={(e) => setProductObservacao(prev => ({ ...prev, [p.sku]: e.target.value }))}
                                      placeholder="Ex: Caixa danificada..."
                                      className="w-full h-12 px-4 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white text-slate-700 shadow-sm transition-all"
                                    />
                                  </div>

                                  {/* Quantidade */}
                                  <div className="w-full sm:w-auto">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Somar Qtd</label>
                                    <div className="flex items-center shadow-sm rounded-xl w-full">
                                      <button 
                                        type="button"
                                        onClick={() => setProductQuantity(prev => ({ ...prev, [p.sku]: formatQuantityInput((parseQuantityValue(prev[p.sku]) || 1) - 1, p.unidade_medida) }))}
                                        className="w-14 sm:w-12 h-12 bg-white rounded-l-xl border border-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={productQuantity[p.sku] !== undefined ? productQuantity[p.sku] : ''}
                                        onChange={(e) => setProductQuantity(prev => ({ ...prev, [p.sku]: formatQuantityInput(e.target.value, p.unidade_medida) }))}
                                        className="flex-1 w-0 sm:w-24 text-center h-12 border-y border-slate-200 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-lg text-slate-800 z-10"
                                      />
                                      <button 
                                        type="button"
                                        onClick={() => setProductQuantity(prev => ({ ...prev, [p.sku]: formatQuantityInput((parseQuantityValue(prev[p.sku]) || 0) + 1, p.unidade_medida) }))}
                                        className="w-14 sm:w-12 h-12 bg-white rounded-r-xl border border-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                  
                                  {/* Botão Salvar */}
                                  <div className="w-full sm:w-auto sm:flex-1">
                                    <button
                                      onClick={() => handleProductSubmit(p)}
                                      disabled={isSubmittingProduct}
                                      className="w-full h-12 flex items-center justify-center px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 mt-5 sm:mt-0 active:scale-[0.98]"
                                    >
                                      {isSubmittingProduct ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : 'Adicionar Lote'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                
                {/* Load More Button */}
                {page < totalPages && (
                  <div className="p-6 border-t border-slate-100 text-center">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingProducts}
                      className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm shadow-sm"
                    >
                      {loadingProducts ? 'Carregando...' : 'Carregar Mais Produtos'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <ScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={handleScanComplete}
        continuous={scanMode === 'auto' && !inventory?.validade_obrigatoria}
        title={scanMode === 'auto' ? 'Contagem contínua +1' : 'Identificar produto'}
      />
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('consult')}
            className={`flex flex-col items-center rounded-xl px-3 py-2 text-xs font-bold transition-colors ${activeTab === 'consult' ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <ClipboardList className="mb-1 h-5 w-5" />
            Consultar itens
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('count')}
            className={`flex flex-col items-center rounded-xl px-3 py-2 text-xs font-bold transition-colors ${activeTab === 'count' ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <ScanLine className="mb-1 h-5 w-5" />
            Contagem
          </button>
        </div>
      </nav>
      </div>
    </div>
  );
}

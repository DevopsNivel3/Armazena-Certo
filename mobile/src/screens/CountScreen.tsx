import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Inventory, Product, QueueItem } from '../types';
import { fetchAllProducts, fetchInventory } from '../lib/api';
import { cacheInventories, cacheProducts, enqueueCount, findProductByCode, getCachedInventory, getProducts, getQueue, retryBlockedQueue } from '../lib/database';
import { codeCandidates, countMultiplier, createOperationId, formatBrDateInput, isValidBrDate, normalizeCode, roundQuantity } from '../lib/codes';
import { syncCounts } from '../lib/sync';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { ScannerSheet } from '../components/ScannerSheet';
import { colors, common } from '../theme';

type Props = { token: string; initialInventory: Inventory; online: boolean; onBack: () => void; onAuthExpired: () => void };
type Recent = { id: string; product: string; code: string; quantity: number; at: string };

export function CountScreen({ token, initialInventory, online, onBack, onAuthExpired }: Props) {
  const [inventory, setInventory] = useState(initialInventory);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [code, setCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [validity, setValidity] = useState('');
  const [observation, setObservation] = useState('');
  const [location, setLocation] = useState(initialInventory.local_atribuido || '');
  const [mode, setMode] = useState<'review' | 'auto'>('review');
  const [scanner, setScanner] = useState(false);
  const [tab, setTab] = useState<'count' | 'products'>('count');
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>({ text: '' });
  const savingRef = useRef(false);

  const locations = useMemo<string[]>(() => {
    const raw = inventory.locais_contagem;
    if (Array.isArray(raw)) return raw;
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch { return []; }
  }, [inventory.locais_contagem]);

  const refreshQueue = useCallback(async () => setQueue(await getQueue(inventory.id)), [inventory.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cachedInventory, cachedProducts] = await Promise.all([getCachedInventory(inventory.id), getProducts(inventory.id)]);
      if (cachedInventory) setInventory(cachedInventory);
      if (cachedProducts.length) setProducts(cachedProducts);
      if (online) {
        const [remoteInventory, remoteProducts] = await Promise.all([fetchInventory(token, inventory.id), fetchAllProducts(token, inventory.id)]);
        await Promise.all([cacheInventories([remoteInventory]), cacheProducts(inventory.id, remoteProducts, true)]);
        setInventory(remoteInventory);
        setProducts(remoteProducts);
        if (!location) setLocation(remoteInventory.local_atribuido || (Array.isArray(remoteInventory.locais_contagem) ? remoteInventory.locais_contagem[0] || '' : ''));
      }
      await refreshQueue();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Falha ao preparar o inventário.', error: true });
    } finally {
      setLoading(false);
    }
  }, [inventory.id, location, online, refreshQueue, token]);

  useEffect(() => { void load(); }, [load]);

  const synchronize = useCallback(async (manual = false) => {
    const network = await NetInfo.fetch();
    if (!network.isConnected) return;
    setSyncing(true);
    if (manual) await retryBlockedQueue(inventory.id);
    const report = await syncCounts(token, inventory.id);
    await refreshQueue();
    setSyncing(false);
    if (report.authRequired) onAuthExpired();
    else if (manual || report.sent) setMessage({ text: report.blocked ? `${report.sent} enviada(s); ${report.blocked} exige(m) revisão.` : `${report.sent} contagem(ns) sincronizada(s).`, error: report.blocked > 0 });
  }, [inventory.id, onAuthExpired, refreshQueue, token]);

  useEffect(() => {
    if (online && queue.length && !syncing) void synchronize();
  }, [online, queue.length]); // A sincronização atualiza a própria fila; a trava compartilhada evita concorrência.

  const locate = async (value: string) => {
    const product = await findProductByCode(inventory.id, codeCandidates(value));
    if (!product) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessage({ text: 'Produto não encontrado no catálogo offline deste inventário.', error: true });
      return null;
    }
    return product;
  };

  const identify = async (value = code) => {
    const product = await locate(value);
    if (!product) return false;
    setSelected(product);
    setCode(normalizeCode(value));
    setQuantity('1');
    setMessage({ text: `${product.name} identificado.` });
    await Haptics.selectionAsync();
    return true;
  };

  const save = async (product: Product, scannedCode: string, requestedQuantity: number, fromAuto = false) => {
    if (savingRef.current) return false;
    if (!Number.isFinite(requestedQuantity) || requestedQuantity === 0) return setMessage({ text: 'Informe uma quantidade válida e diferente de zero.', error: true }), false;
    if (!isValidBrDate(validity)) return setMessage({ text: 'Informe uma validade real em DD/MM/AAAA.', error: true }), false;
    const hasExistingValidity = product.validities.length > 0;
    if (inventory.validade_obrigatoria && !validity && !hasExistingValidity) return setMessage({ text: 'A validade é obrigatória na primeira contagem deste produto.', error: true }), false;
    if (inventory.status !== 'em_contagem' && inventory.status !== 'em_recontagem') return setMessage({ text: 'Este inventário não está aberto para contagem.', error: true }), false;
    savingRef.current = true;
    try {
      const standardizedQuantity = roundQuantity(requestedQuantity * countMultiplier(product));
      const draft = {
        localId: createOperationId(), inventoryId: inventory.id, code: normalizeCode(scannedCode), productId: product.productId,
        productName: product.name, quantity: requestedQuantity, standardizedQuantity,
        validity: validity || null, observation: fromAuto ? 'Leitura rápida pelo aplicativo' : observation || null,
        location: location || null, createdAt: new Date().toISOString()
      };
      await enqueueCount(draft);
      setProducts((current) => current.map((item) => item.productId === product.productId ? { ...item, totalCounted: item.totalCounted + standardizedQuantity, difference: item.difference + standardizedQuantity } : item));
      setRecent((current) => [{ id: draft.localId, product: product.name, code: draft.code, quantity: standardizedQuantity, at: draft.createdAt }, ...current].slice(0, 8));
      setSelected(null); setCode(''); setQuantity('1'); setValidity(''); setObservation('');
      setMessage({ text: `${standardizedQuantity > 0 ? '+' : ''}${standardizedQuantity} em ${product.name} · protegido no aparelho.` });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshQueue();
      if (online) setTimeout(() => void synchronize(), 200);
      return true;
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível salvar no aparelho.', error: true });
      return false;
    } finally {
      savingRef.current = false;
    }
  };

  const handleCameraScan = async (value: string) => {
    const product = await locate(value);
    if (!product) return { accepted: false, keepOpen: true, message: 'Produto não encontrado.' };
    if (mode === 'auto' && !inventory.validade_obrigatoria) {
      const accepted = await save(product, value, 1, true);
      return { accepted, keepOpen: accepted, message: accepted ? `+1 em ${product.name}` : 'Leitura não registrada.' };
    }
    setSelected(product); setCode(normalizeCode(value)); setQuantity('1');
    return { accepted: true, keepOpen: false, message: `${product.name} identificado.` };
  };

  const visibleProducts = search ? products.filter((product) => [product.name, product.sku, product.barcode, product.reference].some((value) => value.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))) : products;
  const blocked = queue.filter((item) => item.status === 'blocked').length;

  if (loading && !products.length) return <SafeAreaView style={common.screen}><ActivityIndicator style={{ flex: 1 }} size="large" color={colors.indigo} /></SafeAreaView>;

  return (
    <SafeAreaView style={common.screen}>
      <View style={styles.header}><TouchableOpacity style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity><View style={{ flex: 1 }}><Text style={common.eyebrow}>Inventário #{inventory.id}</Text><Text style={styles.headerTitle} numberOfLines={1}>{inventory.nome}</Text></View><ConnectionBadge online={online} pending={queue.length} /></View>
      <View style={styles.tabs}><TouchableOpacity style={[styles.tab, tab === 'count' && styles.tabActive]} onPress={() => setTab('count')}><Text style={[styles.tabText, tab === 'count' && styles.tabTextActive]}>Contagem</Text></TouchableOpacity><TouchableOpacity style={[styles.tab, tab === 'products' && styles.tabActive]} onPress={() => setTab('products')}><Text style={[styles.tabText, tab === 'products' && styles.tabTextActive]}>Consultar itens</Text></TouchableOpacity></View>
      {tab === 'count' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {message.text ? <Text style={message.error ? common.error : common.success}>{message.text}</Text> : null}
            <View style={[common.card, styles.syncCard]}><View><Text style={styles.syncTitle}>Fila segura: {queue.length}</Text><Text style={common.subtitle}>{blocked ? `${blocked} leitura(s) precisam de nova tentativa.` : syncing ? 'Enviando para o servidor...' : online ? 'Sincronização automática ativa.' : 'Tudo ficará salvo neste aparelho.'}</Text></View><TouchableOpacity style={common.secondaryButton} disabled={!online || syncing || !queue.length} onPress={() => synchronize(true)}><Text style={common.secondaryButtonText}>{syncing ? 'Enviando...' : 'Sincronizar'}</Text></TouchableOpacity></View>
            <View style={styles.modes}><TouchableOpacity style={[styles.mode, mode === 'review' && styles.modeReview]} onPress={() => setMode('review')}><Text style={styles.modeTitle}>Conferir</Text><Text style={styles.modeText}>Revisar quantidade e validade</Text></TouchableOpacity><TouchableOpacity style={[styles.mode, mode === 'auto' && styles.modeAuto, inventory.validade_obrigatoria && { opacity: 0.4 }]} disabled={inventory.validade_obrigatoria} onPress={() => setMode('auto')}><Text style={styles.modeTitle}>Contínuo +1</Text><Text style={styles.modeText}>Salvar a cada bip</Text></TouchableOpacity></View>
            <View style={common.card}>
              <Text style={common.label}>Código, SKU ou referência</Text><View style={styles.codeRow}><TextInput style={[common.input, { flex: 1 }]} value={code} onChangeText={(value) => { setCode(value); setSelected(null); }} autoCapitalize="characters" autoCorrect={false} returnKeyType="go" onSubmitEditing={() => identify()} placeholder="Bipe ou digite" /><TouchableOpacity style={styles.cameraButton} onPress={() => setScanner(true)}><Text style={styles.cameraText}>Câmera</Text></TouchableOpacity></View>
              {!selected ? <TouchableOpacity style={[common.primaryButton, { marginTop: 12 }]} onPress={() => identify()}><Text style={common.primaryButtonText}>Identificar produto</Text></TouchableOpacity> : (
                <View style={styles.form}>
                  <View style={styles.productBox}><Text style={styles.productName}>{selected.name}</Text><Text style={common.subtitle}>SKU {selected.sku || '-'} · EAN {selected.barcode || '-'} · {selected.unit}</Text><Text style={styles.counted}>Já contado: {selected.totalCounted}</Text></View>
                  {locations.length ? <View><Text style={common.label}>Local da contagem</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{locations.map((item) => <TouchableOpacity key={item} style={[styles.chip, location === item && styles.chipActive]} onPress={() => setLocation(item)}><Text style={[styles.chipText, location === item && styles.chipTextActive]}>{item}</Text></TouchableOpacity>)}</ScrollView></View> : null}
                  <View style={styles.twoColumns}><View style={{ flex: 1 }}><Text style={common.label}>Quantidade</Text><TextInput style={common.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><Text style={common.label}>Validade {inventory.validade_obrigatoria ? '*' : ''}</Text><TextInput style={common.input} value={validity} onChangeText={(value) => setValidity(formatBrDateInput(value))} keyboardType="number-pad" placeholder="DD/MM/AAAA" maxLength={10} /></View></View>
                  <View><Text style={common.label}>Observação</Text><TextInput style={common.input} value={observation} onChangeText={setObservation} placeholder="Opcional" /></View>
                  <TouchableOpacity style={common.primaryButton} onPress={() => save(selected, code, Number(quantity.replace(',', '.')))}><Text style={common.primaryButtonText}>Salvar contagem no aparelho</Text></TouchableOpacity>
                </View>
              )}
            </View>
            {recent.length ? <View style={common.card}><Text style={common.eyebrow}>Últimas leituras</Text>{recent.map((item) => <View key={item.id} style={styles.recent}><View style={{ flex: 1 }}><Text style={styles.recentName} numberOfLines={1}>{item.product}</Text><Text style={styles.recentCode}>{item.code} · {new Date(item.at).toLocaleTimeString('pt-BR')}</Text></View><Text style={styles.recentQty}>{item.quantity > 0 ? '+' : ''}{item.quantity}</Text></View>)}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1 }}><TextInput style={[common.input, { margin: 16 }]} value={search} onChangeText={setSearch} placeholder="Buscar nome, SKU, EAN ou referência" /><FlatList data={visibleProducts.slice(0, 250)} keyExtractor={(item) => String(item.productId)} contentContainerStyle={styles.productList} renderItem={({ item }) => <TouchableOpacity style={common.card} onPress={() => { setSelected(item); setCode(item.barcode || item.sku); setQuantity('1'); setTab('count'); }}><Text style={styles.productName}>{item.name}</Text><Text style={common.subtitle}>SKU {item.sku || '-'} · EAN {item.barcode || '-'} · REF {item.reference || '-'}</Text><Text style={styles.counted}>Contado: {item.totalCounted} · Diferença: {item.difference}</Text></TouchableOpacity>} /></View>
      )}
      <ScannerSheet visible={scanner} continuous={mode === 'auto' && !inventory.validade_obrigatoria} onClose={() => setScanner(false)} onScan={handleCameraScan} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white }, back: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 30, lineHeight: 32, color: colors.ink }, headerTitle: { color: colors.ink, fontWeight: '900', fontSize: 17 },
  tabs: { flexDirection: 'row', backgroundColor: colors.white, padding: 8, gap: 8 }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, tabActive: { backgroundColor: colors.cyanSoft }, tabText: { color: colors.slate, fontWeight: '800' }, tabTextActive: { color: colors.cyan }, content: { padding: 14, gap: 13, paddingBottom: 40 },
  syncCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, syncTitle: { color: colors.ink, fontWeight: '900', marginBottom: 3 }, modes: { flexDirection: 'row', gap: 9 }, mode: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, padding: 13, borderRadius: 16 }, modeReview: { borderColor: colors.cyan, backgroundColor: colors.cyanSoft }, modeAuto: { borderColor: '#f59e0b', backgroundColor: colors.amberSoft }, modeTitle: { color: colors.ink, fontWeight: '900' }, modeText: { color: colors.slate, fontSize: 10, marginTop: 3 },
  codeRow: { flexDirection: 'row', gap: 8 }, cameraButton: { minWidth: 88, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, cameraText: { color: colors.white, fontWeight: '900' }, form: { marginTop: 14, gap: 14 }, productBox: { padding: 14, borderRadius: 16, backgroundColor: colors.cyanSoft }, productName: { color: colors.ink, fontWeight: '900', fontSize: 16 }, counted: { color: colors.green, fontWeight: '800', fontSize: 12, marginTop: 7 }, twoColumns: { flexDirection: 'row', gap: 9 }, chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 9 }, chipActive: { borderColor: colors.indigo, backgroundColor: '#eef2ff' }, chipText: { color: colors.slate, fontWeight: '700', fontSize: 12 }, chipTextActive: { color: colors.indigo }, recent: { flexDirection: 'row', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line }, recentName: { color: colors.ink, fontWeight: '800' }, recentCode: { color: colors.muted, fontSize: 11, marginTop: 3 }, recentQty: { color: colors.green, fontWeight: '900' }, productList: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 }
});

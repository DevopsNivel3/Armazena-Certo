import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Inventory, User } from '../types';
import { cacheInventories, getCachedInventories, getQueue } from '../lib/database';
import { fetchInventories } from '../lib/api';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { colors, common } from '../theme';

type Props = {
  token: string; user: User; online: boolean; onOpen: (inventory: Inventory) => void; onLogout: () => void;
};

export function InventoryListScreen({ token, user, online, onOpen, onLogout }: Props) {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setMessage('');
    try {
      const local = await getCachedInventories();
      if (local.length) setInventories(local);
      if (online) {
        const remote = await fetchInventories(token);
        await cacheInventories(remote);
        setInventories(remote);
      } else if (!local.length) {
        setMessage('Conecte-se uma vez para baixar os inventários deste aparelho.');
      }
      setPending((await getQueue()).length);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os inventários.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [online, token]);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={common.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}><Text style={common.eyebrow}>Operação de estoque</Text><Text style={common.title}>Inventários</Text><Text style={common.subtitle}>Olá, {user.nome}.</Text></View>
        <TouchableOpacity style={common.secondaryButton} onPress={onLogout}><Text style={common.secondaryButtonText}>Sair</Text></TouchableOpacity>
      </View>
      <View style={styles.status}><ConnectionBadge online={online} pending={pending} /></View>
      {message ? <Text style={[common.error, { marginHorizontal: 16 }]}>{message}</Text> : null}
      {loading && !inventories.length ? <ActivityIndicator style={{ flex: 1 }} color={colors.indigo} size="large" /> : (
        <FlatList
          data={inventories}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.indigo]} />}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum inventário disponível.</Text>}
          renderItem={({ item }) => {
            const active = item.status === 'em_contagem' || item.status === 'em_recontagem';
            return (
              <TouchableOpacity style={[common.card, !active && { opacity: 0.6 }]} onPress={() => active && onOpen(item)} disabled={!active} activeOpacity={0.75}>
                <View style={styles.row}><Text style={styles.id}>#{item.id}</Text><Text style={[styles.statusLabel, active ? styles.active : styles.inactive]}>{item.status.replaceAll('_', ' ')}</Text></View>
                <Text style={styles.name}>{item.nome}</Text>
                {item.empresa_cliente_nome ? <Text style={common.subtitle}>{item.empresa_cliente_nome}</Text> : null}
                <View style={styles.footer}><Text style={styles.stage}>Etapa {item.etapa_contagem || 1}</Text><Text style={styles.open}>{active ? 'Abrir contagem →' : 'Contagem fechada'}</Text></View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { paddingHorizontal: 18, paddingBottom: 10 },
  list: { padding: 16, paddingBottom: 40, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  id: { fontWeight: '900', color: colors.indigo },
  statusLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99 },
  active: { color: colors.green, backgroundColor: colors.greenSoft }, inactive: { color: colors.slate, backgroundColor: colors.canvas },
  name: { marginTop: 18, color: colors.ink, fontWeight: '900', fontSize: 20 },
  footer: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', justifyContent: 'space-between' },
  stage: { color: colors.slate, fontWeight: '700', fontSize: 12 }, open: { color: colors.indigo, fontWeight: '900', fontSize: 12 },
  empty: { textAlign: 'center', color: colors.slate, marginTop: 70 }
});

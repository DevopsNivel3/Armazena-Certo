import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function ConnectionBadge({ online, pending = 0, compact = false, syncing = false, blocked = 0 }: { online: boolean; pending?: number; compact?: boolean; syncing?: boolean; blocked?: number }) {
  const attention = !online || pending > 0;
  const label = !online ? 'Sem conexão' : blocked ? 'Contagens precisam de revisão' : syncing ? 'Sincronizando' : pending ? 'Aguardando envio' : 'Conectado';
  if (compact) return <View accessibilityLabel={`${label}. ${pending} contagens pendentes.`} style={[styles.symbol, attention ? styles.attention : styles.online]}><Text style={styles.symbolText}>{!online ? '📴' : blocked ? '⚠️' : pending || syncing ? '🔄' : '📶'}</Text>{pending > 0 && <Text style={styles.counter}>{pending}</Text>}</View>;
  return (
    <View style={[styles.badge, attention ? styles.attention : styles.online]}>
      <View style={[styles.dot, { backgroundColor: attention ? colors.amber : colors.green }]} />
      <Text style={[styles.text, { color: attention ? colors.amber : colors.green }]}>
        {!online ? `Offline${pending ? ` · ${pending} pendente(s)` : ''}` : pending ? `${pending} sincronizando` : 'Online'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  symbol: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  symbolText: { fontSize: 21 },
  counter: { position: 'absolute', top: -3, right: -3, backgroundColor: colors.amber, color: colors.white, minWidth: 17, borderRadius: 9, paddingHorizontal: 4, textAlign: 'center', fontSize: 10, fontWeight: '900' },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99 },
  online: { backgroundColor: colors.greenSoft },
  attention: { backgroundColor: colors.amberSoft },
  dot: { width: 7, height: 7, borderRadius: 99 },
  text: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }
});

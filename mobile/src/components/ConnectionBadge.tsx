import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function ConnectionBadge({ online, pending = 0 }: { online: boolean; pending?: number }) {
  const attention = !online || pending > 0;
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
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99 },
  online: { backgroundColor: colors.greenSoft },
  attention: { backgroundColor: colors.amberSoft },
  dot: { width: 7, height: 7, borderRadius: 99 },
  text: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }
});

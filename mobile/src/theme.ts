import { Platform, StyleSheet } from 'react-native';

export const colors = {
  ink: '#07111f', slate: '#475569', muted: '#94a3b8', line: '#e2e8f0', canvas: '#f8fafc',
  white: '#ffffff', cyan: '#0891b2', cyanSoft: '#ecfeff', indigo: '#4f46e5', green: '#047857',
  greenSoft: '#ecfdf5', amber: '#b45309', amberSoft: '#fffbeb', red: '#be123c', redSoft: '#fff1f2'
};

export const common = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.white, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 16,
    ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } } })
  },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 15, paddingHorizontal: 15, color: colors.ink, backgroundColor: colors.white, fontSize: 16 },
  primaryButton: { minHeight: 52, borderRadius: 15, backgroundColor: colors.indigo, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  secondaryButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { color: colors.ink, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  eyebrow: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
  label: { color: colors.slate, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  error: { borderRadius: 14, padding: 12, backgroundColor: colors.redSoft, color: colors.red, fontWeight: '700' },
  success: { borderRadius: 14, padding: 12, backgroundColor: colors.greenSoft, color: colors.green, fontWeight: '700' }
});

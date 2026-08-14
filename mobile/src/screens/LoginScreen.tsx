import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { login } from '../lib/api';
import { common, colors } from '../theme';

type Props = { onLogin: (token: string, user: Awaited<ReturnType<typeof login>>['user']) => Promise<void> };

export function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) return setError('Informe e-mail e senha.');
    setLoading(true);
    setError('');
    try {
      const result = await login(email, password);
      await onLogin(result.token, result.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brand}><Text style={styles.brandText}>AC</Text></View>
        <Text style={common.eyebrow}>Armazena Certo</Text>
        <Text style={[common.title, { marginTop: 8 }]}>Contagem móvel</Text>
        <Text style={[common.subtitle, { marginTop: 8, marginBottom: 26, textAlign: 'center' }]}>Bipe rápido, trabalhe offline e sincronize com segurança.</Text>
        <View style={[common.card, styles.form]}>
          {error ? <Text style={common.error}>{error}</Text> : null}
          <View><Text style={common.label}>E-mail</Text><TextInput style={common.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" /></View>
          <View><Text style={common.label}>Senha</Text><TextInput style={common.input} value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} returnKeyType="go" /></View>
          <TouchableOpacity style={common.primaryButton} onPress={submit} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={common.primaryButtonText}>Entrar e preparar aparelho</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22 },
  brand: { width: 70, height: 70, borderRadius: 24, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  brandText: { color: colors.white, fontWeight: '900', fontSize: 25 },
  form: { width: '100%', maxWidth: 440, gap: 16 },
});

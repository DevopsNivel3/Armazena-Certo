import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { ActivityIndicator, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Inventory, User } from './src/types';
import { clearSession, loadSession, saveSession } from './src/lib/session';
import { getMe } from './src/lib/api';
import { getDatabase } from './src/lib/database';
import { syncCounts } from './src/lib/sync';
import { LoginScreen } from './src/screens/LoginScreen';
import { InventoryListScreen } from './src/screens/InventoryListScreen';
import { CountScreen } from './src/screens/CountScreen';
import { colors } from './src/theme';

type Session = { token: string; user: User };

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected && state.isInternetReachable !== false)));
    void Promise.all([getDatabase(), loadSession()]).then(async ([, cachedSession]) => {
      if (!cachedSession) return;
      setSession(cachedSession);
      const network = await NetInfo.fetch();
      if (network.isConnected) {
        try {
          const user = await getMe(cachedSession.token);
          const next = { token: cachedSession.token, user };
          await saveSession(next.token, next.user);
          setSession(next);
          void syncCounts(next.token);
        } catch (error) {
          if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 401) {
            // Mantemos a sessão visual até o usuário autenticar novamente; a fila não é removida.
            setSession(null);
          }
        }
      }
    }).finally(() => setReady(true));
    return unsubscribe;
  }, []);

  const authenticated = async (token: string, user: User) => {
    await saveSession(token, user);
    setSession({ token, user });
    void syncCounts(token);
  };

  const logout = async () => {
    await clearSession();
    setSelectedInventory(null);
    setSession(null);
  };

  if (!ready) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}><ActivityIndicator style={{ flex: 1 }} color={colors.cyan} size="large" /></SafeAreaView>;

  return (
    <>
      <StatusBar style={session ? 'dark' : 'light'} />
      {!session ? <LoginScreen onLogin={authenticated} /> : selectedInventory ? (
        <CountScreen token={session.token} initialInventory={selectedInventory} online={online} onBack={() => setSelectedInventory(null)} onAuthExpired={() => setSession(null)} />
      ) : (
        <InventoryListScreen token={session.token} user={session.user} online={online} onOpen={setSelectedInventory} onLogout={logout} />
      )}
    </>
  );
}

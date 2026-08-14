import * as SecureStore from 'expo-secure-store';
import type { User } from '../types';

const TOKEN_KEY = 'armazena_certo_token';
const USER_KEY = 'armazena_certo_user';

export async function saveSession(token: string, user: User) {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
  ]);
}

export async function loadSession() {
  const [token, rawUser] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(USER_KEY)
  ]);
  if (!token || !rawUser) return null;
  try {
    return { token, user: JSON.parse(rawUser) as User };
  } catch {
    return null;
  }
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY)
  ]);
}

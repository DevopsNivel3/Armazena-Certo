import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api from '../services/api';
import { socket, connectSocketWithToken } from '../services/socket';

const AuthContext = createContext();
const TOKEN_KEY = 'token';
const USER_CACHE_KEY = 'user_cache';

function readCachedUser() {
  try {
    const cachedUser = localStorage.getItem(USER_CACHE_KEY);
    return cachedUser ? JSON.parse(cachedUser) : null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => localStorage.getItem(TOKEN_KEY) ? readCachedUser() : null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const response = await api.get('/auth/me');
      if (localStorage.getItem(TOKEN_KEY) !== token) return null;
      setUser(response.data);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      if (localStorage.getItem(TOKEN_KEY) !== token) return null;
      if ([400, 401, 403].includes(error.response?.status)) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_CACHE_KEY);
        setUser(null);
        socket.disconnect();
      }
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshUser().finally(() => setLoading(false));
    const refresh = () => { void refreshUser(); };
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('module-access-denied', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('module-access-denied', refresh);
    };
  }, [refreshUser]);

  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => { void refreshUser(); };
    const reconnect = (reason) => {
      if (reason === 'io server disconnect') {
        void refreshUser().then((current) => {
          if (current) connectSocketWithToken();
        });
      }
    };
    socket.on('permissionsChanged', refresh);
    socket.on('disconnect', reconnect);
    connectSocketWithToken();
    return () => {
      socket.off('permissionsChanged', refresh);
      socket.off('disconnect', reconnect);
    };
  }, [user?.id, refreshUser]);

  const login = async (email, senha) => {
    const response = await api.post('/auth/login', {
      email: email.trim().toLowerCase(),
      senha
    });
    localStorage.setItem(TOKEN_KEY, response.data.token);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(response.data.user));
    setUser(response.data.user);
    setLoading(false);
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_CACHE_KEY);
    setUser(null);
    setLoading(false);
    socket.disconnect();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

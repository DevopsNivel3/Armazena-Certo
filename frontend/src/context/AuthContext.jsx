import { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

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
  const [user, setUser] = useState(() => readCachedUser());
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY) && !readCachedUser());

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const cachedUser = readCachedUser();

    if (token) {
      api.get('/auth/me')
        .then(response => {
          setUser(response.data);
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(response.data));
        })
        .catch((error) => {
          const status = error.response?.status;

          if (status === 400 || status === 401 || status === 403) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_CACHE_KEY);
            setUser(null);
          } else {
            console.warn('Não foi possível validar o token com o servidor (possível offline). Mantendo cache.');
            if (cachedUser) {
              setUser(cachedUser);
            }
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, []);

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
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error('VITE_API_URL nao foi configurada no arquivo .env do frontend.');
}

const api = axios.create({
  // Em desenvolvimento, o Vite encaminha /api ao backend configurado no proxy.
  // Assim o navegador não faz uma requisição cross-origin durante o desenvolvimento.
  baseURL: API_URL.replace(/\/$/, ''),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.data?.code === 'MODULE_ACCESS_DENIED'
    || (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/'))) {
    window.dispatchEvent(new Event('module-access-denied'));
  }
  return Promise.reject(error);
});

export default api;

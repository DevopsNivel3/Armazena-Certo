import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SOCKET_URL;

if (!URL) {
  throw new Error('VITE_SOCKET_URL nao foi configurada no arquivo .env do frontend.');
}
const SOCKET_CLIENT_ID_KEY = 'socket_client_id';

function getSocketClientId() {
  const existingId = localStorage.getItem(SOCKET_CLIENT_ID_KEY);
  if (existingId) {
    return existingId;
  }

  const generatedId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(SOCKET_CLIENT_ID_KEY, generatedId);
  return generatedId;
}

export const socket = io(URL, {
  autoConnect: false,
  auth: (cb) => {
    cb({
      token: localStorage.getItem('token') || '',
      clientId: getSocketClientId()
    });
  }
});

// Helper function to update the token before reconnecting if it changed
export const connectSocketWithToken = () => {
  const token = localStorage.getItem('token') || '';
  const clientId = getSocketClientId();
  
  if (socket.connected) {
    if (socket.auth?.token === token && socket.auth?.clientId === clientId) {
      return; // Already connected with the correct token
    }
    socket.disconnect();
  }
  
  socket.auth = { token, clientId };
  socket.connect();
};

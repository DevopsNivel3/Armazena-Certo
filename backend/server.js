const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { syncDatabase } = require('./models');
const authRoutes = require('./routes/authRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const productRoutes = require('./routes/productRoutes');
const importRoutes = require('./routes/importRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const empresaRoutes = require('./routes/empresaRoutes');
const conferenciaRoutes = require('./routes/conferenciaRoutes');
const expedicaoRoutes = require('./routes/expedicaoRoutes');
const relatorioRoutes = require('./routes/relatorioRoutes');
const {
  registerSocketUser,
  registerSocketInventory,
  unregisterSocketInventory,
  unregisterSocket,
  getSocketUserContext
} = require('./socket');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.CORS_ORIGINS) {
  throw new Error('CORS_ORIGINS nao foi configurada no arquivo .env do backend.');
}

const allowedOrigins = process.env.CORS_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Clientes sem Origin (por exemplo, curl e health checks) não precisam de CORS.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const http = require('http');
const server = http.createServer(app);
const io = require('./socket').init(server);

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/inventories', inventoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/import', importRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/empresas', empresaRoutes);
app.use('/api/conferencia', conferenciaRoutes);
app.use('/api/expedicao', expedicaoRoutes);
app.use('/api/relatorios', relatorioRoutes);

app.get('/', (req, res) => {
  res.send('API de Inventário rodando!');
});

const startServer = async () => {
  await syncDatabase();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    const authToken = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization;
    const clientId = socket.handshake?.auth?.clientId || null;
    if (authToken) {
      try {
        const tokenString = String(authToken).replace('Bearer ', '');
        const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);
        const userId = decoded.id || decoded.usuario_id || decoded.sub;
        console.log(`Socket ${socket.id} authenticated for user ID ${userId} (device ${clientId || 'unknown'})`);
        registerSocketUser(socket.id, userId, clientId, decoded.empresa_id);
        socket.data.user = decoded;
        // Salas privadas usadas pelas atualizações seguras do Outbound.
        socket.join(`usuario_${userId}`);
        if (decoded.empresa_id && ['admin', 'gerente'].includes(decoded.nivel_acesso)) {
          socket.join(`empresa_${decoded.empresa_id}_outbound_managers`);
        }
        if (decoded.empresa_id) {
          io.to(`empresa_${decoded.empresa_id}_outbound_managers`).emit('outboundPresenceUpdate', {
            type: 'user_connection_changed',
            usuario_id: userId
          });
        }
      } catch (error) {
        console.warn(`Socket ${socket.id} connected without valid auth token:`, error.message);
      }
    } else {
      console.log(`Socket ${socket.id} connected with NO token provided.`);
    }
    
    // Allow client to join an inventory-specific room
    socket.on('joinInventory', (inventoryId) => {
      socket.join(`inventory_${inventoryId}`);
      registerSocketInventory(socket.id, inventoryId);
      io.to(`inventory_${inventoryId}`).emit('inventoryPresenceUpdate', {
        type: 'user_connection_changed',
        inventoryId
      });
      console.log(`Socket ${socket.id} joined room inventory_${inventoryId}`);
    });

    socket.on('leaveInventory', (inventoryId) => {
      socket.leave(`inventory_${inventoryId}`);
      unregisterSocketInventory(socket.id, inventoryId);
      io.to(`inventory_${inventoryId}`).emit('inventoryPresenceUpdate', {
        type: 'user_connection_changed',
        inventoryId
      });
      console.log(`Socket ${socket.id} left room inventory_${inventoryId}`);
    });

    socket.on('disconnect', () => {
      const userContext = getSocketUserContext(socket.id);
      const inventoryIds = unregisterSocket(socket.id);
      inventoryIds.forEach((inventoryId) => {
        io.to(`inventory_${inventoryId}`).emit('inventoryPresenceUpdate', {
          type: 'user_connection_changed',
          inventoryId
        });
      });
      if (userContext?.companyId) {
        io.to(`empresa_${userContext.companyId}_outbound_managers`).emit('outboundPresenceUpdate', {
          type: 'user_connection_changed',
          usuario_id: userContext.userId
        });
      }
      console.log('Client disconnected:', socket.id);
    });
  });
};

startServer();

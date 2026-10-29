const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { syncDatabase, Usuario, Inventario, InventarioUsuario } = require('./models');
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
const { hasUserModule } = require('./constants/userModules');

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

io.use(async (socket, next) => {
  try {
    const token = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization;
    const decoded = jwt.verify(String(token || '').replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await Usuario.findByPk(decoded.id, {
      attributes: ['id', 'empresa_id', 'nivel_acesso', 'modulos']
    });
    if (!user || !user.empresa_id || Number(user.empresa_id) !== Number(decoded.empresa_id)) {
      return next(new Error('Sessão inválida.'));
    }
    socket.data.user = user.toJSON();
    socket.data.expiresAt = decoded.exp * 1000;
    return next();
  } catch {
    return next(new Error('Não foi possível autenticar a conexão.'));
  }
});

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

    const user = socket.data.user;
    const clientId = socket.handshake?.auth?.clientId || null;
    registerSocketUser(socket.id, user.id, clientId, user.empresa_id);
    socket.join(`usuario_${user.id}`);
    if (hasUserModule(user, 'cross_docking')) {
      socket.join(`usuario_${user.id}_cross_docking`);
    }
    if (hasUserModule(user, 'inventario')) {
      socket.join(`empresa_${user.empresa_id}_inventario`);
    }
    if (['admin', 'gerente'].includes(user.nivel_acesso) && hasUserModule(user, 'cross_docking')) {
      socket.join(`empresa_${user.empresa_id}_outbound_managers`);
    }
    io.to(`empresa_${user.empresa_id}_outbound_managers`).emit('outboundPresenceUpdate', {
      type: 'user_connection_changed', usuario_id: user.id
    });
    const expirationTimer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));
    socket.on('disconnect', () => clearTimeout(expirationTimer));

    socket.on('joinInventory', async (inventoryId) => {
      try {
        const id = Number(inventoryId);
        if (!Number.isSafeInteger(id) || id <= 0) return;
        const current = await Usuario.findByPk(user.id);
        if (!current || !hasUserModule(current, 'inventario') || Number(current.empresa_id) !== Number(user.empresa_id)) {
          socket.emit('moduleAccessDenied', { module: 'inventario' });
          return;
        }
        const inventory = await Inventario.findOne({ where: { id, empresa_id: current.empresa_id } });
        if (!inventory) return;
        if (!['admin', 'gerente'].includes(current.nivel_acesso)) {
          const assignment = await InventarioUsuario.findOne({ where: { inventario_id: id, usuario_id: current.id } });
          if (!assignment) return;
        }
        if (!socket.connected) return;
        socket.join(`inventory_${id}`);
        registerSocketInventory(socket.id, id);
        io.to(`inventory_${id}`).emit('inventoryPresenceUpdate', {
          type: 'user_connection_changed', inventoryId: id
        });
      } catch (error) {
        console.error('Erro ao autorizar sala de inventario:', error);
      }
    });

    socket.on('leaveInventory', (inventoryId) => {
      if (!socket.rooms.has(`inventory_${inventoryId}`)) return;
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

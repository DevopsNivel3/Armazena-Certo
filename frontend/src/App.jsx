import { BarChart3, Loader2, ShieldCheck } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import InventoryList from './pages/InventoryList';
import InventoryDetails from './pages/InventoryDetails';
import CreateInventory from './pages/CreateInventory';
import UserList from './pages/UserList';
import InventoryCount from './pages/InventoryCount';
import InboundConference from './pages/InboundConference';
import OutboundExpedition from './pages/OutboundExpedition';
import OutboundConference from './pages/OutboundConference';
import MyOutboundLoads from './pages/MyOutboundLoads';
import AccountabilityDashboard from './pages/AccountabilityDashboard';
import OutboundReturns from './pages/OutboundReturns';
import './index.css'; // Ensure tailwind is imported

function AppLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-white/95 p-8 text-center shadow-2xl shadow-slate-950/40 backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600 shadow-sm">
          <BarChart3 className="h-8 w-8" />
        </div>
        <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">Preparando o ambiente</h2>
        <p className="mt-3 text-sm text-slate-500">
          Validando sua sessão e carregando a experiência do sistema.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3 text-indigo-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">Carregando...</span>
        </div>
        <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4">
          <div className="flex items-start gap-3 text-left">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-slate-600">
              Acesso protegido para operadores, gerentes e administradores.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDefaultRouteForUser(user) {
  if (!user) {
    return '/';
  }

  return user.nivel_acesso === 'operador' || user.nivel_acesso === 'admin_inventario' ? '/inventarios' : '/dashboard';
}

const PrivateRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <AppLoader />;
  }

  if (!user) {
    return <Navigate to={`/?redirect=${encodeURIComponent(location.pathname + location.search)}`} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.nivel_acesso)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={
            <PrivateRoute allowedRoles={['admin', 'gerente']}>
              <Dashboard />
            </PrivateRoute>
          } />
          <Route path="/inventarios" element={
            <PrivateRoute>
              <InventoryList />
            </PrivateRoute>
          } />
          <Route path="/inventarios/novo" element={
            <PrivateRoute allowedRoles={['admin', 'gerente']}>
              <CreateInventory />
            </PrivateRoute>
          } />
          <Route path="/inventarios/:id" element={
            <PrivateRoute allowedRoles={['admin', 'gerente', 'admin_inventario']}>
              <InventoryDetails />
            </PrivateRoute>
          } />
          <Route path="/contagem/:id" element={
            <PrivateRoute>
              <InventoryCount />
            </PrivateRoute>
          } />
          <Route path="/conferencia/inbound" element={
            <PrivateRoute>
              <InboundConference />
            </PrivateRoute>
          } />
          <Route path="/conferencia/outbound" element={
            <PrivateRoute allowedRoles={['admin', 'gerente']}>
              <OutboundExpedition />
            </PrivateRoute>
          } />
          <Route path="/conferencia/outbound/minhas-cargas" element={
            <PrivateRoute allowedRoles={['operador', 'admin_inventario']}>
              <MyOutboundLoads />
            </PrivateRoute>
          } />
          <Route path="/conferencia/outbound/retornos" element={
            <PrivateRoute allowedRoles={['admin', 'gerente']}>
              <OutboundReturns />
            </PrivateRoute>
          } />
          <Route path="/conferencia/outbound/:id" element={
            <PrivateRoute>
              <OutboundConference />
            </PrivateRoute>
          } />
          <Route path="/usuarios" element={
            <PrivateRoute allowedRoles={['admin']}>
              <UserList />
            </PrivateRoute>
          } />
          <Route path="/prestacao-contas" element={
            <PrivateRoute allowedRoles={['admin', 'gerente']}>
              <AccountabilityDashboard />
            </PrivateRoute>
          } />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

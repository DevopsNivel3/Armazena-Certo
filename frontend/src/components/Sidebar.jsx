import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Truck,
  BarChart3,
  RotateCcw
} from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed);
  }, [collapsed]);

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', available: true, roles: ['admin', 'gerente'] },
    { icon: BarChart3, label: 'Prestação de contas', path: '/prestacao-contas', available: true, roles: ['admin', 'gerente'] },
    { icon: ClipboardList, label: 'Inventários', path: '/inventarios', available: true, roles: ['admin', 'gerente', 'operador', 'admin_inventario'] },
    { icon: Truck, label: 'Inbound / Recebimento', path: '/conferencia/inbound', available: true, roles: ['admin', 'gerente', 'operador', 'admin_inventario'] },
    { icon: Truck, label: ['operador', 'admin_inventario'].includes(user?.nivel_acesso) ? 'Minhas cargas Outbound' : 'Outbound / Expedição', path: ['operador', 'admin_inventario'].includes(user?.nivel_acesso) ? '/conferencia/outbound/minhas-cargas' : '/conferencia/outbound', excludePrefixes: ['/conferencia/outbound/retornos'], available: true, roles: ['admin', 'gerente', 'operador', 'admin_inventario'] },
    { icon: RotateCcw, label: 'Retornos Outbound', path: '/conferencia/outbound/retornos', available: true, roles: ['admin', 'gerente'] },
    { icon: Users, label: 'Usuários', path: '/usuarios', available: true, roles: ['admin'] },
    { icon: Package, label: 'Produtos', path: '/produtos', available: false, roles: ['admin', 'gerente'] },
    { icon: Settings, label: 'Configurações', path: '/configuracoes', available: false, roles: ['admin'] },
  ];

  const visibleMenuItems = menuItems.filter((item) => !item.roles || item.roles.includes(user?.nivel_acesso));

  const isActive = (item) => {
    if (item.excludePrefixes?.some((prefix) => location.pathname.startsWith(prefix))) return false;
    return location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
  };

  return (
    <>
      {/* Navbar Mobile (Visível apenas em telas pequenas) */}
      <div className="lg:hidden flex items-center justify-between bg-slate-950 px-4 py-3 border-b border-slate-800/80 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg bg-slate-900 p-2 text-slate-400 border border-slate-800 mr-1"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex h-10 w-10 items-center justify-center">
            <img src="/logo.png" alt="Armazena Certo Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-50">Armazena Certo</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Adicionando botão de logout rápido no mobile no lado direito */}
          <button onClick={logout} className="p-2 text-slate-400 hover:text-rose-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Overlay Escuro para Mobile */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Principal */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 h-screen shrink-0 border-r border-slate-800/80 bg-slate-950 text-white transition-all duration-300 flex flex-col lg:sticky lg:top-0 lg:left-0 ${
          collapsed ? 'lg:w-24' : 'lg:w-72'
        } ${mobileOpen ? 'w-72 translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
      <div className="border-b border-slate-800/80 px-4 py-5">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between gap-3'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center">
                  <img src="/logo.png" alt="Armazena Certo Logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Armazena Certo</p>
                  <h1 className="text-sm font-bold tracking-tight text-slate-50">Gestão inteligente</h1>
                </div>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="flex h-12 w-12 items-center justify-center">
              <img src="/logo.png" alt="Armazena Certo Logo" className="h-full w-full object-contain" />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.innerWidth < 1024) {
                setMobileOpen(false);
              } else {
                setCollapsed(!collapsed);
              }
            }}
            className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
            title="Recolher menu"
          >
            <span className="lg:hidden"><ChevronLeft size={18} /></span>
            <span className="hidden lg:block">{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</span>
          </button>
        </div>
      </div>

      <div className="border-b border-slate-800/80 px-4 py-4">
        <div
          className={`rounded-2xl border border-slate-800 bg-slate-900/80 p-3 ${
            collapsed ? 'flex justify-center' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-lg shadow-indigo-900/30">
              {user?.nome?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">{user?.nome || 'Usuário'}</p>
                <p className="truncate text-xs text-slate-400">{user?.email || 'Sem e-mail'}</p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Sessão ativa
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        {!collapsed && (
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Navegação
            </p>
          </div>
        )}

        <div className="space-y-2">
          {visibleMenuItems.map((item) => {
            const active = item.available && isActive(item);
            const baseClass =
              'group flex items-center rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-200';

            if (!item.available) {
              return (
                <div
                  key={item.path}
                  className={`${baseClass} cursor-not-allowed border border-slate-900 bg-slate-900/60 text-slate-500`}
                  title={collapsed ? item.label : `${item.label} em breve`}
                >
                  <item.icon className={`h-5 w-5 shrink-0 ${collapsed ? '' : 'mr-3'} text-slate-600`} />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        Em breve
                      </span>
                    </>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`${baseClass} ${
                  active
                    ? 'border border-indigo-500/30 bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-white shadow-lg shadow-indigo-950/30'
                    : 'border border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-100'
                }`}
                title={collapsed ? item.label : ''}
              >
                <item.icon
                  className={`h-5 w-5 shrink-0 ${collapsed ? '' : 'mr-3'} ${
                    active ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-200'
                  }`}
                />
                {!collapsed && <span className="flex-1">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-slate-800/80 p-4">
        <button
          type="button"
          onClick={logout}
          className={`flex w-full items-center rounded-2xl border border-rose-500/10 bg-rose-500/5 px-3 py-3 text-sm font-semibold text-rose-300 transition-all hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-200 ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? 'Sair' : ''}
        >
          <LogOut className={`h-5 w-5 shrink-0 ${collapsed ? '' : 'mr-3'}`} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
    </>
  );
}

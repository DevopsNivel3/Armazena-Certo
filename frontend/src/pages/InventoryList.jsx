import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  Package,
  Plus,
  Search,
} from 'lucide-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { connectSocketWithToken, socket } from '../services/socket';

const STATUS_META = {
  criado: {
    label: 'Criado',
    badge: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    card: 'from-slate-50 to-white',
  },
  em_contagem: {
    label: 'Em contagem',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    card: 'from-amber-50 to-white',
  },
  em_recontagem: {
    label: 'Em recontagem',
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    card: 'from-rose-50 to-white',
  },
  finalizado: {
    label: 'Finalizado',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    card: 'from-emerald-50 to-white',
  },
};

export default function InventoryList() {
  const { user } = useAuth();
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadInventories = useCallback(async () => {
    try {
      const response = await api.get('/inventories');
      setInventories(response.data);
    } catch (error) {
      console.error('Error loading inventories:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventories();
  }, [loadInventories]);

  useEffect(() => {
    connectSocketWithToken();
    
    socket.on('dashboardUpdate', () => {
      console.log('Inventory list update received');
      loadInventories();
    });

    return () => {
      socket.off('dashboardUpdate');
      socket.disconnect();
    };
  }, [loadInventories]);

  const filteredInventories = inventories.filter((inv) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      inv.nome?.toLowerCase().includes(searchLower) ||
      inv.empresa_cliente_nome?.toLowerCase().includes(searchLower) ||
      inv.empresa_cliente_filial?.toLowerCase().includes(searchLower)
    );
  });

  const counts = inventories.reduce(
    (acc, inventory) => {
      const status = inventory?.status || 'criado';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {}
  );

  const summaryCards = [
    {
      label: 'Total',
      value: inventories.length,
      description: 'Inventários cadastrados',
    },
    {
      label: 'Em andamento',
      value: (counts.em_contagem || 0) + (counts.em_recontagem || 0),
      description: 'Operações ativas',
    },
    {
      label: 'Finalizados',
      value: counts.finalizado || 0,
      description: 'Concluídos com sucesso',
    },
  ];

  const totalDivergencias = inventories.reduce(
    (acc, inventory) => acc + Number(inventory.produtos_divergentes || 0),
    0
  );

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-100">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex h-full min-h-[60vh] items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" />
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
              <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 shadow-2xl shadow-slate-300/30">
                <div className="grid gap-6 px-6 py-7 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
                  <div>
                    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                      Gestão operacional
                    </div>
                    <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                      Gerencie os inventários com mais clareza e menos ruído visual.
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                      Veja o status das operações, filtre rapidamente pelo nome e entre no inventário certo sem perder tempo.
                    </p>
                    {(user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'gerente') ? (
                      <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                          to="/inventarios/novo"
                          className="inline-flex items-center rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 transition-all hover:bg-indigo-400"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Novo inventário
                        </Link>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    {summaryCards.map((card) => (
                      <div key={card.label} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{card.label}</p>
                        <p className="mt-3 text-3xl font-bold text-white">{card.value}</p>
                        <p className="mt-2 text-sm text-slate-300">{card.description}</p>
                      </div>
                    ))}
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Divergências</p>
                      <p className="mt-3 text-3xl font-bold text-white">{totalDivergencias}</p>
                      <p className="mt-2 text-sm text-slate-300">Itens divergentes ainda em aberto.</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Busca rápida</p>
                    <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Encontre um inventário</h2>
                  </div>
                  <div className="relative w-full max-w-xl">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                      <Search className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar inventário por nome ou cliente..."
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {filteredInventories.length === 0 ? (
                <section className="rounded-[28px] border border-slate-200/80 bg-white px-6 py-16 text-center shadow-sm">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                    <ClipboardList className="h-7 w-7 text-slate-400" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">Nenhum inventário encontrado</h3>
                  <p className="mt-2 text-sm text-slate-500">Tente outro termo de busca ou crie um novo inventário.</p>
                </section>
              ) : (
                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredInventories.map((inventory) => {
                    const meta = STATUS_META[inventory.status] || STATUS_META.criado;
                    return (
                      <article
                        key={inventory.id}
                        className={`overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br ${meta.card} shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md`}
                      >
                        <div className="p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
                              <Package className="h-5 w-5" />
                            </div>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </div>

                          <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900">{inventory.nome}</h3>

                          {(inventory.empresa_cliente_nome || inventory.empresa_cliente_filial) && (
                            <div className="mt-2 text-sm font-medium text-slate-600 bg-white/60 border border-slate-200/50 rounded-xl px-3 py-2 flex flex-col gap-0.5">
                              {inventory.empresa_cliente_nome && (
                                <span className="text-slate-800 font-bold">{inventory.empresa_cliente_nome}</span>
                              )}
                              {inventory.empresa_cliente_filial && (
                                <span className="text-xs text-slate-500 uppercase tracking-widest">{inventory.empresa_cliente_filial}</span>
                              )}
                            </div>
                          )}

                          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(inventory.createdAt).toLocaleDateString()}</span>
                          </div>

                          <div className="mt-6 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200/70">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Identificação</span>
                              <span className="font-semibold text-slate-900">#{inventory.id}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-sm">
                              <span className="text-slate-500">Situação</span>
                              <span className="font-semibold text-slate-900">{meta.label}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-sm">
                              <span className="text-slate-500">Progresso</span>
                              <span className="font-semibold text-slate-900">{inventory.progresso_percentual || 0}%</span>
                            </div>
                            <div className="mt-3 h-2.5 w-full rounded-full bg-slate-200">
                              <div
                                className="h-2.5 rounded-full bg-indigo-600 transition-all"
                                style={{ width: `${inventory.progresso_percentual || 0}%` }}
                              />
                            </div>
                            <div className="mt-3 flex items-center justify-between text-sm">
                              <span className="text-slate-500">Divergências</span>
                              <span className="font-semibold text-slate-900">{inventory.produtos_divergentes || 0}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-200/80 bg-white/80 px-6 py-4">
                          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                            {user?.nivel_acesso === 'operador' ? 'Abrir contagem' : 'Abrir detalhes'}
                          </span>
                          <Link
                            to={user?.nivel_acesso === 'operador' ? `/contagem/${inventory.id}` : `/inventarios/${inventory.id}`}
                            className="inline-flex items-center text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
                          >
                            {user?.nivel_acesso === 'operador' ? 'Contar' : 'Acessar'}
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

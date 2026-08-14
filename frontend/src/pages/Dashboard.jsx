import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  ChevronRight,
  Clock3,
  Package,
  Plus,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { socket } from '../services/socket';

const STATUS_META = {
  criado: {
    label: 'Criado',
    badge: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  },
  em_contagem: {
    label: 'Em contagem',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  em_recontagem: {
    label: 'Em recontagem',
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  },
  finalizado: {
    label: 'Finalizado',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
};

function StatCard({ title, value, description, icon: Icon, iconClass }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <h3 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</h3>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(true);

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
    socket.connect();
    
    socket.on('dashboardUpdate', () => {
      console.log('Dashboard update received');
      loadInventories();
    });

    return () => {
      socket.off('dashboardUpdate');
      socket.disconnect();
    };
  }, [loadInventories]);

  const statusCounts = inventories.reduce(
    (acc, inv) => {
      const status = inv?.status || 'criado';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {}
  );

  const totalFinalizados = statusCounts.finalizado || 0;
  const totalCriados = statusCounts.criado || 0;
  const totalEmContagem = statusCounts.em_contagem || 0;
  const totalEmRecontagem = statusCounts.em_recontagem || 0;
  const totalEmAndamento = totalEmContagem + totalEmRecontagem;
  const totalDivergencias = inventories.reduce(
    (acc, inventory) => acc + Number(inventory.produtos_divergentes || 0),
    0
  );
  const averageProgress = inventories.length
    ? Number(
        (
          inventories.reduce(
            (acc, inventory) => acc + Number(inventory.progresso_percentual || 0),
            0
          ) / inventories.length
        ).toFixed(1)
      )
    : 0;

  const COLORS = ['#026666', '#f59e0b', '#1c1a1a'];

  const pieData = [
    { name: 'Finalizado', value: totalFinalizados },
    { name: 'Em andamento', value: totalEmAndamento },
    { name: 'Criado', value: totalCriados },
  ].filter((item) => item.value > 0);

  const statusOption = {
    tooltip: { trigger: 'item', backgroundColor: '#efeeee', borderRadius: 8, padding: 12, textStyle: { color: '#1c1a1a' } },
    legend: { show: false },
    series: [
      {
        name: 'Status',
        type: 'pie',
        radius: ['50%', '80%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#efeeee', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        data: pieData.map((d, i) => ({ value: d.value, name: d.name, itemStyle: { color: COLORS[i % COLORS.length] } }))
      }
    ]
  };

  const monthlyCounts = inventories.reduce((acc, inv) => {
    const createdAt = inv?.createdAt ? new Date(inv.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return acc;
    const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const monthLabel = (key) => {
    const [year, month] = key.split('-');
    const monthIndex = Number(month) - 1;
    const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${names[monthIndex]} ${year}`;
  };

  const monthlyDataKeys = Object.keys(monthlyCounts).sort().slice(-12);
  const monthlyOption = {
    tooltip: { trigger: 'axis', backgroundColor: '#efeeee', borderRadius: 8, padding: 12 },
    grid: { top: 30, right: 20, bottom: 30, left: 40 },
    xAxis: { 
      type: 'category', 
      data: monthlyDataKeys.map(monthLabel), 
      axisLine: { show: false }, 
      axisTick: { show: false },
      axisLabel: { color: '#7a7a7a', fontSize: 12 }
    },
    yAxis: { 
      type: 'value', 
      splitLine: { lineStyle: { type: 'dashed', color: '#e1e1e1' } },
      axisLabel: { color: '#7a7a7a', fontSize: 12 }
    },
    series: [{ 
      data: monthlyDataKeys.map(k => monthlyCounts[k]), 
      type: 'bar', 
      itemStyle: { color: '#026666', borderRadius: [6, 6, 0, 0] } 
    }]
  };

  // --- Novos Gráficos de Análise para Inventários Finalizados ---
  const finalizedInvs = [...inventories].filter(i => i.status === 'finalizado').sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(-10);
  
  // 1. Acurácia (Batidos vs Contados)
  const accuracyData = finalizedInvs.map(i => {
    const hitRate = i.produtos_contados ? (i.produtos_batidos / i.produtos_contados) * 100 : 0;
    return { name: i.nome.length > 12 ? i.nome.substring(0,12)+'...' : i.nome, value: hitRate.toFixed(1) };
  });

  const accuracyOption = {
    tooltip: { trigger: 'axis', formatter: '{b}<br/>Acurácia: {c}%', backgroundColor: '#efeeee', borderRadius: 8 },
    grid: { top: 30, right: 20, bottom: 40, left: 40 },
    xAxis: { type: 'category', data: accuracyData.map(d => d.name), axisLabel: { color: '#7a7a7a', fontSize: 10, interval: 0, rotate: 30 } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%', color: '#7a7a7a' }, splitLine: { lineStyle: { type: 'dashed', color: '#e1e1e1' } } },
    series: [{ 
      data: accuracyData.map(d => d.value), 
      type: 'line', 
      smooth: true, 
      areaStyle: { opacity: 0.1, color: '#10b981' }, 
      itemStyle: { color: '#10b981' },
      symbolSize: 8
    }]
  };

  // 2. Taxa de Divergência
  const divergenceData = finalizedInvs.map(i => {
    const divRate = i.produtos_contados ? (i.produtos_divergentes / i.produtos_contados) * 100 : 0;
    return { name: i.nome.length > 12 ? i.nome.substring(0,12)+'...' : i.nome, value: divRate.toFixed(1) };
  });

  const divergenceOption = {
    tooltip: { trigger: 'axis', formatter: '{b}<br/>Divergência: {c}%', backgroundColor: '#efeeee', borderRadius: 8 },
    grid: { top: 30, right: 20, bottom: 40, left: 40 },
    xAxis: { type: 'category', data: divergenceData.map(d => d.name), axisLabel: { color: '#7a7a7a', fontSize: 10, interval: 0, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%', color: '#7a7a7a' }, splitLine: { lineStyle: { type: 'dashed', color: '#e1e1e1' } } },
    series: [{ 
      data: divergenceData.map(d => d.value), 
      type: 'bar', 
      itemStyle: { color: '#f43f5e', borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 40
    }]
  };

  // 3. Top 5 Maiores Inventários por Volume
  const topVolumeInvs = [...inventories].sort((a,b) => b.total_produtos - a.total_produtos).slice(0, 5).reverse();
  const volumeOption = {
    tooltip: { trigger: 'axis', backgroundColor: '#efeeee', borderRadius: 8 },
    grid: { top: 20, right: 40, bottom: 20, left: 100 },
    xAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed', color: '#e1e1e1' } }, axisLabel: { color: '#7a7a7a' } },
    yAxis: { 
      type: 'category', 
      data: topVolumeInvs.map(d => d.nome.length > 12 ? d.nome.substring(0,12)+'...' : d.nome), 
      axisLine: { show: false }, 
      axisTick: { show: false },
      axisLabel: { color: '#4d4d4d', fontWeight: '500', fontSize: 11 }
    },
    series: [{ 
      data: topVolumeInvs.map(d => d.total_produtos), 
      type: 'bar', 
      itemStyle: { color: '#027777', borderRadius: [0, 4, 4, 0] }, 
      label: { show: true, position: 'right', color: '#026666', fontWeight: 'bold' },
      barMaxWidth: 30
    }]
  };

  const recentInventories = [...inventories]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

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
              <section className="overflow-hidden rounded-[32px] bg-slate-950 shadow-2xl shadow-slate-300/30">
                <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[1.4fr_0.9fr] lg:px-10">
                  <div className="relative z-10">
                    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                      Operação do dia
                    </div>
                    <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
                      Controle de inventário com visão clara, rápida e profissional.
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                      Acompanhe o volume de inventários, identifique operações em andamento e entre direto nas ações mais importantes.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <Link
                        to="/inventarios/novo"
                        className="inline-flex items-center rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition-all hover:bg-indigo-400"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Novo inventário
                      </Link>
                      <Link
                        to="/inventarios"
                        className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition-all hover:bg-white/10"
                      >
                        Ver inventários
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Em andamento</p>
                      <p className="mt-3 text-3xl font-bold text-white">{totalEmAndamento}</p>
                      <p className="mt-2 text-sm text-slate-300">Inventários em contagem ou recontagem.</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Finalizados</p>
                      <p className="mt-3 text-3xl font-bold text-white">{totalFinalizados}</p>
                      <p className="mt-2 text-sm text-slate-300">Operações concluídas e prontas para consulta.</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Recontagens</p>
                      <p className="mt-3 text-3xl font-bold text-white">{totalEmRecontagem}</p>
                      <p className="mt-2 text-sm text-slate-300">Casos que exigem segunda validação.</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Total de Inventários"
                  value={inventories.length}
                  description="Base total registrada no sistema."
                  icon={Package}
                  iconClass="bg-indigo-50 text-indigo-600"
                />
                <StatCard
                  title="Em Andamento"
                  value={totalEmAndamento}
                  description="Fluxos que precisam de atenção operacional."
                  icon={Clock3}
                  iconClass="bg-amber-50 text-amber-600"
                />
                <StatCard
                  title="Recontagem"
                  value={totalEmRecontagem}
                  description="Itens em validação por divergência."
                  icon={AlertTriangle}
                  iconClass="bg-rose-50 text-rose-600"
                />
                <StatCard
                  title="Divergências"
                  value={totalDivergencias}
                  description={`Média geral de progresso: ${averageProgress}%`}
                  icon={BarChart3}
                  iconClass="bg-slate-100 text-slate-700"
                />
              </section>

              {/* Visão Geral: Mensal e Status */}
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.9fr]">
                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Indicadores</p>
                      <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Evolução mensal</h2>
                    </div>
                    <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                      Últimos 12 meses
                    </div>
                  </div>
                  <div className="h-80 w-full">
                    <ReactECharts option={monthlyOption} style={{ height: '100%', width: '100%' }} />
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Distribuição</p>
                    <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Status dos inventários</h2>
                  </div>
                  <div className="h-72 w-full">
                    <ReactECharts option={statusOption} style={{ height: '100%', width: '100%' }} />
                  </div>
                  <div className="mt-2 space-y-3">
                    {pieData.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="text-sm font-medium text-slate-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Análises Profundas - Inventários Finalizados */}
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Qualidade da Contagem</p>
                    <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Acurácia (Batidos)</h2>
                    <p className="text-xs text-slate-500 mt-1">Últimos 10 finalizados</p>
                  </div>
                  <div className="h-64 w-full">
                    <ReactECharts option={accuracyOption} style={{ height: '100%', width: '100%' }} />
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-600">Taxa de Erro</p>
                    <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Divergências (%)</h2>
                    <p className="text-xs text-slate-500 mt-1">Últimos 10 finalizados</p>
                  </div>
                  <div className="h-64 w-full">
                    <ReactECharts option={divergenceOption} style={{ height: '100%', width: '100%' }} />
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Volume</p>
                    <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Top 5 Maiores</h2>
                    <p className="text-xs text-slate-500 mt-1">Por quantidade de itens no ERP</p>
                  </div>
                  <div className="h-64 w-full">
                    <ReactECharts option={volumeOption} style={{ height: '100%', width: '100%' }} />
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Acompanhamento</p>
                    <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Inventários recentes</h2>
                  </div>
                  <Link
                    to="/inventarios"
                    className="inline-flex items-center rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
                  >
                    Ver todos
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>

                {recentInventories.length === 0 ? (
                  <div className="px-6 py-14 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                      <BarChart3 className="h-6 w-6 text-slate-400" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">Nenhum inventário encontrado</h3>
                    <p className="mt-2 text-sm text-slate-500">Crie o primeiro inventário para começar a operar.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Inventário</th>
                          <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Criado em</th>
                          <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Status</th>
                          <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Progresso</th>
                          <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recentInventories.map((inventory) => {
                          const meta = STATUS_META[inventory.status] || STATUS_META.criado;
                          return (
                            <tr key={inventory.id} className="transition-colors hover:bg-slate-50/80">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                                    <Package className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-900">{inventory.nome}</p>
                                    <p className="text-sm text-slate-500">ID #{inventory.id}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600">
                                {new Date(inventory.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`}>
                                  {meta.label}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="min-w-[150px]">
                                  <div className="flex items-center justify-between text-xs text-slate-500">
                                    <span>{inventory.progresso_percentual || 0}%</span>
                                    <span>{inventory.produtos_divergentes || 0} diverg.</span>
                                  </div>
                                  <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200">
                                    <div
                                      className="h-2.5 rounded-full bg-indigo-600 transition-all"
                                      style={{ width: `${inventory.progresso_percentual || 0}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Link
                                  to={`/inventarios/${inventory.id}`}
                                  className="inline-flex items-center text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
                                >
                                  Abrir
                                  <ChevronRight className="ml-1 h-4 w-4" />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

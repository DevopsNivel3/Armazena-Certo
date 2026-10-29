import { ArrowRight, ClipboardList, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { MODULE_META, getModuleRoute, normalizeUserModules } from '../utils/userModules';

const MODULE_PRESENTATION = {
  inventario: { icon: ClipboardList, stages: ['Estoque', 'Contagem', 'Divergências'], tone: 'bg-teal-50 text-teal-700', number: '01' },
  cross_docking: { icon: Truck, stages: ['Recebimento', 'Conferência', 'Expedição'], tone: 'bg-amber-50 text-amber-700', number: '02' }
};

export default function Modules() {
  const { user } = useAuth();
  const modules = normalizeUserModules(user.modulos);
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 px-5 py-10 sm:px-10 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Armazena Certo / Operações</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">Sua operação começa aqui.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Olá, {user.nome}. Selecione um dos módulos habilitados para o seu usuário. Seu perfil define as ações disponíveis em cada operação.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {modules.map((name) => {
              const { icon: Icon, stages, tone, number } = MODULE_PRESENTATION[name];
              return (
                <Link key={name} to={getModuleRoute(user, name)} className="group flex min-h-80 flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-teal-600 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/30 sm:p-9">
                  <div className="flex items-start justify-between">
                    <span className={`rounded-2xl p-4 ${tone}`}><Icon className="h-7 w-7" /></span>
                    <span className="font-mono text-sm text-slate-400">{number}</span>
                  </div>
                  <h2 className="mt-7 text-2xl font-bold tracking-tight text-slate-950">{MODULE_META[name].label}</h2>
                  <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{MODULE_META[name].description}</p>
                  <div className="mt-7 flex flex-wrap gap-2">{stages.map((stage) => <span key={stage} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{stage}</span>)}</div>
                  <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5 text-sm font-semibold text-teal-700">Acessar módulo<ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></div>
                </Link>
              );
            })}
          </div>
          {!modules.length && <p className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Nenhum módulo habilitado. Solicite a liberação de acesso a um administrador.</p>}
        </div>
      </main>
    </div>
  );
}

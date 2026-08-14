import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CheckCircle2, LayoutDashboard, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const defaultRoute = user.nivel_acesso === 'operador' || user.nivel_acesso === 'admin_inventario'
      ? '/inventarios'
      : '/dashboard';
    const redirectUrl = searchParams.get('redirect') || defaultRoute;

    navigate(redirectUrl, { replace: true });
  }, [loading, user, location.search, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const authData = await login(email, senha);
      const searchParams = new URLSearchParams(location.search);
      const defaultRoute = authData?.user?.nivel_acesso === 'operador' ? '/inventarios' : '/dashboard';
      const redirectUrl = searchParams.get('redirect') || defaultRoute;
      navigate(redirectUrl);
    } catch {
      setError('Credenciais inválidas. Verifique seu e-mail e senha.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(2,102,102,0.28),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(2,119,119,0.18),_transparent_28%),linear-gradient(135deg,_#191717_0%,_#1c1a1a_45%,_#262424_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />

          <div className="relative z-10 flex w-full flex-col justify-between px-10 py-12 xl:px-14">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                  <img src="/logo.png" alt="Armazena Certo Logo" className="h-full w-full object-contain p-1" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Plataforma</p>
                  <p className="text-sm font-semibold text-slate-100">Armazena Certo</p>
                </div>
              </div>

              <div className="mt-16 max-w-xl">
                <h1 className="text-5xl font-bold tracking-tight text-white">
                  Gestão inteligente de inventários
                </h1>
                <p className="mt-6 text-lg leading-8 text-slate-300">
                  Centralize inventários, monitore divergências e conduza a equipe com uma experiência mais clara e confiável.
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:max-w-xl">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-indigo-500/15 p-3 text-indigo-300">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Visão operacional</p>
                    <p className="mt-1 text-sm text-slate-300">Acompanhe status, produtividade e progresso da operação em tempo real.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Fluxo simplificado</p>
                    <p className="mt-1 text-sm text-slate-300">Da criação do inventário à exportação final, o sistema reduz ruído e acelera decisões.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-sky-500/15 p-3 text-sky-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Acesso controlado</p>
                    <p className="mt-1 text-sm text-slate-300">Cada perfil entra com permissões adequadas para operar com segurança.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section 
          className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10 bg-cover bg-center bg-no-repeat relative"
          style={{ backgroundImage: "url('/backgroungimage.png')" }}
        >
          {/* Overlay escuro opcional para garantir a leitura do card, caso a imagem seja clara */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"></div>
          
          <div className="w-full max-w-md relative z-10">
            <div className="rounded-[32px] border border-white/10 bg-white/95 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur sm:p-10">
              <div className="lg:hidden">
                <div className="mx-auto flex h-16 w-16 items-center justify-center">
                  <img src="/logo.png" alt="Armazena Certo Logo" className="h-full w-full object-contain" />
                </div>
              </div>

              <div className="mt-4 text-center lg:mt-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Acesso ao sistema</p>
                  <h1 className="mx-auto mt-4 mb-2 text-4xl font-extrabold tracking-tight font-['Open_Sans']">
                    <span className="text-[#191717]">ARMAZENA</span> <span className="text-[#026666]">CERTO</span>
                  </h1>
                  <p className="mt-3 text-sm text-slate-500">Use suas credenciais para acessar o painel administrativo.</p>
                </div>

              {error ? (
                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {error}
                </div>
              ) : null}

              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="email-address" className="mb-2 block text-sm font-semibold text-slate-700">
                    E-mail
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                      <Mail className="h-5 w-5" />
                    </div>
                    <input
                      id="email-address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="block w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="admin@sistema.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                    Senha
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                      <Lock className="h-5 w-5" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="block w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="Digite sua senha"
                      value={senha}
                      onChange={(event) => setSenha(event.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar no sistema'}
                </button>
              </form>

              <div className="mt-8 rounded-2xl bg-slate-50 px-4 py-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-indigo-600" />
                  <p className="text-sm text-slate-600">
                    Ambiente protegido para operadores, gestores e administradores com trilha mais clara de navegação.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

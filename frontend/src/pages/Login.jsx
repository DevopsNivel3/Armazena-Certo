import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const REMEMBERED_EMAIL_KEY = 'armazena-certo:remembered-email';

export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || '');
  const [senha, setSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY)));
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

      if (rememberEmail) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      const searchParams = new URLSearchParams(location.search);
      const defaultRoute = authData?.user?.nivel_acesso === 'operador' || authData?.user?.nivel_acesso === 'admin_inventario'
        ? '/inventarios'
        : '/dashboard';
      const redirectUrl = searchParams.get('redirect') || defaultRoute;
      navigate(redirectUrl);
    } catch {
      setError('Credenciais inválidas. Verifique seu e-mail e senha.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d1010] text-white">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/backgroungimage.png"
        aria-hidden="true"
      >
        <source src="/login-background.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(2,102,102,0.14),transparent_42%)]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full max-w-[1040px] overflow-hidden rounded-[28px] border border-white/10 bg-[#151818]/95 shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-md md:grid-cols-[1.04fr_0.96fr]">
          <section className="relative hidden min-h-[570px] overflow-hidden border-r border-white/10 bg-[#041d1e] md:flex md:items-center md:justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(2,119,119,0.30),transparent_38%),radial-gradient(circle_at_80%_85%,rgba(100,241,137,0.09),transparent_35%)]" />
            <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full border border-white/5" />
            <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full border border-white/5" />

            <div className="relative z-10 max-w-[430px] px-10 text-center">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20">
                <img src="/logo.png" alt="Armazena Certo" className="h-full w-full object-contain" />
              </div>

              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.38em] text-[#75d4d0]">
                Plataforma
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.03em] text-white xl:text-[42px]">
                ARMAZENA <span className="text-[#45aaa7]">CERTO</span>
              </h1>

              <h2 className="mx-auto mt-10 max-w-sm text-2xl font-bold leading-tight text-white">
                Gestão inteligente para uma operação mais eficiente
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base leading-7 text-slate-300">
                Mais controle, agilidade e visão da operação para conduzir inventários com precisão e confiança.
              </p>
            </div>
          </section>

          <section className="flex min-h-[570px] items-center bg-[linear-gradient(145deg,#1e2020_0%,#121515_100%)] px-6 py-10 sm:px-10 lg:px-12">
            <div className="mx-auto w-full max-w-[390px]">
              <div className="mb-8 flex items-center gap-3 md:hidden">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-2">
                  <img src="/logo.png" alt="Armazena Certo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">Plataforma</p>
                  <p className="text-lg font-bold text-white">Armazena Certo</p>
                </div>
              </div>

              <header>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#64f189]">Acesso ao sistema</p>
                <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.03em] text-white">Acesse sua conta</h2>
                <p className="mt-2 text-base text-slate-400">Bem-vindo de volta!</p>
              </header>

              {error ? (
                <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-200" role="alert">
                  {error}
                </div>
              ) : null}

              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="email-address" className="mb-2 block text-sm font-semibold text-slate-200">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    <input
                      id="email-address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="block w-full rounded-lg border border-white/15 bg-[#111414] py-3.5 pl-12 pr-4 text-[15px] text-white outline-none placeholder:text-slate-500 focus:border-[#64f189]/70 focus:ring-4 focus:ring-[#64f189]/10"
                      placeholder="Digite seu e-mail"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-200">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className="block w-full rounded-lg border border-white/15 bg-[#111414] py-3.5 pl-12 pr-12 text-[15px] text-white outline-none placeholder:text-slate-500 focus:border-[#64f189]/70 focus:ring-4 focus:ring-[#64f189]/10"
                      placeholder="Digite sua senha"
                      value={senha}
                      onChange={(event) => setSenha(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(event) => setRememberEmail(event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-[#111414] accent-[#64f189]"
                  />
                  Lembrar e-mail
                </label>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center rounded-lg bg-[#64f189] px-4 py-3.5 text-[15px] font-extrabold text-[#102016] shadow-[0_10px_30px_rgba(100,241,137,0.14)] transition hover:bg-[#76f49a] focus:outline-none focus:ring-4 focus:ring-[#64f189]/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar'}
                </button>
              </form>

              <div className="mt-8 flex justify-center border-t border-white/10 pt-7">
                <a
                  href="https://www.nivel3ti.com.br"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-lg px-3 py-2 opacity-85 transition hover:bg-white/5 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#64f189]/40"
                  aria-label="Acessar o site da Nível 3 Tecnologia"
                  title="Nível 3 Tecnologia"
                >
                  <img src="/nivel3-logo.png" alt="Nível 3 Tecnologia" className="h-auto w-[78px] object-contain" />
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

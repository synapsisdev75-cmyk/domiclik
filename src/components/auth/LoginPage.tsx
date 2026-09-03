import React, { useState, useEffect } from 'react';
import { auth } from '../../lib/firebase';
import {
  startGoogleSignInRedirect,
  completeGoogleSignInFromRedirect,
  isGoogleOAuthReturn,
  describeAuthError,
  saveLoginRole,
  readLoginRole,
} from '../../lib/googleAuth';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { BrandLogo } from '../brand/BrandAssets';
import {
  ShieldCheck,
  Bike,
  Lock,
  Mail,
  MapPin,
  ArrowRight,
  UserPlus,
  Eye,
  EyeOff,
  Satellite,
  Package,
  Clock,
  FileText,
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (
    email: string,
    role: 'admin' | 'secretary' | 'driver' | 'pending_driver'
  ) => void;
}

type LoginRole = 'admin' | 'secretary' | 'driver' | 'pending_driver';

function readLoginRoleFromUrl(): LoginRole {
  if (typeof window === 'undefined') return 'admin';
  const role = new URLSearchParams(window.location.search).get('role');
  if (role === 'driver' || role === 'pending_driver' || role === 'admin' || role === 'secretary') {
    return role;
  }
  return 'admin';
}

function isDriverEntryFromLanding() {
  if (typeof window === 'undefined') return false;
  const role = new URLSearchParams(window.location.search).get('role');
  return role === 'driver' || role === 'pending_driver';
}

function shouldAutoGoogle() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('google') === '1';
}

function landingTransportistaUrl() {
  const fromEnv = String(
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_LANDING_URL || ''
  ).replace(/\/$/, '');
  if (fromEnv) return `${fromEnv}/transportista`;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5174/transportista';
  }
  return 'https://gen-lang-client-0954482957.web.app/transportista';
}

function clearAuthQueryParams() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('role') && !url.searchParams.has('google')) return;
  url.searchParams.delete('role');
  url.searchParams.delete('google');
  window.history.replaceState({}, document.title, url.pathname + url.hash);
}

const LOGIN_HERO_VIDEO = '/brand/login-hero.mp4';

function VillavicencioGpsBackdrop() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none opacity-25"
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id="loginMapFade" cx="55%" cy="58%" r="55%">
          <stop offset="0%" stopColor="#0b1220" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#05080f" stopOpacity="0.95" />
        </radialGradient>
        <linearGradient id="routeBlue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2B6CFF" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#2B6CFF" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="routeOrange" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF5722" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#FF5722" stopOpacity="0.65" />
        </linearGradient>
      </defs>

      {/* Street grid — Villavicencio abstract (overlay sobre el video) */}
      <g stroke="#1a2744" strokeWidth="1" opacity="0.45">
        <path d="M40 120 H760 M40 210 H760 M40 300 H760 M40 390 H760 M40 480 H760 M40 570 H760 M40 660 H760 M40 750 H760" />
        <path d="M90 60 V840 M180 60 V840 M270 60 V840 M360 60 V840 M450 60 V840 M540 60 V840 M630 60 V840 M720 60 V840" />
        <path d="M40 180 Q220 140 400 200 T760 160" fill="none" strokeWidth="1.4" />
        <path d="M40 520 Q280 470 420 540 T760 500" fill="none" strokeWidth="1.4" />
      </g>

      {/* GPS routes */}
      <path
        className="login-route"
        d="M90 740 C140 620 210 580 300 500 S460 380 540 280 S650 180 710 120"
        fill="none"
        stroke="url(#routeBlue)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        className="login-route-slow"
        d="M80 220 C180 280 250 340 340 390 S500 490 580 610 S660 720 720 800"
        fill="none"
        stroke="url(#routeOrange)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        className="login-route"
        d="M120 430 H380 C440 430 470 390 530 360 L700 290"
        fill="none"
        stroke="#2B6CFF"
        strokeOpacity="0.35"
        strokeWidth="1.6"
        strokeLinecap="round"
        style={{ animationDuration: '28s' }}
      />

      {/* Nodes */}
      {[
        [180, 260, '#2B6CFF', '0s'],
        [300, 500, '#FF5722', '0.4s'],
        [420, 360, '#2B6CFF', '0.8s'],
        [540, 280, '#FF5722', '1.2s'],
        [630, 610, '#2B6CFF', '0.6s'],
        [250, 680, '#FF5722', '1.6s'],
        [480, 520, '#2B6CFF', '1s'],
        [700, 200, '#FF5722', '0.2s'],
      ].map(([x, y, color, delay], i) => (
        <g key={i}>
          <circle
            cx={x as number}
            cy={y as number}
            r="8"
            fill={color as string}
            opacity="0.12"
          />
          <circle
            className="login-node"
            cx={x as number}
            cy={y as number}
            r="2.4"
            fill={color as string}
            style={{ animationDelay: delay as string }}
          />
        </g>
      ))}

      {/* Location pins */}
      <g fill="#2B6CFF">
        <path d="M300 498 c-7-10-7-18 0-26 a12 12 0 1 1 0 26z" opacity="0.85" />
        <circle cx="300" cy="486" r="3.2" fill="#05080f" />
      </g>
      <g fill="#FF5722">
        <path d="M540 278 c-7-10-7-18 0-26 a12 12 0 1 1 0 26z" opacity="0.85" />
        <circle cx="540" cy="266" r="3.2" fill="#05080f" />
      </g>

      {/* Tiny vehicle silhouettes */}
      <g transform="translate(470 448)" opacity="0.55">
        <rect x="0" y="2" width="22" height="10" rx="2" fill="#2B6CFF" />
        <circle cx="5" cy="13" r="2.2" fill="#94a3b8" />
        <circle cx="17" cy="13" r="2.2" fill="#94a3b8" />
      </g>
      <g transform="translate(210 618) rotate(-18)" opacity="0.5">
        <circle cx="6" cy="8" r="4.5" fill="#FF5722" />
        <circle cx="18" cy="10" r="3.2" fill="#FF5722" />
        <path d="M8 6 L18 8" stroke="#e8eef9" strokeWidth="1.4" />
      </g>

    </svg>
  );
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const driverEntry = isDriverEntryFromLanding();
  const [role, setRole] = useState<LoginRole>(() => readLoginRoleFromUrl());
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(() =>
    typeof window !== 'undefined' ? isGoogleOAuthReturn() : false
  );
  const [googleBusy, setGoogleBusy] = useState(() =>
    typeof window !== 'undefined' ? isGoogleOAuthReturn() || shouldAutoGoogle() : false
  );
  const [authError, setAuthError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const isRegisterMode = authMode === 'register';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = isGoogleOAuthReturn();
      if (pending) {
        setLoading(true);
        setGoogleBusy(true);
      }
      try {
        const user = await completeGoogleSignInFromRedirect();
        if (cancelled) return;
        if (user?.email) {
          const saved = (readLoginRole() as LoginRole) || role;
          clearAuthQueryParams();
          onLoginSuccess(user.email, saved);
          return;
        }
      } catch (err: unknown) {
        if (!cancelled) setAuthError(describeAuthError(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
          setGoogleBusy(false);
        }
      }

      if (!cancelled && shouldAutoGoogle() && !isGoogleOAuthReturn()) {
        clearAuthQueryParams();
        saveLoginRole(role);
        setGoogleBusy(true);
        try {
          const user = await startGoogleSignInRedirect();
          if (user?.email) {
            onLoginSuccess(user.email, role);
          }
        } catch (err: unknown) {
          setAuthError(describeAuthError(err));
          setGoogleBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    setInfoMsg('');

    try {
      if (isRegisterMode) {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        if (res.user.email) onLoginSuccess(res.user.email, role);
      } else {
        const res = await signInWithEmailAndPassword(auth, email, password);
        if (res.user.email) onLoginSuccess(res.user.email, role);
      }
    } catch (err: any) {
      const code = err?.code || '';
      const msg =
        code === 'auth/invalid-credential' || code === 'auth/wrong-password'
          ? 'Correo o contraseña incorrectos.'
          : code === 'auth/user-not-found'
            ? 'Usuario no encontrado. Crea tu cuenta en Registrarse.'
            : code === 'auth/email-already-in-use'
              ? 'Ese correo ya está registrado. Inicia sesión.'
              : code === 'auth/weak-password'
                ? 'La contraseña debe tener al menos 6 caracteres.'
                : code === 'auth/operation-not-allowed'
                  ? 'Activa correo/contraseña en Firebase → Authentication → Sign-in method.'
                  : 'No se pudo autenticar. Revisa correo y contraseña.';
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setAuthError('');
    setInfoMsg('');
    if (!email.trim()) {
      setAuthError('Ingresa tu correo empresarial para recuperar la contraseña.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfoMsg('Te enviamos un enlace de recuperación a tu correo.');
    } catch {
      setAuthError('No se pudo enviar el correo de recuperación.');
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    setAuthError('');
    setInfoMsg('');
    saveLoginRole(role);
    try {
      const user = await startGoogleSignInRedirect();
      if (user?.email) {
        // Dejar el rol guardado hasta que App lea onAuthStateChanged
        onLoginSuccess(user.email, role);
        return;
      }
      // Redirect en curso: googleBusy se mantiene hasta el retorno
    } catch (err: unknown) {
      setAuthError(describeAuthError(err));
      setGoogleBusy(false);
    }
  };

  const tabs: { id: LoginRole; label: string; icon: React.ReactNode }[] = driverEntry
    ? [
        { id: 'driver', label: 'Transportista', icon: <Bike className="w-3.5 h-3.5" /> },
        { id: 'pending_driver', label: 'Pre-registro', icon: <UserPlus className="w-3.5 h-3.5" /> },
      ]
    : [
        { id: 'admin', label: 'Administrador', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
        { id: 'secretary', label: 'Secretaría', icon: <FileText className="w-3.5 h-3.5" /> },
      ];

  return (
    <div className="login-screen min-h-screen min-h-dvh bg-[#05080f] text-[#e8eef9] overflow-x-hidden selection:bg-[#2B6CFF] selection:text-white">
      {googleBusy && (
        <div className="fixed inset-0 z-[80] bg-[#05080f]/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="h-10 w-10 rounded-full border-2 border-[#2B6CFF] border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-white">
            {googleBusy ? 'Conectando con Google…' : 'Abriendo Google…'}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen min-h-dvh">
        {/* LEFT — brand + video loop */}
        <section className="relative hidden lg:flex flex-col justify-between px-10 xl:px-16 py-10 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <video
              className="absolute inset-0 w-full h-full object-cover"
              src={LOGIN_HERO_VIDEO}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#05080f]/78 via-[#05080f]/45 to-[#05080f]/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#05080f]/88 via-[#05080f]/25 to-[#05080f]/50" />
          </div>
          <VillavicencioGpsBackdrop />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-[#05080f]/70" />

          <div className="relative z-10 login-left-enter space-y-8 max-w-xl">
            <div>
              <div className="flex items-center gap-3">
                <BrandLogo variant="mark" neon={false} className="w-11 h-11" />
                <div>
                  <div className="text-[28px] leading-none font-extrabold tracking-tight">
                    <span className="text-[#2B6CFF]">Domi</span>
                    <span className="text-[#FF5722]">Click</span>
                  </div>
                  <p className="text-[13px] text-slate-400 font-medium mt-1.5">
                    Excelencia a un click de ti.
                  </p>
                </div>
              </div>

              <div className="mt-6 inline-flex items-center rounded-full border border-[#2B6CFF]/25 bg-[#0b1220]/70 px-3.5 py-1.5">
                <span className="text-[10px] font-semibold tracking-[0.16em] text-[#7aa2ff] uppercase">
                  Plataforma de operación Domiclick
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="text-[40px] xl:text-[46px] font-extrabold leading-[1.12] tracking-tight text-white">
                <span className="text-[#2B6CFF]">Encargos</span> locales
                <br />
                <span className="text-[#FF5722]">a un click.</span>
              </h1>
              <p className="text-[15px] text-slate-400 font-normal max-w-md leading-relaxed">
                Software para conectar mandados prepagados con la flota de Domiclick en Villavicencio.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-5 pt-2 max-w-lg">
              {[
                {
                  n: '01',
                  title: 'Monitoreo GPS',
                  desc: 'Seguimiento de vehículos en tiempo real',
                  icon: <Satellite className="w-4 h-4 text-[#2B6CFF]" />,
                },
                {
                  n: '02',
                  title: 'Gestión de envíos',
                  desc: 'Control de despachos y entregas',
                  icon: <Package className="w-4 h-4 text-[#FF5722]" />,
                },
                {
                  n: '03',
                  title: 'Trazabilidad',
                  desc: 'Historial completo de cada servicio',
                  icon: <Clock className="w-4 h-4 text-[#7aa2ff]" />,
                },
              ].map((item) => (
                <div key={item.n} className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 tracking-wider">
                    {item.icon}
                    <span>{item.n}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-white leading-snug">{item.title}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 login-left-enter" style={{ animationDelay: '0.12s' }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1a2744] bg-[#0b1220]/80 px-3.5 py-2 text-[12px] text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-[#2B6CFF]" />
              <span>Operación en Villavicencio</span>
            </div>
          </div>
        </section>

        {/* RIGHT — auth card */}
        <section className="relative flex items-center justify-center px-4 sm:px-8 py-8 sm:py-12 bg-[#070b14]">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_70%_20%,rgba(43,108,255,0.08),transparent_50%)]" />

          {/* Mobile logo */}
          <div className="absolute top-5 left-5 lg:hidden flex items-center gap-2 z-10">
            <BrandLogo variant="mark" neon={false} className="w-8 h-8" />
            <span className="text-lg font-extrabold tracking-tight">
              <span className="text-[#2B6CFF]">Domi</span>
              <span className="text-[#FF5722]">Click</span>
            </span>
          </div>

          <div
            className="login-card-enter relative w-full max-w-[460px] rounded-[22px] border border-[#1e2d4a]/80 bg-[#0f1728]/80 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.55)] px-6 sm:px-8 py-8 sm:py-9"
            style={{ animationDelay: '0.08s' }}
          >
            <div className="mb-7">
              <h2 className="text-[26px] sm:text-[28px] font-extrabold text-white tracking-tight leading-tight">
                {driverEntry
                  ? isRegisterMode
                    ? 'Registro transportista'
                    : 'Cabina transportista'
                  : isRegisterMode
                    ? 'Crear cuenta en DomiClick'
                    : 'Bienvenido a DomiClick'}
              </h2>
              <p className="mt-1.5 text-[14px] text-slate-400 font-medium">
                {driverEntry
                  ? 'Accede a tu jornada, GPS y pedidos asignados.'
                  : isRegisterMode
                    ? 'Regístrate con Google o con tu correo electrónico.'
                    : 'Accede a tu centro de operaciones.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#0a101c] border border-[#1a2744] mb-5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setInfoMsg('');
                }}
                className={`py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-200 ${
                  authMode === 'login'
                    ? 'bg-[#2B6CFF] text-white shadow-[0_8px_20px_rgba(43,108,255,0.28)]'
                    : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                  setInfoMsg('');
                }}
                className={`py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-200 ${
                  authMode === 'register'
                    ? 'bg-[#FF5722] text-white shadow-[0_8px_20px_rgba(255,87,34,0.28)]'
                    : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                Registrarse
              </button>
            </div>

            <div className={`grid gap-1.5 p-1 rounded-2xl bg-[#0a101c] border border-[#1a2744] mb-7 ${
              tabs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            }`}>
              {tabs.map((tab) => {
                const active = role === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRole(tab.id)}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 px-1 rounded-xl text-[10px] sm:text-[12px] font-semibold transition-all duration-200 ${
                      active
                        ? 'bg-[#2B6CFF] text-white shadow-[0_8px_20px_rgba(43,108,255,0.28)]'
                        : 'text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    {tab.icon}
                    <span className="leading-tight text-center">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            {role === 'admin' && (
              <p className="-mt-5 mb-5 text-[11px] text-slate-500 leading-relaxed">
                {isRegisterMode
                  ? 'Al registrarte como administrador, el primer usuario se activa solo. Los siguientes requieren aprobación en Usuarios.'
                  : 'El primer administrador se activa solo. Después, otro admin activo debe autorizarte en Usuarios.'}
              </p>
            )}
            {role === 'secretary' && (
              <p className="-mt-5 mb-5 text-[11px] text-slate-500 leading-relaxed">
                {isRegisterMode
                  ? 'La secretaría atiende chats, crea pedidos y monitorea el botón de pánico. Un administrador activo debe activarte.'
                  : 'Acceso operativo: pedidos, radios con transportistas y alertas de pánico.'}
              </p>
            )}
            {role === 'pending_driver' && isRegisterMode && (
              <p className="-mt-5 mb-5 text-[11px] text-slate-500 leading-relaxed">
                Tras crear tu cuenta completarás el prerregistro como transportista para revisión del administrador.
              </p>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl py-3 text-[13px] font-semibold text-slate-200 bg-transparent border border-[#1a2744] hover:bg-[#121a2c] hover:border-[#2B6CFF]/40 disabled:opacity-60 transition mb-5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              {isRegisterMode ? 'Registrarse con Google' : 'Continuar con Google'}
            </button>

            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#1a2744]" />
              </div>
              <p className="relative mx-auto w-fit bg-[#0f1728] px-3 text-[11px] text-slate-500 font-medium">
                {isRegisterMode ? 'o regístrate con correo' : 'o continúa con correo'}
              </p>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-300 mb-1.5">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isRegisterMode ? 'Tu correo electrónico' : 'Ingresa tu correo empresarial'}
                    className="w-full bg-[#0a101c] border border-[#1a2744] rounded-xl pl-10 pr-4 py-3 text-[13.5px] text-white placeholder:text-slate-500 focus:outline-none focus:border-[#2B6CFF] focus:ring-2 focus:ring-[#2B6CFF]/20 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-300 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isRegisterMode ? 'Mínimo 6 caracteres' : 'Ingresa tu contraseña'}
                    className="w-full bg-[#0a101c] border border-[#1a2744] rounded-xl pl-10 pr-11 py-3 text-[13.5px] text-white placeholder:text-slate-500 focus:outline-none focus:border-[#2B6CFF] focus:ring-2 focus:ring-[#2B6CFF]/20 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!isRegisterMode && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[12px] font-medium text-[#7aa2ff] hover:text-[#2B6CFF] transition"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}
              </div>

              {(authError || infoMsg) && (
                <p className={`text-[12px] font-medium ${infoMsg ? 'text-emerald-400' : 'text-red-400'}`}>
                  {infoMsg || authError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group w-full mt-1 inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-[13px] font-bold tracking-[0.08em] uppercase text-white bg-gradient-to-r from-[#2B6CFF] to-[#1a4fd6] shadow-[0_10px_28px_rgba(43,108,255,0.32)] hover:brightness-110 hover:shadow-[0_12px_32px_rgba(43,108,255,0.42)] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
              >
                <span>{isRegisterMode ? 'Crear cuenta DomiClick' : 'Ingresar a DomiClick'}</span>
                <ArrowRight className="w-4 h-4 text-[#FF5722] group-hover:translate-x-0.5 transition-transform" />
              </button>
            </form>

            <p className="mt-6 text-center text-[13px] text-slate-400">
              {isRegisterMode ? '¿Ya tienes cuenta?' : '¿Nuevo en DomiClick?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(isRegisterMode ? 'login' : 'register');
                  setAuthError('');
                  setInfoMsg('');
                }}
                className="font-semibold text-[#2B6CFF] hover:text-[#7aa2ff] transition"
              >
                {isRegisterMode ? 'Inicia sesión' : 'Crea tu cuenta'}
              </button>
            </p>

            {!driverEntry && (
              <p className="mt-3 text-center text-[12px] text-slate-500">
                ¿Eres transportista?{' '}
                <a
                  href={landingTransportistaUrl()}
                  className="font-semibold text-[#FF5722] hover:text-[#ff8a50] transition"
                >
                  Ingresa desde la web de clientes
                </a>
              </p>
            )}

            <div className="mt-6 pt-4 border-t border-[#1a2744]/80 flex flex-col items-center gap-1.5 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                <span>Conexión segura · Datos protegidos</span>
              </div>
              <span className="text-center">Calle 23 37k 28 · Barrio Teusaca · Villavicencio</span>
              <span>© 2026 DomiClick. Todos los derechos reservados.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

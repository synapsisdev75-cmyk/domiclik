import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
  Bell,
  ChevronRight,
  CreditCard,
  FileText,
  HelpCircle,
  Loader2,
  LogOut,
  MapPin,
  User,
} from 'lucide-react';
import { useAuth } from '../lib/auth';

type MenuItem = {
  label: string;
  icon: typeof MapPin;
  action: 'link' | 'soon' | 'external' | 'signout';
  to?: string;
};

const MENU: MenuItem[] = [
  { label: 'Mis direcciones', icon: MapPin, action: 'soon' },
  { label: 'Métodos de pago', icon: CreditCard, action: 'soon' },
  { label: 'Notificaciones', icon: Bell, action: 'link', to: '/notificaciones' },
  { label: 'Ayuda', icon: HelpCircle, action: 'link', to: '/ayuda' },
  { label: 'Términos y privacidad', icon: FileText, action: 'external', to: '/privacy.html' },
  { label: 'Cerrar sesión', icon: LogOut, action: 'signout' },
];

export function ProfilePage() {
  const { user, profile, loading, error, signIn, signInApple, signOut, clearError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [busyApple, setBusyApple] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showApple = (() => {
    try {
      return Capacitor.getPlatform() !== 'android';
    } catch {
      return true;
    }
  })();

  function showSoon() {
    setToast('Próximamente');
    window.setTimeout(() => setToast(null), 2000);
  }

  async function handleSignIn() {
    if (busy || busyApple) return;
    clearError();
    setBusy(true);
    try {
      await signIn();
    } finally {
      setBusy(false);
    }
  }

  async function handleSignInApple() {
    setBusyApple(true);
    try {
      await signInApple();
    } finally {
      setBusyApple(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  function onMenu(item: MenuItem) {
    if (item.action === 'soon') {
      showSoon();
      return;
    }
    if (item.action === 'external' && item.to) {
      window.open(item.to, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.action === 'signout') {
      void handleSignOut();
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50svh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--domi-orange)]" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="app-screen mx-auto flex min-h-[100svh] max-w-lg flex-col items-center justify-center px-6 pb-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[var(--domi-border)] bg-[var(--domi-panel)]">
          <User className="h-9 w-9 text-[var(--domi-muted)]" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-white">Tu perfil</h1>
        <p className="mt-2 text-sm text-[var(--domi-muted)]">
          Inicia sesión para guardar pedidos, seguimiento y preferencias.
        </p>
        <button
          type="button"
          className="cta-primary mt-6 w-full max-w-xs"
          disabled={busy || busyApple}
          onClick={() => void handleSignIn()}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar con Google'}
        </button>
        {error ? (
          <p className="mt-3 max-w-sm text-left text-[12px] leading-snug text-red-300">{error}</p>
        ) : null}
        {showApple ? (
          <>
            <button
              type="button"
              className="cta-ghost mt-3 w-full max-w-xs"
              disabled={busy || busyApple}
              onClick={() => void handleSignInApple()}
            >
              {busyApple ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar con Apple'}
            </button>
            <p className="mt-3 max-w-xs text-[11px] leading-snug text-[var(--domi-muted)]">
              Apple funciona en iPhone (app iOS) y en Safari cuando esté activado en Firebase.
            </p>
          </>
        ) : (
          <p className="mt-3 max-w-xs text-[11px] leading-snug text-[var(--domi-muted)]">
            En Android inicia sesión con tu cuenta Google del teléfono.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
      <div className="flex items-center gap-4">
        {profile.photoURL ? (
          <img
            src={profile.photoURL}
            alt=""
            className="h-16 w-16 rounded-full border-2 border-[rgba(255,87,34,0.45)] object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--domi-border)] bg-[var(--domi-panel)]">
            <User className="h-7 w-7 text-[var(--domi-muted)]" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold text-white">
            {profile.displayName || 'Cliente DomiClick'}
          </h1>
          {profile.email ? (
            <p className="mt-0.5 truncate text-sm text-[var(--domi-muted)]">{profile.email}</p>
          ) : null}
          {profile.phone ? (
            <p className="mt-0.5 text-sm text-[var(--domi-cyan)]">{profile.phone}</p>
          ) : null}
        </div>
      </div>

      <nav className="mt-8 overflow-hidden rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)]">
        {MENU.map((item, idx) => {
          const Icon = item.icon;
          const isSignOut = item.action === 'signout';
          const rowClass = `flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-white/5 ${
            idx > 0 ? 'border-t border-[var(--domi-border)]' : ''
          } ${isSignOut ? 'text-red-400' : 'text-white'}`;

          if (item.action === 'link' && item.to) {
            return (
              <Link key={item.label} to={item.to} className={rowClass}>
                <Icon className={`h-5 w-5 shrink-0 ${isSignOut ? '' : 'text-[var(--domi-muted)]'}`} />
                <span className="flex-1 text-sm font-semibold">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </Link>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              className={rowClass}
              disabled={busy && isSignOut}
              onClick={() => onMenu(item)}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isSignOut ? '' : 'text-[var(--domi-muted)]'}`} />
              <span className="flex-1 text-sm font-semibold">{item.label}</span>
              {!isSignOut ? <ChevronRight className="h-4 w-4 text-slate-600" /> : null}
            </button>
          );
        })}
      </nav>

      {toast ? (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--domi-border)] bg-[#0d1424] px-4 py-2 text-xs font-semibold text-white shadow-lg sm:bottom-8">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

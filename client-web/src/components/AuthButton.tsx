import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';

export function AuthButton({ compact = false }: { compact?: boolean }) {
  const { profile, loading, error, signIn, signOut, clearError } = useAuth();

  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-[var(--domi-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {!compact ? 'Sesión…' : null}
      </span>
    );
  }

  if (profile) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        {profile.photoURL ? (
          <img
            src={profile.photoURL}
            alt=""
            className="h-8 w-8 rounded-full border border-[var(--domi-border)] object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(255,87,34,0.2)] text-xs font-bold text-[var(--domi-orange)]">
            {(profile.displayName || profile.email || '?').slice(0, 1).toUpperCase()}
          </span>
        )}
        {!compact ? (
          <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-white sm:inline">
            {profile.displayName || profile.email}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--domi-border)] bg-white/5 px-3 py-1.5 text-xs font-semibold text-[var(--domi-muted)] transition hover:border-[rgba(255,87,34,0.45)] hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Salir
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          clearError();
          void signIn();
        }}
        className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.18)] bg-white px-3.5 py-2 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-slate-100 sm:text-sm"
      >
        <GoogleMark />
        <LogIn className="h-3.5 w-3.5 sm:hidden" aria-hidden />
        <span className="hidden sm:inline">Continuar con Google</span>
        <span className="sm:hidden">Google</span>
      </button>
      {error ? <p className="max-w-[14rem] text-right text-[10px] text-red-300">{error}</p> : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.1 4 9.2 8.5 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.1C29.3 35.4 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.1 39.5 16 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1.1 6.2 5.1C39.3 36.9 44 31.5 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}

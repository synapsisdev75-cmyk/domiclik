import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'register';

export function EmailAuthForm({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { signInWithEmail, registerWithEmail, resetPassword, error, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setInfo(null);
    setLocalError(null);
    clearError();
    try {
      if (mode === 'register') {
        await registerWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'No se pudo autenticar');
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    setBusy(true);
    setInfo(null);
    setLocalError(null);
    clearError();
    try {
      await resetPassword(email);
      setInfo('Te enviamos un enlace de recuperación a tu correo.');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'No se pudo enviar el correo');
    } finally {
      setBusy(false);
    }
  }

  const shownError = localError || error;

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className={`rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4 text-left ${className}`.trim()}
    >
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-[var(--domi-cyan)]" aria-hidden />
        <p className="text-sm font-bold text-[var(--domi-text)]">
          {mode === 'login' ? 'Correo y contraseña' : 'Crear cuenta'}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-[var(--domi-border)] bg-[var(--domi-surface)] p-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode('login');
            setLocalError(null);
            setInfo(null);
            clearError();
          }}
          className={`rounded-lg py-2 text-[11px] font-bold transition ${
            mode === 'login'
              ? 'bg-[var(--domi-blue)] text-white'
              : 'text-[var(--domi-muted)]'
          }`}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode('register');
            setLocalError(null);
            setInfo(null);
            clearError();
          }}
          className={`rounded-lg py-2 text-[11px] font-bold transition ${
            mode === 'register'
              ? 'bg-[var(--domi-orange)] text-white'
              : 'text-[var(--domi-muted)]'
          }`}
        >
          Registrarse
        </button>
      </div>

      {mode === 'register' ? (
        <label className="mb-2 block">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--domi-muted)]">
            Nombre
          </span>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            autoComplete="name"
            disabled={busy}
          />
        </label>
      ) : null}

      <label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-semibold text-[var(--domi-muted)]">
          Correo *
        </span>
        <input
          className="field-input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          autoComplete="email"
          disabled={busy}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-[11px] font-semibold text-[var(--domi-muted)]">
          Contraseña *
        </span>
        <input
          className="field-input"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          disabled={busy}
        />
      </label>

      <button type="submit" className="cta-primary w-full !py-2.5 text-sm" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {mode === 'login' ? 'Entrar con correo' : 'Crear cuenta'}
      </button>

      {mode === 'login' && !compact ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onForgot()}
          className="mt-2 w-full text-center text-[11px] font-semibold text-[var(--domi-cyan)]"
        >
          Olvidé mi contraseña
        </button>
      ) : null}

      {info ? (
        <p className="mt-2 text-[11px] leading-snug text-[var(--domi-green)]">{info}</p>
      ) : null}
      {shownError ? (
        <p className="mt-2 text-[11px] leading-snug text-red-400">{shownError}</p>
      ) : null}
    </form>
  );
}

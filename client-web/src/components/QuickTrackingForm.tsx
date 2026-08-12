import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../lib/auth';

export function QuickTrackingForm() {
  const navigate = useNavigate();
  const { profile, signIn, loading: authLoading } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!profile) {
      setError('Debes iniciar sesión con Google para consultar un pedido.');
      return;
    }

    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Ingresa tu código de seguimiento (ej. DMC-4521).');
      return;
    }
    navigate(`/seguimiento/${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      id="seguimiento-rapido"
      onSubmit={handleSubmit}
      className="glass-panel rounded-2xl p-6 sm:p-7"
    >
      <h2 className="font-display text-xl font-bold text-white">Seguir un pedido</h2>
      <p className="mt-1 text-sm text-[var(--domi-muted)]">
        Ingresa tu código (ej. DMC-4521). Requiere sesión Google.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          className="field-input font-mono uppercase"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="DMC-4521"
          aria-label="Código de seguimiento"
        />
        <button type="submit" className="cta-primary shrink-0" disabled={authLoading}>
          <Search className="h-4 w-4" aria-hidden />
          Buscar
        </button>
      </div>

      {error ? (
        <div
          className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {error}
          {!profile ? (
            <button
              type="button"
              className="ml-2 font-bold text-[var(--domi-cyan)] underline"
              onClick={() => void signIn()}
            >
              Iniciar sesión
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

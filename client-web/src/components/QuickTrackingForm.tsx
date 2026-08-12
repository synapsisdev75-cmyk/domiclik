import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

export function QuickTrackingForm() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
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
        Ingresa tu código (ej. DMC-4521).
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          className="field-input font-mono uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="DMC-4521"
          aria-label="Código de seguimiento"
        />
        <button type="submit" className="cta-primary shrink-0">
          <Search className="h-4 w-4" aria-hidden />
          Buscar
        </button>
      </div>
    </form>
  );
}

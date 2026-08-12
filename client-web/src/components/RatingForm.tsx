import { useState, type FormEvent } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { submitCustomerRating, type PublicOrderTracking } from '../lib/firebase';

interface RatingFormProps {
  order: PublicOrderTracking;
  onRated: () => void;
}

export function RatingForm({ order, onRated }: RatingFormProps) {
  const { profile, signIn, loading: authLoading } = useAuth();
  const [stars, setStars] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (order.serviceRating) {
    return (
      <div className="mt-6 rounded-xl border border-[rgba(0,230,118,0.25)] bg-[rgba(0,230,118,0.08)] px-4 py-4">
        <p className="text-sm font-semibold text-[var(--domi-green)]">Ya calificaste este servicio</p>
        <div className="mt-2 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-4 w-4 ${i < (order.serviceRating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`}
            />
          ))}
          <span className="ml-2 text-sm text-white">{order.serviceRating}★</span>
        </div>
        {order.ratingComment ? (
          <p className="mt-2 text-sm text-[var(--domi-muted)]">{order.ratingComment}</p>
        ) : null}
      </div>
    );
  }

  if (order.status !== 'delivered') {
    return (
      <p className="mt-6 text-sm text-[var(--domi-muted)]">
        Podrás calificar cuando el pedido esté entregado.
      </p>
    );
  }

  if (!order.assignedDriverId) {
    return (
      <p className="mt-6 text-sm text-[var(--domi-muted)]">
        Este pedido no tiene repartidor asignado para calificar.
      </p>
    );
  }

  if (!profile) {
    return (
      <div className="mt-6 rounded-xl border border-[var(--domi-border)] bg-[rgba(5,8,15,0.45)] px-4 py-4">
        <p className="text-sm font-semibold text-white">Califica tu entrega</p>
        <p className="mt-1 text-sm text-[var(--domi-muted)]">
          Inicia sesión con Google para dejar tu calificación con tu nombre real.
        </p>
        <button
          type="button"
          className="cta-primary mt-4"
          disabled={authLoading}
          onClick={() => void signIn()}
        >
          Continuar con Google
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-[rgba(0,230,118,0.25)] bg-[rgba(0,230,118,0.08)] px-4 py-4 text-sm text-[var(--domi-green)]">
        ¡Gracias {profile.displayName || ''}! Tu calificación quedó registrada.
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !order.assignedDriverId) return;
    setError(null);
    setSubmitting(true);
    try {
      await submitCustomerRating({
        orderId: order.orderId,
        trackingCode: order.trackingCode,
        driverId: order.assignedDriverId,
        driverName: order.assignedDriverName || 'Repartidor DomiClick',
        stars,
        comment,
        authorName: profile.displayName || profile.email || 'Cliente',
        authorUid: profile.uid,
        authorEmail: profile.email,
      });
      setDone(true);
      onRated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la calificación');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-[var(--domi-border)] bg-[rgba(5,8,15,0.45)] px-4 py-5">
      <p className="text-sm font-semibold text-white">¿Cómo estuvo tu entrega?</p>
      <p className="mt-1 text-xs text-[var(--domi-muted)]">
        Calificando como {profile.displayName || profile.email}
        {order.assignedDriverName ? ` · ${order.assignedDriverName}` : ''}
      </p>

      <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Estrellas">
        {Array.from({ length: 5 }).map((_, i) => {
          const value = i + 1;
          const active = value <= (hover || stars);
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={stars === value}
              className="rounded-lg p-1 transition hover:scale-110"
              onMouseEnter={() => setHover(value)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setStars(value)}
            >
              <Star
                className={`h-7 w-7 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`}
              />
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
          Comentario (opcional)
        </span>
        <textarea
          className="field-input min-h-[80px] resize-y"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Puntualidad, cuidado del paquete, amabilidad…"
          maxLength={400}
        />
      </label>

      {error ? (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="cta-primary mt-4" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Enviando…
          </>
        ) : (
          'Enviar calificación'
        )}
      </button>
    </form>
  );
}

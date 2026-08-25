import { useMemo, useState, type FormEvent } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { submitCustomerRating, type PublicOrderTracking } from '../lib/firebase';

interface RatingFormProps {
  order: PublicOrderTracking;
  onRated: () => void;
}

const QUESTIONS = [
  { key: 'punctuality' as const, label: 'Puntualidad' },
  { key: 'care' as const, label: 'Cuidado del pedido' },
  { key: 'attention' as const, label: 'Atención del repartidor' },
];

function StarRow({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-[var(--domi-muted)]">{label}</span>
      <div className="flex gap-0.5" role="radiogroup" aria-label={label}>
        {Array.from({ length: 5 }).map((_, i) => {
          const n = i + 1;
          const active = n <= (hover || value);
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              className="rounded-md p-0.5 transition hover:scale-110"
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange(n)}
            >
              <Star className={`h-5 w-5 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RatingForm({ order, onRated }: RatingFormProps) {
  const { profile, signIn, loading: authLoading } = useAuth();
  const [punctuality, setPunctuality] = useState(5);
  const [care, setCare] = useState(5);
  const [attention, setAttention] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const stars = useMemo(
    () => Math.round(((punctuality + care + attention) / 3) * 10) / 10,
    [punctuality, care, attention],
  );
  const percent = Math.round((stars / 5) * 100);

  if (order.serviceRating) {
    const survey = order.ratingSurvey;
    return (
      <div className="mt-6 rounded-xl border border-[rgba(0,230,118,0.25)] bg-[rgba(0,230,118,0.08)] px-4 py-4">
        <p className="text-sm font-semibold text-[var(--domi-green)]">Ya calificaste este pedido</p>
        <div className="mt-2 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-4 w-4 ${i < Math.round(order.serviceRating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`}
            />
          ))}
          <span className="ml-2 text-sm text-white">
            {order.serviceRating}★ · {Math.round(((order.serviceRating || 0) / 5) * 100)}%
          </span>
        </div>
        {survey ? (
          <p className="mt-2 text-xs text-[var(--domi-muted)]">
            Puntualidad {survey.punctuality}★ · Cuidado {survey.care}★ · Atención {survey.attention}★
          </p>
        ) : null}
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
          Inicia sesión con Google para dejar tu calificación vinculada a este pedido.
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
        ¡Gracias {profile.displayName || ''}! Tu encuesta quedó en el pedido {order.trackingCode}.
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
        survey: { punctuality, care, attention },
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
      <p className="text-sm font-semibold text-white">¿Cómo estuvo tu pedido?</p>
      <p className="mt-1 text-xs text-[var(--domi-muted)]">
        Encuesta corta · se guarda en {order.trackingCode}
        {order.assignedDriverName ? ` · ${order.assignedDriverName}` : ''}
      </p>

      <div className="mt-4 space-y-3">
        <StarRow label={QUESTIONS[0].label} value={punctuality} onChange={setPunctuality} />
        <StarRow label={QUESTIONS[1].label} value={care} onChange={setCare} />
        <StarRow label={QUESTIONS[2].label} value={attention} onChange={setAttention} />
      </div>

      <p className="mt-3 text-xs font-semibold text-amber-300">
        Promedio {stars.toFixed(1)}★ · {percent}% para Central
      </p>

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
          'Enviar encuesta'
        )}
      </button>
    </form>
  );
}

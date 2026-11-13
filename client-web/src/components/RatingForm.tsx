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
  size = 20,
}: {
  value: number;
  onChange?: (n: number) => void;
  label: string;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-[var(--domi-muted)]">{label}</span>
      <div className="flex gap-0.5" role="radiogroup" aria-label={label}>
        {Array.from({ length: 5 }).map((_, i) => {
          const n = i + 1;
          const active = n <= shown;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              disabled={!onChange}
              className="rounded-md p-0.5 transition hover:scale-110 disabled:hover:scale-100"
              onMouseEnter={() => onChange && setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange?.(n)}
            >
              <Star
                width={size}
                height={size}
                fill={active ? '#F59E0B' : 'transparent'}
                stroke={active ? '#F59E0B' : '#64748b'}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RatedBlock({
  stars,
  percent,
  survey,
  comment,
}: {
  stars: number;
  percent: number;
  survey?: PublicOrderTracking['ratingSurvey'];
  comment?: string;
}) {
  return (
    <div className="mt-6 rounded-xl border border-[rgba(0,230,118,0.25)] bg-[rgba(0,230,118,0.08)] px-4 py-4">
      <p className="text-sm font-semibold text-[var(--domi-green)]">Calificación enviada</p>
      <div className="mt-3">
        <StarRow label="Valoración" value={Math.round(stars)} size={22} />
      </div>
      <p className="mt-2 text-sm font-bold text-white">{stars} de 5 estrellas</p>
      <p className="mt-1 text-xs text-[var(--domi-muted)]">
        Efectividad para Central: {percent}% (dato aparte de las estrellas)
      </p>
      {survey ? (
        <p className="mt-2 text-xs text-[var(--domi-muted)]">
          Puntualidad {survey.punctuality}★ · Cuidado {survey.care}★ · Atención {survey.attention}★
        </p>
      ) : null}
      {comment ? <p className="mt-2 text-sm text-[var(--domi-muted)]">{comment}</p> : null}
    </div>
  );
}

export function RatingForm({ order, onRated }: RatingFormProps) {
  const { profile, signIn, loading: authLoading } = useAuth();
  const [stars, setStars] = useState(5);
  const [punctuality, setPunctuality] = useState(5);
  const [care, setCare] = useState(5);
  const [attention, setAttention] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(order.serviceRating || null);

  const percent = useMemo(() => Math.round((stars / 5) * 100), [stars]);

  const proof = order.deliveryProofUrl ? (
    <div className="mt-4 overflow-hidden rounded-xl border border-[var(--domi-border)]">
      <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
        Foto de entrega
      </p>
      <a href={order.deliveryProofUrl} target="_blank" rel="noreferrer" className="block p-3 pt-2">
        <img
          src={order.deliveryProofUrl}
          alt="Evidencia fotográfica de la entrega"
          className="max-h-52 w-full rounded-lg object-cover"
        />
      </a>
    </div>
  ) : null;

  if (saved || order.serviceRating) {
    const value = saved || order.serviceRating || 0;
    return (
      <>
        {proof}
        <RatedBlock
          stars={value}
          percent={Math.round((value / 5) * 100)}
          survey={order.ratingSurvey}
          comment={order.ratingComment}
        />
      </>
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
      setSaved(stars);
      onRated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la calificación');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-[var(--domi-border)] bg-[rgba(5,8,15,0.45)] px-4 py-5">
      {proof}
      <p className="text-sm font-semibold text-white">¿Cómo estuvo tu pedido?</p>
      <p className="mt-1 text-xs text-[var(--domi-muted)]">
        Elige de 1 a 5 estrellas. Se guarda en {order.trackingCode}
        {order.assignedDriverName ? ` · ${order.assignedDriverName}` : ''}
      </p>

      <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3">
        <StarRow label="Valoración general" value={stars} onChange={setStars} size={28} />
        <p className="mt-2 text-sm font-bold text-white">{stars} de 5 estrellas</p>
        <p className="mt-1 text-[11px] text-[var(--domi-muted)]">
          Efectividad para Central: {percent}% (no reemplaza las estrellas)
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <StarRow label={QUESTIONS[0].label} value={punctuality} onChange={setPunctuality} />
        <StarRow label={QUESTIONS[1].label} value={care} onChange={setCare} />
        <StarRow label={QUESTIONS[2].label} value={attention} onChange={setAttention} />
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

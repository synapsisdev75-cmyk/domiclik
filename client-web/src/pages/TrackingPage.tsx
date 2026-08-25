import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Loader2, PackageSearch, RefreshCw } from 'lucide-react';
import type { TrackingStatus } from '../contracts/salesIngest';
import { BrandLogo } from '../components/BrandLogo';
import { RatingForm } from '../components/RatingForm';
import { AuthButton } from '../components/AuthButton';
import { findOrderByTrackingCode, type PublicOrderTracking } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { pushForStatus } from '../lib/brandCopy';

const STATUS_LABEL: Record<TrackingStatus, string> = {
  pending: 'Pendiente de asignación',
  assigned: 'Asignado a repartidor',
  accepted: 'Repartidor aceptó',
  en_route_origin: 'En camino al origen',
  at_origin: 'En el establecimiento',
  picked_up: 'Pedido recogido',
  in_transit: 'En camino a ti',
  at_destination: 'Muy cerca de tu dirección',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const STATUS_COLOR: Record<TrackingStatus, string> = {
  pending: 'text-amber-300',
  assigned: 'text-[var(--domi-cyan)]',
  accepted: 'text-[var(--domi-cyan)]',
  en_route_origin: 'text-[var(--domi-cyan)]',
  at_origin: 'text-[var(--domi-orange)]',
  picked_up: 'text-[var(--domi-orange)]',
  in_transit: 'text-[var(--domi-orange)]',
  at_destination: 'text-[var(--domi-green)]',
  delivered: 'text-[var(--domi-green)]',
  cancelled: 'text-red-300',
};

function asStatus(value: string): TrackingStatus {
  if (value in STATUS_LABEL) return value as TrackingStatus;
  return 'pending';
}

export function TrackingPage() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { profile, signIn, loading: authLoading } = useAuth();
  const [lookup, setLookup] = useState(code?.toUpperCase() || '');
  const [data, setData] = useState<PublicOrderTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(async (trackingCode: string) => {
    if (!profile) {
      setData(null);
      setError('Debes iniciar sesión con Google para ver el seguimiento.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await findOrderByTrackingCode(trackingCode);
      if (!res) {
        setData(null);
        setError('No se encontró un pedido con ese código');
        return;
      }
      setData(res);
    } catch (err: unknown) {
      setData(null);
      setError(err instanceof Error ? err.message : 'No se pudo consultar el pedido');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!code) {
      setData(null);
      setError(null);
      return;
    }
    setLookup(code.toUpperCase());
    if (authLoading) return;
    void load(code);
  }, [code, load, refreshToken, authLoading]);

  function goLookup(e: FormEvent) {
    e.preventDefault();
    if (!profile) {
      setError('Debes iniciar sesión con Google para consultar un pedido.');
      return;
    }
    const trimmed = lookup.trim().toUpperCase();
    if (!trimmed) return;
    navigate(`/seguimiento/${encodeURIComponent(trimmed)}`);
  }

  const status = data ? asStatus(data.status) : null;
  const push = status ? pushForStatus(status) : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--domi-border)] bg-[rgba(5,8,15,0.7)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link to="/" aria-label="Volver al inicio" className="inline-flex items-center gap-2">
            <BrandLogo variant="optimized" height={36} />
            <span className="font-display text-base font-extrabold tracking-tight">
              <span className="text-[#2B6CFF]">Domi</span>
              <span className="text-[#FF5722]">Click</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden items-center gap-1.5 text-sm font-semibold text-[var(--domi-muted)] hover:text-white sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Solicitar
            </Link>
            <AuthButton compact />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-extrabold text-white">Seguimiento</h1>
          <p className="mt-2 text-[var(--domi-muted)]">
            Consulta el estado y califica tu entrega con tu cuenta Google.
          </p>
        </div>

        <form onSubmit={goLookup} className="glass-panel mb-6 flex flex-col gap-3 rounded-2xl p-5 sm:flex-row">
          <input
            className="field-input font-mono uppercase"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="DMC-4521"
            aria-label="Código de seguimiento"
          />
          <button type="submit" className="cta-primary shrink-0">
            <PackageSearch className="h-4 w-4" aria-hidden />
            Consultar
          </button>
        </form>

        {loading ? (
          <div className="glass-panel flex items-center justify-center gap-2 rounded-2xl p-10 text-[var(--domi-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Consultando…
          </div>
        ) : null}

        {!loading && error ? (
          <div
            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200"
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

        {!loading && data && status ? (
          <div className="glass-panel animate-fade-up rounded-2xl p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--domi-muted)]">
              Código
            </p>
            <p className="font-mono mt-1 text-2xl font-bold tracking-wider text-white">
              {data.trackingCode}
            </p>

            {push ? (
              <div className="mt-5 rounded-xl border border-[rgba(43,108,255,0.35)] bg-[rgba(43,108,255,0.08)] px-4 py-4">
                <p className="text-base font-bold text-white">{push.title}</p>
                <p className="mt-1 text-sm text-[var(--domi-muted)]">{push.body}</p>
              </div>
            ) : null}

            {data.assignedDriverName && status !== 'pending' && status !== 'cancelled' ? (
              <p className="mt-4 text-sm text-[var(--domi-muted)]">
                Domiclick:{' '}
                <span className="text-white">{data.assignedDriverName}</span>
              </p>
            ) : null}

            {data.deliveryConfirmCode && status !== 'delivered' && status !== 'cancelled' ? (
              <div className="mt-5 rounded-xl border border-[rgba(255,87,34,0.35)] bg-[rgba(255,87,34,0.08)] px-4 py-4 text-center">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--domi-orange)]">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                  PIN de entrega
                </p>
                <p className="font-mono mt-2 text-3xl font-bold tracking-[0.35em] text-white">
                  {data.deliveryConfirmCode}
                </p>
                <p className="mt-2 text-xs text-[var(--domi-muted)]">
                  Entrégaselo al repartidor al recibir el pedido.
                </p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
                  Estado
                </p>
                <p className={`mt-1 text-lg font-bold ${STATUS_COLOR[status]}`}>
                  {STATUS_LABEL[status]}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
                  ETA
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {data.etaText || 'Te avisamos cuando salga el repartidor'}
                </p>
              </div>
            </div>

            {data.deliveryAddress ? (
              <p className="mt-4 text-sm text-[var(--domi-muted)]">
                Entrega: <span className="text-white">{data.deliveryAddress}</span>
              </p>
            ) : null}

            {data.updatedAt ? (
              <p className="mt-3 text-xs text-[var(--domi-muted)]">
                Actualizado: {new Date(data.updatedAt).toLocaleString('es-CO')}
              </p>
            ) : null}

            {data.timeline && data.timeline.length > 0 ? (
              <ol className="mt-6 space-y-2 border-t border-[var(--domi-border)] pt-4">
                <li className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
                  Trazabilidad
                </li>
                {[...data.timeline]
                  .slice()
                  .reverse()
                  .map((event, idx) => (
                    <li key={`${event.at || idx}-${event.to || idx}`} className="text-sm text-[var(--domi-muted)]">
                      <span className="text-white">{STATUS_LABEL[asStatus(String(event.to || ''))]}</span>
                      {event.at ? (
                        <span className="ml-2 text-xs">
                          {new Date(event.at).toLocaleString('es-CO')}
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ol>
            ) : null}

            <button
              type="button"
              className="cta-ghost mt-6"
              onClick={() => setRefreshToken((n) => n + 1)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Actualizar
            </button>

            <RatingForm order={data} onRated={() => setRefreshToken((n) => n + 1)} />
          </div>
        ) : null}

        {!loading && !data && !error && !code ? (
          <p className="text-sm text-[var(--domi-muted)]">
            Ingresa un código para ver el estado de tu entrega.
          </p>
        ) : null}

        <footer className="mt-16 border-t border-[var(--domi-border)] pt-8 text-center text-xs text-[var(--domi-muted)]">
          <p>Calle 23 37k 28 · Barrio Teusaca · Villavicencio, Meta</p>
          <p className="mt-1">© 2026 DomiClick. Todos los derechos reservados.</p>
        </footer>
      </main>
    </div>
  );
}

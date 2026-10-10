import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Loader2, MessageCircle, PackageSearch, Phone, RefreshCw } from 'lucide-react';
import type { TrackingStatus } from '../contracts/salesIngest';
import { BrandLogo } from '../components/BrandLogo';
import { LiveTripMap } from '../components/LiveTripMap';
import { RatingForm } from '../components/RatingForm';
import { subscribeOrderTracking, type PublicOrderTracking } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { pushForStatus } from '../lib/brandCopy';
import { CustomerOrdersPanel } from '../components/CustomerOrdersPanel';
import { rememberRecentOrder } from '../lib/recentOrders';

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

function stepIndex(status: TrackingStatus): number {
  if (status === 'delivered') return 2;
  if (status === 'picked_up' || status === 'in_transit' || status === 'at_destination') {
    return 1;
  }
  if (status === 'cancelled') return -1;
  return 0;
}

export function AppTrackingPage() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { profile, signIn, loading: authLoading } = useAuth();
  const [lookup, setLookup] = useState(code?.toUpperCase() || '');
  const [data, setData] = useState<PublicOrderTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!code) {
      setData(null);
      setError(null);
      return;
    }
    setLookup(code.toUpperCase());
    if (authLoading) return;
    if (!profile) {
      setData(null);
      setError('Debes iniciar sesión para ver el seguimiento.');
      return;
    }

    setLoading(true);
    setError(null);
    const unsub = subscribeOrderTracking(code, (res) => {
      setLoading(false);
      if (!res) {
        setData(null);
        setError('No se encontró un pedido con ese código');
        return;
      }
      setData(res);
      setError(null);
      rememberRecentOrder({
        trackingCode: res.trackingCode,
        orderId: res.orderId,
        deliveryAddress: res.deliveryAddress,
        status: res.status,
        createdAt: res.createdAt || new Date().toISOString(),
      });
    });
    return () => unsub();
  }, [code, profile, authLoading, refreshToken]);

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
  const activeStep = status ? stepIndex(status) : -1;
  const phone = data?.assignedDriverPhone?.replace(/\D/g, '') || '';

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8">
      <header className="mb-4 flex items-center justify-between gap-3">
        <Link to="/" aria-label="Inicio" className="inline-flex items-center gap-2">
          <BrandLogo variant="optimized" height={32} />
        </Link>
        <Link to="/pedidos" className="text-xs font-semibold text-[var(--domi-cyan)]">
          Mis pedidos
        </Link>
      </header>

      <h1 className="font-display text-2xl font-extrabold text-white">Seguimiento</h1>

      <form onSubmit={goLookup} className="mt-4 flex gap-2">
        <input
          className="field-input font-mono uppercase"
          value={lookup}
          onChange={(e) => setLookup(e.target.value)}
          placeholder="DMC-4521"
          aria-label="Código de seguimiento"
        />
        <button type="submit" className="cta-primary shrink-0 px-3">
          <PackageSearch className="h-4 w-4" aria-hidden />
        </button>
      </form>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-[var(--domi-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Consultando…
        </div>
      ) : null}

      {!loading && error ? (
        <div
          className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
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
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-lg font-bold tracking-wider text-white">{data.trackingCode}</p>
            <span className={`text-xs font-bold ${STATUS_COLOR[status]}`}>
              {data.paymentReviewStatus === 'pending_review'
                ? 'Comprobante en revisión'
                : STATUS_LABEL[status]}
            </span>
          </div>
          {data.paymentReviewStatus === 'pending_review' ? (
            <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Central está revisando tu transferencia. Aún no hay Domiclick asignado.
            </div>
          ) : null}

          {push ? (
            <div className="rounded-2xl border border-[rgba(43,108,255,0.35)] bg-[rgba(43,108,255,0.08)] px-4 py-3">
              <p className="font-bold text-white">{push.title}</p>
              <p className="mt-1 text-sm text-[var(--domi-muted)]">{push.body}</p>
            </div>
          ) : null}

          {(data.pickupCoords || data.deliveryCoords || data.driverLocation) &&
          status !== 'cancelled' ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
                Ruta en vivo
              </p>
              <LiveTripMap
                pickup={data.pickupCoords}
                delivery={data.deliveryCoords}
                driver={
                  status !== 'pending' && status !== 'delivered' ? data.driverLocation : null
                }
                status={status || undefined}
                heightClass="h-64"
              />
              {status !== 'pending' && status !== 'delivered' ? (
                <p className="text-[11px] text-[var(--domi-muted)]">
                  {data.driverLocation
                    ? `En vivo${
                        data.driverLocation.updatedAt
                          ? ` · ${new Date(data.driverLocation.updatedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                          : ''
                      }`
                    : 'Esperando ubicación del repartidor… debe tener el GPS activo en la cabina.'}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="glass-panel rounded-2xl px-4 py-5">
            {[
              { label: 'Recogiendo', emoji: '📍' },
              { label: 'En camino', emoji: '🛵' },
              { label: 'Entregado', emoji: '🏠' },
            ].map((s, i) => {
              const done = activeStep >= i;
              const current = activeStep === i;
              return (
                <div key={s.label} className="flex gap-3">
                  <div className="flex w-8 flex-col items-center">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                        done
                          ? 'bg-[rgba(255,87,34,0.2)] text-[var(--domi-orange)]'
                          : 'bg-white/5 text-slate-500'
                      } ${current ? 'ring-2 ring-[var(--domi-orange)]' : ''}`}
                    >
                      {s.emoji}
                    </span>
                    {i < 2 ? (
                      <span
                        className={`my-1 min-h-[18px] w-0.5 flex-1 ${done ? 'bg-[var(--domi-orange)]' : 'bg-white/10'}`}
                      />
                    ) : null}
                  </div>
                  <p className={`pt-1.5 text-sm font-semibold ${done ? 'text-white' : 'text-slate-500'}`}>
                    {s.label}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-[var(--domi-muted)]">Llegada estimada</p>
            <p className="mt-1 text-base font-bold text-white">
              {data.etaText || 'Te avisamos cuando salga el repartidor'}
            </p>
          </div>

          {data.assignedDriverName && status !== 'pending' && status !== 'cancelled' ? (
            <div className="glass-panel flex items-center gap-3 rounded-2xl px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(0,229,255,0.12)] text-sm font-bold text-[var(--domi-cyan)]">
                {data.assignedDriverName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{data.assignedDriverName}</p>
                <p className="text-xs text-[var(--domi-muted)]">Tu repartidor</p>
              </div>
              {phone ? (
                <div className="flex gap-2">
                  <a
                    href={`tel:+${phone.startsWith('57') ? phone : `57${phone}`}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(0,230,118,0.15)] text-[var(--domi-green)]"
                    aria-label="Llamar"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  <a
                    href={`https://wa.me/${phone.startsWith('57') ? phone : `57${phone}`}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(0,229,255,0.12)] text-[var(--domi-cyan)]"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          {data.deliveryConfirmCode && status !== 'delivered' && status !== 'cancelled' ? (
            <div className="rounded-2xl border border-[rgba(255,87,34,0.35)] bg-[rgba(255,87,34,0.08)] px-4 py-4 text-center">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--domi-orange)]">
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                PIN de entrega
              </p>
              <p className="font-mono mt-2 text-3xl font-bold tracking-[0.35em] text-white">
                {data.deliveryConfirmCode}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            className="cta-ghost w-full justify-center"
            onClick={() => setRefreshToken((n) => n + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Actualizar
          </button>

          <RatingForm order={data} onRated={() => setRefreshToken((n) => n + 1)} />
        </div>
      ) : null}

      {!loading && !data && !error && !code ? (
        <CustomerOrdersPanel className="mt-6" />
      ) : null}

      {!code ? (
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--domi-muted)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Link>
      ) : null}
    </div>
  );
}

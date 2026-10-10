import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Package } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  isCustomerOrderActive,
  isCustomerOrderHistory,
  subscribeCustomerOrders,
  type CustomerOrderSummary,
} from '../lib/firebase';

type TabId = 'activos' | 'historial';

const TABS: { id: TabId; label: string }[] = [
  { id: 'activos', label: 'Activos' },
  { id: 'historial', label: 'Historial' },
];

const STATUS_LABEL: Record<string, string> = {
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

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function OrdersPage() {
  const { profile, loading: authLoading, signIn } = useAuth();
  const [tab, setTab] = useState<TabId>('activos');
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!profile?.uid) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = subscribeCustomerOrders(
      profile.uid,
      (list) => {
        setOrders(list);
        setLoading(false);
      },
      profile.email,
    );
    return () => unsub();
  }, [profile?.uid, profile?.email, authLoading]);

  const activeOrders = useMemo(
    () => orders.filter((o) => isCustomerOrderActive(o.status)),
    [orders],
  );
  const historyOrders = useMemo(
    () => orders.filter((o) => isCustomerOrderHistory(o.status)),
    [orders],
  );

  const filtered = tab === 'activos' ? activeOrders : historyOrders;

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-white">Mis pedidos</h1>
      <p className="mt-1 text-sm text-[var(--domi-muted)]">
        Los activos se mantienen hasta la entrega; luego pasan al historial.
      </p>

      <div className="mt-5 flex gap-1 rounded-xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-1">
        {TABS.map(({ id, label }) => {
          const count = id === 'activos' ? activeOrders.length : historyOrders.length;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold transition ${
                tab === id
                  ? 'bg-[rgba(255,87,34,0.2)] text-[var(--domi-orange)]'
                  : 'text-[var(--domi-muted)]'
              }`}
            >
              {label}
              {count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {!profile && !authLoading ? (
        <div className="glass-panel mt-8 rounded-2xl p-6 text-center">
          <Package className="mx-auto h-8 w-8 text-[var(--domi-muted)]" />
          <p className="mt-3 text-sm text-[var(--domi-muted)]">
            Inicia sesión para ver tus pedidos.
          </p>
          <button type="button" className="cta-primary mt-4" onClick={() => void signIn()}>
            Entrar
          </button>
        </div>
      ) : null}

      {loading || authLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--domi-orange)]" />
        </div>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {profile && !loading && !authLoading && !error ? (
        filtered.length === 0 ? (
          <div className="glass-panel mt-8 rounded-2xl p-6 text-center">
            <p className="text-sm text-[var(--domi-muted)]">
              {tab === 'activos'
                ? 'No tienes pedidos activos. Cuando solicites uno, aparece aquí hasta entregarlo.'
                : 'Aún no hay pedidos en el historial.'}
            </p>
            {tab === 'activos' ? (
              <Link to="/solicitar" className="cta-primary mt-4 inline-flex">
                Solicitar domicilio
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {filtered.map((order) => {
              const active = isCustomerOrderActive(order.status);
              return (
                <li key={order.orderId}>
                  <Link
                    to={`/seguimiento/${encodeURIComponent(order.trackingCode)}`}
                    className={`glass-panel block rounded-2xl px-4 py-4 transition active:border-[rgba(0,229,255,0.35)] ${
                      active ? 'border-[rgba(255,87,34,0.35)]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-mono text-base font-bold tracking-wide text-white">
                        {order.trackingCode}
                      </p>
                      <span
                        className={`shrink-0 text-right text-[11px] font-semibold ${
                          order.status === 'delivered'
                            ? 'text-[var(--domi-green)]'
                            : order.status === 'cancelled'
                              ? 'text-red-300'
                              : 'text-[var(--domi-cyan)]'
                        }`}
                      >
                        {STATUS_LABEL[order.status] || order.status}
                      </span>
                    </div>
                    {order.deliveryAddress ? (
                      <p className="mt-2 line-clamp-2 text-sm text-[var(--domi-muted)]">
                        {order.deliveryAddress}
                      </p>
                    ) : null}
                    {order.updatedAt || order.createdAt ? (
                      <p className="mt-2 text-[11px] text-slate-500">
                        {formatDate(order.updatedAt || order.createdAt)}
                      </p>
                    ) : null}
                    {active ? (
                      <p className="mt-2 text-[11px] font-semibold text-[var(--domi-orange)]">
                        Seguir en vivo →
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

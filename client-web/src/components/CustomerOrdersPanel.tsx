import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Package } from 'lucide-react';
import {
  findOrderByTrackingCode,
  isCustomerOrderActive,
  isCustomerOrderHistory,
  subscribeCustomerOrders,
  type CustomerOrderSummary,
} from '../lib/firebase';
import { listRecentOrdersLocal, type RecentOrderLocal } from '../lib/recentOrders';
import { useAuth } from '../lib/auth';

const STATUS_SHORT: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignado',
  accepted: 'Aceptado',
  en_route_origin: 'Al origen',
  at_origin: 'En origen',
  picked_up: 'Recogido',
  in_transit: 'En camino',
  at_destination: 'Cerca',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

function fromLocal(r: RecentOrderLocal): CustomerOrderSummary {
  return {
    orderId: r.orderId || r.trackingCode,
    trackingCode: r.trackingCode,
    status: r.status || 'pending',
    deliveryAddress: r.deliveryAddress,
    createdAt: r.createdAt,
  };
}

type Props = {
  /** Si hay un código abierto en seguimiento, se resalta */
  highlightCode?: string;
  className?: string;
};

export function CustomerOrdersPanel({ highlightCode, className = '' }: Props) {
  const { profile, signIn, loading: authLoading } = useAuth();
  const [remote, setRemote] = useState<CustomerOrderSummary[]>([]);
  const [localExtras, setLocalExtras] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!profile?.uid) {
      setRemote([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeCustomerOrders(
      profile.uid,
      (list) => {
        setRemote(list);
        setLoading(false);
      },
      profile.email,
    );
    return () => unsub();
  }, [profile?.uid, profile?.email, authLoading]);

  // Respaldo: códigos guardados en este dispositivo + refresco de estado
  useEffect(() => {
    const locals = listRecentOrdersLocal();
    if (!locals.length) {
      setLocalExtras([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const remoteCodes = new Set(remote.map((r) => r.trackingCode.toUpperCase()));
      const missing = locals.filter((l) => !remoteCodes.has(l.trackingCode.toUpperCase()));
      if (!missing.length) {
        if (!cancelled) setLocalExtras([]);
        return;
      }
      const resolved: CustomerOrderSummary[] = [];
      for (const m of missing.slice(0, 8)) {
        try {
          const live = await findOrderByTrackingCode(m.trackingCode);
          if (live) {
            resolved.push({
              orderId: live.orderId,
              trackingCode: live.trackingCode,
              status: live.status,
              deliveryAddress: live.deliveryAddress,
              pickupAddress: live.pickupAddress,
              createdAt: live.createdAt,
              updatedAt: live.updatedAt,
            });
          } else {
            resolved.push(fromLocal(m));
          }
        } catch {
          resolved.push(fromLocal(m));
        }
      }
      if (!cancelled) setLocalExtras(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [remote]);

  const merged = useMemo(() => {
    const byId = new Map<string, CustomerOrderSummary>();
    for (const o of [...remote, ...localExtras]) {
      byId.set(o.trackingCode.toUpperCase(), o);
    }
    return [...byId.values()].sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      return tb - ta;
    });
  }, [remote, localExtras]);

  const active = merged.filter((o) => isCustomerOrderActive(o.status));
  const history = merged.filter((o) => isCustomerOrderHistory(o.status)).slice(0, 5);

  if (authLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-[var(--domi-muted)] ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando tus pedidos…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={`glass-panel rounded-2xl p-5 ${className}`}>
        <Package className="h-6 w-6 text-[var(--domi-muted)]" />
        <p className="mt-2 text-sm text-[var(--domi-muted)]">
          Inicia sesión para ver tus pedidos recientes.
        </p>
        <button type="button" className="cta-primary mt-3" onClick={() => void signIn()}>
          Entrar
        </button>
      </div>
    );
  }

  if (loading && merged.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-sm text-[var(--domi-muted)] ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Buscando tus pedidos…
      </div>
    );
  }

  if (merged.length === 0) {
    return (
      <div className={`glass-panel rounded-2xl p-5 ${className}`}>
        <p className="text-sm text-[var(--domi-muted)]">
          Aún no aparecen pedidos en esta cuenta. Si acabas de solicitar, espera un momento o usa el
          código DMC.
        </p>
        <Link to="/" className="mt-3 inline-flex text-sm font-semibold text-[var(--domi-cyan)]">
          Solicitar domicilio →
        </Link>
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${className}`}>
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-white">Tus pedidos activos</h2>
          <Link to="/pedidos" className="text-[11px] font-semibold text-[var(--domi-cyan)]">
            Ver todos
          </Link>
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-[var(--domi-muted)]">No tienes pedidos en curso.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((o) => {
              const hi = highlightCode?.toUpperCase() === o.trackingCode.toUpperCase();
              return (
                <li key={o.orderId}>
                  <Link
                    to={`/seguimiento/${encodeURIComponent(o.trackingCode)}`}
                    className={`glass-panel block rounded-2xl px-4 py-3.5 transition ${
                      hi
                        ? 'border-[rgba(255,87,34,0.45)]'
                        : 'active:border-[rgba(0,229,255,0.35)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-sm font-bold text-white">{o.trackingCode}</p>
                      <span className="shrink-0 text-[11px] font-semibold text-[var(--domi-orange)]">
                        {STATUS_SHORT[o.status] || o.status}
                      </span>
                    </div>
                    {o.deliveryAddress ? (
                      <p className="mt-1 line-clamp-1 text-xs text-[var(--domi-muted)]">
                        {o.deliveryAddress}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {history.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-sm font-bold text-white">Historial reciente</h2>
          <ul className="space-y-2">
            {history.map((o) => (
              <li key={o.orderId}>
                <Link
                  to={`/seguimiento/${encodeURIComponent(o.trackingCode)}`}
                  className="glass-panel block rounded-2xl px-4 py-3 transition active:border-[rgba(0,229,255,0.35)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm font-bold text-white">{o.trackingCode}</p>
                    <span
                      className={`shrink-0 text-[11px] font-semibold ${
                        o.status === 'delivered' ? 'text-[var(--domi-green)]' : 'text-red-300'
                      }`}
                    >
                      {STATUS_SHORT[o.status] || o.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Bell, Package, Search, ShoppingBag, UtensilsCrossed, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { OFFICE_CITY } from '../lib/companyInfo';
import { useAuth } from '../lib/auth';
import { listCustomerOrders, type CustomerOrderSummary } from '../lib/firebase';

const CATEGORIES = [
  { id: 'comida', label: 'Comida', icon: UtensilsCrossed, color: 'text-[var(--domi-orange)]', bg: 'bg-[rgba(255,87,34,0.12)]' },
  { id: 'paquetes', label: 'Paquetes', icon: Package, color: 'text-[var(--domi-cyan)]', bg: 'bg-[rgba(0,229,255,0.1)]' },
  { id: 'compras', label: 'Compras', icon: ShoppingBag, color: 'text-[var(--domi-blue)]', bg: 'bg-[rgba(43,108,255,0.12)]' },
  { id: 'otros', label: 'Otros', icon: MoreHorizontal, color: 'text-[var(--domi-green)]', bg: 'bg-[rgba(0,230,118,0.1)]' },
] as const;

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

export function AppHomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);

  useEffect(() => {
    if (!profile?.uid) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    void listCustomerOrders(profile.uid)
      .then((rows) => {
        if (!cancelled) setOrders(rows);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.uid]);

  const recent = orders.slice(0, 3);

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            DomiClick
          </p>
          <p className="mt-0.5 font-display text-lg font-bold text-white">{OFFICE_CITY}</p>
        </div>
        <Link
          to="/notificaciones"
          aria-label="Notificaciones"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--domi-border)] bg-[var(--domi-panel)] text-[var(--domi-muted)] transition active:border-[rgba(255,87,34,0.45)] active:text-[var(--domi-orange)]"
        >
          <Bell className="h-5 w-5" />
        </Link>
      </header>

      <button
        type="button"
        onClick={() => navigate('/solicitar')}
        className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-[var(--domi-border)] bg-[rgba(5,8,15,0.65)] px-4 py-3.5 text-left transition active:border-[rgba(255,87,34,0.4)]"
      >
        <Search className="h-5 w-5 shrink-0 text-[var(--domi-muted)]" />
        <span className="text-sm text-[#5f6f8c]">Buscar dirección o lugar…</span>
      </button>

      <button
        type="button"
        onClick={() => navigate('/solicitar')}
        className="mb-6 w-full rounded-2xl border border-[rgba(255,87,34,0.35)] bg-gradient-to-br from-[rgba(255,87,34,0.18)] to-[rgba(255,87,34,0.05)] p-5 text-left transition active:brightness-110"
      >
        <p className="font-display text-lg font-bold text-white">¿Necesitas enviar algo?</p>
        <p className="mt-1 text-sm text-[var(--domi-muted)]">
          Nosotros te ayudamos →
        </p>
      </button>

      <section className="mb-8">
        <h2 className="mb-4 font-display text-sm font-semibold text-[var(--domi-muted)]">
          Solicitar entrega
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {CATEGORIES.map(({ id, label, icon: Icon, color, bg }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(`/solicitar?tipo=${id}`)}
              className="flex flex-col items-center gap-2"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full border border-[var(--domi-border)] ${bg} ${color}`}
              >
                <Icon className="h-6 w-6" strokeWidth={1.9} />
              </span>
              <span className="text-[11px] font-semibold text-slate-300">{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-white">Tus últimos pedidos</h2>
          <Link to="/pedidos" className="text-xs font-semibold text-[var(--domi-cyan)]">
            Ver todos
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="glass-panel rounded-2xl px-4 py-5">
            <p className="text-sm text-[var(--domi-muted)]">
              Aún no tienes pedidos. Toca <span className="text-white">Solicitar</span> para el primero.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {recent.map((order) => (
              <li key={order.orderId}>
                <Link
                  to={`/seguimiento/${encodeURIComponent(order.trackingCode)}`}
                  className="glass-panel block rounded-2xl px-4 py-3.5 transition active:border-[rgba(0,229,255,0.35)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm font-bold text-white">{order.trackingCode}</p>
                    <span className="shrink-0 text-[11px] font-semibold text-[var(--domi-cyan)]">
                      {STATUS_SHORT[order.status] || order.status}
                    </span>
                  </div>
                  {order.deliveryAddress ? (
                    <p className="mt-1.5 line-clamp-1 text-xs text-[var(--domi-muted)]">
                      {order.deliveryAddress}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

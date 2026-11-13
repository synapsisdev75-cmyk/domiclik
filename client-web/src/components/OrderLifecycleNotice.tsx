import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { forgetRecentOrder } from '../lib/recentOrders';
import {
  alertDriverArrived,
  alertOrderCancelled,
  alertOrderPickedUp,
  unlockAlertAudio,
} from '../lib/alerts';
import type { PublicOrderTracking } from '../lib/firebase';

const PLAYED_KEY = 'domiclick_played_order_alerts_v1';

function markPlayed(key: string): boolean {
  try {
    const raw = sessionStorage.getItem(PLAYED_KEY);
    const played = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    if (played.has(key)) return false;
    played.add(key);
    sessionStorage.setItem(PLAYED_KEY, JSON.stringify([...played].slice(-80)));
    return true;
  } catch {
    return true;
  }
}

export function OrderLifecycleNotice({ order }: { order: PublicOrderTracking }) {
  const last = useRef<string>('');

  useEffect(() => {
    const status = String(order.status || '');
    const key = `${order.orderId}:${status}`;
    if (last.current === key) return;
    last.current = key;

    if (status === 'cancelled' || status === 'canceled' || status === 'cancelado') {
      forgetRecentOrder(order.trackingCode);
    }

    if (!markPlayed(key)) return;
    unlockAlertAudio();
    if (status === 'cancelled' || status === 'canceled' || status === 'cancelado') {
      alertOrderCancelled();
    } else if (status === 'picked_up' || status === 'in_transit') {
      alertOrderPickedUp();
    } else if (status === 'at_destination') {
      alertDriverArrived();
    }
  }, [order.orderId, order.status, order.trackingCode]);

  if (order.status === 'cancelled' || order.status === 'canceled' || order.status === 'cancelado') {
    return (
      <div
        className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/12 px-4 py-4"
        role="alert"
      >
        <p className="text-base font-bold text-red-200">Pedido cancelado</p>
        <p className="mt-1 text-sm text-[var(--domi-muted)]">
          {order.trackingCode} quedó cerrado. Ya puedes crear una entrega nueva; este código no
          bloquea otra solicitud.
        </p>
        <Link to="/" className="cta-primary mt-3 inline-flex text-sm">
          Crear un pedido nuevo
        </Link>
      </div>
    );
  }

  if (order.status === 'picked_up' || order.status === 'in_transit') {
    return (
      <div className="mt-4 rounded-2xl border border-[rgba(255,87,34,0.35)] bg-[rgba(255,87,34,0.1)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--domi-orange)]">Pedido recogido</p>
        <p className="mt-1 text-sm text-[var(--domi-muted)]">
          El repartidor ya tiene tu encargo y va hacia el destino.
        </p>
      </div>
    );
  }

  if (order.status === 'at_destination') {
    return (
      <div className="mt-4 rounded-2xl border border-[rgba(0,230,118,0.35)] bg-[rgba(0,230,118,0.1)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--domi-green)]">El repartidor llegó</p>
        <p className="mt-1 text-sm text-[var(--domi-muted)]">
          Ten listo el PIN de entrega. Domiclick está en tu dirección.
        </p>
      </div>
    );
  }

  return null;
}

export function DeliveryProofCard({ url }: { url?: string | null }) {
  if (!url) return null;
  return (
    <div className="mt-4 rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
        Evidencia de entrega
      </p>
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
        <img
          src={url}
          alt="Foto de entrega del pedido"
          className="max-h-64 w-full rounded-xl object-cover"
        />
      </a>
      <p className="mt-2 text-[11px] text-[var(--domi-muted)]">
        Foto tomada por el repartidor al confirmar el PIN. Tócala para verla en grande.
      </p>
    </div>
  );
}

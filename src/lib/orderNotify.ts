import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type OrderNotifyKind =
  | 'cancelled'
  | 'picked_up'
  | 'at_destination'
  | 'assigned'
  | 'delivered';

const COPY: Record<OrderNotifyKind, { title: string; body: (code: string) => string }> = {
  cancelled: {
    title: 'Pedido cancelado',
    body: (code) => `Tu pedido ${code} fue cancelado. Ábrelo para ver el estado Cancelado.`,
  },
  picked_up: {
    title: 'Pedido recogido',
    body: (code) => `El repartidor ya recogió ${code} y va hacia ti.`,
  },
  at_destination: {
    title: 'El repartidor llegó',
    body: (code) => `Tu Domiclick está en el destino de ${code}. Ten listo el PIN.`,
  },
  assigned: {
    title: 'Repartidor asignado',
    body: (code) => `${code} ya tiene motorizado asignado.`,
  },
  delivered: {
    title: 'Pedido entregado',
    body: (code) => `${code} se entregó. Gracias por usar DomiClick.`,
  },
};

export function notifyKindForStatus(status: string): OrderNotifyKind | null {
  if (status === 'cancelled' || status === 'picked_up' || status === 'at_destination') {
    return status;
  }
  if (status === 'assigned') return 'assigned';
  if (status === 'delivered') return 'delivered';
  return null;
}

/** Un documento por pedido+evento: no duplica el aviso si se reintenta el mismo cambio. */
export async function notifyCustomerOrderEvent(params: {
  orderId: string;
  trackingCode?: string;
  customerUid?: string | null;
  customerEmail?: string | null;
  kind: OrderNotifyKind;
}): Promise<void> {
  const orderId = String(params.orderId || '').trim();
  if (!orderId) return;
  const id = `${orderId}_${params.kind}`;
  const ref = doc(db, 'customer_notifications', id);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) return;
    const code = String(params.trackingCode || orderId);
    const copy = COPY[params.kind];
    await setDoc(ref, {
      id,
      orderId,
      trackingCode: code,
      customerUid: String(params.customerUid || ''),
      customerEmail: String(params.customerEmail || '').trim().toLowerCase(),
      kind: params.kind,
      title: copy.title,
      body: copy.body(code),
      createdAt: new Date().toISOString(),
      read: false,
    });
  } catch (err) {
    console.warn('[notify] no se guardó el aviso al cliente', err);
  }
}

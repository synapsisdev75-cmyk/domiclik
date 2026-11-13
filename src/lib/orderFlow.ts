import type { OrderStatus } from '../types';
import { PUSH_MESSAGES } from './brandCopy';

export const LIVE_ORDER_STATUSES: OrderStatus[] = [
  'assigned',
  'accepted',
  'en_route_origin',
  'at_origin',
  'picked_up',
  'in_transit',
  'at_destination',
];

export function isLiveOrderStatus(status: OrderStatus | string | undefined): boolean {
  return LIVE_ORDER_STATUSES.includes(status as OrderStatus);
}

/** Transferencia con comprobante: no se asigna hasta que torre apruebe. */
export function isPaymentOnHold(order: { paymentReviewStatus?: string } | null | undefined): boolean {
  return order?.paymentReviewStatus === 'pending_review';
}

export function orderTransferPaid(order: {
  amountPaid?: number;
  payments?: Array<{ amount?: number; status?: string }>;
} | null | undefined): number {
  if (typeof order?.amountPaid === 'number' && order.amountPaid > 0) return order.amountPaid;
  return (order?.payments || [])
    .filter((p) => !p.status || p.status === 'approved')
    .reduce((sum, p) => sum + Math.round(Number(p.amount || 0)), 0);
}

export function paymentMethodLabel(order: {
  paymentMethod?: string;
  transferChannel?: string;
} | null | undefined): string {
  const method = String(order?.paymentMethod || '');
  if (method === 'transferencia' || order?.transferChannel === 'pasarela') return 'Pago en línea';
  if (method === 'efectivo') return 'Contraentrega';
  if (method === 'ya_pagado') return 'Ya pagado en el negocio';
  if (method === 'otro') return 'Otro';
  return '';
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendiente de gestión',
  assigned: 'Asignado',
  accepted: 'Aceptado',
  en_route_origin: 'En camino al origen',
  at_origin: 'Llegó al origen',
  picked_up: 'Recogido',
  in_transit: 'En camino al destino',
  at_destination: 'Llegó al destino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export type DriverStepAction = {
  next: OrderStatus;
  label: string;
};

/** Confirmar recogida activa la entrega (in_transit). Luego: llegué al destino → PIN. */
export const DRIVER_NEXT_ACTION: Partial<Record<OrderStatus, DriverStepAction>> = {
  assigned: { next: 'in_transit', label: 'Confirmar recogida' },
  accepted: { next: 'in_transit', label: 'Confirmar recogida' },
  en_route_origin: { next: 'in_transit', label: 'Confirmar recogida' },
  at_origin: { next: 'in_transit', label: 'Confirmar recogida' },
  picked_up: { next: 'in_transit', label: 'Confirmar recogida' },
  in_transit: { next: 'at_destination', label: 'Llegué al destino' },
};

export function pushKeyForStatus(
  status: OrderStatus,
): keyof typeof PUSH_MESSAGES | null {
  if (status === 'assigned' || status === 'accepted' || status === 'en_route_origin') return 'assigned';
  if (status === 'at_origin') return 'at_origin';
  if (status === 'picked_up' || status === 'in_transit') return 'picked_up';
  if (status === 'at_destination') return 'nearby';
  if (status === 'delivered') return 'delivered';
  return null;
}

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

/** Flujo matriz: Aceptar → Iniciar ruta → Llegué origen → Recogida → Iniciar entrega → Llegué destino */
export const DRIVER_NEXT_ACTION: Partial<Record<OrderStatus, DriverStepAction>> = {
  assigned: { next: 'accepted', label: 'Aceptar servicio' },
  accepted: { next: 'en_route_origin', label: 'Iniciar ruta' },
  en_route_origin: { next: 'at_origin', label: 'Llegué al origen' },
  at_origin: { next: 'picked_up', label: 'Confirmar recogida' },
  picked_up: { next: 'in_transit', label: 'Iniciar entrega' },
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

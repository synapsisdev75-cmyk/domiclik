/**
 * Contrato del TUBO DomiClick ↔ Landing de clientes.
 * Espejo de src/contracts/salesIngest.ts en el monorepo.
 */

export const INGEST_PATH = '/api/v1/inbound/orders';
export const HEALTH_PATH = '/api/v1/health';
export const TRACKING_PATH = '/api/v1/tracking';

export type IngestOrderBody = {
  sourceSiteId: string;
  externalOrderId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerUid?: string;
  customerPhotoURL?: string;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  pickupAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  description?: string;
  declaredValue?: number;
  notes?: string;
};

export type IngestOrderResponse = {
  ok: true;
  orderId: string;
  trackingCode: string;
  /** PIN que el cliente da al repartidor para confirmar entrega */
  deliveryConfirmCode: string;
  status: 'pending' | 'assigned';
};

export type IngestErrorResponse = {
  ok: false;
  error: string;
};

export type TrackingStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export type TrackingResponse = {
  ok: true;
  trackingCode: string;
  deliveryConfirmCode?: string | null;
  status: TrackingStatus;
  orderId?: string;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  serviceRating?: number;
  ratingComment?: string;
  etaText?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type TrackingErrorResponse = {
  ok: false;
  error: string;
};

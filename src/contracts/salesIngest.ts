/**
 * Contrato del TUBO DomiClick ↔ Página de Ventas (proyecto independiente).
 *
 * Flujo:
 *   Página de Ventas  --POST-->  DomiClick Ingest API  -->  Firestore `orders`
 *   DomiClick Admin escucha en tiempo real y despacha motorizados.
 *
 * Endpoint: POST {DOMICLICK_API_URL}/api/v1/inbound/orders
 * Header:   Authorization: Bearer {DOMICLICK_INGEST_TOKEN}
 *           X-DomiClick-Site: {sourceSiteId}
 */

export const INGEST_PATH = '/api/v1/inbound/orders';
export const HEALTH_PATH = '/api/v1/health';

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

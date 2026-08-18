import {
  INGEST_PATH,
  TRACKING_PATH,
  type IngestErrorResponse,
  type IngestOrderBody,
  type IngestOrderResponse,
  type TrackingErrorResponse,
  type TrackingResponse,
} from '../contracts/salesIngest';
import { API_URL, INGEST_TOKEN, SITE_ID } from './config';
import { createClientOrder, findOrderByTrackingCode } from './firebase';

/**
 * Envía la solicitud a DomiClick.
 * 1) Intenta API tubo (:8787)
 * 2) Si falla, escribe directo en Firestore → la torre de control lo recibe en vivo
 */
export async function submitOrder(
  payload: Omit<IngestOrderBody, 'sourceSiteId'>,
): Promise<IngestOrderResponse> {
  const body: IngestOrderBody = {
    ...payload,
    sourceSiteId: SITE_ID,
  };

  try {
    const res = await fetch(`${API_URL}${INGEST_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INGEST_TOKEN}`,
        'X-DomiClick-Site': SITE_ID,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as IngestOrderResponse | IngestErrorResponse;

    if (res.ok && data.ok) {
      return data;
    }

    console.warn('[DomiClick] API ingest falló, usando Firestore directo', data);
  } catch (err) {
    console.warn('[DomiClick] API no disponible, usando Firestore directo', err);
  }

  // Respaldo: misma colección `orders` que escucha la torre de control
  if (
    payload.pickupLat == null ||
    payload.pickupLng == null ||
    payload.deliveryLat == null ||
    payload.deliveryLng == null
  ) {
    throw new Error('Faltan coordenadas de recolección/entrega para guardar el pedido');
  }

  return createClientOrder({
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    customerEmail: payload.customerEmail,
    customerUid: payload.customerUid,
    customerPhotoURL: payload.customerPhotoURL,
    pickupAddress: payload.pickupAddress || 'Punto de recolección',
    pickupLat: payload.pickupLat,
    pickupLng: payload.pickupLng,
    deliveryAddress: payload.deliveryAddress,
    deliveryLat: payload.deliveryLat,
    deliveryLng: payload.deliveryLng,
    description: payload.description,
    notes: payload.notes,
    declaredValue: payload.declaredValue,
    shippingFee: payload.shippingFee,
    routeDistanceKm: payload.routeDistanceKm,
    routeDurationMin: payload.routeDurationMin,
    pricingBand: payload.pricingBand,
    pricePerKm: payload.pricePerKm,
    peakMultiplier: payload.peakMultiplier,
    scheduledFor: payload.scheduledFor,
    invoiceNumber: payload.invoiceNumber,
    invoicePhotoUrl: payload.invoicePhotoUrl,
    sourceSiteId: SITE_ID,
  });
}

export async function fetchTracking(code: string): Promise<TrackingResponse> {
  const encoded = encodeURIComponent(code.trim().toUpperCase());

  try {
    const res = await fetch(`${API_URL}${TRACKING_PATH}/${encoded}`);
    const data = (await res.json()) as TrackingResponse | TrackingErrorResponse;
    if (res.ok && data.ok) return data;
  } catch {
    /* fallback Firestore abajo */
  }

  const local = await findOrderByTrackingCode(code);
  if (!local) {
    throw new Error('No se encontró el pedido');
  }

  return {
    ok: true,
    trackingCode: local.trackingCode,
    deliveryConfirmCode: local.deliveryConfirmCode,
    status: local.status as TrackingResponse['status'],
    orderId: local.orderId,
    assignedDriverId: local.assignedDriverId,
    assignedDriverName: local.assignedDriverName,
    serviceRating: local.serviceRating,
    ratingComment: local.ratingComment,
    etaText: local.etaText,
    updatedAt: local.updatedAt,
    createdAt: local.createdAt,
  };
}

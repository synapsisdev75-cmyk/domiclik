import { Capacitor } from '@capacitor/core';
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

const INGEST_TIMEOUT_MS = 4000;

function isLocalUrl(urlOrHost: string): boolean {
  return /localhost|127\.0\.0\.1|::1/i.test(urlOrHost);
}

/**
 * Solo usa el tubo :8787 en desarrollo real (página local + API local).
 * En producción / Capacitor (hostname "localhost" en WebView) NUNCA: el fetch
 * a localhost:8787 se cuelga y el pedido no llega a la torre.
 */
function shouldUseIngestApi() {
  if (!API_URL) return false;
  const apiIsLocal = isLocalUrl(API_URL);

  let native = false;
  try {
    native = Capacitor.isNativePlatform();
  } catch {
    native = false;
  }
  if (native) return false;

  if (typeof window === 'undefined') return !apiIsLocal;

  const pageIsLocal = isLocalUrl(window.location.hostname);
  if (apiIsLocal) return pageIsLocal;
  return true;
}

async function createOrderInFirestore(
  payload: Omit<IngestOrderBody, 'sourceSiteId'>,
): Promise<IngestOrderResponse> {
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
    pickupPlaceId: payload.pickupPlaceId,
    deliveryAddress: payload.deliveryAddress,
    deliveryPlaceId: payload.deliveryPlaceId,
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
    isVip: payload.isVip,
    vipSurchargeCop: payload.vipSurchargeCop,
    scheduledFor: payload.scheduledFor,
    invoiceNumber: payload.invoiceNumber,
    invoicePhotoUrl: payload.invoicePhotoUrl,
    paymentMethod: payload.paymentMethod,
    transferChannel: payload.transferChannel,
    paymentProofUrl: payload.paymentProofUrl,
    paymentNote: payload.paymentNote,
    couponCode: payload.couponCode,
    sourceSiteId: SITE_ID,
  });
}

/**
 * Envía la solicitud a DomiClick.
 * Producción/app: Firestore directo (torre en vivo).
 * Dev local: intenta API tubo (:8787) con timeout, luego Firestore.
 */
export async function submitOrder(
  payload: Omit<IngestOrderBody, 'sourceSiteId'>,
): Promise<IngestOrderResponse> {
  const body: IngestOrderBody = {
    ...payload,
    sourceSiteId: SITE_ID,
  };

  if (!shouldUseIngestApi()) {
    console.info('[DomiClick] Pedido → Firestore (torre en vivo)');
    return createOrderInFirestore(payload);
  }

  try {
    const res = await fetch(`${API_URL}${INGEST_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INGEST_TOKEN}`,
        'X-DomiClick-Site': SITE_ID,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
    });

    const data = (await res.json()) as IngestOrderResponse | IngestErrorResponse;

    if (res.ok && data.ok) {
      return data;
    }

    console.warn('[DomiClick] API ingest falló, usando Firestore directo', data);
  } catch (err) {
    console.warn('[DomiClick] API no disponible, usando Firestore directo', err);
  }

  return createOrderInFirestore(payload);
}

export async function fetchTracking(code: string): Promise<TrackingResponse> {
  const encoded = encodeURIComponent(code.trim().toUpperCase());

  if (shouldUseIngestApi()) {
    try {
      const res = await fetch(`${API_URL}${TRACKING_PATH}/${encoded}`, {
        signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
      });
      const data = (await res.json()) as TrackingResponse | TrackingErrorResponse;
      if (res.ok && data.ok) return data;
    } catch {
      /* fallback Firestore abajo */
    }
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

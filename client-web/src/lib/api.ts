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

export async function submitOrder(
  payload: Omit<IngestOrderBody, 'sourceSiteId'>,
): Promise<IngestOrderResponse> {
  const body: IngestOrderBody = {
    ...payload,
    sourceSiteId: SITE_ID,
  };

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

  if (!res.ok || !data.ok) {
    const message = !data.ok ? data.error : `Error ${res.status}`;
    throw new Error(message || 'No se pudo enviar la solicitud');
  }

  return data;
}

export async function fetchTracking(code: string): Promise<TrackingResponse> {
  const encoded = encodeURIComponent(code.trim().toUpperCase());
  const res = await fetch(`${API_URL}${TRACKING_PATH}/${encoded}`);
  const data = (await res.json()) as TrackingResponse | TrackingErrorResponse;

  if (!res.ok || !data.ok) {
    const message = !data.ok ? data.error : `Error ${res.status}`;
    throw new Error(message || 'No se encontró el pedido');
  }

  return data;
}

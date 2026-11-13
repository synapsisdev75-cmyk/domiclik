import { haversineKm, type LatLng } from './geo';

/** Referencia interna: radio para considerar “mismo lugar”. No se muestra al transportista. */
export const SAME_PLACE_RADIUS_M = 40;

export type NearbyOrderPoint = {
  id: string;
  pickupCoords?: LatLng | null;
  deliveryCoords?: LatLng | null;
};

export type NearbySamePlaceNotice = {
  pickupCount: number;
  deliveryCount: number;
  /** Clave estable para no repetir el pitido sin cambios. */
  signature: string;
  /** Texto visible para el transportista (sin mencionar metros). */
  message: string;
};

function clusterOrderIds(
  points: Array<{ id: string; lat: number; lng: number }>,
  radiusM: number,
): string[] {
  const near = new Set<string>();
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const meters = haversineKm(points[i], points[j]) * 1000;
      if (meters <= radiusM) {
        near.add(points[i].id);
        near.add(points[j].id);
      }
    }
  }
  return [...near].sort();
}

/**
 * Detecta 2+ recogidas o 2+ entregas dentro del radio interno.
 * Solo notificación: no cambia la ruta ni la asignación.
 */
export function detectNearbySamePlaceOrders(
  orders: NearbyOrderPoint[],
  radiusM = SAME_PLACE_RADIUS_M,
): NearbySamePlaceNotice | null {
  const usable = orders.slice(0, 3);
  if (usable.length < 2) return null;

  const pickups = usable
    .filter((o) => o.pickupCoords?.lat != null && o.pickupCoords?.lng != null)
    .map((o) => ({
      id: o.id,
      lat: o.pickupCoords!.lat,
      lng: o.pickupCoords!.lng,
    }));
  const drops = usable
    .filter((o) => o.deliveryCoords?.lat != null && o.deliveryCoords?.lng != null)
    .map((o) => ({
      id: o.id,
      lat: o.deliveryCoords!.lat,
      lng: o.deliveryCoords!.lng,
    }));

  const pickupIds = clusterOrderIds(pickups, radiusM);
  const deliveryIds = clusterOrderIds(drops, radiusM);
  const pickupCount = pickupIds.length;
  const deliveryCount = deliveryIds.length;
  if (pickupCount < 2 && deliveryCount < 2) return null;

  const parts: string[] = [];
  if (pickupCount >= 2) {
    parts.push(
      pickupCount === 2
        ? 'Tienes 2 recogidas en el mismo lugar'
        : `Tienes ${pickupCount} recogidas en el mismo lugar`,
    );
  }
  if (deliveryCount >= 2) {
    parts.push(
      deliveryCount === 2
        ? 'Tienes 2 entregas en el mismo lugar'
        : `Tienes ${deliveryCount} entregas en el mismo lugar`,
    );
  }

  return {
    pickupCount,
    deliveryCount,
    signature: `R:${pickupIds.join(',')}|E:${deliveryIds.join(',')}`,
    message: parts.join(' · '),
  };
}

type LatLng = { lat: number; lng: number };

const PICKUP_LEG = new Set(['assigned', 'accepted', 'en_route_origin', 'at_origin']);

type Stop = LatLng & { id: string; kind: 'pickup' | 'drop' };

export type TourOrder = {
  id: string;
  status: string;
  pickupCoords?: LatLng | null;
  deliveryCoords?: LatLng | null;
};

function dist2(a: LatLng, b: LatLng) {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
}

/** Hasta 3 pedidos: desde el moto, la parada más cercana que ya se puede visitar. */
export function planJoinedTour(orders: TourOrder[], start?: LatLng | null): LatLng[] {
  const usable = orders
    .filter((order) => order.pickupCoords?.lat && order.deliveryCoords?.lat)
    .slice(0, 3);
  if (!usable.length) return [];

  const left: Stop[] = [];
  for (const order of usable) {
    const pickup = {
      lat: order.pickupCoords!.lat,
      lng: order.pickupCoords!.lng,
      id: order.id,
      kind: 'pickup' as const,
    };
    const drop = {
      lat: order.deliveryCoords!.lat,
      lng: order.deliveryCoords!.lng,
      id: order.id,
      kind: 'drop' as const,
    };
    if (PICKUP_LEG.has(order.status)) left.push(pickup, drop);
    else left.push(drop);
  }

  const path: LatLng[] = [];
  let cursor: LatLng | null = start && Number.isFinite(start.lat) ? start : null;
  if (cursor) path.push(cursor);

  while (left.length) {
    const open = left.filter(
      (stop) => stop.kind === 'pickup' || !left.some((other) => other.id === stop.id && other.kind === 'pickup'),
    );
    if (!open.length) break;
    let best = open[0];
    if (cursor) {
      let bestD = Infinity;
      for (const stop of open) {
        const d = dist2(cursor, stop);
        if (d < bestD) {
          bestD = d;
          best = stop;
        }
      }
    }
    path.push({ lat: best.lat, lng: best.lng });
    cursor = best;
    left.splice(left.indexOf(best), 1);
  }
  return path;
}

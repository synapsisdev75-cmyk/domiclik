import {
  fetchTravelCostMatrix,
  estimateTourCost,
  haversineKm,
  pathCostFromMatrix,
  type TravelCost,
} from './geo';

type LatLng = { lat: number; lng: number };

const PICKUP_LEG = new Set(['assigned', 'accepted', 'en_route_origin', 'at_origin']);
/** Candidatas a puntuar con tiempo real de calles (prefiltro haversine). */
const STREET_SCORE_TOP_N = 8;

type Stop = LatLng & { id: string; kind: 'pickup' | 'drop' };

/** Parada de ruta unida (coords + tipo para pines R/E). */
export type TourStop = LatLng & { kind?: 'pickup' | 'drop'; orderId?: string };

export type TourOrder = {
  id: string;
  status: string;
  pickupCoords?: LatLng | null;
  deliveryCoords?: LatLng | null;
};

function metersBetween(a: LatLng, b: LatLng) {
  return haversineKm(a, b) * 1000;
}

function pathLengthM(start: LatLng | null, stops: Stop[]) {
  if (!stops.length) return 0;
  let total = 0;
  let cursor = start;
  for (const stop of stops) {
    if (cursor) total += metersBetween(cursor, stop);
    cursor = stop;
  }
  return total;
}

/** Si el pedido aún tiene recogida en la lista, la entrega no puede ir antes. */
function isValidSequence(stops: Stop[]) {
  const seenPickup = new Set<string>();
  const hasPickup = new Set(stops.filter((s) => s.kind === 'pickup').map((s) => s.id));
  for (const stop of stops) {
    if (stop.kind === 'pickup') {
      seenPickup.add(stop.id);
      continue;
    }
    if (hasPickup.has(stop.id) && !seenPickup.has(stop.id)) return false;
  }
  return true;
}

function permute<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const head = items[i];
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of permute(rest)) out.push([head, ...tail]);
  }
  return out;
}

function greedyNearest(leftIn: Stop[], start: LatLng | null): Stop[] {
  const left = leftIn.slice();
  const path: Stop[] = [];
  let cursor = start;
  while (left.length) {
    const open = left.filter(
      (stop) =>
        stop.kind === 'pickup' ||
        !left.some((other) => other.id === stop.id && other.kind === 'pickup'),
    );
    if (!open.length) break;
    let best = open[0];
    if (cursor) {
      let bestD = Infinity;
      for (const stop of open) {
        const d = metersBetween(cursor, stop);
        if (d < bestD) {
          bestD = d;
          best = stop;
        }
      }
    }
    path.push(best);
    cursor = best;
    left.splice(left.indexOf(best), 1);
  }
  return path;
}

function buildStops(orders: TourOrder[]): Stop[] {
  const usable = orders
    .filter((order) => order.pickupCoords?.lat && order.deliveryCoords?.lat)
    .slice(0, 3);
  const left: Stop[] = [];
  for (const order of usable) {
    const pickup: Stop = {
      lat: order.pickupCoords!.lat,
      lng: order.pickupCoords!.lng,
      id: order.id,
      kind: 'pickup',
    };
    const drop: Stop = {
      lat: order.deliveryCoords!.lat,
      lng: order.deliveryCoords!.lng,
      id: order.id,
      kind: 'drop',
    };
    // Solo paradas pendientes: al completar R, sale del cupo y se reoptimiza el remanente.
    if (PICKUP_LEG.has(order.status)) left.push(pickup, drop);
    else left.push(drop);
  }
  return left;
}

function resolveOrigin(start?: LatLng | null): LatLng | null {
  return start && Number.isFinite(start.lat) && Number.isFinite(start.lng)
    ? { lat: start.lat, lng: start.lng }
    : null;
}

function toTourPath(origin: LatLng | null, best: Stop[]): TourStop[] {
  const path: TourStop[] = [];
  if (origin) path.push({ lat: origin.lat, lng: origin.lng });
  for (const stop of best) {
    path.push({
      lat: stop.lat,
      lng: stop.lng,
      kind: stop.kind,
      orderId: stop.id,
    });
  }
  return path;
}

/** Secuencias válidas ordenadas por distancia aérea (mejor primero). */
function rankValidSequences(left: Stop[], origin: LatLng | null): Stop[][] {
  if (!left.length) return [];
  const ranked: Array<{ seq: Stop[]; len: number }> = [];
  for (const seq of permute(left)) {
    if (!isValidSequence(seq)) continue;
    ranked.push({ seq, len: pathLengthM(origin, seq) });
  }
  if (!ranked.length) return [greedyNearest(left, origin)];
  ranked.sort((a, b) => a.len - b.len);
  return ranked.map((r) => r.seq);
}

/**
 * Optimiza la ruta unida (hasta 3 pedidos) partiendo del live del transportista.
 * Sync: mejor secuencia válida por haversine (R_i antes de E_i).
 * Para tiempo real de calles usar `planJoinedTourAsync`.
 */
export function planJoinedTour(orders: TourOrder[], start?: LatLng | null): TourStop[] {
  const left = buildStops(orders);
  if (!left.length) return [];
  const origin = resolveOrigin(start);
  const ranked = rankValidSequences(left, origin);
  return toTourPath(origin, ranked[0] || left);
}

/** Solo las paradas R/E (sin el punto de origen del moto). Sync / haversine. */
export function planJoinedTourStops(orders: TourOrder[], start?: LatLng | null): TourStop[] {
  return planJoinedTour(orders, start).filter((s) => s.kind === 'pickup' || s.kind === 'drop');
}

/**
 * Elige la mejor secuencia entre candidatas midiendo tiempo real en calles.
 * Prefiltro haversine → top N → matriz OSRM (o Directions) → menor tiempo.
 */
async function pickBestByStreetTime(
  origin: LatLng | null,
  candidates: Stop[][],
): Promise<Stop[]> {
  if (!candidates.length) return [];
  if (candidates.length === 1) return candidates[0];

  const top = candidates.slice(0, STREET_SCORE_TOP_N);
  const points: LatLng[] = [];
  if (origin) points.push(origin);
  const indexOfStop = new Map<string, number>();
  for (const seq of top) {
    for (const stop of seq) {
      const key = `${stop.kind}:${stop.id}`;
      if (indexOfStop.has(key)) continue;
      indexOfStop.set(key, points.length);
      points.push({ lat: stop.lat, lng: stop.lng });
    }
  }

  const matrix = points.length >= 2 ? await fetchTravelCostMatrix(points) : null;

  let best = top[0];
  let bestCost: TravelCost = { durationSec: Infinity, distanceM: Infinity };

  for (const seq of top) {
    let cost: TravelCost;
    if (matrix) {
      const indices: number[] = [];
      if (origin) indices.push(0);
      for (const stop of seq) {
        const idx = indexOfStop.get(`${stop.kind}:${stop.id}`);
        if (idx == null) {
          cost = { durationSec: Infinity, distanceM: Infinity };
          break;
        }
        indices.push(idx);
      }
      cost =
        indices.length >= 2
          ? pathCostFromMatrix(matrix, indices)
          : { durationSec: 0, distanceM: 0 };
    } else {
      const path: LatLng[] = origin ? [origin, ...seq] : [...seq];
      cost = await estimateTourCost(path);
    }

    if (
      cost.durationSec < bestCost.durationSec ||
      (cost.durationSec === bestCost.durationSec && cost.distanceM < bestCost.distanceM)
    ) {
      bestCost = cost;
      best = seq;
    }
  }

  if (!Number.isFinite(bestCost.durationSec)) return candidates[0];
  return best;
}

/**
 * Misma regla de negocio que `planJoinedTour`, pero el ranking final usa
 * tiempo/distancia por calles (OSRM Table / Directions).
 */
export async function planJoinedTourAsync(
  orders: TourOrder[],
  start?: LatLng | null,
): Promise<TourStop[]> {
  const left = buildStops(orders);
  if (!left.length) return [];
  const origin = resolveOrigin(start);
  const ranked = rankValidSequences(left, origin);
  const best = await pickBestByStreetTime(origin, ranked);
  return toTourPath(origin, best);
}

export async function planJoinedTourStopsAsync(
  orders: TourOrder[],
  start?: LatLng | null,
): Promise<TourStop[]> {
  const path = await planJoinedTourAsync(orders, start);
  return path.filter((s) => s.kind === 'pickup' || s.kind === 'drop');
}

/**
 * Firma del lote pendiente: cambia al unirse un pedido o al completar R/E
 * (status sale de PICKUP_LEG → se reoptimiza solo el remanente).
 * No incluye GPS: el live no debe reordenar a cada tick.
 */
export function tourPlanSignature(orders: TourOrder[]): string {
  return orders
    .slice(0, 3)
    .map((o) => {
      const p = o.pickupCoords;
      const d = o.deliveryCoords;
      const pendingPickup = PICKUP_LEG.has(o.status) ? 'R' : '';
      return [
        o.id,
        pendingPickup,
        o.status,
        p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : '',
        d ? `${d.lat.toFixed(5)},${d.lng.toFixed(5)}` : '',
      ].join(':');
    })
    .join('|');
}

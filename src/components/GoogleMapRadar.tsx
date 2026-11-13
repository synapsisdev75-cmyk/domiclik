import React, { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { MotorizadoDriver, DeliveryOrder, type StaffRole } from '../types';
import { ChatWindow } from './chat/ChatWindow';
import { VILLAVICENCIO_CENTER } from '../data/villavicencio';
import { BRAND } from './brand/BrandAssets';
import { calculateOptimalRoute } from '../utils/routing';
import { isLiveOrderStatus, ORDER_STATUS_LABEL, paymentMethodLabel } from '../lib/orderFlow';
import { isDriverOnShiftToday } from '../lib/workShift';
import { Driver3DMarkersLayer } from './map/Driver3DMarkersLayer';
import {
  bearingDeg,
  pointAtAlong,
  projectOnPath,
  roadSignature,
  sliceFrom,
  type RoadPoint,
} from '../lib/roadFollow';
import { createRadarTrackSmoother } from '../lib/liveTrackSmooth';

/** Evita que un error de Google Maps tumbe toda la torre de control. */
class RadarErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[GoogleMapRadar] error de mapa', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 bg-[#0a0e16] p-4 text-center">
          <p className="text-sm font-black text-white">El radar no pudo cargar el mapa</p>
          <p className="max-w-sm text-[11px] text-slate-400">
            {this.state.error.message?.slice(0, 160) || 'Error de Google Maps'}
          </p>
          <button
            type="button"
            className="rounded-xl bg-[#FF5722] px-4 py-2 text-xs font-black text-white"
            onClick={() => this.setState({ error: null })}
          >
            Reintentar mapa
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ROAD_SNAP_M = 450;

const MAP_ID =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_MAP_ID) ||
  process.env.VITE_GOOGLE_MAPS_MAP_ID ||
  '7959bb6afa37dd5e9db669a8';

/** Solicitudes (pending) */
export const ROUTE_COLOR_SOLICITUD = '#FF8A00';
/** Entrega: recogida → destino */
export const ROUTE_COLOR_EN_PROCESO = '#00E5FF';
/** Recogida: donde está el repartidor → punto de recogida */
export const ROUTE_COLOR_RECOGIDA = '#C8F542';

const PICKUP_LEG = new Set(['assigned', 'accepted', 'en_route_origin', 'at_origin']);
const DELIVERY_LEG = new Set(['picked_up', 'in_transit', 'at_destination']);

interface GoogleMapRadarProps {
  drivers: MotorizadoDriver[];
  orders?: DeliveryOrder[];
  height?: string;
  apiKey: string;
  /** Si viene, el pin abre la radio con ese transportista. */
  tower?: { role: StaffRole; email: string } | null;
}

function gpsFreshness(updatedAt?: string, now = Date.now()): { live: boolean; text: string } {
  const at = Date.parse(updatedAt || '');
  if (!Number.isFinite(at) || at <= 0) return { live: false, text: 'Sin señal' };
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 50) return { live: true, text: 'EN VIVO' };
  if (sec < 3600) return { live: false, text: `hace ${Math.max(1, Math.round(sec / 60))} min` };
  return { live: false, text: 'Sin señal' };
}

function hasMapPoint(driver: MotorizadoDriver): boolean {
  const lat = driver.location?.lat;
  const lng = driver.location?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

type RouteKind = 'solicitud' | 'proceso';

function routeKind(status: DeliveryOrder['status']): RouteKind | null {
  if (status === 'pending') return 'solicitud';
  if (status === 'cancelled' || status === 'delivered') return null;
  return 'proceso';
}

function routeColor(kind: RouteKind) {
  return kind === 'solicitud' ? ROUTE_COLOR_SOLICITUD : ROUTE_COLOR_EN_PROCESO;
}

type Drawn = {
  glow: google.maps.Polyline;
  line: google.maps.Polyline;
  color: string;
  orderId?: string;
};

type LatLng = { lat: number; lng: number };

function isFiniteLatLng(p: unknown): p is LatLng {
  if (!p || typeof p !== 'object') return false;
  const lat = Number((p as LatLng).lat);
  const lng = Number((p as LatLng).lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

function asLatLng(p: unknown): LatLng | null {
  if (!isFiniteLatLng(p)) return null;
  return { lat: Number((p as LatLng).lat), lng: Number((p as LatLng).lng) };
}

/** Evita InvalidValueError: fitBounds con {lat,lng} o bounds vacíos tumba toda la ops. */
function safeFitBounds(map: google.maps.Map, points: LatLng[], padding = 72) {
  const valid = points.map(asLatLng).filter((p): p is LatLng => !!p);
  if (!valid.length) return;
  try {
    if (valid.length === 1) {
      map.panTo(valid[0]);
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of valid) bounds.extend(p);
    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, padding);
  } catch (err) {
    console.warn('[radar] fitBounds omitido', err);
  }
}

/** Parte de la ruta que falta. Lo ya recorrido se oculta. Si el moto está lejos de la vía, se deja completa. */
function remainingRoute(path: LatLng[], driver: LatLng): LatLng[] {
  if (path.length < 2) return path;
  let bestI = 0;
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((driver.lng - a.lng) * dx + (driver.lat - a.lat) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const lat = a.lat + dy * t;
    const lng = a.lng + dx * t;
    const dLat = driver.lat - lat;
    const dLng = driver.lng - lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      bestI = i;
      bestT = t;
    }
  }
  const meters = Math.sqrt(bestD) * 111_320;
  if (meters > 180) return path;
  const a = path[bestI];
  const b = path[bestI + 1];
  const snap = {
    lat: a.lat + (b.lat - a.lat) * bestT,
    lng: a.lng + (b.lng - a.lng) * bestT,
  };
  const ahead = path.slice(bestI + 1);
  return ahead.length ? [snap, ...ahead] : [snap, b];
}

type TourStop = LatLng & { orderId: string; kind: 'pickup' | 'drop' };

/** Recogida antes que su entrega. Entre lo que ya se puede visitar, elige el más cercano. */
function planOpenStops(orders: DeliveryOrder[], start: LatLng | null): TourStop[] {
  const left: TourStop[] = [];
  for (const order of orders) {
    const pickup = { lat: order.pickupCoords.lat, lng: order.pickupCoords.lng, orderId: order.id, kind: 'pickup' as const };
    const drop = { lat: order.deliveryCoords.lat, lng: order.deliveryCoords.lng, orderId: order.id, kind: 'drop' as const };
    if (PICKUP_LEG.has(order.status)) left.push(pickup, drop);
    else left.push(drop);
  }
  const path: TourStop[] = [];
  let cursor = start;
  while (left.length) {
    const open = left.filter(
      (stop) => stop.kind === 'pickup' || !left.some((other) => other.orderId === stop.orderId && other.kind === 'pickup'),
    );
    if (!open.length) break;
    let best = open[0];
    if (cursor) {
      let bestD = Infinity;
      for (const stop of open) {
        const dLat = stop.lat - cursor.lat;
        const dLng = stop.lng - cursor.lng;
        const d = dLat * dLat + dLng * dLng;
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

type StopMark = { label: string; kind: 'pickup' | 'drop'; orderId: string };

/** R1/E1, R2/E2… solo cuando el mismo repartidor lleva 2 o 3 pedidos unidos. */
function unifiedStopMarks(orders: DeliveryOrder[], drivers: MotorizadoDriver[]): Record<string, StopMark> {
  const marks: Record<string, StopMark> = {};
  const byDriver: Record<string, DeliveryOrder[]> = {};
  for (const order of orders) {
    if (routeKind(order.status) !== 'proceso' || !order.assignedDriverId) continue;
    if (!order.pickupCoords?.lat || !order.deliveryCoords?.lat) continue;
    const group = byDriver[order.assignedDriverId] || [];
    group.push(order);
    byDriver[order.assignedDriverId] = group;
  }
  for (const driverId of Object.keys(byDriver)) {
    const group = byDriver[driverId];
    if (group.length < 2 || group.length > 3) continue;
    const loc = liveDriverPoint(group[0], drivers);
    const stops = planOpenStops(group, loc);
    let r = 0;
    let e = 0;
    for (const stop of stops) {
      const label = stop.kind === 'pickup' ? `R${(r += 1)}` : `E${(e += 1)}`;
      marks[`${stop.orderId}:${stop.kind}`] = { label, kind: stop.kind, orderId: stop.orderId };
    }
  }
  return marks;
}

function fresherStop(a?: LatLng & { updatedAt?: string }, b?: LatLng & { updatedAt?: string }): LatLng | null {
  const aOk = Boolean(a && Number.isFinite(a.lat) && Number.isFinite(a.lng));
  const bOk = Boolean(b && Number.isFinite(b.lat) && Number.isFinite(b.lng));
  if (aOk && bOk) {
    const aAt = Date.parse(a!.updatedAt || '') || 0;
    const bAt = Date.parse(b!.updatedAt || '') || 0;
    const pick = bAt > aAt ? b! : a!;
    return { lat: pick.lat, lng: pick.lng };
  }
  if (bOk) return { lat: b!.lat, lng: b!.lng };
  if (aOk) return { lat: a!.lat, lng: a!.lng };
  return null;
}

/** GPS que mueve el radar: el más reciente entre la ficha del moto y la copia del pedido. */
function liveDriverPoint(order: DeliveryOrder, drivers: MotorizadoDriver[]): LatLng | null {
  const driver = order.assignedDriverId
    ? drivers.find((d) => d.id === order.assignedDriverId)
    : undefined;
  return fresherStop(driver?.location, order.driverLive);
}

/**
 * Dibuja rutas por calles.
 * Solicitudes = naranja (recogida → entrega).
 * En camino a recoger = lima desde el GPS hasta la recogida guardada, y cian el tramo de entrega.
 * Ya recogido = cian desde el GPS hasta la entrega guardada. El trazo se acorta en cada tick.
 * La línea no se borra mientras llega la ruta nueva: se actualiza encima.
 */
function StreetRoutesLayer({
  orders,
  drivers,
  onRoads,
  onPickOrder,
}: {
  orders: DeliveryOrder[];
  drivers: MotorizadoDriver[];
  onRoads?: (roads: Record<string, RoadPoint[]>) => void;
  onPickOrder?: (orderId: string) => void;
}) {
  const map = useMap();
  const linesRef = useRef<Record<string, Drawn>>({});
  const cacheRef = useRef<Record<string, LatLng[]>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const [cacheTick, setCacheTick] = useState(0);
  const fittedKeyRef = useRef('');
  const onRoadsRef = useRef(onRoads);
  onRoadsRef.current = onRoads;
  const onPickRef = useRef(onPickOrder);
  onPickRef.current = onPickOrder;
  const roadSigRef = useRef('');

  const routeOrders = useMemo(() => {
    const withCoords = orders.filter(
      (o) =>
        routeKind(o.status) &&
        o.pickupCoords?.lat &&
        o.pickupCoords?.lng &&
        o.deliveryCoords?.lat &&
        o.deliveryCoords?.lng
    );
    const solicitudes = withCoords.filter((o) => o.status === 'pending').slice(0, 8);
    const proceso = withCoords.filter((o) => o.status !== 'pending');
    return [...proceso, ...solicitudes];
  }, [orders]);

  const progressKey = useMemo(() => {
    return routeOrders
      .map((order) => {
        const loc = liveDriverPoint(order, drivers);
        if (!loc) return `${order.id}:full`;
        return `${order.id}:${order.status}:${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`;
      })
      .join('|');
  }, [routeOrders, drivers]);

  useEffect(() => {
    if (!map || !(window as unknown as { google?: typeof google }).google?.maps) return;

    const keep: Record<string, true> = {};
    const fitPoints: LatLng[] = [];
    let anyPath = false;
    const pushFit = (p: unknown) => {
      const pt = asLatLng(p);
      if (pt) fitPoints.push(pt);
    };

    const remember = (key: string, from: LatLng, to: LatLng) => {
      const hit = cacheRef.current[key];
      if (hit && hit.length >= 2) return;
      if (inflightRef.current.has(key)) return;
      inflightRef.current.add(key);
      void calculateOptimalRoute(from.lat, from.lng, to.lat, to.lng)
        .then((route) => {
          const path = route.coordinates.map(([lat, lng]) => ({ lat, lng }));
          cacheRef.current[key] = path.length >= 2 ? path : [from, to];
        })
        .catch(() => {
          cacheRef.current[key] = [from, to];
        })
        .finally(() => {
          inflightRef.current.delete(key);
          setCacheTick((n) => n + 1);
        });
    };

    const upsert = (id: string, path: LatLng[], color: string, z: number, orderId?: string) => {
      if (path.length < 2) return;
      keep[id] = true;
      const existing = linesRef.current[id];
      if (existing && existing.color === color && existing.orderId === orderId) {
        existing.glow.setPath(path);
        existing.line.setPath(path);
        return;
      }
      existing?.glow.setMap(null);
      existing?.line.setMap(null);
      const pick = () => {
        if (orderId) onPickRef.current?.(orderId);
      };
      const glow = new google.maps.Polyline({
        path,
        geodesic: false,
        clickable: Boolean(orderId),
        strokeColor: color,
        strokeOpacity: 0.22,
        strokeWeight: 12,
        map,
        zIndex: z,
      });
      const line = new google.maps.Polyline({
        path,
        geodesic: false,
        clickable: Boolean(orderId),
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 4,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 1,
              scale: 3,
              strokeColor: color,
            },
            offset: '0',
            repeat: '14px',
          },
        ],
        map,
        zIndex: z + 1,
      });
      if (orderId) {
        glow.addListener('click', pick);
        line.addListener('click', pick);
      }
      linesRef.current[id] = { glow, line, color, orderId };
    };

    const chained: Record<string, true> = {};
    const roads: Record<string, RoadPoint[]> = {};
    const byDriver: Record<string, DeliveryOrder[]> = {};
    for (const order of routeOrders) {
      if (routeKind(order.status) !== 'proceso' || !order.assignedDriverId) continue;
      const group = byDriver[order.assignedDriverId] || [];
      group.push(order);
      byDriver[order.assignedDriverId] = group;
    }
    for (const driverId of Object.keys(byDriver)) {
      const group = byDriver[driverId];
      if (group.length < 2 || group.length > 3) continue;
      const loc = liveDriverPoint(group[0], drivers);
      if (!loc) continue;
      group.forEach((order) => {
        chained[order.id] = true;
      });
      const stops = planOpenStops(group, loc);
      const legs: Array<{ path: LatLng[]; orderId: string }> = [];
      let prev: LatLng = loc;
      stops.forEach((stop, index) => {
        const key = `chain:${driverId}:leg:${index}:${prev.lat.toFixed(4)},${prev.lng.toFixed(4)}>${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}`;
        remember(key, prev, stop);
        const segment = cacheRef.current[key] || [prev, stop];
        legs.push({
          path: segment.length >= 2 ? segment : [prev, stop],
          orderId: stop.orderId,
        });
        prev = stop;
      });
      const stable = legs.reduce<LatLng[]>((acc, leg) => {
        if (!leg.path.length) return acc;
        return acc.length ? [...acc, ...leg.path.slice(1)] : [...leg.path];
      }, []);
      if (stable.length >= 2) roads[driverId] = stable;
      const snap = stable.length >= 2 ? projectOnPath(stable, loc) : null;
      const onRoad = Boolean(snap && snap.metersOff <= ROAD_SNAP_M);
      let walked = 0;
      legs.forEach((leg, index) => {
        let legMeters = 0;
        for (let i = 0; i < leg.path.length - 1; i++) {
          const dy = (leg.path[i + 1].lat - leg.path[i].lat) * 111320;
          const dx = (leg.path[i + 1].lng - leg.path[i].lng) * 111320;
          legMeters += Math.hypot(dx, dy);
        }
        const legStart = walked;
        walked += legMeters;
        let visible = leg.path;
        if (onRoad && snap) {
          if (walked <= snap.along + 12) return;
          if (legStart < snap.along) visible = sliceFrom(leg.path, Math.max(0, snap.along - legStart));
        }
        if (visible.length < 2) return;
        upsert(`chain:${driverId}:leg:${index}`, visible, ROUTE_COLOR_EN_PROCESO, 70, leg.orderId);
        visible.forEach(pushFit);
        pushFit(loc);
        anyPath = true;
      });
    }

    for (const order of routeOrders) {
      if (chained[order.id]) continue;
      const kind = routeKind(order.status)!;
      const pickup = { lat: order.pickupCoords.lat, lng: order.pickupCoords.lng };
      const dropoff = { lat: order.deliveryCoords.lat, lng: order.deliveryCoords.lng };
      const corridorKey = `${order.id}:corridor:${pickup.lat},${pickup.lng}>${dropoff.lat},${dropoff.lng}`;
      remember(corridorKey, pickup, dropoff);
      const corridor = cacheRef.current[corridorKey] || [pickup, dropoff];
      if (order.assignedDriverId && !roads[order.assignedDriverId] && corridor.length >= 2) {
        roads[order.assignedDriverId] = corridor;
      }
      const loc = liveDriverPoint(order, drivers);

      if (kind === 'proceso' && loc && PICKUP_LEG.has(order.status)) {
        upsert(`${order.id}:corridor`, corridor, ROUTE_COLOR_EN_PROCESO, 30, order.id);
        corridor.forEach(pushFit);
        const navKey = `${order.id}:nav:pickup:${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;
        remember(navKey, loc, pickup);
        const nav = cacheRef.current[navKey] || [loc, pickup];
        const visible = remainingRoute(nav, loc);
        upsert(`${order.id}:nav`, visible, ROUTE_COLOR_RECOGIDA, 60, order.id);
        visible.forEach(pushFit);
        pushFit(loc);
      } else if (kind === 'proceso' && loc && (DELIVERY_LEG.has(order.status) || order.status !== 'pending')) {
        const navKey = `${order.id}:nav:drop:${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;
        remember(navKey, loc, dropoff);
        const nav = cacheRef.current[navKey] || [loc, dropoff];
        const visible = remainingRoute(nav, loc);
        upsert(`${order.id}:nav`, visible, ROUTE_COLOR_EN_PROCESO, 60, order.id);
        visible.forEach(pushFit);
        pushFit(loc);
      } else {
        const color = routeColor(kind);
        upsert(`${order.id}:corridor`, corridor, color, kind === 'proceso' ? 40 : 20, order.id);
        corridor.forEach(pushFit);
      }
      anyPath = true;
    }

    for (const id of Object.keys(linesRef.current)) {
      if (keep[id]) continue;
      const drawn = linesRef.current[id];
      drawn.glow.setMap(null);
      drawn.line.setMap(null);
      delete linesRef.current[id];
    }

    const roadSig = Object.keys(roads)
      .sort()
      .map((id) => `${id}:${roadSignature(roads[id])}`)
      .join('|');
    if (roadSig !== roadSigRef.current) {
      roadSigRef.current = roadSig;
      onRoadsRef.current?.(roads);
    }

    const fitKey = routeOrders.map((o) => `${o.id}:${o.status}`).join('|');
    if (anyPath && fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey;
      safeFitBounds(map, fitPoints, 72);
    }
  }, [map, routeOrders, progressKey, drivers, cacheTick]);

  useEffect(() => {
    const lines = linesRef.current;
    return () => {
      Object.values(lines).forEach((drawn: Drawn) => {
        drawn.glow.setMap(null);
        drawn.line.setMap(null);
      });
      for (const id of Object.keys(lines)) delete lines[id];
    };
  }, [map]);

  return null;
}

/** El pin recorre la calle ya calculada, sin saltar de un GPS al siguiente. */
function useStreetGlide(drivers: MotorizadoDriver[], roads: Record<string, RoadPoint[]>) {
  const alongRef = useRef<Record<string, number>>({});
  const roadKeyRef = useRef('');
  const smoothRef = useRef(createRadarTrackSmoother());
  const [pos, setPos] = useState<Record<string, RoadPoint & { heading?: number }>>({});
  const targetKey = drivers
    .map((driver) => {
      const loc = driver.location;
      return loc ? `${driver.id}:${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}` : driver.id;
    })
    .join('|');
  const roadKey = Object.keys(roads)
    .sort()
    .map((id) => `${id}:${roadSignature(roads[id])}`)
    .join('|');

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const started = performance.now();
    const smoother = smoothRef.current;
    if (roadKey !== roadKeyRef.current) {
      roadKeyRef.current = roadKey;
      alongRef.current = {};
    }
    const from: Record<string, number> = {};
    const to: Record<string, number> = {};
    const dur: Record<string, number> = {};
    const pathOf: Record<string, RoadPoint[]> = {};
    const raw: Record<string, RoadPoint & { heading?: number }> = {};
    const active = new Set<string>();

    for (const driver of drivers) {
      const loc = driver.location;
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
      active.add(driver.id);
      // Suaviza snapshot Firestore antes de proyectar (corta teleports esquina↔esquina).
      const soft = smoother.applyRaw(driver.id, {
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading,
        updatedAt: loc.updatedAt,
        moving: loc.moving,
      });
      raw[driver.id] = { lat: soft.lat, lng: soft.lng, heading: soft.heading };
      const path = roads[driver.id];
      const proj = path && path.length >= 2 ? projectOnPath(path, soft) : null;
      if (!path || !proj || proj.metersOff > ROAD_SNAP_M) {
        alongRef.current[driver.id] = Number.NaN;
        continue;
      }
      pathOf[driver.id] = path;
      const prev = alongRef.current[driver.id];
      const clampedTo = smoother.clampAlong(driver.id, proj.along);
      from[driver.id] = Number.isFinite(prev) ? prev : clampedTo;
      to[driver.id] = clampedTo;
      // Si el clamp bloqueó un retroceso ruidoso, no anime hacia atrás.
      if (to[driver.id] + 1 < from[driver.id] && clampedTo === from[driver.id]) {
        to[driver.id] = from[driver.id];
      }
      const delta = Math.abs(to[driver.id] - from[driver.id]);
      dur[driver.id] = Math.min(8000, Math.max(900, delta * 55));
    }
    smoother.prune(active);

    const tick = (now: number) => {
      if (!alive) return;
      const next: Record<string, RoadPoint & { heading?: number }> = {};
      let pending = false;
      for (const driver of drivers) {
        const id = driver.id;
        if (!raw[id]) continue;
        const path = pathOf[id];
        if (!path || !Number.isFinite(to[id])) {
          next[id] = raw[id];
          continue;
        }
        const t = Math.min(1, (now - started) / dur[id]);
        const eased = t * t * (3 - 2 * t);
        const along = from[id] + (to[id] - from[id]) * eased;
        alongRef.current[id] = along;
        smoother.rememberAlong(id, along);
        const point = pointAtAlong(path, along);
        const ahead = pointAtAlong(path, along + 18);
        let heading = raw[id].heading;
        if (metersHint(point, ahead) > 4) heading = bearingDeg(point, ahead) % 360;
        next[id] = { ...point, heading };
        if (t < 1) pending = true;
      }
      setPos(next);
      if (pending) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // targetKey y roadKey ya representan drivers y roads. Reiniciar solo cuando cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, roadKey]);

  return drivers.map((driver) => {
    const point = pos[driver.id];
    if (!point || !driver.location) return driver;
    const path = roads[driver.id];
    const along = alongRef.current[driver.id];
    let heading = point.heading ?? driver.location.heading;
    if (path && Number.isFinite(along)) {
      const ahead = pointAtAlong(path, along + 18);
      if (metersHint(point, ahead) > 4) heading = bearingDeg(point, ahead) % 360;
    }
    return {
      ...driver,
      location: { ...driver.location, lat: point.lat, lng: point.lng, heading },
    };
  });
}

function metersHint(a: RoadPoint, b: RoadPoint) {
  const dy = (b.lat - a.lat) * 111320;
  const dx = (b.lng - a.lng) * 111320;
  return Math.hypot(dx, dy);
}

function StopPin({ label, sub, color }: { label: string; sub?: string; color: string }) {
  return (
    <div className="flex cursor-pointer flex-col items-center" style={{ transform: 'translateY(8px)' }}>
      <div
        className="rounded-xl border-[3px] border-white px-2 py-1 text-center shadow-xl"
        style={{ background: color, boxShadow: `0 0 0 2px ${color}, 0 8px 18px rgba(0,0,0,.45)` }}
      >
        <div className="text-[11px] font-black uppercase tracking-wide text-black">{label}</div>
        {sub ? <div className="max-w-[92px] truncate text-[9px] font-bold text-black/80">{sub}</div> : null}
      </div>
      <div className="h-3 w-3 -translate-y-1.5 rotate-45 border-2 border-white" style={{ background: color }} />
    </div>
  );
}

/**
 * Google Maps Platform radar — Map ID + dark night ops look.
 */
export const GoogleMapRadar: React.FC<GoogleMapRadarProps> = ({
  drivers,
  orders = [],
  height = 'h-[480px]',
  apiKey,
  tower = null,
}) => {
  const liveDrivers = useMemo(() => {
    return drivers.map((driver) => {
      let bestAt = Date.parse(driver.location?.updatedAt || '') || 0;
      let location = driver.location;
      for (const order of orders) {
        if (order.assignedDriverId !== driver.id || !order.driverLive) continue;
        const at = Date.parse(order.driverLive.updatedAt || '') || 0;
        if (at > bestAt && Number.isFinite(order.driverLive.lat) && Number.isFinite(order.driverLive.lng)) {
          bestAt = at;
          location = {
            ...driver.location,
            lat: order.driverLive.lat,
            lng: order.driverLive.lng,
            heading: order.driverLive.heading,
            updatedAt: order.driverLive.updatedAt,
          };
        }
      }
      return location === driver.location ? driver : { ...driver, location };
    });
  }, [drivers, orders]);
  const approved = liveDrivers.filter((d) => d.status === 'approved');
  const located = approved.filter(hasMapPoint);
  const onShiftNoGps = approved.filter(
    (d) => d.isActive && isDriverOnShiftToday(d) && !hasMapPoint(d),
  );
  const [roads, setRoads] = useState<Record<string, RoadPoint[]>>({});
  const acceptRoads = useCallback((next: Record<string, RoadPoint[]>) => {
    setRoads(next);
  }, []);
  const shown = useStreetGlide(located, roads);
  const [model3dReady, setModel3dReady] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [orderFocus, setOrderFocus] = useState<{ id: string; label: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const picked = located.find((d) => d.id === pickedId) || null;
  const stopMarks = useMemo(() => unifiedStopMarks(orders, liveDrivers), [orders, liveDrivers]);
  const focusedOrder = orderFocus ? orders.find((order) => order.id === orderFocus.id) || null : null;
  const openOrder = useCallback((id: string, label: string) => {
    setOrderFocus({ id, label });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);

  const solicitudCount = orders.filter((o) => o.status === 'pending').length;
  const procesoCount = orders.filter((o) => isLiveOrderStatus(o.status)).length;

  return (
    <RadarErrorBoundary>
    <div className={`relative ${height} w-full overflow-hidden bg-[#0a0e16]`}>
      <APIProvider apiKey={apiKey} libraries={['marker', 'geometry', 'routes']}>
        <Map
          defaultCenter={{
            lat: VILLAVICENCIO_CENTER.lat,
            lng: VILLAVICENCIO_CENTER.lng,
          }}
          defaultZoom={VILLAVICENCIO_CENTER.zoom}
          mapId={MAP_ID}
          colorScheme="DARK"
          gestureHandling="greedy"
          disableDefaultUI={false}
          zoomControl
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          style={{ width: '100%', height: '100%' }}
          className="w-full h-full"
        >
          <StreetRoutesLayer
            orders={orders}
            drivers={liveDrivers}
            onRoads={acceptRoads}
            onPickOrder={(orderId) => {
              const mark =
                stopMarks[`${orderId}:pickup`] ||
                stopMarks[`${orderId}:drop`] ||
                null;
              const order = orders.find((row) => row.id === orderId);
              openOrder(orderId, mark?.label || order?.trackingCode || 'Pedido');
            }}
          />
          <Driver3DMarkersLayer drivers={shown} onModelReady={setModel3dReady} />

          {shown.map((driver) => {
            const pos = asLatLng(driver.location);
            if (!pos) return null;
            const fresh = gpsFreshness(driver.location?.updatedAt, nowMs);
            const live = fresh.live;
            const stopped = live && driver.location?.moving === false;
            const moving = live && driver.location?.moving === true;
            const color = !live || stopped ? '#FFB300' : '#00E676';
            const motion = !live ? fresh.text : stopped ? 'Detenido' : moving ? 'En movimiento' : 'EN VIVO';
            return (
              <AdvancedMarker
                key={driver.id}
                position={pos}
                title={`${driver.fullName} · ${driver.plateNumber || 'Sin placa'} · ${motion}`}
                onClick={() => setPickedId((cur) => (cur === driver.id ? null : driver.id))}
                zIndex={pickedId === driver.id ? 80 : 40}
              >
                <button
                  type="button"
                  className="relative block border-0 bg-transparent p-0"
                  style={{ width: 18, height: 18 }}
                >
                  {live && !stopped ? (
                    <span
                      className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                      style={{ borderColor: color, animation: 'domiGpsPulse 1.4s ease-out infinite' }}
                    />
                  ) : null}
                  <span
                    className="absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                    style={{ background: color, boxShadow: `0 0 0 3px ${color}66, 0 0 12px ${color}` }}
                  />
                  <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/70 bg-[#070B16]/95 px-2 py-1 text-left leading-tight shadow-lg">
                    <span className="block max-w-[140px] truncate text-[10px] font-black text-white">
                      {driver.fullName || 'Transportista'}
                    </span>
                    <span className="block text-[9px] font-bold" style={{ color }}>
                      {(driver.plateNumber || 'Sin placa') + ' · ' + motion}
                    </span>
                  </span>
                </button>
              </AdvancedMarker>
            );
          })}

          {orders.map((order) => {
            if (!routeKind(order.status)) return null;
            const pickupPos = asLatLng(order.pickupCoords);
            const dropPos = asLatLng(order.deliveryCoords);
            if (!pickupPos || !dropPos) return null;
            const code = order.trackingCode || '';
            const pickupMark = stopMarks[`${order.id}:pickup`];
            const dropMark = stopMarks[`${order.id}:drop`];
            const pickupLabel = pickupMark?.label || 'R';
            const dropLabel = dropMark?.label || 'E';
            const showPickup = Boolean(pickupMark) || PICKUP_LEG.has(order.status) || order.status === 'pending';
            return (
              <React.Fragment key={order.id}>
                {showPickup ? (
                  <AdvancedMarker
                    position={pickupPos}
                    title={`${pickupLabel} · ${order.customerName || code} · Recogida`}
                    zIndex={orderFocus?.id === order.id ? 60 : 30}
                    onClick={() => openOrder(order.id, pickupLabel)}
                  >
                    <StopPin
                      label={pickupLabel}
                      sub={order.customerName || code}
                      color={ROUTE_COLOR_RECOGIDA}
                    />
                  </AdvancedMarker>
                ) : null}
                <AdvancedMarker
                  position={dropPos}
                  title={`${dropLabel} · ${order.customerName || code} · Entrega`}
                  zIndex={orderFocus?.id === order.id ? 61 : 31}
                  onClick={() => openOrder(order.id, dropLabel)}
                >
                  <StopPin
                    label={dropLabel}
                    sub={order.customerName || code}
                    color={ROUTE_COLOR_EN_PROCESO}
                  />
                </AdvancedMarker>
              </React.Fragment>
            );
          })}
        </Map>
      </APIProvider>

      {focusedOrder ? (
        <div className="absolute right-2 top-2 z-20 w-[min(360px,calc(100%-1rem))] rounded-2xl border border-[#00E5FF]/40 bg-[#070B16]/95 p-3 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#00E5FF]">
                {orderFocus?.label} · {focusedOrder.trackingCode || focusedOrder.id}
              </p>
              <p className="truncate text-sm font-black">{focusedOrder.customerName || 'Cliente'}</p>
              <p className="text-[11px] text-slate-400">{focusedOrder.customerPhone || 'Sin teléfono'}</p>
            </div>
            <button
              type="button"
              onClick={() => setOrderFocus(null)}
              className="shrink-0 text-[10px] font-bold text-slate-400"
            >
              Cerrar
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-300">
            {ORDER_STATUS_LABEL[focusedOrder.status] || focusedOrder.status}
            {focusedOrder.assignedDriverName ? ` · ${focusedOrder.assignedDriverName}` : ''}
          </p>
          <p className="mt-2 text-[11px] leading-snug">
            <span className="font-black text-[#C8F542]">Recogida · </span>
            {focusedOrder.pickupAddress || 'Sin dirección'}
          </p>
          <p className="mt-1 text-[11px] leading-snug">
            <span className="font-black text-[#00E5FF]">Entrega · </span>
            {focusedOrder.deliveryAddress || 'Sin dirección'}
          </p>
          {focusedOrder.description ? (
            <p className="mt-1 text-[11px] text-slate-300">Detalle: {focusedOrder.description}</p>
          ) : null}
          {focusedOrder.notes ? (
            <p className="mt-1 text-[11px] text-slate-400">Notas: {focusedOrder.notes}</p>
          ) : null}
          {paymentMethodLabel(focusedOrder) ? (
            <p className="mt-1 text-[11px] text-slate-300">Pago: {paymentMethodLabel(focusedOrder)}</p>
          ) : null}
        </div>
      ) : null}

      {picked && tower ? (
        <div className="absolute bottom-16 right-2 z-20 w-[min(420px,calc(100%-1rem))] overflow-hidden rounded-2xl border border-[#00E5FF]/40 bg-[#070B16]/95 shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-[#142340] px-3 py-2">
            <p className="truncate text-[11px] font-black uppercase tracking-wide text-white">
              Radio · {picked.fullName}
            </p>
            <button
              type="button"
              onClick={() => setPickedId(null)}
              className="text-[10px] font-bold text-slate-400"
            >
              Cerrar
            </button>
          </div>
          <ChatWindow
            chatId={`chat_${picked.id}`}
            driver={picked}
            heightClass="h-[240px]"
            currentRole={tower.role === 'secretary' ? 'secretary' : 'admin'}
            senderName={
              tower.role === 'secretary'
                ? `Secretaría · ${tower.email.split('@')[0] || 'Torre'}`
                : 'Torre de control'
            }
          />
        </div>
      ) : null}

      {onShiftNoGps.length > 0 ? (
        <div className="absolute top-2 left-2 right-2 z-20 rounded-xl border border-amber-400/50 bg-amber-950/90 px-3 py-2 text-[11px] text-amber-100 shadow-lg">
          <p className="font-black uppercase tracking-wide">En turno, sin GPS en el mapa</p>
          <p className="mt-0.5 truncate text-amber-200/90">
            {onShiftNoGps.map((d) => d.fullName).join(' · ')} · pídeles abrir la cabina
          </p>
        </div>
      ) : null}

      {/* Leyenda — esquina inferior izquierda */}
      <div className="absolute bottom-2 left-2 z-10 max-w-[220px] rounded-xl border border-[#1a2744] bg-[#0a101c]/92 px-3 py-2 shadow-lg backdrop-blur-sm">
        <p className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
          Leyenda de rutas
        </p>
        <div className="space-y-1.5 text-[10px] text-white">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-1 w-6 rounded-full"
              style={{ background: ROUTE_COLOR_SOLICITUD, boxShadow: `0 0 6px ${ROUTE_COLOR_SOLICITUD}` }}
            />
            <span>
              Solicitudes <span className="text-slate-400">({solicitudCount})</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-1 w-6 rounded-full"
              style={{
                background: ROUTE_COLOR_EN_PROCESO,
                boxShadow: `0 0 6px ${ROUTE_COLOR_EN_PROCESO}`,
              }}
            />
            <span>
              Ruta de entrega <span className="text-slate-400">({procesoCount})</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black text-black"
              style={{ background: ROUTE_COLOR_RECOGIDA }}
            >
              R
            </span>
            <span>Recogida</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[8px] font-black text-black"
              style={{ background: ROUTE_COLOR_EN_PROCESO }}
            >
              E
            </span>
            <span>Entrega · toca R/E o la ruta</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#00E676]" />
            {model3dReady ? 'Moto 3D en mapa' : 'Cargando moto 3D…'}
          </div>
        </div>
      </div>

      <div className="absolute bottom-2 right-2 z-10 map-brand-badge flex items-center gap-2 rounded-xl border border-[#FF5722]/40 bg-[#0a101c]/90 px-2.5 py-1.5 shadow-[0_0_16px_rgba(255,87,34,0.25)]">
        <img src={BRAND.logoMark} alt="DomiClick" className="brand-neon h-7 w-7 object-contain" />
        <div className="hidden leading-tight sm:block">
          <div className="font-display text-[10px] font-black italic text-white">
            Domi<span className="text-[#FF5722]">Click</span>
          </div>
          <div className="font-tech text-[8px] text-slate-400">Rutas por calles · Night Ops</div>
        </div>
      </div>
    </div>
    </RadarErrorBoundary>
  );
};

export function getGoogleMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (typeof import.meta !== 'undefined' &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env
        ?.VITE_GOOGLE_MAPS_PLATFORM_KEY) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('domiclick_gmaps_key')) ||
    ''
  );
}

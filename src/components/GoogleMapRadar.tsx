import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { MotorizadoDriver, DeliveryOrder, type StaffRole } from '../types';
import { ChatWindow } from './chat/ChatWindow';
import { VILLAVICENCIO_CENTER } from '../data/villavicencio';
import { BRAND } from './brand/BrandAssets';
import { calculateOptimalRoute } from '../utils/routing';
import { isLiveOrderStatus } from '../lib/orderFlow';
import { Driver3DMarkersLayer } from './map/Driver3DMarkersLayer';
import {
  bearingDeg,
  pointAtAlong,
  projectOnPath,
  roadSignature,
  sliceFrom,
  sliceUntil,
  type RoadPoint,
} from '../lib/roadFollow';

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
};

type LatLng = { lat: number; lng: number };

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
function nearestTour(orders: DeliveryOrder[], start: LatLng): LatLng[] {
  const left: TourStop[] = [];
  for (const order of orders) {
    const pickup = { lat: order.pickupCoords.lat, lng: order.pickupCoords.lng, orderId: order.id, kind: 'pickup' as const };
    const drop = { lat: order.deliveryCoords.lat, lng: order.deliveryCoords.lng, orderId: order.id, kind: 'drop' as const };
    if (PICKUP_LEG.has(order.status)) left.push(pickup, drop);
    else left.push(drop);
  }
  const path: LatLng[] = [start];
  let cursor = start;
  while (left.length) {
    const open = left.filter(
      (stop) => stop.kind === 'pickup' || !left.some((other) => other.orderId === stop.orderId && other.kind === 'pickup'),
    );
    if (!open.length) break;
    let best = open[0];
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
    path.push({ lat: best.lat, lng: best.lng });
    cursor = { lat: best.lat, lng: best.lng };
    left.splice(left.indexOf(best), 1);
  }
  return path;
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
}: {
  orders: DeliveryOrder[];
  drivers: MotorizadoDriver[];
  onRoads?: (roads: Record<string, RoadPoint[]>) => void;
}) {
  const map = useMap();
  const linesRef = useRef<Record<string, Drawn & { color: string }>>({});
  const cacheRef = useRef<Record<string, LatLng[]>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const [cacheTick, setCacheTick] = useState(0);
  const fittedKeyRef = useRef('');
  const onRoadsRef = useRef(onRoads);
  onRoadsRef.current = onRoads;
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
    const bounds = new google.maps.LatLngBounds();
    let anyPath = false;

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

    const upsert = (id: string, path: LatLng[], color: string, z: number) => {
      if (path.length < 2) return;
      keep[id] = true;
      const existing = linesRef.current[id];
      if (existing && existing.color === color) {
        existing.glow.setPath(path);
        existing.line.setPath(path);
        return;
      }
      existing?.glow.setMap(null);
      existing?.line.setMap(null);
      const glow = new google.maps.Polyline({
        path,
        geodesic: false,
        strokeColor: color,
        strokeOpacity: 0.22,
        strokeWeight: 12,
        map,
        zIndex: z,
      });
      const line = new google.maps.Polyline({
        path,
        geodesic: false,
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
      linesRef.current[id] = { glow, line, color };
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
      const stops = nearestTour(group, loc);
      const tourStops = stops.slice(1);
      let stable: LatLng[] = [];
      for (let i = 0; i < tourStops.length - 1; i++) {
        const from = tourStops[i];
        const to = tourStops[i + 1];
        const key = `chain:${driverId}:${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
        remember(key, from, to);
        const segment = cacheRef.current[key] || [from, to];
        stable = stable.length ? [...stable, ...segment.slice(1)] : [...segment];
      }
      if (stable.length >= 2) roads[driverId] = stable;
      const snap = stable.length >= 2 ? projectOnPath(stable, loc) : null;
      const onRoad = Boolean(snap && snap.metersOff <= ROAD_SNAP_M);
      const ahead = onRoad && snap ? sliceFrom(stable, snap.along) : stable;
      const traveled = onRoad && snap ? sliceUntil(stable, snap.along) : [];
      if (traveled.length >= 2) {
        upsert(`chain:${driverId}:trail`, traveled, '#8AA0B4', 24);
        traveled.forEach((point) => bounds.extend(point));
      }
      if (ahead.length >= 2) {
        upsert(`chain:${driverId}`, ahead, ROUTE_COLOR_EN_PROCESO, 70);
        ahead.forEach((point) => bounds.extend(point));
        bounds.extend(loc);
        anyPath = true;
      }
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
        upsert(`${order.id}:corridor`, corridor, ROUTE_COLOR_EN_PROCESO, 30);
        corridor.forEach((p) => bounds.extend(p));
        const navKey = `${order.id}:nav:pickup:${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;
        remember(navKey, loc, pickup);
        const nav = cacheRef.current[navKey] || [loc, pickup];
        const visible = remainingRoute(nav, loc);
        upsert(`${order.id}:nav`, visible, ROUTE_COLOR_RECOGIDA, 60);
        visible.forEach((p) => bounds.extend(p));
        bounds.extend(loc);
      } else if (kind === 'proceso' && loc && (DELIVERY_LEG.has(order.status) || order.status !== 'pending')) {
        const navKey = `${order.id}:nav:drop:${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;
        remember(navKey, loc, dropoff);
        const nav = cacheRef.current[navKey] || [loc, dropoff];
        const visible = remainingRoute(nav, loc);
        upsert(`${order.id}:nav`, visible, ROUTE_COLOR_EN_PROCESO, 60);
        visible.forEach((p) => bounds.extend(p));
        bounds.extend(loc);
      } else {
        const color = routeColor(kind);
        upsert(`${order.id}:corridor`, corridor, color, kind === 'proceso' ? 40 : 20);
        corridor.forEach((p) => bounds.extend(p));
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
      map.fitBounds(bounds, 72);
    }
  }, [map, routeOrders, progressKey, drivers, cacheTick]);

  useEffect(() => {
    const lines = linesRef.current;
    return () => {
      Object.values(lines).forEach((drawn) => {
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
  const [pos, setPos] = useState<Record<string, RoadPoint>>({});
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
    if (roadKey !== roadKeyRef.current) {
      roadKeyRef.current = roadKey;
      alongRef.current = {};
    }
    const from: Record<string, number> = {};
    const to: Record<string, number> = {};
    const dur: Record<string, number> = {};
    const pathOf: Record<string, RoadPoint[]> = {};
    const raw: Record<string, RoadPoint> = {};

    for (const driver of drivers) {
      const loc = driver.location;
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
      raw[driver.id] = { lat: loc.lat, lng: loc.lng };
      const path = roads[driver.id];
      const proj = path && path.length >= 2 ? projectOnPath(path, loc) : null;
      if (!path || !proj || proj.metersOff > ROAD_SNAP_M) {
        alongRef.current[driver.id] = Number.NaN;
        continue;
      }
      pathOf[driver.id] = path;
      const prev = alongRef.current[driver.id];
      from[driver.id] = Number.isFinite(prev) ? prev : proj.along;
      to[driver.id] = proj.along;
      const delta = Math.abs(to[driver.id] - from[driver.id]);
      dur[driver.id] = Math.min(8000, Math.max(900, delta * 55));
    }

    const tick = (now: number) => {
      if (!alive) return;
      const next: Record<string, RoadPoint> = {};
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
        next[id] = pointAtAlong(path, along);
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
    let heading = driver.location.heading;
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
  const [roads, setRoads] = useState<Record<string, RoadPoint[]>>({});
  const acceptRoads = useCallback((next: Record<string, RoadPoint[]>) => {
    setRoads(next);
  }, []);
  const shown = useStreetGlide(located, roads);
  const [model3dReady, setModel3dReady] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const picked = located.find((d) => d.id === pickedId) || null;

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);

  const solicitudCount = orders.filter((o) => o.status === 'pending').length;
  const procesoCount = orders.filter((o) => isLiveOrderStatus(o.status)).length;

  return (
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
          <StreetRoutesLayer orders={orders} drivers={liveDrivers} onRoads={acceptRoads} />
          <Driver3DMarkersLayer drivers={shown} onModelReady={setModel3dReady} />

          {shown.map((driver) => {
            const fresh = gpsFreshness(driver.location?.updatedAt, nowMs);
            const live = fresh.live;
            const stopped = live && driver.location?.moving === false;
            const moving = live && driver.location?.moving === true;
            const color = !live || stopped ? '#FFB300' : '#00E676';
            const motion = !live ? fresh.text : stopped ? 'Detenido' : moving ? 'En movimiento' : 'EN VIVO';
            return (
              <AdvancedMarker
                key={driver.id}
                position={{ lat: driver.location.lat, lng: driver.location.lng }}
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
            const kind = routeKind(order.status);
            if (!kind || !order.pickupCoords || !order.deliveryCoords) return null;
            const color = routeColor(kind);
            return (
              <React.Fragment key={order.id}>
                <AdvancedMarker
                  position={{
                    lat: order.pickupCoords.lat,
                    lng: order.pickupCoords.lng,
                  }}
                  title={`${order.trackingCode || order.id} · Recolección`}
                >
                  <div
                    className="pointer-events-none flex items-center justify-center"
                    style={{ width: 16, height: 16, transform: 'translateY(50%)' }}
                  >
                    <div
                      className="h-3 w-3 rounded-full border-2 border-white"
                      style={{
                        background: color,
                        boxShadow: `0 0 0 1px ${color}, 0 1px 4px rgba(0,0,0,.55)`,
                      }}
                    />
                  </div>
                </AdvancedMarker>
                <AdvancedMarker
                  position={{
                    lat: order.deliveryCoords.lat,
                    lng: order.deliveryCoords.lng,
                  }}
                  title={`${order.trackingCode || order.id} · Entrega`}
                >
                  <div
                    className="pointer-events-none flex items-center justify-center"
                    style={{ width: 18, height: 18, transform: 'translateY(50%)' }}
                  >
                    <div
                      className="h-3.5 w-3.5 rounded-sm border-2 border-white"
                      style={{
                        background: color,
                        boxShadow: `0 0 0 1px ${color}, 0 1px 4px rgba(0,0,0,.55)`,
                      }}
                    />
                  </div>
                </AdvancedMarker>
              </React.Fragment>
            );
          })}
        </Map>
      </APIProvider>

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
              Entrega <span className="text-slate-400">({procesoCount})</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-1 w-6 rounded-full"
              style={{
                background: ROUTE_COLOR_RECOGIDA,
                boxShadow: `0 0 6px ${ROUTE_COLOR_RECOGIDA}`,
              }}
            />
            <span>Navegación en vivo</span>
          </div>
          <div className="flex items-center gap-2 pt-0.5 text-[9px] text-slate-500">
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

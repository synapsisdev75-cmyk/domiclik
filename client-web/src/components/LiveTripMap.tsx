import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { APIProvider, Map, AdvancedMarker, useApiIsLoaded, useMap } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID } from '../lib/config';
import { estimateRoute, estimateTourRoute, VILLAVICENCIO_CENTER } from '../lib/geo';
import { pointAtAlong, projectOnPath, roadSignature } from '../lib/roadFollow';
import { normalizeHeading } from '../lib/headingSmooth';
import {
  startHybridOrientation,
  type NavMapMode,
} from '../lib/driverOrientation';
import { MotoMarker3D, motoSizeForZoom } from './MotoMarker3D';

type LatLng = { lat: number; lng: number };

/** Parada de ruta unida: R = recogida (naranja), E = entrega (azul). */
export type MapTourStop = LatLng & {
  kind?: 'pickup' | 'drop';
  orderId?: string;
  /** Orden de visita en la ruta (1, 2, 3… estilo Route4Me). */
  visitSeq?: number;
};

export type MapStopPick = {
  orderId: string;
  label: string;
  kind: 'pickup' | 'drop';
  visitSeq?: number;
};

const PIN_RECOGIDA = '#FF5722';
const PIN_ENTREGA = '#2B6CFF';
const ROUTE_JOINED = '#00B0FF';

type LiveTripMapProps = {
  pickup?: LatLng | null;
  delivery?: LatLng | null;
  driver?: LatLng | null;
  heightClass?: string;
  /** Ocupa todo el contenedor (el mapa deja de quedar en un recuadro). */
  fill?: boolean;
  /** Al cambiar, centra el mapa en el repartidor con zoom cercano. */
  focusSeq?: number;
  /**
   * Modo “mi ubicación” estilo Google Maps: el mapa sigue el GPS.
   * Si el usuario arrastra el mapa, el padre debe poner esto en false.
   */
  followMe?: boolean;
  /** Rumbo GPS (0–360) del transportista. */
  driverHeading?: number | null;
  /** true = el GPS detecta avance (punta = movimiento hacia delante). */
  driverMoving?: boolean;
  /** Velocidad m/s (Geolocation) para motor híbrido brújula/GPS. */
  driverSpeedMps?: number | null;
  /**
   * free = norte arriba (moto rota sola);
   * headingUp = mapa sigue el rumbo (modo conducción).
   */
  navMode?: NavMapMode;
  /** Al incrementar, reinicia y recalibra la brújula del pin. */
  calibrateSeq?: number;
  /** Rumbo suavizado de la moto (para UI / heading-up). */
  onDriverHeadingSmooth?: (headingDeg: number) => void;
  /** Se dispara cuando el usuario mueve el mapa a mano (sale del seguimiento). */
  onFollowBreak?: () => void;
  /** Estado del pedido: la recogida y la entrega no se recortan entre sí. */
  status?: string;
  /** Ruta ya ordenada (moto → paradas). Si viene, el mapa de DomiClick la dibuja unida. */
  tour?: MapTourStop[];
  /**
   * Pines visibles R/E (hasta 3 pedidos). Si viene, se muestran todos
   * aunque la ruta unida ya no visite una recogida hecha.
   */
  stops?: Array<MapTourStop & { index?: number }>;
  /** Pedido del pin suelto R/E cuando no hay ruta unida. */
  orderId?: string | null;
  /** Al tocar un pin R/E o el tramo de esa parada. */
  onPickStop?: (stop: MapStopPick) => void;
  /**
   * Centra el mapa en una parada (p. ej. al tocar 1/R1 en la hoja).
   * Incrementar `seq` para repetir el pan aunque sean las mismas coords.
   */
  focusStop?: (LatLng & { seq: number }) | null;
};

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

const PICKUP_LEG = new Set(['assigned', 'accepted', 'en_route_origin', 'at_origin']);
const DELIVERY_LEG = new Set(['picked_up', 'in_transit', 'at_destination']);

function StretchMap() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const id = window.setTimeout(() => {
      google.maps.event.trigger(map, 'resize');
    }, 200);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

/** Gestos básicos (sin forzar heading/tilt: en raster rompe y deja el mapa verde). */
function UnlockMapGestures() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    try {
      map.setOptions({
        gestureHandling: 'greedy',
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
    } catch {
      /* ignore */
    }
    const id = window.setTimeout(() => {
      try {
        google.maps.event.trigger(map, 'resize');
        const c = map.getCenter?.();
        if (c) map.setCenter(c);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

function FocusDriver({ driver, focusSeq }: { driver?: LatLng | null; focusSeq: number }) {
  const map = useMap();
  const driverRef = useRef(driver);
  driverRef.current = driver;
  useEffect(() => {
    if (!map || focusSeq < 1) return;
    const target = driverRef.current;
    if (!target) return;
    map.panTo(target);
    map.setZoom(17);
  }, [map, focusSeq]);
  return null;
}

/** Centra en una parada R/E al seleccionarla desde la hoja (solo info, sin abrir Maps). */
function FocusStop({
  focusStop,
}: {
  focusStop?: (LatLng & { seq: number }) | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || !focusStop || focusStop.seq < 1) return;
    if (!Number.isFinite(focusStop.lat) || !Number.isFinite(focusStop.lng)) return;
    map.panTo({ lat: focusStop.lat, lng: focusStop.lng });
    map.setZoom(17);
  }, [map, focusStop?.seq, focusStop?.lat, focusStop?.lng]);
  return null;
}

/** Sigue el GPS solo en modo “Ubicarme”; no altera la orientación de la moto. */
function FollowLive({
  driver,
  followMe,
  followGateRef,
}: {
  driver?: LatLng | null;
  followMe?: boolean;
  followGateRef: MutableRefObject<boolean>;
}) {
  const map = useMap();
  const seen = useRef('');
  useEffect(() => {
    followGateRef.current = Boolean(followMe);
    if (!followMe) {
      seen.current = '';
      return;
    }
    if (!map || !driver) return;
    if (!followGateRef.current) return;
    const key = `${driver.lat.toFixed(4)},${driver.lng.toFixed(4)}`;
    if (seen.current === key) return;
    const first = seen.current === '';
    seen.current = key;
    if (!followGateRef.current) return;
    map.panTo(driver);
    if (first) map.setZoom(17);
  }, [map, driver, followMe, followGateRef]);
  return null;
}

/**
 * Norte arriba vs conducción. En mapas raster setHeading no aplica:
 * no lo llamamos para no romper el pintado de tiles.
 */
function NavModeController({
  navMode,
  headingDeg,
}: {
  navMode: NavMapMode;
  headingDeg: number | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    let vector = false;
    try {
      const rt = String(
        (map as google.maps.Map & { getRenderingType?: () => string }).getRenderingType?.() || '',
      );
      vector = rt === 'VECTOR';
    } catch {
      vector = false;
    }
    if (!vector) return;
    if (navMode === 'free') {
      try {
        map.setHeading(0);
        map.setTilt(0);
      } catch {
        /* ignore */
      }
      return;
    }
    if (headingDeg == null || !Number.isFinite(headingDeg)) return;
    try {
      map.setHeading(normalizeHeading(headingDeg));
    } catch {
      /* ignore */
    }
  }, [map, navMode, headingDeg]);
  return null;
}

/**
 * Cualquier gesto manual corta “Ubicarme” de inmediato (ref + callback),
 * para que el GPS no vuelva a pegar el mapa.
 */
function BreakFollowOnGesture({
  followMe,
  followGateRef,
  onFollowBreak,
}: {
  followMe?: boolean;
  followGateRef: MutableRefObject<boolean>;
  onFollowBreak?: () => void;
}) {
  const map = useMap();
  const breakRef = useRef(onFollowBreak);
  breakRef.current = onFollowBreak;

  useEffect(() => {
    if (!map) return;
    let broken = false;
    let armedHeading = false;
    const armId = window.setTimeout(() => {
      armedHeading = true;
    }, 700);

    const breakFollow = () => {
      if (!followGateRef.current && !followMe) return;
      if (broken) return;
      broken = true;
      // Corta el panTo del GPS al instante (antes del re-render).
      followGateRef.current = false;
      breakRef.current?.();
    };

    const onHeadingOrTilt = () => {
      if (armedHeading && followGateRef.current) breakFollow();
    };

    const listeners = [
      map.addListener('dragstart', breakFollow),
      map.addListener('drag', breakFollow),
      map.addListener('heading_changed', onHeadingOrTilt),
      map.addListener('tilt_changed', onHeadingOrTilt),
    ];
    const div = map.getDiv?.();
    const onTouch = (ev: TouchEvent) => {
      if (!followGateRef.current) return;
      // 1 dedo en movimiento o 2+ = el usuario quiere ver el mapa, no el follow.
      if (ev.touches.length >= 1) breakFollow();
    };
    const onWheel = () => breakFollow();
    // touchstart corta demasiado pronto al solo tocar Ubicarme area... only when follow is on
    div?.addEventListener('touchmove', onTouch, { passive: true });
    div?.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.clearTimeout(armId);
      for (const listener of listeners) google.maps.event.removeListener(listener);
      div?.removeEventListener('touchmove', onTouch);
      div?.removeEventListener('wheel', onWheel);
    };
  }, [map, followMe, followGateRef]);
  return null;
}

function FitBounds({ points, paused }: { points: LatLng[]; paused?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!map || paused || points.length === 0) return;
    const valid = points.filter(
      (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0),
    );
    if (!valid.length) return;
    try {
      if (valid.length === 1) {
        map.panTo(valid[0]);
        map.setZoom(15);
        return;
      }
      const bounds = new google.maps.LatLngBounds();
      valid.forEach((p) => bounds.extend(p));
      if (!bounds.isEmpty()) map.fitBounds(bounds, 56);
    } catch (err) {
      console.warn('[LiveTripMap] fitBounds omitido', err);
    }
  }, [map, points, paused]);
  return null;
}

function RoadLine({
  path,
  color,
  onPickAt,
}: {
  path: LatLng[];
  color: string;
  onPickAt?: (at: LatLng) => void;
}) {
  const map = useMap();
  const pathKey = path.length >= 2 ? roadSignature(path) : '';
  const pickRef = useRef(onPickAt);
  pickRef.current = onPickAt;
  useEffect(() => {
    if (!map || path.length < 2) return;
    const pick = (event: google.maps.MapMouseEvent) => {
      const at = event.latLng;
      if (!at || !pickRef.current) return;
      pickRef.current({ lat: at.lat(), lng: at.lng() });
    };
    const casing = new google.maps.Polyline({
      path,
      map,
      geodesic: false,
      clickable: Boolean(onPickAt),
      strokeColor: '#0B1220',
      strokeOpacity: 0.92,
      strokeWeight: 11,
      zIndex: 40,
    });
    const line = new google.maps.Polyline({
      path,
      map,
      geodesic: false,
      clickable: Boolean(onPickAt),
      strokeColor: color,
      strokeOpacity: 1,
      strokeWeight: 6,
      zIndex: 41,
    });
    const listeners = onPickAt ? [casing.addListener('click', pick), line.addListener('click', pick)] : [];
    return () => {
      listeners.forEach((listener) => listener.remove());
      line.setMap(null);
      casing.setMap(null);
    };
  }, [map, pathKey, color, path, Boolean(onPickAt)]);
  return null;
}

/**
 * Pin estilo Route4Me: número de visita grande + distintivo R/E DomiClick.
 * Color: naranja recogida / azul entrega.
 */
function Pin({
  number,
  badge,
  color,
  ink,
}: {
  number: string;
  badge?: string;
  color: string;
  ink: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="flex min-w-[2.35rem] flex-col items-center rounded-xl border-[3px] border-white px-2 py-1 text-center shadow-xl"
        style={{ background: color, color: ink, boxShadow: `0 0 0 2px ${color}` }}
      >
        <span className="text-[15px] font-black leading-none tracking-tight">{number}</span>
        {badge ? (
          <span className="mt-0.5 text-[9px] font-black uppercase leading-none opacity-95">{badge}</span>
        ) : null}
      </div>
      <div className="h-3 w-3 -translate-y-1.5 rotate-45 border-2 border-white" style={{ background: color }} />
    </div>
  );
}

/**
 * Número = orden de visita (1,2,3…). Badge = R1/E2 (identidad del pedido).
 * `index` = slot del pedido; `visitSeq` = secuencia de la ruta óptima.
 */
function tourStopVisual(
  stops: Array<MapTourStop & { index?: number }>,
): Array<{
  point: MapTourStop;
  number: string;
  badge: string;
  label: string;
  color: string;
  title: string;
  kind: 'pickup' | 'drop';
  visitSeq: number;
}> {
  let r = 0;
  let e = 0;
  return stops.map((point, i) => {
    const isPickup = point.kind === 'pickup';
    const visitSeq = point.visitSeq ?? i + 1;
    if (isPickup) {
      r += 1;
      const n = point.index ?? r;
      const badge = `R${n}`;
      return {
        point,
        number: String(visitSeq),
        badge,
        label: badge,
        color: PIN_RECOGIDA,
        title: `Parada ${visitSeq} · Recogida ${n}`,
        kind: 'pickup' as const,
        visitSeq,
      };
    }
    e += 1;
    const n = point.index ?? e;
    const badge = `E${n}`;
    return {
      point,
      number: String(visitSeq),
      badge,
      label: badge,
      color: PIN_ENTREGA,
      title: `Parada ${visitSeq} · Entrega ${n}`,
      kind: 'drop' as const,
      visitSeq,
    };
  });
}

function useRoadPin(driver: LatLng | null | undefined, path: LatLng[] | null | undefined) {
  const alongRef = useRef<number | null>(null);
  const roadRef = useRef('');
  const [pos, setPos] = useState<LatLng | null>(null);
  const pathKey = path && path.length >= 2 ? roadSignature(path) : '';
  const driverKey = driver ? `${driver.lat.toFixed(5)},${driver.lng.toFixed(5)}` : '';

  useEffect(() => {
    if (!driver) return;
    if (!path || path.length < 2) {
      setPos(driver);
      return;
    }
    if (pathKey !== roadRef.current) {
      roadRef.current = pathKey;
      alongRef.current = null;
    }
    const proj = projectOnPath(path, driver);
    if (!proj || proj.metersOff > 450) {
      alongRef.current = null;
      setPos(driver);
      return;
    }
    const from = alongRef.current ?? proj.along;
    const to = proj.along;
    const started = performance.now();
    const dur = Math.min(8000, Math.max(900, Math.abs(to - from) * 55));
    let raf = 0;
    let alive = true;
    const tick = (now: number) => {
      if (!alive) return;
      const t = Math.min(1, (now - started) / dur);
      const eased = t * t * (3 - 2 * t);
      const along = from + (to - from) * eased;
      alongRef.current = along;
      setPos(pointAtAlong(path, along));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // driverKey y pathKey cubren el GPS y la calle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverKey, pathKey]);

  return pos || driver || null;
}

/** Fallback 2D si WebGLOverlayView no está disponible en el dispositivo. */
function DriverMotoPinFallback({
  driverHeading,
  driverSpeedMps,
  calibrateSeq = 0,
  onHeadingChange,
}: {
  driverHeading?: number | null;
  driverSpeedMps?: number | null;
  calibrateSeq?: number;
  onHeadingChange?: (h: number) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(16);
  const [mapHeading, setMapHeading] = useState(0);
  const [pinHeading, setPinHeading] = useState<number | null>(null);

  useEffect(() => {
    if (!map) return;
    const sync = () => {
      try {
        setZoom(map.getZoom?.() ?? 16);
        setMapHeading(normalizeHeading(map.getHeading?.() || 0));
      } catch {
        /* ignore */
      }
    };
    sync();
    const zoomL = map.addListener('zoom_changed', sync);
    const headL = map.addListener('heading_changed', sync);
    return () => {
      google.maps.event.removeListener(zoomL);
      google.maps.event.removeListener(headL);
    };
  }, [map]);

  useEffect(() => {
    const orientation = startHybridOrientation({
      onHeading: (h) => {
        setPinHeading(h);
        onHeadingChange?.(h);
      },
    });
    orientation.setGps(driverHeading ?? null, driverSpeedMps ?? null);
    if (calibrateSeq > 0) orientation.recalibrate();
    return () => orientation.stop();
  }, [driverHeading, driverSpeedMps, calibrateSeq, onHeadingChange]);

  return (
    <MotoMarker3D
      headingDeg={pinHeading ?? driverHeading ?? 0}
      mapHeadingDeg={mapHeading}
      sizePx={motoSizeForZoom(zoom)}
      calibrateKey={calibrateSeq}
    />
  );
}

function LiveTripMapCanvas({
  pickup,
  delivery,
  driver,
  focusSeq = 0,
  followMe = false,
  driverHeading = null,
  driverMoving: _driverMoving = false,
  driverSpeedMps = null,
  navMode = 'free',
  calibrateSeq = 0,
  onDriverHeadingSmooth,
  onFollowBreak,
  status,
  tour,
  stops,
  orderId,
  onPickStop,
  focusStop = null,
}: Omit<LiveTripMapProps, 'heightClass' | 'fill'>) {
  const mapsReady = useApiIsLoaded();
  /** false al instante cuando el usuario toca el mapa (antes del re-render). */
  const followGateRef = useRef(Boolean(followMe));
  followGateRef.current = Boolean(followMe);
  const [smoothHeading, setSmoothHeading] = useState<number | null>(null);
  const onHeadingSmoothRef = useRef(onDriverHeadingSmooth);
  onHeadingSmoothRef.current = onDriverHeadingSmooth;

  const handleMotoHeading = (h: number) => {
    setSmoothHeading(h);
    onHeadingSmoothRef.current?.(h);
  };
  const points = useMemo(() => {
    const list: LatLng[] = [];
    if (stops && stops.length > 0) {
      for (const stop of stops) list.push(stop);
    } else {
      if (pickup) list.push(pickup);
      if (delivery) list.push(delivery);
    }
    if (driver) list.push(driver);
    return list;
  }, [pickup, delivery, driver, stops]);

  const [street, setStreet] = useState<LatLng[] | null>(null);
  const [approach, setApproach] = useState<LatLng[] | null>(null);
  const [liveNav, setLiveNav] = useState<LatLng[] | null>(null);
  const [tourPath, setTourPath] = useState<LatLng[] | null>(null);
  const goingToPickup = Boolean(status && PICKUP_LEG.has(status));
  const onDelivery = Boolean(status && DELIVERY_LEG.has(status));

  const pickupLat = pickup?.lat;
  const pickupLng = pickup?.lng;
  const deliveryLat = delivery?.lat;
  const deliveryLng = delivery?.lng;

  useEffect(() => {
    if (!mapsReady) return;
    if (pickupLat == null || pickupLng == null || deliveryLat == null || deliveryLng == null) {
      setStreet(null);
      return;
    }
    let cancel = false;
    void estimateRoute({ lat: pickupLat, lng: pickupLng }, { lat: deliveryLat, lng: deliveryLng }).then(
      (route) => {
        if (!cancel && route.path.length >= 2) setStreet(route.path);
      },
    );
    return () => {
      cancel = true;
    };
  }, [mapsReady, pickupLat, pickupLng, deliveryLat, deliveryLng]);

  const approachKey =
    goingToPickup && driver ? `${driver.lat.toFixed(3)},${driver.lng.toFixed(3)}` : '';
  const deliveryNavKey =
    onDelivery && driver ? `${driver.lat.toFixed(3)},${driver.lng.toFixed(3)}` : '';

  useEffect(() => {
    if (!mapsReady) return;
    if (!approachKey || pickupLat == null || pickupLng == null) {
      setApproach(null);
      return;
    }
    const [lat, lng] = approachKey.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let cancel = false;
    void estimateRoute({ lat, lng }, { lat: pickupLat, lng: pickupLng }).then((route) => {
      if (!cancel && route.path.length >= 2) setApproach(route.path);
    });
    return () => {
      cancel = true;
    };
  }, [mapsReady, approachKey, pickupLat, pickupLng]);

  useEffect(() => {
    if (!mapsReady) return;
    if (!deliveryNavKey || deliveryLat == null || deliveryLng == null) {
      setLiveNav(null);
      return;
    }
    const [lat, lng] = deliveryNavKey.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let cancel = false;
    void estimateRoute({ lat, lng }, { lat: deliveryLat, lng: deliveryLng }).then((route) => {
      if (!cancel && route.path.length >= 2) setLiveNav(route.path);
    });
    return () => {
      cancel = true;
    };
  }, [mapsReady, deliveryNavKey, deliveryLat, deliveryLng]);

  const tourKey = (tour || [])
    .map((point) => `${point.kind || 'x'}:${point.lat.toFixed(4)},${point.lng.toFixed(4)}`)
    .join('|');

  useEffect(() => {
    const stops = (tour || []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (stops.length < 2) {
      setTourPath(null);
      return;
    }
    // Mientras llega la geometría por calles, dibuja el orden de paradas (sin cruzar lógica R/E).
    setTourPath(stops);
    if (!mapsReady) return;
    let cancel = false;
    void estimateTourRoute(stops).then((route) => {
      if (cancel) return;
      if (route.path.length >= 2) setTourPath(route.path);
    });
    return () => {
      cancel = true;
    };
  }, [tourKey, mapsReady]);

  const closed = status === 'delivered' || status === 'cancelled';
  const joined = Boolean(tour && tour.length >= 2);

  const deliveryPath = useMemo(() => {
    if (joined) {
      const full = tourPath && tourPath.length >= 2 ? tourPath : tour || [];
      return driver ? remainingRoute(full, driver) : full;
    }
    if (closed || !pickup || !delivery) return [];
    if (onDelivery && driver) {
      const full = liveNav && liveNav.length >= 2 ? liveNav : [driver, delivery];
      return remainingRoute(full, driver);
    }
    const full = street && street.length >= 2 ? street : [pickup, delivery];
    if (goingToPickup) return full;
    if (driver) return remainingRoute(full, driver);
    return full;
  }, [joined, tour, tourPath, driver, closed, pickup, delivery, street, liveNav, onDelivery, goingToPickup]);

  const stickPath =
    joined && tourPath && tourPath.length >= 2
      ? tourPath
      : onDelivery && liveNav && liveNav.length >= 2
        ? liveNav
        : street && street.length >= 2
          ? street
          : null;
  const roadDriver = useRoadPin(driver, stickPath);

  const pickupPath = useMemo(() => {
    if (joined) return [];
    if (!goingToPickup || !driver || !pickup) return [];
    const full = approach && approach.length >= 2 ? approach : [driver, pickup];
    return remainingRoute(full, driver);
  }, [joined, goingToPickup, driver, pickup, approach]);

  const center = driver || pickup || delivery || stops?.[0] || VILLAVICENCIO_CENTER;
  const routeColor = joined ? ROUTE_JOINED : PIN_ENTREGA;
  // Pines: todos los R/E del lote (hasta 3). Si no hay stops, usa la ruta unida o el pedido suelto.
  const visuals =
    stops && stops.length > 0
      ? tourStopVisual(stops)
      : joined && tour
        ? tourStopVisual(tour.slice(driver ? 1 : 0))
        : [];
  const showLoosePins = visuals.length === 0;
  const pickAt = (at: LatLng) => {
    if (!onPickStop) return;
    let best = visuals[0];
    let bestD = Infinity;
    for (const stop of visuals) {
      if (!stop.point.orderId) continue;
      const dLat = stop.point.lat - at.lat;
      const dLng = stop.point.lng - at.lng;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) {
        bestD = d;
        best = stop;
      }
    }
    if (best?.point.orderId) {
      onPickStop({
        orderId: best.point.orderId,
        label: best.label,
        kind: best.kind,
        visitSeq: best.visitSeq,
      });
      return;
    }
    if (orderId) onPickStop({ orderId, label: 'Pedido', kind: 'drop' });
  };

  return (
    <Map
      defaultCenter={center}
      defaultZoom={driver ? 16 : 13}
      mapId={GOOGLE_MAPS_MAP_ID}
      // Sin forzar VECTOR: en muchos Android WebGL falla y el mapa queda en verde vacío.
      gestureHandling="greedy"
      disableDefaultUI
      clickableIcons={false}
      draggable
      scrollwheel
      disableDoubleClickZoom={false}
      zoomControl
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={false}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      }}
      className="domi-live-map"
    >
      <StretchMap />
      <UnlockMapGestures />
      <FitBounds
        points={points}
        paused={followMe || focusSeq > 0 || Boolean(focusStop?.seq) || Boolean(driver)}
      />
      <FollowLive driver={driver} followMe={followMe} followGateRef={followGateRef} />
      <FocusDriver driver={driver} focusSeq={focusSeq} />
      <FocusStop focusStop={focusStop} />
      <NavModeController navMode={navMode} headingDeg={smoothHeading} />
      <BreakFollowOnGesture
        followMe={followMe}
        followGateRef={followGateRef}
        onFollowBreak={onFollowBreak}
      />
      <RoadLine path={deliveryPath} color={routeColor} onPickAt={onPickStop ? pickAt : undefined} />
      <RoadLine path={pickupPath} color={PIN_RECOGIDA} onPickAt={onPickStop ? pickAt : undefined} />
      {showLoosePins && pickup ? (
        <AdvancedMarker
          position={pickup}
          title="Recogida"
          onClick={() => orderId && onPickStop?.({ orderId, label: 'R', kind: 'pickup' })}
        >
          <Pin number="1" badge="R" color={PIN_RECOGIDA} ink="#fff" />
        </AdvancedMarker>
      ) : null}
      {visuals.map((stop, index) => (
        <AdvancedMarker
          key={`tour-${stop.badge}-${stop.visitSeq}-${index}-${stop.point.orderId || ''}-${stop.point.lat.toFixed(4)}`}
          position={stop.point}
          title={stop.title}
          zIndex={100 + stop.visitSeq}
          onClick={() =>
            stop.point.orderId &&
            onPickStop?.({
              orderId: stop.point.orderId,
              label: stop.label,
              kind: stop.kind,
              visitSeq: stop.visitSeq,
            })
          }
        >
          <Pin number={stop.number} badge={stop.badge} color={stop.color} ink="#fff" />
        </AdvancedMarker>
      ))}
      {showLoosePins && delivery ? (
        <AdvancedMarker
          position={delivery}
          title="Entrega"
          onClick={() => orderId && onPickStop?.({ orderId, label: 'E', kind: 'drop' })}
        >
          <Pin number="2" badge="E" color={PIN_ENTREGA} ink="#fff" />
        </AdvancedMarker>
      ) : null}
      {roadDriver ? (
        <AdvancedMarker position={roadDriver} title="Repartidor" zIndex={200}>
          <DriverMotoPinFallback
            driverHeading={driverHeading}
            driverSpeedMps={driverSpeedMps}
            calibrateSeq={calibrateSeq}
            onHeadingChange={handleMotoHeading}
          />
        </AdvancedMarker>
      ) : null}
    </Map>
  );
}

export function LiveTripMap({
  pickup,
  delivery,
  driver,
  heightClass = 'h-56',
  fill = false,
  focusSeq = 0,
  followMe = false,
  driverHeading = null,
  driverMoving = false,
  driverSpeedMps = null,
  navMode = 'free',
  calibrateSeq = 0,
  onDriverHeadingSmooth,
  onFollowBreak,
  status,
  tour,
  stops,
  orderId,
  onPickStop,
  focusStop = null,
}: LiveTripMapProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className={`${heightClass} flex items-center justify-center rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] text-xs text-[var(--domi-muted)]`}
      >
        Mapa no disponible
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden bg-[#d7e3d4] ${fill ? 'h-full min-h-0' : heightClass}`}
    >
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker', 'geometry', 'routes']}>
        <LiveTripMapCanvas
          pickup={pickup}
          delivery={delivery}
          driver={driver}
          focusSeq={focusSeq}
          followMe={followMe}
          driverHeading={driverHeading}
          driverMoving={driverMoving}
          driverSpeedMps={driverSpeedMps}
          navMode={navMode}
          calibrateSeq={calibrateSeq}
          onDriverHeadingSmooth={onDriverHeadingSmooth}
          onFollowBreak={onFollowBreak}
          status={status}
          tour={tour}
          stops={stops}
          orderId={orderId}
          onPickStop={onPickStop}
          focusStop={focusStop}
        />
      </APIProvider>
    </div>
  );
}

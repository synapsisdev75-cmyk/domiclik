import { useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID } from '../lib/config';
import { estimateRoute, VILLAVICENCIO_CENTER } from '../lib/geo';

type LatLng = { lat: number; lng: number };

type LiveTripMapProps = {
  pickup?: LatLng | null;
  delivery?: LatLng | null;
  driver?: LatLng | null;
  heightClass?: string;
  /** Ocupa todo el contenedor (el mapa deja de quedar en un recuadro). */
  fill?: boolean;
  /** Al cambiar, centra el mapa en el repartidor con zoom cercano. */
  focusSeq?: number;
  /** Estado del pedido: la recogida y la entrega no se recortan entre sí. */
  status?: string;
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

const PICKUP_LEG = new Set(['assigned', 'accepted', 'en_route_origin']);
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

function FocusDriver({ driver, focusSeq }: { driver?: LatLng | null; focusSeq: number }) {
  const map = useMap();
  const driverRef = useRef(driver);
  driverRef.current = driver;
  useEffect(() => {
    if (!map || focusSeq < 1) return;
    const target = driverRef.current;
    if (!target) return;
    map.panTo(target);
    map.setZoom(18);
  }, [map, focusSeq]);
  return null;
}

function FollowLive({ driver }: { driver?: LatLng | null }) {
  const map = useMap();
  const seen = useRef('');
  useEffect(() => {
    if (!map || !driver) return;
    const key = `${driver.lat.toFixed(5)},${driver.lng.toFixed(5)}`;
    if (seen.current === key) return;
    const first = seen.current === '';
    seen.current = key;
    map.panTo(driver);
    if (first) map.setZoom(16);
  }, [map, driver]);
  return null;
}

function FitBounds({ points, paused }: { points: LatLng[]; paused?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!map || paused || points.length === 0) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 56);
  }, [map, points, paused]);
  return null;
}

function RoadLine({ path, color }: { path: LatLng[]; color: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || path.length < 2) return;
    const casing = new google.maps.Polyline({
      path,
      map,
      geodesic: false,
      strokeColor: '#111827',
      strokeOpacity: 0.9,
      strokeWeight: 10,
    });
    const line = new google.maps.Polyline({
      path,
      map,
      geodesic: false,
      strokeColor: color,
      strokeOpacity: 1,
      strokeWeight: 5,
    });
    return () => {
      line.setMap(null);
      casing.setMap(null);
    };
  }, [map, path, color]);
  return null;
}

function Pin({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="rounded-full border-[3px] border-white px-2.5 py-1 text-[11px] font-black text-white shadow-lg"
        style={{ background: color }}
      >
        {label}
      </div>
      <div className="h-2 w-2 -translate-y-1 rotate-45" style={{ background: color }} />
    </div>
  );
}

export function LiveTripMap({
  pickup,
  delivery,
  driver,
  heightClass = 'h-56',
  fill = false,
  focusSeq = 0,
  status,
}: LiveTripMapProps) {
  const points = useMemo(() => {
    const list: LatLng[] = [];
    if (pickup) list.push(pickup);
    if (delivery) list.push(delivery);
    if (driver) list.push(driver);
    return list;
  }, [pickup, delivery, driver]);

  const [street, setStreet] = useState<LatLng[] | null>(null);
  const [approach, setApproach] = useState<LatLng[] | null>(null);
  const goingToPickup = Boolean(status && PICKUP_LEG.has(status));
  const onDelivery = Boolean(status && DELIVERY_LEG.has(status));

  const pickupLat = pickup?.lat;
  const pickupLng = pickup?.lng;
  const deliveryLat = delivery?.lat;
  const deliveryLng = delivery?.lng;

  useEffect(() => {
    if (pickupLat == null || pickupLng == null || deliveryLat == null || deliveryLng == null) {
      setStreet(null);
      return;
    }
    let cancel = false;
    void estimateRoute({ lat: pickupLat, lng: pickupLng }, { lat: deliveryLat, lng: deliveryLng }).then(
      (route) => {
        if (!cancel) setStreet(route.path);
      }
    );
    return () => {
      cancel = true;
    };
  }, [pickupLat, pickupLng, deliveryLat, deliveryLng]);

  const approachKey =
    goingToPickup && driver ? `${driver.lat.toFixed(2)},${driver.lng.toFixed(2)}` : '';

  useEffect(() => {
    if (!approachKey || pickupLat == null || pickupLng == null) {
      setApproach(null);
      return;
    }
    const [lat, lng] = approachKey.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let cancel = false;
    void estimateRoute({ lat, lng }, { lat: pickupLat, lng: pickupLng }).then((route) => {
      if (!cancel) setApproach(route.path);
    });
    return () => {
      cancel = true;
    };
  }, [approachKey, pickupLat, pickupLng]);

  const closed = status === 'delivered' || status === 'cancelled';

  const deliveryPath = useMemo(() => {
    if (closed || !pickup || !delivery) return [];
    const full = street && street.length >= 2 ? street : [pickup, delivery];
    if (onDelivery && driver) return remainingRoute(full, driver);
    if (goingToPickup) return full;
    if (driver) return remainingRoute(full, driver);
    return full;
  }, [closed, pickup, delivery, driver, street, onDelivery, goingToPickup]);

  const pickupPath = useMemo(() => {
    if (!goingToPickup || !driver || !pickup) return [];
    const full = approach && approach.length >= 2 ? approach : [driver, pickup];
    return remainingRoute(full, driver);
  }, [goingToPickup, driver, pickup, approach]);

  const center = driver || pickup || delivery || VILLAVICENCIO_CENTER;

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
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          defaultCenter={center}
          defaultZoom={driver ? 16 : 13}
          mapId={GOOGLE_MAPS_MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <StretchMap />
          <FitBounds points={points} paused={focusSeq > 0 || Boolean(driver)} />
          <FollowLive driver={driver} />
          <FocusDriver driver={driver} focusSeq={focusSeq} />
          <RoadLine path={deliveryPath} color="#00E5FF" />
          <RoadLine path={pickupPath} color="#7CB518" />
          {pickup ? (
            <AdvancedMarker position={pickup} title="Recogida">
              <Pin label="Recogida" color="#2B6CFF" />
            </AdvancedMarker>
          ) : null}
          {delivery ? (
            <AdvancedMarker position={delivery} title="Entrega">
              <Pin label="Entrega" color="#FF5722" />
            </AdvancedMarker>
          ) : null}
          {driver ? (
            <AdvancedMarker
              key={`${driver.lat.toFixed(5)},${driver.lng.toFixed(5)}`}
              position={driver}
              title="Repartidor"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#00E676] text-sm shadow-[0_0_12px_rgba(0,230,118,0.6)]">
                🛵
              </div>
            </AdvancedMarker>
          ) : null}
        </Map>
      </APIProvider>
    </div>
  );
}

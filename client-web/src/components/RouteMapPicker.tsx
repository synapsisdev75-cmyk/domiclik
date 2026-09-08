import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import type { LatLng } from '../lib/geo';
import { VILLAVICENCIO_CENTER } from '../lib/geo';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID } from '../lib/config';

export type MapPickMode = 'pickup' | 'delivery' | null;

type RouteMapPickerProps = {
  pickup: LatLng | null;
  delivery: LatLng | null;
  path: LatLng[];
  pickMode: MapPickMode;
  routing?: boolean;
  /** True mientras el usuario arrastra un pin: no fitBounds ni pan automático. */
  pinDragging?: boolean;
  onPick: (point: LatLng) => void;
  onDragPickup: (point: LatLng) => void;
  onDragDelivery: (point: LatLng) => void;
  onDragStart?: (which: 'pickup' | 'delivery') => void;
  heightClass?: string;
};

function PinBadge({
  letter,
  color,
  caption,
}: {
  letter: string;
  color: string;
  caption: string;
}) {
  return (
    <div className="flex flex-col items-center" style={{ transform: 'translateY(8px)' }}>
      <div
        className="flex items-center justify-center select-none"
        style={{
          width: 34,
          height: 34,
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          background: color,
          border: '2px solid #fff',
          boxShadow: `0 0 0 1px ${color}, 0 4px 12px rgba(0,0,0,.55)`,
          cursor: 'grab',
        }}
      >
        <span
          style={{
            transform: 'rotate(45deg)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 13,
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          {letter}
        </span>
      </div>
      <span
        className="mt-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
        style={{ background: 'rgba(5,8,15,0.85)', border: `1px solid ${color}` }}
      >
        {caption}
      </span>
    </div>
  );
}

function RoadPolyline({ path, fit }: { path: LatLng[]; fit: boolean }) {
  const map = useMap();
  const glowRef = useRef<google.maps.Polyline | null>(null);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const lastFitKey = useRef('');

  useEffect(() => {
    if (!map || !(window as unknown as { google?: typeof google }).google?.maps) return;

    const clear = () => {
      glowRef.current?.setMap(null);
      lineRef.current?.setMap(null);
      glowRef.current = null;
      lineRef.current = null;
    };

    if (path.length < 2) {
      clear();
      return;
    }

    if (glowRef.current && lineRef.current) {
      glowRef.current.setPath(path);
      lineRef.current.setPath(path);
    } else {
      clear();
      glowRef.current = new google.maps.Polyline({
        path,
        geodesic: false,
        strokeColor: '#00E5FF',
        strokeOpacity: 0.35,
        strokeWeight: 10,
        map,
        zIndex: 1,
        clickable: false,
      });
      lineRef.current = new google.maps.Polyline({
        path,
        geodesic: false,
        strokeColor: '#00E5FF',
        strokeOpacity: 1,
        strokeWeight: 5,
        map,
        zIndex: 2,
        clickable: false,
      });
    }

    const key = `${path[0].lat.toFixed(3)},${path[0].lng.toFixed(3)}>${path[path.length - 1].lat.toFixed(3)},${path[path.length - 1].lng.toFixed(3)}`;
    if (fit && key !== lastFitKey.current) {
      lastFitKey.current = key;
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 80);
    }

    return () => {
      /* keep polylines until unmount / empty path */
    };
  }, [map, path, fit]);

  useEffect(() => {
    return () => {
      glowRef.current?.setMap(null);
      lineRef.current?.setMap(null);
      glowRef.current = null;
      lineRef.current = null;
    };
  }, [map]);

  return null;
}

function FocusPins({
  pickup,
  delivery,
  skipFit,
}: {
  pickup: LatLng | null;
  delivery: LatLng | null;
  skipFit: boolean;
}) {
  const map = useMap();
  const last = useRef('');

  useEffect(() => {
    if (!map || skipFit) return;
    // Redondeo grueso: no recentrar por micro-movimientos
    const key = `${pickup?.lat.toFixed(3)},${pickup?.lng.toFixed(3)}|${delivery?.lat.toFixed(3)},${delivery?.lng.toFixed(3)}`;
    if (key === last.current) return;
    last.current = key;

    if (pickup && delivery) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(pickup);
      bounds.extend(delivery);
      map.fitBounds(bounds, 80);
      return;
    }
    const one = pickup || delivery;
    if (one) {
      map.panTo(one);
      if ((map.getZoom() || 13) < 15) map.setZoom(16);
    }
  }, [map, pickup, delivery, skipFit]);

  return null;
}

function MapClickHandler({
  pickMode,
  onPick,
  enabled,
}: {
  pickMode: MapPickMode;
  onPick: (point: LatLng) => void;
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !enabled) return;
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!pickMode || !e.latLng) return;
      onPick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    return () => listener.remove();
  }, [map, pickMode, onPick, enabled]);

  useEffect(() => {
    if (!map) return;
    map.setOptions({
      draggableCursor: enabled && pickMode ? 'crosshair' : undefined,
      gestureHandling: enabled ? 'greedy' : 'none',
    });
  }, [map, pickMode, enabled]);

  return null;
}

function InnerMap(props: RouteMapPickerProps) {
  const {
    pickup,
    delivery,
    path,
    pickMode,
    routing,
    pinDragging = false,
    onPick,
    onDragPickup,
    onDragDelivery,
    onDragStart,
  } = props;

  const [localDragging, setLocalDragging] = useState(false);
  const dragging = pinDragging || localDragging;
  const lockCamera = dragging || Boolean(routing);

  const center = useMemo(() => {
    if (pickup) return pickup;
    if (delivery) return delivery;
    return VILLAVICENCIO_CENTER;
  }, [pickup, delivery]);

  const roadPath = !dragging && path.length >= 2 ? path : [];

  function beginDrag(which: 'pickup' | 'delivery') {
    setLocalDragging(true);
    onDragStart?.(which);
  }

  function endDragPickup(e: google.maps.MapMouseEvent) {
    const ll = e.latLng;
    setLocalDragging(false);
    if (!ll) return;
    onDragPickup({ lat: ll.lat(), lng: ll.lng() });
  }

  function endDragDelivery(e: google.maps.MapMouseEvent) {
    const ll = e.latLng;
    setLocalDragging(false);
    if (!ll) return;
    onDragDelivery({ lat: ll.lat(), lng: ll.lng() });
  }

  return (
    <Map
      defaultCenter={{ lat: center.lat, lng: center.lng }}
      defaultZoom={12}
      minZoom={10}
      mapId={GOOGLE_MAPS_MAP_ID}
      colorScheme="DARK"
      gestureHandling={dragging ? 'none' : 'greedy'}
      keyboardShortcuts={false}
      disableDefaultUI={false}
      zoomControl
      mapTypeControl={false}
      streetViewControl
      fullscreenControl={false}
      style={{ width: '100%', height: '100%' }}
      className="h-full w-full"
      reuseMaps
    >
      <MapClickHandler pickMode={pickMode} onPick={onPick} enabled={!dragging} />
      <FocusPins pickup={pickup} delivery={delivery} skipFit={lockCamera} />
      <RoadPolyline path={roadPath} fit={!lockCamera} />

      {pickup ? (
        <AdvancedMarker
          position={{ lat: pickup.lat, lng: pickup.lng }}
          draggable
          title="A · Recolección (arrastra para ajustar)"
          onDragStart={() => beginDrag('pickup')}
          onDragEnd={endDragPickup}
        >
          <PinBadge letter="A" color="#2B6CFF" caption="Recolección" />
        </AdvancedMarker>
      ) : null}

      {delivery ? (
        <AdvancedMarker
          position={{ lat: delivery.lat, lng: delivery.lng }}
          draggable
          title="B · Entrega (arrastra para ajustar)"
          onDragStart={() => beginDrag('delivery')}
          onDragEnd={endDragDelivery}
        >
          <PinBadge letter="B" color="#FF5722" caption="Entrega" />
        </AdvancedMarker>
      ) : null}
    </Map>
  );
}

export function RouteMapPickerInner(props: RouteMapPickerProps) {
  const { heightClass = 'h-64 sm:h-80', pinDragging } = props;
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[var(--domi-border)] ${heightClass}`}
    >
      <InnerMap {...props} />
      <p className="pointer-events-none absolute bottom-2 right-2 rounded-lg bg-black/70 px-2 py-1 text-[10px] text-white">
        {pinDragging
          ? 'Suelta el pin para actualizar la ruta'
          : 'DomiClick: Arrastra A / B · ruta se actualiza'}
      </p>
    </div>
  );
}

export function RouteMapPicker(props: RouteMapPickerProps) {
  const { heightClass = 'h-64 sm:h-80' } = props;

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className={`${heightClass} flex items-center justify-center rounded-xl border border-[var(--domi-border)] bg-[#0a0e16] px-4 text-center text-sm text-[var(--domi-muted)]`}
      >
        Falta <code className="text-[var(--domi-cyan)]">VITE_GOOGLE_MAPS_PLATFORM_KEY</code> en
        client-web/.env
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker', 'routes', 'geometry', 'places']}>
      <RouteMapPickerInner {...props} />
    </APIProvider>
  );
}

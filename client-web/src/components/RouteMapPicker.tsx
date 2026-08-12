import { useEffect, useMemo, useRef } from 'react';
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
  onPick: (point: LatLng) => void;
  onDragPickup: (point: LatLng) => void;
  onDragDelivery: (point: LatLng) => void;
  onLiveDragPickup?: (point: LatLng) => void;
  onLiveDragDelivery?: (point: LatLng) => void;
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

    clear();

    glowRef.current = new google.maps.Polyline({
      path,
      geodesic: false,
      strokeColor: '#00E5FF',
      strokeOpacity: 0.22,
      strokeWeight: 12,
      map,
      zIndex: 1,
    });

    lineRef.current = new google.maps.Polyline({
      path,
      geodesic: false,
      strokeColor: '#00E5FF',
      strokeOpacity: 0.95,
      strokeWeight: 4,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 3,
            strokeColor: '#00E5FF',
          },
          offset: '0',
          repeat: '16px',
        },
      ],
      map,
      zIndex: 2,
    });

    const key = `${path[0].lat.toFixed(4)},${path[0].lng.toFixed(4)}>${path[path.length - 1].lat.toFixed(4)},${path[path.length - 1].lng.toFixed(4)}:${path.length}`;
    if (fit && key !== lastFitKey.current) {
      lastFitKey.current = key;
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 80);
    }

    return clear;
  }, [map, path, fit]);

  return null;
}

function MapClickHandler({
  pickMode,
  onPick,
}: {
  pickMode: MapPickMode;
  onPick: (point: LatLng) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!pickMode || !e.latLng) return;
      onPick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    return () => listener.remove();
  }, [map, pickMode, onPick]);

  useEffect(() => {
    if (!map) return;
    map.setOptions({ draggableCursor: pickMode ? 'crosshair' : undefined });
  }, [map, pickMode]);

  return null;
}

function InnerMap(props: RouteMapPickerProps) {
  const {
    pickup,
    delivery,
    path,
    pickMode,
    routing,
    onPick,
    onDragPickup,
    onDragDelivery,
    onLiveDragPickup,
    onLiveDragDelivery,
  } = props;

  const center = useMemo(() => {
    if (pickup) return pickup;
    if (delivery) return delivery;
    return VILLAVICENCIO_CENTER;
  }, [pickup, delivery]);

  // Solo dibuja ruta de calles calculada (evita línea recta fantasma al arrastrar)
  const roadPath = path.length >= 2 ? path : [];

  return (
    <Map
      defaultCenter={{ lat: center.lat, lng: center.lng }}
      defaultZoom={13}
      mapId={GOOGLE_MAPS_MAP_ID}
      colorScheme="DARK"
      gestureHandling="greedy"
      disableDefaultUI={false}
      zoomControl
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={false}
      style={{ width: '100%', height: '100%' }}
      className="h-full w-full"
    >
      <MapClickHandler pickMode={pickMode} onPick={onPick} />
      <RoadPolyline path={roadPath} fit={!routing} />

      {pickup ? (
        <AdvancedMarker
          position={{ lat: pickup.lat, lng: pickup.lng }}
          draggable
          title="A · Recolección (punto de salida)"
          onDrag={(e) => {
            const ll = e.latLng;
            if (!ll) return;
            onLiveDragPickup?.({ lat: ll.lat(), lng: ll.lng() });
          }}
          onDragEnd={(e) => {
            const ll = e.latLng;
            if (!ll) return;
            onDragPickup({ lat: ll.lat(), lng: ll.lng() });
          }}
        >
          <PinBadge letter="A" color="#2B6CFF" caption="Recolección" />
        </AdvancedMarker>
      ) : null}

      {delivery ? (
        <AdvancedMarker
          position={{ lat: delivery.lat, lng: delivery.lng }}
          draggable
          title="B · Entrega (punto de llegada)"
          onDrag={(e) => {
            const ll = e.latLng;
            if (!ll) return;
            onLiveDragDelivery?.({ lat: ll.lat(), lng: ll.lng() });
          }}
          onDragEnd={(e) => {
            const ll = e.latLng;
            if (!ll) return;
            onDragDelivery({ lat: ll.lat(), lng: ll.lng() });
          }}
        >
          <PinBadge letter="B" color="#FF5722" caption="Entrega" />
        </AdvancedMarker>
      ) : null}
    </Map>
  );
}

export function RouteMapPicker(props: RouteMapPickerProps) {
  const { heightClass = 'h-64 sm:h-80', routing } = props;

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
    <div
      className={`relative ${heightClass} w-full overflow-hidden rounded-xl border border-[var(--domi-border)] bg-[#0a0e16]`}
      role="application"
      aria-label="Mapa Google DomiClick"
    >
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker', 'routes', 'geometry', 'places']}>
        <InnerMap {...props} />
      </APIProvider>

      <div className="pointer-events-none absolute left-2 top-2 z-10 space-y-1 rounded-lg border border-[var(--domi-border)] bg-[#0a101c]/92 px-2 py-1.5 text-[10px]">
        <div className="font-bold text-[#2B6CFF]">A · Recolección (salida)</div>
        <div className="font-bold text-[#FF5722]">B · Entrega (llegada)</div>
      </div>

      {routing ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center">
          <span className="rounded-full border border-[rgba(0,229,255,0.35)] bg-[#0a101c]/90 px-3 py-1.5 text-xs font-semibold text-[var(--domi-cyan)]">
            Optimizando ruta…
          </span>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-xl border border-[#FF5722]/40 bg-[#0a101c]/90 px-2.5 py-1.5">
        <div className="font-display text-[10px] font-black italic text-white">
          Domi<span className="text-[#FF5722]">Click</span>
        </div>
        <div className="text-[8px] text-slate-400">Arrastra A / B · ruta se actualiza</div>
      </div>
    </div>
  );
}

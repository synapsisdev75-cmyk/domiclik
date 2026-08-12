import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '../lib/geo';
import { VILLAVICENCIO_CENTER } from '../lib/geo';

export type MapPickMode = 'pickup' | 'delivery' | null;

type RouteMapPickerProps = {
  pickup: LatLng | null;
  delivery: LatLng | null;
  path: LatLng[];
  pickMode: MapPickMode;
  onPick: (point: LatLng) => void;
  heightClass?: string;
};

function pinIcon(color: string, letter: string) {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);color:#fff;font:700 12px/1 sans-serif">${letter}</span>
    </div>`,
  });
}

export function RouteMapPicker({
  pickup,
  delivery,
  path,
  pickMode,
  onPick,
  heightClass = 'h-64 sm:h-72',
}: RouteMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const onPickRef = useRef(onPick);
  const pickModeRef = useRef(pickMode);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    pickModeRef.current = pickMode;
  }, [pickMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [VILLAVICENCIO_CENTER.lat, VILLAVICENCIO_CENTER.lng],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!pickModeRef.current) return;
      onPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapRef.current = null;
      pickupMarkerRef.current = null;
      deliveryMarkerRef.current = null;
      lineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickup) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = L.marker([pickup.lat, pickup.lng], {
          icon: pinIcon('#2B6CFF', 'A'),
        }).addTo(map);
      } else {
        pickupMarkerRef.current.setLatLng([pickup.lat, pickup.lng]);
      }
      pickupMarkerRef.current.bindPopup('Partida (A)');
    } else if (pickupMarkerRef.current) {
      map.removeLayer(pickupMarkerRef.current);
      pickupMarkerRef.current = null;
    }

    if (delivery) {
      if (!deliveryMarkerRef.current) {
        deliveryMarkerRef.current = L.marker([delivery.lat, delivery.lng], {
          icon: pinIcon('#FF5722', 'B'),
        }).addTo(map);
      } else {
        deliveryMarkerRef.current.setLatLng([delivery.lat, delivery.lng]);
      }
      deliveryMarkerRef.current.bindPopup('Entrega (B)');
    } else if (deliveryMarkerRef.current) {
      map.removeLayer(deliveryMarkerRef.current);
      deliveryMarkerRef.current = null;
    }

    const pts = path.length >= 2 ? path : pickup && delivery ? [pickup, delivery] : [];
    if (pts.length >= 2) {
      const latlngs = pts.map((p) => [p.lat, p.lng] as [number, number]);
      if (!lineRef.current) {
        lineRef.current = L.polyline(latlngs, {
          color: '#00E5FF',
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
      } else {
        lineRef.current.setLatLngs(latlngs);
      }
      map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
    } else if (lineRef.current) {
      map.removeLayer(lineRef.current);
      lineRef.current = null;
    }

    window.setTimeout(() => map.invalidateSize(), 40);
  }, [pickup, delivery, path]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  return (
    <div
      ref={containerRef}
      className={`${heightClass} w-full overflow-hidden rounded-xl border border-[var(--domi-border)]`}
      role="application"
      aria-label="Mapa de ruta DomiClick"
    />
  );
}

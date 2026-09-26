import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import { MotorizadoDriver, DriverLocationHistoryPoint } from '../../types';
import { subscribeDriverLocationHistory } from '../../lib/firebase';
import { VILLAVICENCIO_CENTER } from '../../data/villavicencio';
import { getGoogleMapsApiKey } from '../GoogleMapRadar';
import {
  Calendar,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Bike,
  TrendingUp,
  X,
  ListOrdered,
} from 'lucide-react';

const MAP_ID =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_MAP_ID) ||
  process.env.VITE_GOOGLE_MAPS_MAP_ID ||
  '7959bb6afa37dd5e9db669a8';

interface DriverRouteHistoryViewProps {
  drivers: MotorizadoDriver[];
  initialSelectedDriverId?: string | null;
  onClose?: () => void;
}

type WaypointKind = 'start' | 'end' | 'stop';

function waypointKind(index: number, total: number, speed?: number): WaypointKind | null {
  if (index === 0) return 'start';
  if (index === total - 1) return 'end';
  if ((speed || 0) === 0) return 'stop';
  return null;
}

function HistoryMapLayers({
  points,
  playbackIndex,
}: {
  points: DriverLocationHistoryPoint[];
  playbackIndex: number;
}) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const glowRef = useRef<google.maps.Polyline | null>(null);
  const fittedKeyRef = useRef<string>('');

  const path = useMemo(
    () => points.map((p) => ({ lat: p.lat, lng: p.lng })),
    [points],
  );

  const waypoints = useMemo(() => {
    return points
      .map((pt, index) => {
        const kind = waypointKind(index, points.length, pt.speed);
        if (!kind) return null;
        return { pt, index, kind };
      })
      .filter(Boolean) as Array<{
      pt: DriverLocationHistoryPoint;
      index: number;
      kind: WaypointKind;
    }>;
  }, [points]);

  const active = points[playbackIndex] || null;

  useEffect(() => {
    if (!map || !(window as unknown as { google?: typeof google }).google?.maps) return;

    glowRef.current?.setMap(null);
    polylineRef.current?.setMap(null);
    glowRef.current = null;
    polylineRef.current = null;

    if (path.length === 0) return;

    glowRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#f59e0b',
      strokeOpacity: 0.25,
      strokeWeight: 12,
      map,
      zIndex: 1,
    });

    polylineRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#f59e0b',
      strokeOpacity: 0.95,
      strokeWeight: 4,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 3,
            strokeColor: '#fbbf24',
          },
          offset: '0',
          repeat: '16px',
        },
      ],
      map,
      zIndex: 2,
    });

    const fitKey = `${points.length}:${points[0]?.id || ''}:${points[points.length - 1]?.id || ''}`;
    if (fitKey !== fittedKeyRef.current) {
      fittedKeyRef.current = fitKey;
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 56);
    }

    return () => {
      glowRef.current?.setMap(null);
      polylineRef.current?.setMap(null);
      glowRef.current = null;
      polylineRef.current = null;
    };
  }, [map, path, points]);

  useEffect(() => {
    if (!map || !active) return;
    map.panTo({ lat: active.lat, lng: active.lng });
  }, [map, active?.lat, active?.lng, playbackIndex]);

  return (
    <>
      {waypoints.map(({ pt, index, kind }) => {
        const timeStr = new Date(pt.timestamp).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const label =
          kind === 'start' ? 'INICIO' : kind === 'end' ? 'ÚLTIMO' : 'PARADA';
        const bg =
          kind === 'start'
            ? 'bg-emerald-500 text-black border-emerald-300'
            : kind === 'end'
              ? 'bg-amber-500 text-black border-amber-300'
              : 'bg-indigo-500 text-white border-indigo-300';

        return (
          <AdvancedMarker
            key={`wp-${pt.id || index}`}
            position={{ lat: pt.lat, lng: pt.lng }}
            title={`${label} · ${timeStr}`}
            zIndex={kind === 'end' ? 20 : 10}
          >
            <div
              className={`pointer-events-none flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold shadow-xl ${bg}`}
            >
              <span>{label}</span>
              <span>{timeStr}</span>
            </div>
          </AdvancedMarker>
        );
      })}

      {active ? (
        <AdvancedMarker
          position={{ lat: active.lat, lng: active.lng }}
          zIndex={50}
          title="Posición de reproducción"
        >
          <div className="pointer-events-none relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-[#f59e0b] text-black shadow-2xl">
            <Bike className="h-5 w-5" />
            <span className="absolute -bottom-5 whitespace-nowrap rounded-md bg-[#11141a]/95 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
              {new Date(active.timestamp).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </AdvancedMarker>
      ) : null}
    </>
  );
}

export const DriverRouteHistoryView: React.FC<DriverRouteHistoryViewProps> = ({
  drivers,
  initialSelectedDriverId,
  onClose,
}) => {
  const approvedDrivers = drivers.filter((d) => d.status === 'approved');
  const [selectedDriverId, setSelectedDriverId] = useState<string>(
    initialSelectedDriverId || approvedDrivers[0]?.id || '',
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [historyPoints, setHistoryPoints] = useState<DriverLocationHistoryPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const apiKey = getGoogleMapsApiKey();
  const currentDriver = drivers.find((d) => d.id === selectedDriverId);

  useEffect(() => {
    if (!selectedDriverId) return;

    setLoading(true);
    setIsPlaying(false);
    setPlaybackIndex(0);

    const unsub = subscribeDriverLocationHistory(selectedDriverId, selectedDate, (pts) => {
      setHistoryPoints(pts);
      setLoading(false);
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [selectedDriverId, selectedDate]);

  useEffect(() => {
    if (!isPlaying || historyPoints.length < 2) return;

    const intervalTime = 1200 / playbackSpeed;
    const timer = setInterval(() => {
      setPlaybackIndex((prev) => {
        const next = prev + 1;
        if (next >= historyPoints.length) {
          setIsPlaying(false);
          return historyPoints.length - 1;
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, historyPoints]);

  const totalKm = calculateTotalDistanceKm(historyPoints);
  const avgSpeed =
    historyPoints.length > 0
      ? Math.round(
          historyPoints.reduce((sum, p) => sum + (p.speed || 0), 0) / historyPoints.length,
        )
      : 0;

  const mapCenter =
    historyPoints[playbackIndex] ||
    historyPoints[historyPoints.length - 1] ||
    VILLAVICENCIO_CENTER;

  return (
    <div className="space-y-6 overflow-hidden rounded-2xl border border-[#2d3139] bg-[#161920] p-6 shadow-2xl">
      <div className="flex flex-col justify-between gap-4 border-b border-[#2d3139] pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/20 text-[#f59e0b]">
              <TrendingUp className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-extrabold text-white">
              Historial de Rutas GPS por Motorizado
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Mapa Google · telemetría y trayectoria de la jornada
            {loading ? ' · cargando…' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#2d3139] bg-[#11141a] p-1.5">
            <Bike className="ml-1 h-4 w-4 text-[#f59e0b]" />
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="bg-transparent pr-2 text-xs font-bold text-white focus:outline-none"
            >
              {approvedDrivers.map((d) => (
                <option key={d.id} value={d.id} className="bg-[#161920] text-white">
                  {d.fullName} ({d.plateNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[#2d3139] bg-[#11141a] p-1.5">
            <Calendar className="ml-1 h-4 w-4 text-emerald-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent pr-1 text-xs font-bold text-white focus:outline-none"
            />
          </div>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#2d3139] bg-[#11141a] p-2 text-slate-400 hover:bg-[#2d3139] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {currentDriver ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[#2d3139] bg-[#11141a] p-4">
            <img
              src={currentDriver.photoUrl}
              alt={currentDriver.fullName}
              className="h-12 w-12 rounded-xl border border-[#2d3139] object-cover"
            />
            <div>
              <h4 className="text-sm font-bold leading-tight text-white">{currentDriver.fullName}</h4>
              <span className="mt-0.5 block font-mono text-xs font-bold text-[#f59e0b]">
                Placa: {currentDriver.plateNumber}
              </span>
              <span className="text-[10px] text-slate-400">{currentDriver.motoModel}</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[#2d3139] bg-[#11141a] p-4">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Recorrido Total
              </span>
              <span className="mt-1 block font-mono text-2xl font-extrabold text-amber-400">
                {totalKm} km
              </span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-lg text-[#f59e0b]">
              📏
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[#2d3139] bg-[#11141a] p-4">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Velocidad Promedio
              </span>
              <span className="mt-1 block font-mono text-2xl font-extrabold text-emerald-400">
                {avgSpeed} <span className="text-xs font-normal text-slate-400">km/h</span>
              </span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-lg text-emerald-400">
              ⚡
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[#2d3139] bg-[#11141a] p-4">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Registros GPS Hoy
              </span>
              <span className="mt-1 block font-mono text-2xl font-extrabold text-indigo-400">
                {historyPoints.length}{' '}
                <span className="text-xs font-normal text-slate-400">puntos</span>
              </span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-lg text-indigo-400">
              🛰️
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="relative lg:col-span-2">
          <div className="h-[460px] w-full overflow-hidden rounded-2xl border border-[#2d3139]">
            {apiKey ? (
              <APIProvider apiKey={apiKey} libraries={['marker', 'geometry']}>
                <Map
                  mapId={MAP_ID}
                  colorScheme="DARK"
                  defaultCenter={{
                    lat: mapCenter.lat,
                    lng: mapCenter.lng,
                  }}
                  defaultZoom={14}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  zoomControl
                  mapTypeControl={false}
                  streetViewControl={false}
                  fullscreenControl={false}
                  style={{ width: '100%', height: '100%' }}
                >
                  <HistoryMapLayers points={historyPoints} playbackIndex={playbackIndex} />
                </Map>
              </APIProvider>
            ) : (
              <div className="flex h-full items-center justify-center bg-[#0a101c] px-6 text-center text-sm text-slate-400">
                Falta la API key de Google Maps (`VITE_GOOGLE_MAPS_PLATFORM_KEY`) para el historial.
              </div>
            )}
          </div>

          <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2d3139] bg-[#11141a]/95 p-3 text-xs shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={historyPoints.length < 2}
                className="flex items-center gap-1.5 rounded-xl bg-[#f59e0b] px-3.5 py-2 font-extrabold text-black shadow transition hover:bg-amber-400 disabled:opacity-50"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                <span>{isPlaying ? 'Pausar Replay' : 'Reproducir Recorrido en Vivo'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackIndex(0);
                }}
                className="rounded-xl border border-[#2d3139] bg-[#161920] p-2 text-slate-300 transition hover:bg-[#2d3139]"
                title="Reiniciar reproducción"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="rounded-xl border border-[#2d3139] bg-[#161920] px-2 py-2 font-bold text-white focus:outline-none"
              >
                <option value={1}>1x Velocidad</option>
                <option value={2}>2x Velocidad</option>
                <option value={4}>4x Velocidad</option>
              </select>
            </div>

            {historyPoints.length > 0 ? (
              <div className="flex max-w-xs flex-1 items-center gap-2">
                <span className="font-mono text-[11px] text-slate-400">
                  {playbackIndex + 1}/{historyPoints.length}
                </span>
                <input
                  type="range"
                  min={0}
                  max={historyPoints.length - 1}
                  value={playbackIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setPlaybackIndex(Number(e.target.value));
                  }}
                  className="h-1.5 w-full cursor-pointer rounded-lg bg-[#2d3139] accent-[#f59e0b]"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex h-[460px] flex-col space-y-3 rounded-2xl border border-[#2d3139] bg-[#11141a] p-4">
          <div className="flex items-center justify-between border-b border-[#2d3139] pb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-white">
              <ListOrdered className="h-4 w-4 text-[#f59e0b]" />
              <span>Línea de Tiempo Telemetría ({historyPoints.length})</span>
            </span>
            <span className="font-mono text-[10px] text-slate-500">{selectedDate}</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {historyPoints.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500">
                No hay puntos GPS registrados para esta fecha.
              </div>
            ) : (
              historyPoints.map((pt, index) => {
                const isActivePlayback = playbackIndex === index;
                const timeStr = new Date(pt.timestamp).toLocaleTimeString('es-CO', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <button
                    type="button"
                    key={pt.id || index}
                    onClick={() => {
                      setIsPlaying(false);
                      setPlaybackIndex(index);
                    }}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 text-left text-xs transition ${
                      isActivePlayback
                        ? 'border-amber-500/50 bg-amber-500/20 text-white shadow-lg'
                        : 'border-[#2d3139] bg-[#161920] text-slate-300 hover:bg-[#2d3139]/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="rounded border border-[#2d3139] bg-[#11141a] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        #{index + 1}
                      </span>
                      <div>
                        <span className="block text-[11px] font-bold leading-tight text-white">
                          {pt.addressName || 'Calle de Villavicencio'}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>{timeStr}</span>
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block font-mono text-xs font-bold text-emerald-400">
                        {pt.speed || 0} km/h
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function calculateTotalDistanceKm(points: DriverLocationHistoryPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    total += haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
  }
  return Number(total.toFixed(2));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MotorizadoDriver, DriverLocationHistoryPoint } from '../../types';
import { fetchDriverLocationHistory, subscribeDriverLocationHistory } from '../../lib/firebase';
import { VILLAVICENCIO_CENTER } from '../../data/villavicencio';
import {
  Calendar,
  Clock,
  Gauge,
  Play,
  Pause,
  RotateCcw,
  Bike,
  MapPin,
  Navigation,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  X,
  Zap,
  CheckCircle2,
  ListOrdered,
  Layers,
} from 'lucide-react';

interface DriverRouteHistoryViewProps {
  drivers: MotorizadoDriver[];
  initialSelectedDriverId?: string | null;
  onClose?: () => void;
}

export const DriverRouteHistoryView: React.FC<DriverRouteHistoryViewProps> = ({
  drivers,
  initialSelectedDriverId,
  onClose,
}) => {
  const approvedDrivers = drivers.filter((d) => d.status === 'approved');
  const [selectedDriverId, setSelectedDriverId] = useState<string>(
    initialSelectedDriverId || (approvedDrivers[0]?.id || '')
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [historyPoints, setHistoryPoints] = useState<DriverLocationHistoryPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Playback Animation State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 4x
  const animRef = useRef<number | null>(null);

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const pointMarkersRef = useRef<L.Marker[]>([]);
  const animMarkerRef = useRef<L.Marker | null>(null);

  const currentDriver = drivers.find((d) => d.id === selectedDriverId);

  // 1. Fetch History Points on Driver/Date Change
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

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [VILLAVICENCIO_CENTER.lat, VILLAVICENCIO_CENTER.lng],
      zoom: 14,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 3. Render Polyline & Waypoint Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous layers
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    pointMarkersRef.current.forEach((m) => m.remove());
    pointMarkersRef.current = [];

    if (animMarkerRef.current) {
      animMarkerRef.current.remove();
      animMarkerRef.current = null;
    }

    if (historyPoints.length === 0) return;

    const latLngs: [number, number][] = historyPoints.map((pt) => [pt.lat, pt.lng]);

    // Draw full day history route
    const polyline = L.polyline(latLngs, {
      color: '#f59e0b', // Amber line
      weight: 5,
      opacity: 0.9,
      dashArray: '8, 8',
    }).addTo(map);

    polylineRef.current = polyline;

    // Render Start (Origin) and End (Current/Latest) Markers
    historyPoints.forEach((pt, index) => {
      const isStart = index === 0;
      const isEnd = index === historyPoints.length - 1;

      if (isStart || isEnd || pt.speed === 0) {
        let badgeBg = 'bg-[#11141a] text-slate-300 border-slate-700';
        let icon = '📍';

        if (isStart) {
          badgeBg = 'bg-emerald-500 text-black border-emerald-400';
          icon = '🚩 INICIO';
        } else if (isEnd) {
          badgeBg = 'bg-amber-500 text-black border-amber-400';
          icon = '🏁 ÚLTIMO';
        } else if (pt.speed === 0) {
          badgeBg = 'bg-indigo-500 text-white border-indigo-400';
          icon = '⏹️ PARADA';
        }

        const timeStr = new Date(pt.timestamp).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const customIcon = L.divIcon({
          className: 'history-waypoint-marker',
          html: `
            <div class="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shadow-xl backdrop-blur-md ${badgeBg}">
              <span>${icon}</span>
              <span>${timeStr}</span>
            </div>
          `,
          iconSize: [80, 24],
          iconAnchor: [40, 12],
        });

        const marker = L.marker([pt.lat, pt.lng], { icon: customIcon }).addTo(map);
        marker.bindPopup(`
          <div style="color: black; font-size: 12px; font-family: sans-serif;">
            <strong>${pt.addressName || 'Punto de Registro'}</strong><br/>
            Hora: ${timeStr}<br/>
            Velocidad: ${pt.speed || 0} km/h
          </div>
        `);
        pointMarkersRef.current.push(marker);
      }
    });

    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
  }, [historyPoints]);

  // 4. Playback Animation Effect
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

  // Update animated bike position on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || historyPoints.length === 0) return;

    const currentPt = historyPoints[playbackIndex];
    if (!currentPt) return;

    if (!animMarkerRef.current) {
      const bikeIcon = L.divIcon({
        className: 'playback-bike-marker',
        html: `
          <div class="relative flex items-center justify-center w-11 h-11 rounded-full bg-[#f59e0b] text-black border-2 border-white shadow-2xl animate-bounce">
            <span class="text-xl font-bold">🛵</span>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      animMarkerRef.current = L.marker([currentPt.lat, currentPt.lng], { icon: bikeIcon }).addTo(map);
    } else {
      animMarkerRef.current.setLatLng([currentPt.lat, currentPt.lng]);
    }

    map.panTo([currentPt.lat, currentPt.lng], { animate: true, duration: 0.5 });
  }, [playbackIndex, historyPoints]);

  // Metrics Calculation
  const totalKm = calculateTotalDistanceKm(historyPoints);
  const maxSpeed = historyPoints.reduce((max, p) => Math.max(max, p.speed || 0), 0);
  const avgSpeed =
    historyPoints.length > 0
      ? Math.round(
          historyPoints.reduce((sum, p) => sum + (p.speed || 0), 0) / historyPoints.length
        )
      : 0;

  return (
    <div className="bg-[#161920] border border-[#2d3139] rounded-2xl shadow-2xl overflow-hidden p-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#2d3139] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-[#f59e0b] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-extrabold text-white">Historial de Rutas GPS por Motorizado</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Visualización de telemetría y trayectoria registrada en Firestore para la jornada operativa
          </p>
        </div>

        {/* Driver Picker & Date Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#11141a] p-1.5 rounded-xl border border-[#2d3139]">
            <Bike className="w-4 h-4 text-[#f59e0b] ml-1" />
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none pr-2"
            >
              {approvedDrivers.map((d) => (
                <option key={d.id} value={d.id} className="bg-[#161920] text-white">
                  {d.fullName} ({d.plateNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#11141a] p-1.5 rounded-xl border border-[#2d3139]">
            <Calendar className="w-4 h-4 text-emerald-400 ml-1" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none pr-1"
            />
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#11141a] hover:bg-[#2d3139] text-slate-400 hover:text-white border border-[#2d3139]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Driver Info Card + Daily Stat Summary */}
      {currentDriver && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#11141a] border border-[#2d3139] p-4 rounded-2xl flex items-center gap-3">
            <img
              src={currentDriver.photoUrl}
              alt={currentDriver.fullName}
              className="w-12 h-12 rounded-xl object-cover border border-[#2d3139]"
            />
            <div>
              <h4 className="text-sm font-bold text-white leading-tight">{currentDriver.fullName}</h4>
              <span className="text-xs font-mono font-bold text-[#f59e0b] block mt-0.5">
                Placa: {currentDriver.plateNumber}
              </span>
              <span className="text-[10px] text-slate-400">{currentDriver.motoModel}</span>
            </div>
          </div>

          <div className="bg-[#11141a] border border-[#2d3139] p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Recorrido Total
              </span>
              <span className="text-2xl font-extrabold text-amber-400 font-mono mt-1 block">
                {totalKm} km
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[#f59e0b] flex items-center justify-center text-lg">
              📏
            </div>
          </div>

          <div className="bg-[#11141a] border border-[#2d3139] p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Velocidad Promedio
              </span>
              <span className="text-2xl font-extrabold text-emerald-400 font-mono mt-1 block">
                {avgSpeed} <span className="text-xs font-normal text-slate-400">km/h</span>
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
              ⚡
            </div>
          </div>

          <div className="bg-[#11141a] border border-[#2d3139] p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Registros GPS Hoy
              </span>
              <span className="text-2xl font-extrabold text-indigo-400 font-mono mt-1 block">
                {historyPoints.length} <span className="text-xs font-normal text-slate-400">puntos</span>
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg">
              🛰️
            </div>
          </div>
        </div>
      )}

      {/* Main Map & Timeline Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Column */}
        <div className="lg:col-span-2 relative">
          <div ref={mapContainerRef} className="h-[460px] w-full rounded-2xl border border-[#2d3139] z-0" />

          {/* Playback Controls Overlay Bar */}
          <div className="absolute bottom-4 left-4 right-4 z-10 bg-[#11141a]/95 backdrop-blur-md p-3 rounded-2xl border border-[#2d3139] shadow-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={historyPoints.length < 2}
                className="bg-[#f59e0b] hover:bg-amber-400 disabled:opacity-50 text-black font-extrabold px-3.5 py-2 rounded-xl transition shadow flex items-center gap-1.5"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pausar Replay' : 'Reproducir Recorrido en Vivo'}</span>
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackIndex(0);
                }}
                className="bg-[#161920] hover:bg-[#2d3139] text-slate-300 border border-[#2d3139] p-2 rounded-xl transition"
                title="Reiniciar reproducción"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="bg-[#161920] border border-[#2d3139] text-white rounded-xl px-2 py-2 font-bold focus:outline-none"
              >
                <option value={1}>1x Velocidad</option>
                <option value={2}>2x Velocidad</option>
                <option value={4}>4x Velocidad</option>
              </select>
            </div>

            {/* Scrubber / Progress indicator */}
            {historyPoints.length > 0 && (
              <div className="flex items-center gap-2 flex-1 max-w-xs">
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
                  className="w-full accent-[#f59e0b] cursor-pointer h-1.5 bg-[#2d3139] rounded-lg"
                />
              </div>
            )}
          </div>
        </div>

        {/* GPS Logs Timeline Column */}
        <div className="bg-[#11141a] border border-[#2d3139] rounded-2xl p-4 space-y-3 flex flex-col h-[460px]">
          <div className="flex items-center justify-between border-b border-[#2d3139] pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <ListOrdered className="w-4 h-4 text-[#f59e0b]" />
              <span>Línea de Tiempo Telemetría ({historyPoints.length})</span>
            </span>

            <span className="text-[10px] text-slate-500 font-mono">{selectedDate}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {historyPoints.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs">
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
                  <div
                    key={pt.id || index}
                    onClick={() => {
                      setIsPlaying(false);
                      setPlaybackIndex(index);
                    }}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 text-xs ${
                      isActivePlayback
                        ? 'bg-amber-500/20 border-amber-500/50 text-white shadow-lg'
                        : 'bg-[#161920] border-[#2d3139] text-slate-300 hover:bg-[#2d3139]/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[10px] text-slate-400 bg-[#11141a] px-1.5 py-0.5 rounded border border-[#2d3139]">
                        #{index + 1}
                      </span>
                      <div>
                        <span className="font-bold text-white block text-[11px] leading-tight">
                          {pt.addressName || 'Calle de Villavicencio'}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{timeStr}</span>
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-emerald-400 text-xs block">
                        {pt.speed || 0} km/h
                      </span>
                    </div>
                  </div>
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

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MotorizadoDriver, DeliveryOrder, MapWallSettings } from '../../types';
import {
  connectFirestore,
  subscribeDrivers,
  subscribeOrders,
  subscribeRealtimeStatus,
  subscribeMapWallSettings,
  RealtimeSyncMeta,
} from '../../lib/firebase';
import { alertDeliveryComplete } from '../../lib/alerts';
import { MapComponent, MapStyleType } from '../MapComponent';
import { GoogleMapRadar, getGoogleMapsApiKey } from '../GoogleMapRadar';
import { BrandIcon } from '../brand/BrandAssets';
import { DomiRadarIcon } from '../ui/CustomIcons';
import { MapWallKpiStrip, DraggableKpiPanel, WallKpiData } from './MapWallKpiStrip';
import { MapWallPulseScene } from './MapWallPulseScene';
import { MonitorSmartphone, Pin, PinOff, Pause, Play, Copy, Check } from 'lucide-react';
import { isLiveOrderStatus } from '../../lib/orderFlow';
import { mapWallPublicUrl } from '../../lib/publicUrls';
import { DEFAULT_MAP_WALL_SETTINGS, MapWallPhase } from '../../lib/mapWall';

export function isMapWallView(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('view') === 'map-wall';
}

export function openMapWallWindow() {
  const url = new URL(mapWallPublicUrl());
  const win = window.open(url.toString(), 'domiclick-map-wall');
  win?.focus();
}

const PHASE_LABEL: Record<MapWallPhase, string> = {
  'video-a': 'Video A',
  map: 'Plano mapa',
  'video-b': 'Video B',
};

export const MapWallScreen: React.FC = () => {
  const [drivers, setDrivers] = useState<MotorizadoDriver[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [realtimeMeta, setRealtimeMeta] = useState<RealtimeSyncMeta | null>(null);
  const [wallSettings, setWallSettings] = useState<MapWallSettings>(DEFAULT_MAP_WALL_SETTINGS);
  const [mapStyleToggle, setMapStyleToggle] = useState<'map' | 'satellite'>('map');
  const [now, setNow] = useState(() => new Date());
  const [phase, setPhase] = useState<MapWallPhase>('video-a');
  const [sceneProgress, setSceneProgress] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [floatingKpi, setFloatingKpi] = useState(false);
  const [kpiPos, setKpiPos] = useState({ x: 24, y: 88 });
  const [linkCopied, setLinkCopied] = useState(false);
  const shareUrl = mapWallPublicUrl();

  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const primedRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );
  const mapStartRef = useRef(Date.now());
  const nextVideoAfterMapRef = useRef<MapWallPhase>('video-b');
  const phaseRef = useRef<MapWallPhase>(phase);
  const autoRotateRef = useRef(autoRotate);
  phaseRef.current = phase;
  autoRotateRef.current = autoRotate;

  const googleMapsKey = getGoogleMapsApiKey();
  const useGoogleMaps = Boolean(googleMapsKey) && mapStyleToggle === 'map';
  const radarMapStyle: MapStyleType =
    mapStyleToggle === 'satellite' ? 'google_satellite' : 'dark';

  const isMapPhase = phase === 'map';
  const isVideoPhase = phase === 'video-a' || phase === 'video-b';
  const activeVideoUrl =
    phase === 'video-a' ? wallSettings.videoAUrl : wallSettings.videoBUrl;

  useEffect(() => {
    document.title = 'DomiClick · Radar (pantalla)';
    return () => {
      document.title = 'DomiClick Ops — Administración';
    };
  }, []);

  useEffect(() => subscribeRealtimeStatus(setRealtimeMeta), []);
  useEffect(() => subscribeMapWallSettings(setWallSettings), []);

  useEffect(() => {
    let cancelled = false;
    let unsubDrivers: (() => void) | undefined;
    let unsubOrders: (() => void) | undefined;

    (async () => {
      await connectFirestore();
      if (cancelled) return;
      unsubDrivers = subscribeDrivers(setDrivers);
      unsubOrders = subscribeOrders(setOrders);
    })();

    return () => {
      cancelled = true;
      unsubDrivers?.();
      unsubOrders?.();
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (!primedRef.current) {
      orders.forEach((o) => prev.set(o.id, o.status));
      primedRef.current = true;
      return;
    }
    for (const order of orders) {
      const was = prev.get(order.id);
      if (was && was !== 'delivered' && order.status === 'delivered') {
        alertDeliveryComplete();
      }
      prev.set(order.id, order.status);
    }
  }, [orders]);

  const approvedDrivers = drivers.filter((d) => d.status === 'approved');
  const activeDrivers = approvedDrivers.filter((d) => d.isActive);
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const transitOrders = orders.filter((o) => isLiveOrderStatus(o.status)).length;
  const todayKey = new Date().toISOString().split('T')[0];
  const deliveredToday = orders.filter(
    (o) =>
      o.status === 'delivered' && (o.updatedAt || o.createdAt || '').startsWith(todayKey)
  ).length;
  const activePct =
    approvedDrivers.length > 0
      ? Math.round((activeDrivers.length / approvedDrivers.length) * 100)
      : 0;

  const kpiData: WallKpiData = useMemo(
    () => ({
      activeDrivers: activeDrivers.length,
      approvedDrivers: approvedDrivers.length,
      activePct,
      pendingOrders,
      transitOrders,
      deliveredToday,
    }),
    [
      activeDrivers.length,
      approvedDrivers.length,
      activePct,
      pendingOrders,
      transitOrders,
      deliveredToday,
    ]
  );

  const clock = now.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const live =
    realtimeMeta?.live && !realtimeMeta?.error
      ? 'EN VIVO'
      : realtimeMeta?.error
        ? 'ERROR'
        : 'SINCRONIZANDO…';

  const liveColor =
    realtimeMeta?.live && !realtimeMeta?.error
      ? 'text-[#00E676]'
      : realtimeMeta?.error
        ? 'text-red-400'
        : 'text-amber-300';

  /** Video siempre avanza al terminar; el mapa solo si Auto está activo. */
  const handleVideoEnded = useCallback(() => {
    if (!autoRotateRef.current) return;
    const current = phaseRef.current;
    nextVideoAfterMapRef.current = current === 'video-a' ? 'video-b' : 'video-a';
    setPhase('map');
    mapStartRef.current = Date.now();
    setSceneProgress(0);
  }, []);

  useEffect(() => {
    if (phase !== 'map' || !autoRotate) return;

    const duration = wallSettings.mapDurationMs;
    mapStartRef.current = Date.now();
    setSceneProgress(0);

    const tick = window.setInterval(() => {
      if (!autoRotateRef.current) return;
      const elapsed = Date.now() - mapStartRef.current;
      setSceneProgress(Math.min(100, (elapsed / duration) * 100));
      if (elapsed >= duration) {
        setPhase(nextVideoAfterMapRef.current);
        setSceneProgress(0);
      }
    }, 50);

    return () => window.clearInterval(tick);
  }, [phase, autoRotate, wallSettings.mapDurationMs]);

  const onVideoProgress = useCallback((pct: number) => {
    setSceneProgress(pct);
  }, []);

  const goToPhase = useCallback((next: MapWallPhase) => {
    if (next === 'video-a') nextVideoAfterMapRef.current = 'video-b';
    if (next === 'video-b') nextVideoAfterMapRef.current = 'video-a';
    setPhase(next);
    setSceneProgress(0);
    if (next === 'map') mapStartRef.current = Date.now();
  }, []);

  const onKpiDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: kpiPos.x,
        origY: kpiPos.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [kpiPos]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setKpiPos({
        x: Math.max(8, dragRef.current.origX + dx),
        y: Math.max(72, dragRef.current.origY + dy),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const mapSec = Math.round(wallSettings.mapDurationMs / 1000);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#05080f] text-[#e8eef9] flex flex-col font-sans overflow-hidden">
      <header className="shrink-0 border-b border-[#142340] bg-[#070B16]/95 backdrop-blur-md px-4 sm:px-6 py-3 space-y-3 relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <DomiRadarIcon className="w-6 h-6 shrink-0 map-wall-icon-float" color="#00F0FF" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black uppercase tracking-wider font-mono truncate">
                Radar operativo · pantalla secundaria
              </h1>
              <p className="text-[10px] text-slate-400 font-tech flex items-center gap-2">
                <MonitorSmartphone className="w-3.5 h-3.5" />
                Video A → mapa {mapSec}s → Video B → mapa {mapSec}s
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-[9px] font-mono text-slate-500 truncate max-w-[220px] sm:max-w-md">
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(shareUrl).then(() => {
                      setLinkCopied(true);
                      window.setTimeout(() => setLinkCopied(false), 2000);
                    });
                  }}
                  className="inline-flex items-center gap-1 text-[9px] font-tech font-bold text-[#00E5FF] hover:text-white"
                  title="Copiar enlace para WhatsApp (funciona en iPhone)"
                >
                  {linkCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {linkCopied ? 'Copiado' : 'Copiar enlace'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-tech text-xs">
            <div className="flex items-center gap-2 bg-[#0A1122] border border-[#1A2D52] rounded-xl px-3 py-1.5">
              <BrandIcon name="gps" className="w-5 h-5" />
              <span className="text-slate-400 font-bold">GPS</span>
              <span className="text-[#00E676] font-black">
                {activeDrivers.length}/{approvedDrivers.length}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-[#0A1122] border border-[#1A2D52] rounded-xl px-3 py-1.5">
              <span className={`font-black ${liveColor} map-wall-live-dot`}>{live}</span>
              <span className="text-slate-500">·</span>
              <span className="text-white font-bold tabular-nums">{clock}</span>
            </div>

            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              className="flex items-center gap-1.5 bg-[#0A1122] border border-[#1A2D52] rounded-xl px-3 py-1.5 text-slate-300 hover:text-white"
              title={autoRotate ? 'Pausar rotación' : 'Reanudar rotación'}
            >
              {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{autoRotate ? 'Auto' : 'Pausa'}</span>
            </button>

            <button
              type="button"
              onClick={() => setFloatingKpi((v) => !v)}
              className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 ${
                floatingKpi
                  ? 'bg-[#FF5722]/20 border-[#FF5722]/50 text-[#FF5722]'
                  : 'bg-[#0A1122] border-[#1A2D52] text-slate-300'
              }`}
              title="Mover indicadores sobre el mapa"
            >
              {floatingKpi ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{floatingKpi ? 'Flotante' : 'Fijos'}</span>
            </button>

            <div className="flex items-center gap-1 bg-[#0A1122] p-1 rounded-xl border border-[#1A2D52]">
              <button
                type="button"
                onClick={() => goToPhase('map')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  isMapPhase ? 'bg-[#FF5722] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mapa
              </button>
              <button
                type="button"
                onClick={() => goToPhase('video-a')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  phase === 'video-a'
                    ? 'bg-[#00E5FF] text-[#05080f]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                V-A
              </button>
              <button
                type="button"
                onClick={() => goToPhase('video-b')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  phase === 'video-b'
                    ? 'bg-[#00E5FF] text-[#05080f]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                V-B
              </button>
              <button
                type="button"
                onClick={() => setMapStyleToggle('map')}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-bold ${
                  mapStyleToggle === 'map' ? 'text-[#FF5722]' : 'text-slate-500'
                }`}
              >
                OSM
              </button>
              <button
                type="button"
                onClick={() => setMapStyleToggle('satellite')}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-bold ${
                  mapStyleToggle === 'satellite' ? 'text-[#2B6CFF]' : 'text-slate-500'
                }`}
              >
                Sat
              </button>
            </div>
          </div>
        </div>

        {!floatingKpi && isMapPhase && <MapWallKpiStrip data={kpiData} />}

        <div className="h-0.5 w-full bg-[#121D36] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#FF5722] via-[#00E5FF] to-[#FF5722] transition-[width] duration-75 ease-linear map-wall-progress-glow"
            style={{ width: `${sceneProgress}%` }}
          />
        </div>
      </header>

      <main className="flex-1 min-h-0 relative">
        <div
          className={`absolute inset-0 transition-opacity duration-700 ${
            isMapPhase ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          {useGoogleMaps ? (
            <GoogleMapRadar
              drivers={approvedDrivers}
              orders={orders}
              height="h-full"
              apiKey={googleMapsKey}
            />
          ) : (
            <MapComponent
              drivers={approvedDrivers}
              orders={orders}
              height="h-full"
              showFilters={false}
              mapStyle={radarMapStyle}
              compactChrome
            />
          )}

          {floatingKpi && isMapPhase && (
            <DraggableKpiPanel data={kpiData} pos={kpiPos} onDragStart={onKpiDragStart} />
          )}
        </div>

        <div
          className={`absolute inset-0 transition-opacity duration-700 ${
            isVideoPhase ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          <MapWallPulseScene
            kpi={kpiData}
            clock={clock}
            liveLabel={live}
            liveColor={liveColor}
            videoUrl={activeVideoUrl}
            active={isVideoPhase}
            onEnded={handleVideoEnded}
            onProgress={onVideoProgress}
          />
        </div>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#070B16]/85 border border-[#1A2D52] rounded-full px-3 py-1.5">
          {(['video-a', 'map', 'video-b'] as const).map((p) => (
            <span
              key={p}
              className={`w-2 h-2 rounded-full ${
                phase === p ? 'bg-[#00E5FF] map-wall-scene-dot' : 'bg-slate-600'
              }`}
              title={PHASE_LABEL[p]}
            />
          ))}
          <span className="text-[10px] font-tech text-slate-400 uppercase tracking-wider">
            {PHASE_LABEL[phase]}
          </span>
        </div>
      </main>
    </div>
  );
};

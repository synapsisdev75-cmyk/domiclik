import React, { useEffect, useState, useRef } from 'react';
import { MotorizadoDriver, DeliveryOrder } from '../../types';
import {
  connectFirestore,
  subscribeDrivers,
  subscribeOrders,
  subscribeRealtimeStatus,
  RealtimeSyncMeta,
} from '../../lib/firebase';
import { alertDeliveryComplete } from '../../lib/alerts';
import { MapComponent, MapStyleType } from '../MapComponent';
import { GoogleMapRadar, getGoogleMapsApiKey } from '../GoogleMapRadar';
import { BrandIcon } from '../brand/BrandAssets';
import { DomiMotoIcon, DomiTowerIcon, DomiCargoIcon, DomiRadarIcon } from '../ui/CustomIcons';
import { MapPin, MonitorSmartphone } from 'lucide-react';

export function isMapWallView(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('view') === 'map-wall';
}

/** Abre (o enfoca) la pantalla solo-mapa en otra ventana/monitor. */
export function openMapWallWindow() {
  const url = new URL(window.location.href);
  url.searchParams.set('view', 'map-wall');
  const win = window.open(url.toString(), 'domiclick-map-wall');
  win?.focus();
}

/**
 * Pantalla dedicada: solo mapa + indicadores operativos.
 * Pensada para duplicar en un segundo monitor.
 */
export const MapWallScreen: React.FC = () => {
  const [drivers, setDrivers] = useState<MotorizadoDriver[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [realtimeMeta, setRealtimeMeta] = useState<RealtimeSyncMeta | null>(null);
  const [mapStyleToggle, setMapStyleToggle] = useState<'map' | 'satellite'>('map');
  const [now, setNow] = useState(() => new Date());
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const primedRef = useRef(false);

  const googleMapsKey = getGoogleMapsApiKey();
  const useGoogleMaps = Boolean(googleMapsKey) && mapStyleToggle === 'map';
  const radarMapStyle: MapStyleType =
    mapStyleToggle === 'satellite' ? 'google_satellite' : 'dark';

  useEffect(() => {
    document.title = 'DomiClick · Radar (pantalla)';
    return () => {
      document.title = 'DomiClick - Logística & Mensajería en Villavicencio';
    };
  }, []);

  useEffect(() => {
    return subscribeRealtimeStatus(setRealtimeMeta);
  }, []);

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
  const transitOrders = orders.filter(
    (o) => o.status === 'in_transit' || o.status === 'assigned'
  ).length;
  const todayKey = new Date().toISOString().split('T')[0];
  const deliveredToday = orders.filter(
    (o) =>
      o.status === 'delivered' && (o.updatedAt || o.createdAt || '').startsWith(todayKey)
  ).length;
  const activePct =
    approvedDrivers.length > 0
      ? Math.round((activeDrivers.length / approvedDrivers.length) * 100)
      : 0;

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

  return (
    <div className="fixed inset-0 z-[9999] bg-[#05080f] text-[#e8eef9] flex flex-col font-sans select-none overflow-hidden">
      {/* Indicadores */}
      <header className="shrink-0 border-b border-[#142340] bg-[#070B16]/95 backdrop-blur-md px-4 sm:px-6 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <DomiRadarIcon className="w-6 h-6 shrink-0" color="#00F0FF" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black uppercase tracking-wider font-mono truncate">
                Radar operativo · pantalla secundaria
              </h1>
              <p className="text-[10px] text-slate-400 font-tech flex items-center gap-2">
                <MonitorSmartphone className="w-3.5 h-3.5" />
                Solo mapa e indicadores · Villavicencio
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-tech text-xs">
            <div className="flex items-center gap-2 bg-[#0A1122] border border-[#1A2D52] rounded-xl px-3 py-1.5">
              <BrandIcon name="gps" className="w-5 h-5" />
              <span className="text-slate-400 font-bold">GPS</span>
              <span className="text-[#00E676] font-black">
                {activeDrivers.length}/{approvedDrivers.length}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-[#0A1122] border border-[#1A2D52] rounded-xl px-3 py-1.5">
              <span className={`font-black ${liveColor}`}>{live}</span>
              <span className="text-slate-500">·</span>
              <span className="text-white font-bold tabular-nums">{clock}</span>
            </div>
            <div className="flex items-center gap-1 bg-[#0A1122] p-1 rounded-xl border border-[#1A2D52]">
              <button
                type="button"
                onClick={() => setMapStyleToggle('map')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  mapStyleToggle === 'map'
                    ? 'bg-[#FF5722] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mapa
              </button>
              <button
                type="button"
                onClick={() => setMapStyleToggle('satellite')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  mapStyleToggle === 'satellite'
                    ? 'bg-[#2B6CFF] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Satélite
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-[#0B1222]/95 border border-[#182B4D] rounded-2xl p-3 sm:p-4 neon-border-orange">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
                  Motorizados activos
                </span>
                <div className="text-2xl font-black text-white font-tech mt-1 flex items-baseline gap-1">
                  <span>{activeDrivers.length}</span>
                  <span className="text-xs text-slate-400 font-normal">
                    / {approvedDrivers.length}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full max-w-[6rem] rounded-full bg-[#121D36] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF5722] to-[#ff8a50]"
                    style={{ width: `${activePct}%` }}
                  />
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#FF5722]/15 border border-[#FF5722]/40 flex items-center justify-center shrink-0">
                <DomiMotoIcon className="w-5 h-5" color="#FF5722" />
              </div>
            </div>
          </div>

          <div className="bg-[#0B1222]/95 border border-[#182B4D] rounded-2xl p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
                  Solicitudes pendientes
                </span>
                <div className="text-2xl font-black text-white font-tech mt-1">{pendingOrders}</div>
                <span className="text-[10px] text-amber-400 font-tech font-bold block mt-1">
                  {pendingOrders ? 'En espera' : 'Sin pendientes'}
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#2B6CFF]/15 border border-[#00E5FF]/40 flex items-center justify-center shrink-0">
                <DomiTowerIcon className="w-5 h-5" color="#00E5FF" />
              </div>
            </div>
          </div>

          <div className="bg-[#0B1222]/95 border border-[#182B4D] rounded-2xl p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
                  Envíos en tránsito
                </span>
                <div className="text-2xl font-black text-[#00E5FF] font-tech mt-1">{transitOrders}</div>
                <span className="text-[10px] text-slate-400 font-tech font-bold block mt-1">
                  En curso ahora
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#00E5FF]/15 border border-[#00E5FF]/40 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-[#00E5FF]" />
              </div>
            </div>
          </div>

          <div className="bg-[#0B1222]/95 border border-[#182B4D] rounded-2xl p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
                  Entregas hoy
                </span>
                <div className="text-2xl font-black text-[#FF5722] font-tech mt-1">{deliveredToday}</div>
                <span className="text-[10px] text-slate-400 font-tech font-bold block mt-1">
                  Completadas
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#FF5722]/15 border border-[#FF5722]/40 flex items-center justify-center shrink-0">
                <DomiCargoIcon className="w-5 h-5" color="#FF5722" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mapa a pantalla completa */}
      <main className="flex-1 min-h-0 relative">
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
      </main>
    </div>
  );
};

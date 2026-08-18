import React, { useEffect, useMemo, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { MotorizadoDriver, DeliveryOrder } from '../types';
import { VILLAVICENCIO_CENTER } from '../data/villavicencio';
import { BRAND } from './brand/BrandAssets';
import { calculateOptimalRoute } from '../utils/routing';
import { isLiveOrderStatus } from '../lib/orderFlow';

const MAP_ID =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_MAP_ID) ||
  process.env.VITE_GOOGLE_MAPS_MAP_ID ||
  '7959bb6afa37dd5e9db669a8';

/** Solicitudes (pending) */
export const ROUTE_COLOR_SOLICITUD = '#FF8A00';
/** En proceso / activo (assigned + in_transit) */
export const ROUTE_COLOR_EN_PROCESO = '#00E5FF';

interface GoogleMapRadarProps {
  drivers: MotorizadoDriver[];
  orders?: DeliveryOrder[];
  height?: string;
  apiKey: string;
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

/**
 * Dibuja rutas por calles (Google Directions / OSRM) — no línea recta.
 * Solicitudes = naranja · En proceso = cian.
 */
function StreetRoutesLayer({ orders }: { orders: DeliveryOrder[] }) {
  const map = useMap();
  const drawnRef = useRef<Drawn[]>([]);
  const cacheRef = useRef<Record<string, google.maps.LatLngLiteral[]>>({});

  const routeOrders = useMemo(() => {
    const withCoords = orders.filter(
      (o) =>
        routeKind(o.status) &&
        o.pickupCoords?.lat &&
        o.pickupCoords?.lng &&
        o.deliveryCoords?.lat &&
        o.deliveryCoords?.lng
    );

    const solicitudes = withCoords
      .filter((o) => o.status === 'pending')
      .slice(0, 8);
    const proceso = withCoords.filter((o) => o.status !== 'pending');
    // En proceso primero (prioridad visual), luego solicitudes
    return [...proceso, ...solicitudes];
  }, [orders]);

  useEffect(() => {
    if (!map || !(window as unknown as { google?: typeof google }).google?.maps) return;

    let cancelled = false;

    const clear = () => {
      drawnRef.current.forEach(({ glow, line }) => {
        glow.setMap(null);
        line.setMap(null);
      });
      drawnRef.current = [];
    };

    const drawPath = (path: google.maps.LatLngLiteral[], color: string, z: number) => {
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
      drawnRef.current.push({ glow, line });
    };

    const run = async () => {
      clear();
      if (routeOrders.length === 0) return;

      const bounds = new google.maps.LatLngBounds();
      let anyPath = false;

      for (let i = 0; i < routeOrders.length; i++) {
        if (cancelled) return;
        const order = routeOrders[i];
        const kind = routeKind(order.status)!;
        const color = routeColor(kind);
        const key = `${order.id}:${order.pickupCoords.lat},${order.pickupCoords.lng}>${order.deliveryCoords.lat},${order.deliveryCoords.lng}`;

        let path = cacheRef.current[key];
        if (!path || path.length < 3) {
          try {
            const route = await calculateOptimalRoute(
              order.pickupCoords.lat,
              order.pickupCoords.lng,
              order.deliveryCoords.lat,
              order.deliveryCoords.lng
            );
            path = route.coordinates.map(([lat, lng]) => ({ lat, lng }));
            if (path.length >= 2) cacheRef.current[key] = path;
          } catch {
            path = [
              { lat: order.pickupCoords.lat, lng: order.pickupCoords.lng },
              { lat: order.deliveryCoords.lat, lng: order.deliveryCoords.lng },
            ];
          }
        }

        if (cancelled) return;
        if (!path || path.length < 2) continue;

        // Proceso encima de solicitudes
        drawPath(path, color, kind === 'proceso' ? 40 : 20);
        path.forEach((p) => bounds.extend(p));
        anyPath = true;
      }

      if (!cancelled && anyPath) {
        map.fitBounds(bounds, 72);
      }
    };

    void run();

    return () => {
      cancelled = true;
      clear();
    };
  }, [map, routeOrders]);

  return null;
}

/**
 * Google Maps Platform radar — Map ID + dark night ops look.
 */
export const GoogleMapRadar: React.FC<GoogleMapRadarProps> = ({
  drivers,
  orders = [],
  height = 'h-[480px]',
  apiKey,
}) => {
  const approved = drivers.filter((d) => d.status === 'approved');

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
          <StreetRoutesLayer orders={orders} />

          {approved.map((driver) => (
            <AdvancedMarker
              key={`${driver.id}-${driver.location?.lat?.toFixed(5)}-${driver.location?.lng?.toFixed(5)}`}
              position={{ lat: driver.location.lat, lng: driver.location.lng }}
              title={`${driver.fullName} · ${driver.plateNumber}${driver.isActive ? ' · GPS vivo' : ''}`}
            >
              <div
                className="relative flex items-center justify-center pointer-events-none"
                style={{
                  width: 22,
                  height: 22,
                  transform: 'translateY(50%)',
                }}
              >
                {driver.isActive ? (
                  <span
                    className="absolute inset-0 rounded-full border-2 opacity-60"
                    style={{
                      borderColor: '#00E676',
                      animation: 'domiGpsPulse 1.4s ease-out infinite',
                    }}
                  />
                ) : null}
                <div
                  className="w-[14px] h-[14px] rounded-full border-2 border-white"
                  style={{
                    background: driver.isActive ? '#00E676' : '#2B6CFF',
                    boxShadow: `0 0 0 1px ${driver.isActive ? '#00E676' : '#2B6CFF'}, 0 0 10px ${
                      driver.isActive ? '#00E676' : '#2B6CFF'
                    }`,
                  }}
                />
              </div>
            </AdvancedMarker>
          ))}

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
              En proceso <span className="text-slate-400">({procesoCount})</span>
            </span>
          </div>
          <div className="flex items-center gap-2 pt-0.5 text-[9px] text-slate-500">
            <span className="inline-block h-2 w-2 rounded-full bg-[#00E676]" />
            Motorizado activo
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

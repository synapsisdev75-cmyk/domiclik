import React from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { MotorizadoDriver, DeliveryOrder } from '../types';
import { VILLAVICENCIO_CENTER } from '../data/villavicencio';
import { BRAND } from './brand/BrandAssets';

const MAP_ID =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_MAP_ID) ||
  process.env.VITE_GOOGLE_MAPS_MAP_ID ||
  '7959bb6afa37dd5e9db669a8';

interface GoogleMapRadarProps {
  drivers: MotorizadoDriver[];
  orders?: DeliveryOrder[];
  height?: string;
  apiKey: string;
}

/** Draws a neon dashed polyline for the first active order route */
function RoutePolyline({ orders }: { orders: DeliveryOrder[] }) {
  const map = useMap();

  React.useEffect(() => {
    if (!map || !(window as any).google?.maps) return;

    const order =
      orders.find((o) => o.status === 'in_transit' && o.pickupCoords && o.deliveryCoords) ||
      orders.find((o) => o.pickupCoords && o.deliveryCoords);
    if (!order?.pickupCoords || !order?.deliveryCoords) return;

    const path = [
      { lat: order.pickupCoords.lat, lng: order.pickupCoords.lng },
      { lat: order.deliveryCoords.lat, lng: order.deliveryCoords.lng },
    ];

    const glow = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#00E5FF',
      strokeOpacity: 0.25,
      strokeWeight: 12,
      map,
    });

    const line = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#00E5FF',
      strokeOpacity: 0.95,
      strokeWeight: 3,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 3,
            strokeColor: '#00E5FF',
          },
          offset: '0',
          repeat: '14px',
        },
      ],
      map,
    });

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 80);

    return () => {
      glow.setMap(null);
      line.setMap(null);
    };
  }, [map, orders]);

  return null;
}

/**
 * Google Maps Platform radar — Map ID + dark night ops look.
 * Uses official Maps JS API (not Leaflet/CARTO tiles).
 */
export const GoogleMapRadar: React.FC<GoogleMapRadarProps> = ({
  drivers,
  orders = [],
  height = 'h-[480px]',
  apiKey,
}) => {
  const approved = drivers.filter((d) => d.status === 'approved');

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
          <RoutePolyline orders={orders} />

          {approved.map((driver) => (
            <AdvancedMarker
              key={driver.id}
              position={{ lat: driver.location.lat, lng: driver.location.lng }}
              title={`${driver.fullName} · ${driver.plateNumber}`}
            >
              {/* Punto GPS preciso: círculo pequeño anclado al centro (no halo de aproximación) */}
              <div
                className="relative flex items-center justify-center pointer-events-none"
                style={{
                  width: 18,
                  height: 18,
                  transform: 'translateY(50%)',
                }}
              >
                <div
                  className="w-[14px] h-[14px] rounded-full border-2 border-white"
                  style={{
                    background: driver.isActive ? '#00E676' : '#2B6CFF',
                    boxShadow: `0 0 0 1px ${driver.isActive ? '#00E676' : '#2B6CFF'}, 0 1px 4px rgba(0,0,0,.55)`,
                  }}
                />
              </div>
            </AdvancedMarker>
          ))}

          {orders.map((order) => {
            const coords = order.deliveryCoords || order.pickupCoords;
            if (!coords) return null;
            const color =
              order.status === 'delivered'
                ? '#FF5722'
                : order.status === 'in_transit' || order.status === 'assigned'
                  ? '#2B6CFF'
                  : '#FF8A00';
            return (
              <AdvancedMarker
                key={order.id}
                position={{ lat: coords.lat, lng: coords.lng }}
                title={order.trackingCode || order.id}
              >
                <div
                  className="relative flex items-center justify-center pointer-events-none"
                  style={{ width: 16, height: 16, transform: 'translateY(50%)' }}
                >
                  <div
                    className="w-3 h-3 rounded-full border-2 border-white"
                    style={{
                      background: color,
                      boxShadow: `0 0 0 1px ${color}, 0 1px 4px rgba(0,0,0,.55)`,
                    }}
                  />
                </div>
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>

      <div className="absolute bottom-2 right-2 z-10 map-brand-badge flex items-center gap-2 bg-[#0a101c]/90 border border-[#FF5722]/40 rounded-xl px-2.5 py-1.5 shadow-[0_0_16px_rgba(255,87,34,0.25)]">
        <img src={BRAND.logoMark} alt="DomiClick" className="brand-neon w-7 h-7 object-contain" />
        <div className="leading-tight hidden sm:block">
          <div className="text-[10px] font-black text-white font-display italic">
            Domi<span className="text-[#FF5722]">Click</span>
          </div>
          <div className="text-[8px] text-slate-400 font-tech">Google Maps · Night Ops</div>
        </div>
      </div>
    </div>
  );
};

export function getGoogleMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (typeof import.meta !== 'undefined' &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('domiclick_gmaps_key')) ||
    ''
  );
}

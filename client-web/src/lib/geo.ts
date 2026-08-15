import { ROAD_FACTOR } from './pricing';
import { GOOGLE_MAPS_API_KEY } from './config';

export const VILLAVICENCIO_CENTER = { lat: 4.142, lng: -73.6266 };

export type LatLng = { lat: number; lng: number };

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function geocodeAddress(query: string): Promise<(LatLng & { label: string }) | null> {
  const q = query.trim();
  if (q.length < 4) return null;
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: `${q}, Villavicencio, Meta, Colombia`,
      format: 'json',
      limit: '1',
      countrycodes: 'co',
    });
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!data?.[0]) return null;
  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    label: data[0].display_name,
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url =
    'https://nominatim.openstreetmap.org/reverse?' +
    new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      zoom: '18',
    });
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export type RouteEstimate = {
  distanceKm: number;
  durationMin: number;
  path: LatLng[];
  provider: 'google' | 'osrm' | 'approx';
};

function approxRoute(from: LatLng, to: LatLng): RouteEstimate {
  const fallbackKm = haversineKm(from, to) * ROAD_FACTOR;
  const km = Math.round(fallbackKm * 100) / 100;
  // ETA operativo: se recalcula en pricing con hora pico; aquí floor a ~75 km/h + buffer 10
  const travelMin = Math.max(1, Math.ceil((km / 75) * 60));
  return {
    distanceKm: km,
    durationMin: travelMin + 10,
    path: [from, to],
    provider: 'approx',
  };
}

/** Google Directions JS (requiere Directions API habilitada en la key). */
export function estimateRouteWithGoogle(from: LatLng, to: LatLng): Promise<RouteEstimate | null> {
  const g = (window as unknown as { google?: typeof google }).google;
  if (!g?.maps?.DirectionsService) return Promise.resolve(null);

  const service = new g.maps.DirectionsService();
  const travel =
    (g.maps.TravelMode as { TWO_WHEELER?: google.maps.TravelMode }).TWO_WHEELER ||
    g.maps.TravelMode.DRIVING;

  return new Promise((resolve) => {
    service.route(
      {
        origin: from,
        destination: to,
        travelMode: travel,
        provideRouteAlternatives: false,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status !== g.maps.DirectionsStatus.OK || !result?.routes?.[0]?.legs?.[0]) {
          console.warn('[DomiClick] Google Directions:', status);
          resolve(null);
          return;
        }
        const route = result.routes[0];
        const leg = route.legs[0];
        const path: LatLng[] =
          route.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) ||
          leg.steps?.flatMap((st) => st.path.map((p) => ({ lat: p.lat(), lng: p.lng() }))) ||
          [from, to];

        resolve({
          distanceKm: Math.round(((leg.distance?.value || 0) / 1000) * 100) / 100,
          durationMin: Math.max(5, Math.round((leg.duration?.value || 0) / 60)),
          path: path.length >= 2 ? path : [from, to],
          provider: 'google',
        });
      },
    );
  });
}

const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
];

async function estimateRouteWithOsrm(from: LatLng, to: LatLng): Promise<RouteEstimate | null> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const qs = 'overview=full&geometries=geojson&steps=false';

  for (const base of OSRM_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${base}/${coords}?${qs}`, { signal: controller.signal });
      window.clearTimeout(t);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        code?: string;
        routes?: Array<{
          distance: number;
          duration: number;
          geometry?: { coordinates: [number, number][] };
        }>;
      };
      if (data.code && data.code !== 'Ok') continue;
      const route = data.routes?.[0];
      if (!route?.geometry?.coordinates?.length) continue;
      const path = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      if (path.length < 2) continue;
      return {
        distanceKm: Math.round((route.distance / 1000) * 100) / 100,
        durationMin: Math.max(5, Math.round(route.duration / 60)),
        path,
        provider: 'osrm',
      };
    } catch (err) {
      console.warn('[DomiClick] OSRM endpoint failed', base, err);
    }
  }
  return null;
}

/**
 * Ruta por calles (óptima): Google Directions → OSRM → aproximación.
 * Nunca debería quedarse en línea recta si OSRM/Google responden.
 */
export async function estimateRoute(from: LatLng, to: LatLng): Promise<RouteEstimate> {
  if (GOOGLE_MAPS_API_KEY) {
    const googleRoute = await estimateRouteWithGoogle(from, to);
    if (googleRoute && googleRoute.path.length > 2) return googleRoute;
  }

  const osrm = await estimateRouteWithOsrm(from, to);
  if (osrm) return osrm;

  // Último intento Google aunque path sea corto
  const googleAgain = await estimateRouteWithGoogle(from, to);
  if (googleAgain) return googleAgain;

  return approxRoute(from, to);
}

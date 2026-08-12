import { ROAD_FACTOR } from './pricing';

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
};

/** Ruta por OSRM (público) con fallback Haversine × factor carretera. */
export async function estimateRoute(from: LatLng, to: LatLng): Promise<RouteEstimate> {
  const fallbackKm = haversineKm(from, to) * ROAD_FACTOR;
  const fallback: RouteEstimate = {
    distanceKm: Math.round(fallbackKm * 100) / 100,
    durationMin: Math.max(8, Math.ceil(fallbackKm * 3.5)),
    path: [from, to],
  };

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: { coordinates: [number, number][] };
      }>;
    };
    const route = data.routes?.[0];
    if (!route) return fallback;
    const path =
      route.geometry?.coordinates?.map(([lng, lat]) => ({ lat, lng })) || [from, to];
    return {
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMin: Math.max(5, Math.round(route.duration / 60)),
      path,
    };
  } catch {
    return fallback;
  }
}

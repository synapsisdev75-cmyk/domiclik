import { ROAD_FACTOR } from './pricing';
import { GOOGLE_MAPS_API_KEY } from './config';
import { searchLocalPlaces } from './villavicencioPlaces';

export const VILLAVICENCIO_CENTER = { lat: 4.142, lng: -73.6266 };

/** Villavicencio + Restrepo, Acacías, Cumaral y vía Puerto López. */
export const VILLAVICENCIO_MAP_BOUNDS = {
  south: 3.95,
  west: -73.88,
  north: 4.32,
  east: -73.38,
};

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

export type PlaceSuggestion = {
  id: string;
  label: string;
  secondary: string;
  kind: string;
  source: 'google' | 'nominatim' | 'local';
  placeId?: string;
  lat?: number;
  lng?: number;
};

const PLACE_KIND_ES: Record<string, string> = {
  hospital: 'Hospital',
  doctor: 'Salud',
  school: 'Colegio',
  university: 'Universidad',
  park: 'Parque',
  route: 'Calle / avenida',
  street_address: 'Dirección',
  neighborhood: 'Barrio',
  sublocality: 'Barrio',
  locality: 'Zona',
  shopping_mall: 'Centro comercial',
  supermarket: 'Supermercado',
  store: 'Local',
  restaurant: 'Restaurante',
  cafe: 'Café',
  church: 'Iglesia',
  pharmacy: 'Farmacia',
  gas_station: 'Estación',
  bank: 'Banco',
  police: 'Policía',
  stadium: 'Estadio',
  airport: 'Aeropuerto',
  bus_station: 'Terminal',
  premise: 'Urbanización',
  point_of_interest: 'Sitio',
  establishment: 'Sitio',
};

function kindFromTypes(types: string[] | undefined): string {
  if (!types?.length) return 'Lugar';
  for (const t of types) {
    if (PLACE_KIND_ES[t]) return PLACE_KIND_ES[t];
  }
  return 'Lugar';
}

function nominatimKind(cls: string | undefined, type: string | undefined): string {
  if (type && PLACE_KIND_ES[type]) return PLACE_KIND_ES[type];
  if (cls === 'highway' || type === 'residential') return 'Calle / avenida';
  if (cls === 'amenity' && type === 'hospital') return 'Hospital';
  if (cls === 'amenity' && (type === 'school' || type === 'college')) return 'Colegio';
  if (cls === 'leisure' && type === 'park') return 'Parque';
  if (cls === 'place' && (type === 'suburb' || type === 'neighbourhood')) return 'Barrio';
  if (cls === 'landuse' && type === 'residential') return 'Urbanización';
  return 'Lugar';
}

function googlePlacesReady(): typeof google.maps.places | null {
  return (window as unknown as { google?: typeof google }).google?.maps?.places || null;
}

function placesFromLib(
  placesLib?: google.maps.PlacesLibrary,
): typeof google.maps.places | null {
  if (placesLib) return placesLib as unknown as typeof google.maps.places;
  return googlePlacesReady();
}

async function searchGooglePlaces(
  places: typeof google.maps.places,
  q: string,
): Promise<PlaceSuggestion[]> {
  const biased = q.toLowerCase().includes('villavicencio') ? q : `${q} Villavicencio`;
  const service = new places.AutocompleteService();
  const predictions = await new Promise<google.maps.places.AutocompletePrediction[]>(
    (resolve) => {
      service.getPlacePredictions(
        {
          input: biased,
          componentRestrictions: { country: 'co' },
          locationBias: {
            center: VILLAVICENCIO_CENTER,
            radius: 28000,
          },
        },
        (res, status) => {
          if (
            status !== places.PlacesServiceStatus.OK &&
            status !== places.PlacesServiceStatus.ZERO_RESULTS
          ) {
            console.warn('[DomiClick] Places autocomplete status:', status);
            resolve([]);
            return;
          }
          resolve(res || []);
        },
      );
    },
  );
  if (!predictions.length) return [];
  return predictions.slice(0, 8).map((p) => ({
    id: p.place_id,
    placeId: p.place_id,
    label: p.structured_formatting?.main_text || p.description,
    secondary: p.structured_formatting?.secondary_text || 'Villavicencio, Meta',
    kind: kindFromTypes(p.types),
    source: 'google' as const,
  }));
}

function foldKey(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mergeSuggestions(groups: PlaceSuggestion[][]): PlaceSuggestion[] {
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const group of groups) {
    for (const hit of group) {
      const key = foldKey(`${hit.label} ${hit.lat?.toFixed(4) || ''} ${hit.lng?.toFixed(4) || ''}`);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

async function searchPhoton(query: string): Promise<PlaceSuggestion[]> {
  const queries = [`${query} Villavicencio`, query];
  const batches = await Promise.all(
    queries.map(async (q) => {
      const url =
        'https://photon.komoot.io/api/?' +
        new URLSearchParams({
          q,
          lat: String(VILLAVICENCIO_CENTER.lat),
          lon: String(VILLAVICENCIO_CENTER.lng),
          limit: '8',
          lang: 'es',
        });
      try {
        const res = await fetch(url);
        if (!res.ok) return [] as PlaceSuggestion[];
        const data = (await res.json()) as {
          features?: Array<{
            properties?: Record<string, string | undefined>;
            geometry?: { coordinates?: [number, number] };
          }>;
        };
        return (data.features || [])
          .map((f) => {
            const p = f.properties || {};
            const coords = f.geometry?.coordinates;
            if (!coords?.length) return null;
            const [lng, lat] = coords;
            const city = (p.city || p.district || '').toLowerCase();
            if (city && !city.includes('villavicencio') && !city.includes('meta')) {
              const dist = haversineKm({ lat, lng }, VILLAVICENCIO_CENTER);
              if (dist > 40) return null;
            }
            const label =
              p.name ||
              p.street ||
              p.city ||
              [p.street, p.housenumber].filter(Boolean).join(' ') ||
              'Lugar';
            const secondary = [
              p.street,
              p.district || p.suburb || p.locality,
              p.city || 'Villavicencio',
              p.state || 'Meta',
            ]
              .filter(Boolean)
              .join(', ');
            return {
              id: `photon-${lng}-${lat}-${label}`,
              label,
              secondary: secondary || 'Villavicencio, Meta',
              kind: nominatimKind(undefined, p.osm_value),
              source: 'nominatim' as const,
              lat,
              lng,
            } satisfies PlaceSuggestion;
          })
          .filter(Boolean) as PlaceSuggestion[];
      } catch {
        return [] as PlaceSuggestion[];
      }
    }),
  );
  return mergeSuggestions(batches);
}

export async function searchPlaceSuggestions(
  query: string,
  placesLib?: google.maps.PlacesLibrary,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const localHits = searchLocalPlaces(q);

  const places = placesFromLib(placesLib);
  const googlePromise = places?.AutocompleteService
    ? searchGooglePlaces(places, q).catch((err) => {
        console.warn('[DomiClick] Places autocomplete', err);
        return [] as PlaceSuggestion[];
      })
    : Promise.resolve([] as PlaceSuggestion[]);

  const [googleHits, photonHits] = await Promise.all([googlePromise, searchPhoton(q)]);
  return mergeSuggestions([localHits, googleHits, photonHits]);
}

export async function resolvePlaceSuggestion(
  suggestion: PlaceSuggestion,
  placesLib?: google.maps.PlacesLibrary,
): Promise<(LatLng & { label: string }) | null> {
  if (suggestion.lat != null && suggestion.lng != null) {
    return {
      lat: suggestion.lat,
      lng: suggestion.lng,
      label: suggestion.secondary
        ? `${suggestion.label}, ${suggestion.secondary}`
        : suggestion.label,
    };
  }
  if (suggestion.placeId) {
    const places = placesFromLib(placesLib);
    if (places?.PlacesService) {
      const host = document.createElement('div');
      const svc = new places.PlacesService(host);
      const details = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
        svc.getDetails(
          {
            placeId: suggestion.placeId!,
            fields: ['geometry', 'formatted_address', 'name', 'types'],
            language: 'es',
          },
          (place, status) => {
            if (status !== places.PlacesServiceStatus.OK || !place?.geometry?.location) {
              resolve(null);
              return;
            }
            resolve(place);
          },
        );
      });
      const loc = details?.geometry?.location;
      if (loc) {
        return {
          lat: loc.lat(),
          lng: loc.lng(),
          label: details.formatted_address || details.name || suggestion.label,
        };
      }
    }
  }
  return geocodeAddressNominatim(qSafe(suggestion.label));
}

function qSafe(q: string) {
  return q.trim();
}

async function geocodeAddressNominatim(q: string): Promise<(LatLng & { label: string }) | null> {
  if (q.length < 3) return null;
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

export async function geocodeAddress(
  query: string,
  placesLib?: google.maps.PlacesLibrary,
): Promise<(LatLng & { label: string }) | null> {
  const q = query.trim();
  if (q.length < 3) return null;
  const hits = await searchPlaceSuggestions(q, placesLib);
  if (hits[0]) {
    const resolved = await resolvePlaceSuggestion(hits[0], placesLib);
    if (resolved) return resolved;
  }
  return geocodeAddressNominatim(q);
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

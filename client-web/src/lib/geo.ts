import { ROAD_FACTOR } from './pricing';
import { GOOGLE_MAPS_API_KEY } from './config';
import { searchLocalPlaces, matchesSearchAnchor, isStreetSearchQuery, extractStreetFromQuery, dedupeStreetSuggestions, streetSuggestionKey } from './villavicencioPlaces';
import {
  resolvePlaceCategory,
  categorySearchQuery,
  categoryMatchesPlace,
} from './placeCategories';

export const VILLAVICENCIO_CENTER = { lat: 4.142, lng: -73.6266 };

/** Villavicencio + Restrepo, Acacías, Cumaral y vía Puerto López. */
export const VILLAVICENCIO_MAP_BOUNDS = {
  south: 3.95,
  west: -73.88,
  north: 4.32,
  east: -73.38,
};

export function isWithinServiceArea(lat: number, lng: number): boolean {
  return (
    lat >= VILLAVICENCIO_MAP_BOUNDS.south &&
    lat <= VILLAVICENCIO_MAP_BOUNDS.north &&
    lng >= VILLAVICENCIO_MAP_BOUNDS.west &&
    lng <= VILLAVICENCIO_MAP_BOUNDS.east
  );
}

export const OUT_OF_AREA_MESSAGE =
  'Solo realizamos entregas en Villavicencio y alrededores (Meta).';

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
  convenience_store: 'Tienda',
  store: 'Comercio',
  clothing_store: 'Comercio',
  electronics_store: 'Comercio',
  restaurant: 'Restaurante',
  meal_takeaway: 'Restaurante',
  meal_delivery: 'Restaurante',
  cafe: 'Café',
  ice_cream: 'Heladería',
  bar: 'Bar',
  night_club: 'Bar',
  butcher_shop: 'Carnicería',
  bakery: 'Panadería',
  church: 'Iglesia',
  pharmacy: 'Farmacia',
  gas_station: 'Estación',
  bank: 'Banco',
  police: 'Policía',
  stadium: 'Estadio',
  airport: 'Aeropuerto',
  bus_station: 'Terminal',
  premise: 'Urbanización',
  lodging: 'Hotel',
  gym: 'Gimnasio',
  beauty_salon: 'Salón',
  hair_care: 'Salón',
  florist: 'Floristería',
  laundry: 'Lavandería',
  car_repair: 'Taller',
  point_of_interest: 'Negocio',
  establishment: 'Negocio',
  food: 'Negocio',
};

function kindFromTypes(types: string[] | undefined): string {
  if (!types?.length) return 'Negocio';
  for (const t of types) {
    if (PLACE_KIND_ES[t]) return PLACE_KIND_ES[t];
  }
  if (types.includes('establishment') || types.includes('food')) return 'Negocio';
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

async function predictGoogle(
  places: typeof google.maps.places,
  q: string,
): Promise<PlaceSuggestion[]> {
  const service = new places.AutocompleteService();
  const streetQuery = isStreetSearchQuery(q);
  const normalized = streetQuery ? extractStreetFromQuery(q) : q;
  const category = resolvePlaceCategory(q);
  const inputs = category
    ? [categorySearchQuery(category, q)]
    : streetQuery
      ? [`${normalized}, Villavicencio, Meta`, normalized]
      : normalized.toLowerCase().includes('villavicencio')
        ? [normalized]
        : [normalized, `${normalized} Villavicencio, Meta`];
  const batches = await Promise.all(
    inputs.map(
      (input) =>
        new Promise<google.maps.places.AutocompletePrediction[]>((resolve) => {
          const request: google.maps.places.AutocompletionRequest = {
            input,
            componentRestrictions: { country: 'co' },
            locationRestriction: {
              west: VILLAVICENCIO_MAP_BOUNDS.west,
              south: VILLAVICENCIO_MAP_BOUNDS.south,
              east: VILLAVICENCIO_MAP_BOUNDS.east,
              north: VILLAVICENCIO_MAP_BOUNDS.north,
            },
            locationBias: {
              center: VILLAVICENCIO_CENTER,
              radius: 22000,
            },
          };
          if (streetQuery) {
            request.types = ['geocode'];
          }
          service.getPlacePredictions(
            request,
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
        }),
    ),
  );
  return batches.flat().map((p) => ({
    id: `ac-${p.place_id}`,
    placeId: p.place_id,
    label: p.structured_formatting?.main_text || p.description,
    secondary: p.structured_formatting?.secondary_text || 'Villavicencio, Meta',
    kind: streetQuery ? 'Calle / avenida' : kindFromTypes(p.types),
    source: 'google' as const,
  }));
}

async function textSearchGoogle(
  places: typeof google.maps.places,
  q: string,
): Promise<PlaceSuggestion[]> {
  if (!places.PlacesService) return [];
  const category = resolvePlaceCategory(q);
  const host = document.createElement('div');
  const svc = new places.PlacesService(host);
  const query = category
    ? categorySearchQuery(category, q)
    : q.toLowerCase().includes('villavicencio')
      ? q
      : `${q} Villavicencio Meta`;
  const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
    svc.textSearch(
      {
        query,
        location: VILLAVICENCIO_CENTER,
        radius: 28000,
        type: category?.googleIncludedType,
      },
      (res, status) => {
        if (
          status !== places.PlacesServiceStatus.OK &&
          status !== places.PlacesServiceStatus.ZERO_RESULTS
        ) {
          console.warn('[DomiClick] Places textSearch status:', status);
          resolve([]);
          return;
        }
        resolve(res || []);
      },
    );
  });
  return results.slice(0, category ? 15 : 12).map((p) => {
    const loc = p.geometry?.location;
    return {
      id: `ts-${p.place_id || p.name}`,
      placeId: p.place_id,
      label: p.name || p.formatted_address || q,
      secondary: p.vicinity || p.formatted_address || 'Villavicencio, Meta',
      kind: category?.label || kindFromTypes(p.types),
      source: 'google' as const,
      lat: loc ? loc.lat() : undefined,
      lng: loc ? loc.lng() : undefined,
    };
  });
}

async function geocodeGoogle(q: string): Promise<PlaceSuggestion[]> {
  const g = (window as unknown as { google?: typeof google }).google?.maps;
  if (!g?.Geocoder) return [];
  const geo = new g.Geocoder();
  const streetPart = isStreetSearchQuery(q) ? extractStreetFromQuery(q) : q;
  try {
    const res = await geo.geocode({
      address: `${streetPart}, Villavicencio, Meta, Colombia`,
      componentRestrictions: { country: 'CO' },
      bounds: {
        north: VILLAVICENCIO_MAP_BOUNDS.north,
        south: VILLAVICENCIO_MAP_BOUNDS.south,
        east: VILLAVICENCIO_MAP_BOUNDS.east,
        west: VILLAVICENCIO_MAP_BOUNDS.west,
      },
    });
    return (res.results || [])
      .filter((r) => {
        const loc = r.geometry.location;
        return isWithinServiceArea(loc.lat(), loc.lng());
      })
      .slice(0, 8)
      .map((r) => {
      const loc = r.geometry.location;
      return {
        id: `gc-${r.place_id}`,
        placeId: r.place_id,
        label: r.formatted_address || q,
        secondary: r.formatted_address || 'Villavicencio, Meta',
        kind: 'Dirección',
        source: 'google' as const,
        lat: loc.lat(),
        lng: loc.lng(),
      };
    });
  } catch (err) {
    console.warn('[DomiClick] Geocoder', err);
    return [];
  }
}

function placeDisplayName(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'text' in value) {
    return String((value as { text?: string }).text || '');
  }
  return '';
}

async function searchByTextNew(q: string): Promise<PlaceSuggestion[]> {
  const Place = (window as unknown as { google?: typeof google }).google?.maps?.places?.Place;
  if (!Place?.searchByText) return [];
  const category = resolvePlaceCategory(q);
  const textQuery = category ? categorySearchQuery(category, q) : `${q} Villavicencio Meta Colombia`;
  try {
    const request: google.maps.places.SearchByTextRequest = {
      textQuery,
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
      locationBias: VILLAVICENCIO_CENTER,
      region: 'CO',
      language: 'es',
      maxResultCount: category ? 15 : 10,
    };
    if (category?.googleIncludedType) {
      request.includedType = category.googleIncludedType;
    }
    const { places } = await Place.searchByText(request);
    return (places || [])
      .filter((p) => !category || categoryMatchesPlace(category, {
        label: placeDisplayName(p.displayName) || q,
        kind: kindFromTypes(p.types),
        secondary: p.formattedAddress || undefined,
      }))
      .map((p) => {
      const loc = p.location;
      return {
        id: `nt-${p.id}`,
        placeId: p.id,
        label: placeDisplayName(p.displayName) || q,
        secondary: p.formattedAddress || 'Villavicencio, Meta',
        kind: category?.label || kindFromTypes(p.types),
        source: 'google' as const,
        lat: loc?.lat(),
        lng: loc?.lng(),
      };
    });
  } catch (err) {
    console.warn('[DomiClick] Place.searchByText', err);
    return [];
  }
}

async function searchGooglePlaces(
  places: typeof google.maps.places,
  q: string,
): Promise<PlaceSuggestion[]> {
  if (isStreetSearchQuery(q)) {
    const [autoHits, geoHits] = await Promise.all([
      predictGoogle(places, q).catch(() => [] as PlaceSuggestion[]),
      geocodeGoogle(q),
    ]);
    return mergeSuggestions([autoHits, geoHits], q);
  }

  const [textNew, textOld, autoHits, geoHits] = await Promise.all([
    searchByTextNew(q),
    textSearchGoogle(places, q).catch(() => [] as PlaceSuggestion[]),
    predictGoogle(places, q).catch(() => [] as PlaceSuggestion[]),
    geocodeGoogle(q),
  ]);
  return mergeSuggestions([textNew, textOld, autoHits, geoHits], q);
}

function foldKey(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function inServiceAreaHit(hit: PlaceSuggestion): boolean {
  if (hit.lat == null || hit.lng == null) return true;
  return isWithinServiceArea(hit.lat, hit.lng);
}

function mergeSuggestions(groups: PlaceSuggestion[][], query?: string): PlaceSuggestion[] {
  const category = query ? resolvePlaceCategory(query) : null;
  const streetQuery = query ? isStreetSearchQuery(query) : null;
  const limit = category ? 12 : streetQuery ? 20 : 10;
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const group of groups) {
    for (const hit of group) {
      if (!inServiceAreaHit(hit)) continue;
      if (query && !matchesSearchAnchor(hit, query)) continue;
      const key = streetQuery && (hit.kind === 'Calle / avenida' || hit.kind === 'Dirección')
        ? streetSuggestionKey(hit.label)
        : foldKey(`${hit.label} ${hit.lat?.toFixed(4) || ''} ${hit.lng?.toFixed(4) || ''}`);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function searchPhoton(query: string): Promise<PlaceSuggestion[]> {
  const streetQuery = isStreetSearchQuery(query);
  const normalized = streetQuery ? extractStreetFromQuery(query) : query;
  const queries = [`${normalized} Villavicencio`, normalized];
  const limit = streetQuery ? '15' : '8';
  const batches = await Promise.all(
    queries.map(async (q) => {
      const url =
        'https://photon.komoot.io/api/?' +
        new URLSearchParams({
          q,
          lat: String(VILLAVICENCIO_CENTER.lat),
          lon: String(VILLAVICENCIO_CENTER.lng),
          limit,
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
            if (!isWithinServiceArea(lat, lng)) return null;
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
  return mergeSuggestions(batches, query);
}

async function searchNominatimSuggestions(query: string): Promise<PlaceSuggestion[]> {
  const normalized = extractStreetFromQuery(query);
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: `${normalized}, Villavicencio, Meta, Colombia`,
      format: 'json',
      limit: '15',
      countrycodes: 'co',
      addressdetails: '1',
    });
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      class?: string;
      type?: string;
      address?: { road?: string; suburb?: string; city?: string };
    }>;
    return (data || [])
      .map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lon);
        if (!isWithinServiceArea(lat, lng)) return null;
        const road = row.address?.road;
        const label = road || row.display_name.split(',')[0] || normalized;
        return {
          id: `nom-${row.lon}-${row.lat}-${label}`,
          label,
          secondary: row.display_name.replace(/^[^,]+,?\s*/, '') || 'Villavicencio, Meta',
          kind: nominatimKind(row.class, row.type),
          source: 'nominatim' as const,
          lat,
          lng,
        };
      })
      .filter(Boolean) as PlaceSuggestion[];
  } catch {
    return [];
  }
}

export async function searchPlaceSuggestions(
  query: string,
  placesLib?: google.maps.PlacesLibrary,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const streetQuery = isStreetSearchQuery(q);
  const localHits = searchLocalPlaces(q);
  const places = placesFromLib(placesLib);
  const googlePromise = places
    ? searchGooglePlaces(places, q).catch((err) => {
        console.warn('[DomiClick] Places', err);
        return [] as PlaceSuggestion[];
      })
    : geocodeGoogle(q).catch(() => [] as PlaceSuggestion[]);

  const nominatimPromise = streetQuery
    ? searchNominatimSuggestions(q).catch(() => [] as PlaceSuggestion[])
    : Promise.resolve([] as PlaceSuggestion[]);

  const [googleHits, photonHits, nominatimHits] = await Promise.all([
    googlePromise,
    searchPhoton(q),
    nominatimPromise,
  ]);
  const groups = streetQuery
    ? [localHits, googleHits, nominatimHits, photonHits]
    : [localHits, googleHits, nominatimHits, photonHits];
  return dedupeStreetSuggestions(mergeSuggestions(groups, q));
}

function formatPickedLabel(suggestion: PlaceSuggestion): string {
  const primary = suggestion.label.trim();
  if (!suggestion.secondary || suggestion.secondary === 'Villavicencio, Meta') return primary;
  if (suggestion.secondary.startsWith(primary)) return suggestion.secondary;
  return primary;
}

export async function resolvePlaceSuggestion(
  suggestion: PlaceSuggestion,
  placesLib?: google.maps.PlacesLibrary,
): Promise<(LatLng & { label: string }) | null> {
  if (suggestion.lat != null && suggestion.lng != null) {
    if (!isWithinServiceArea(suggestion.lat, suggestion.lng)) return null;
    return {
      lat: suggestion.lat,
      lng: suggestion.lng,
      label: formatPickedLabel(suggestion),
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
        const lat = loc.lat();
        const lng = loc.lng();
        if (!isWithinServiceArea(lat, lng)) return null;
        return {
          lat,
          lng,
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
      limit: '8',
      countrycodes: 'co',
    });
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  for (const row of data || []) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!isWithinServiceArea(lat, lng)) continue;
    return { lat, lng, label: row.display_name };
  }
  return null;
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
  const g = (window as unknown as { google?: typeof google }).google?.maps;
  if (g?.Geocoder) {
    try {
      const geo = new g.Geocoder();
      const res = await geo.geocode({ location: { lat, lng }, language: 'es' });
      const best = res.results?.[0]?.formatted_address;
      if (best) return best;
    } catch {
      /* fallback nominatim */
    }
  }

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

/** Distancia mínima entre recolección y entrega (~80 m). */
export function coordsTooClose(a: LatLng, b: LatLng, minKm = 0.08): boolean {
  return haversineKm(a, b) < minKm;
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

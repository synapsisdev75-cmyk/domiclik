import { ROAD_FACTOR } from './pricing';
import { GOOGLE_MAPS_API_KEY } from './config';
import { normalizePastedAddress, hasUrbanizationIntent, parseColombianCompoundAddress } from './addressParts';
import {
  searchLocalPlaces,
  matchesSearchAnchor,
  isStreetSearchQuery,
  isStreetOnlyQuery,
  isIntersectionQuery,
  extractStreetFromQuery,
  formatStreetSearchQuery,
  dedupeStreetSuggestions,
  streetSuggestionKey,
  roadNumberFromLabel,
} from './villavicencioPlaces';
import {
  resolvePlaceCategory,
  categorySearchQuery,
  looksLikePlaceQuery,
} from './placeCategories';

export const VILLAVICENCIO_CENTER = { lat: 4.142, lng: -73.6266 };

/** Villavicencio + Restrepo, Acacías, Cumaral y vía Puerto López (solo centro/cámara del mapa). */
export const VILLAVICENCIO_MAP_BOUNDS = {
  south: 3.95,
  west: -73.88,
  north: 4.32,
  east: -73.38,
};

/** Sin restricción de zona: cualquier resultado de geocode/Places es válido. */
export function isWithinServiceArea(_lat: number, _lng: number): boolean {
  return true;
}

export const OUT_OF_AREA_MESSAGE =
  'No encontramos esa dirección. Revisa la placa o el barrio e inténtalo de nuevo.';

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
  /** Miniatura Street View / Places Photo (estilo Maps). */
  photoUrl?: string;
};

/** Miniatura Street View estática (foto esférica recortada). Requiere Street View Static API. */
export function streetViewThumbUrl(lat: number, lng: number, size = '120x120'): string | null {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const params = new URLSearchParams({
    size,
    location: `${lat},${lng}`,
    fov: '90',
    pitch: '0',
    source: 'outdoor',
    key: GOOGLE_MAPS_API_KEY,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

export function withStreetViewPhoto(hit: PlaceSuggestion): PlaceSuggestion {
  if (hit.photoUrl) return hit;
  if (hit.lat == null || hit.lng == null) return hit;
  const photoUrl = streetViewThumbUrl(hit.lat, hit.lng);
  return photoUrl ? { ...hit, photoUrl } : hit;
}

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
  gas_station: 'Gasolinera',
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
  point_of_interest: 'Lugar',
  tourist_attraction: 'Lugar',
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
  const intersection = isIntersectionQuery(q);
  const streetQuery = isStreetSearchQuery(q);
  const hasPlate = /#\s*[\dA-Za-z]|\b\d{1,4}[a-zA-Z]?\s*[-–]\s*\d{1,4}\b/i.test(q);
  const placeLike = looksLikePlaceQuery(q);
  const category = resolvePlaceCategory(q);
  // Lugares / POI: texto libre. Vía/placa: canónico. Categoría: query tipada.
  const core =
    category || placeLike
      ? q.trim()
      : hasPlate
        ? normalizePastedAddress(q) || q.trim()
        : intersection || streetQuery
          ? formatStreetSearchQuery(q)
          : q.trim();
  const input = category
    ? categorySearchQuery(category, q)
    : !/villavicencio/i.test(core)
      ? `${core}, Villavicencio, Meta`
      : core;

  const runPredict = (opts: {
    input: string;
    types?: string[];
  }) =>
    new Promise<google.maps.places.AutocompletePrediction[]>((resolve) => {
      service.getPlacePredictions(
        {
          input: opts.input,
          componentRestrictions: { country: 'co' },
          language: 'es',
          ...(opts.types ? { types: opts.types } : {}),
          locationBias: {
            center: VILLAVICENCIO_CENTER,
            radius: 32000,
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
    });

  // Como Maps: predicciones generales + establecimientos (negocios, sitios).
  const [general, establishments] = await Promise.all([
    runPredict({ input }),
    placeLike || category
      ? runPredict({ input, types: ['establishment'] }).catch(() => [])
      : Promise.resolve([] as google.maps.places.AutocompletePrediction[]),
  ]);

  const seen = new Set<string>();
  const merged: google.maps.places.AutocompletePrediction[] = [];
  for (const p of [...establishments, ...general]) {
    if (!p.place_id || seen.has(p.place_id)) continue;
    seen.add(p.place_id);
    merged.push(p);
  }

  return merged.map((p) => ({
    id: `ac-${p.place_id}`,
    placeId: p.place_id,
    label: p.structured_formatting?.main_text || p.description,
    secondary: p.structured_formatting?.secondary_text || 'Villavicencio, Meta',
    kind:
      intersection || hasPlate
        ? 'Dirección'
        : category
          ? category.label
          : placeLike
            ? kindFromTypes(p.types) || 'Lugar'
            : streetQuery
              ? 'Calle / avenida'
              : kindFromTypes(p.types),
    source: 'google' as const,
  }));
}

async function textSearchGoogle(
  places: typeof google.maps.places,
  q: string,
): Promise<PlaceSuggestion[]> {
  if (!places.PlacesService) return [];
  const category = resolvePlaceCategory(q);
  if (!category) return [];
  const host = document.createElement('div');
  const svc = new places.PlacesService(host);
  const query = categorySearchQuery(category, q);
  const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
    svc.textSearch(
      {
        query,
        location: VILLAVICENCIO_CENTER,
        radius: 28000,
        ...(category.googleIncludedType ? { type: category.googleIncludedType } : {}),
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
  return results.slice(0, 12).map((p) => {
    const loc = p.geometry?.location;
    return {
      id: `ts-${p.place_id || p.name}`,
      placeId: p.place_id,
      label: p.name || p.formatted_address || q,
      secondary: p.vicinity || p.formatted_address || 'Villavicencio, Meta',
      kind: category.label || kindFromTypes(p.types),
      source: 'google' as const,
      lat: loc ? loc.lat() : undefined,
      lng: loc ? loc.lng() : undefined,
    };
  });
}

function geocodeTypeRank(types: string[] | undefined, preferRoute = false): number {
  if (!types?.length) return 0;
  // Vía sola (“Carrera 27”): preferir route sobre street_address con placa ajena.
  if (preferRoute) {
    if (types.includes('route') && !types.includes('street_address')) return 4;
    if (types.includes('street_address') || types.includes('premise') || types.includes('subpremise'))
      return 1;
    if (types.includes('establishment') || types.includes('point_of_interest')) return 0;
    if (types.includes('neighborhood') || types.includes('locality') || types.includes('plus_code'))
      return -1;
    return 0;
  }
  if (types.includes('street_address') || types.includes('premise') || types.includes('subpremise')) return 3;
  if (types.includes('establishment') || types.includes('point_of_interest')) return 2;
  if (types.includes('route')) return 1;
  if (types.includes('neighborhood') || types.includes('locality') || types.includes('plus_code')) return -1;
  return 0;
}

async function findPlaceFromQuery(
  places: typeof google.maps.places,
  q: string,
): Promise<PlaceSuggestion[]> {
  if (!places.PlacesService) return [];
  const host = document.createElement('div');
  const svc = new places.PlacesService(host);
  const query = /villavicencio/i.test(q) ? q : `${q}, Villavicencio, Meta`;
  const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
    svc.findPlaceFromQuery(
      {
        query,
        fields: ['geometry', 'formatted_address', 'name', 'place_id', 'types'],
        locationBias: VILLAVICENCIO_CENTER,
        language: 'es',
      },
      (res, status) => {
        if (
          status !== places.PlacesServiceStatus.OK &&
          status !== places.PlacesServiceStatus.ZERO_RESULTS
        ) {
          console.warn('[DomiClick] Places findPlace status:', status);
          resolve([]);
          return;
        }
        resolve(res || []);
      },
    );
  });
  return results.slice(0, 5).map((p) => {
    const loc = p.geometry?.location;
    return {
      id: `fp-${p.place_id || p.name}`,
      placeId: p.place_id,
      label: p.formatted_address || p.name || q,
      secondary: p.formatted_address || 'Villavicencio, Meta',
      kind: kindFromTypes(p.types) || 'Dirección',
      source: 'google' as const,
      lat: loc ? loc.lat() : undefined,
      lng: loc ? loc.lng() : undefined,
    };
  });
}

/** Variantes como las que entiende Google Maps (Cl. / Calle / con ciudad). */
function addressQueryVariants(raw: string): string[] {
  const base = raw.trim().replace(/\s+/g, ' ');
  const norm = normalizePastedAddress(base) || base;
  const mapsStyle = norm
    .replace(/^Calle\s+/i, 'Cl. ')
    .replace(/^Carrera\s+/i, 'Cra. ')
    .replace(/^Avenida\s+/i, 'Av. ');
  const withCity = (s: string) => (/villavicencio/i.test(s) ? s : `${s}, Villavicencio, Meta`);
  return [
    ...new Set(
      [base, norm, mapsStyle, withCity(base), withCity(norm), withCity(mapsStyle)].map((s) =>
        s.replace(/\s+/g, ' ').trim(),
      ),
    ),
  ].filter((s) => s.length >= 3);
}

async function geocodeGoogle(q: string): Promise<PlaceSuggestion[]> {
  const g = (window as unknown as { google?: typeof google }).google?.maps;
  if (!g?.Geocoder) return [];
  const geo = new g.Geocoder();
  const streetOnly = isStreetOnlyQuery(q);
  const intersection = isIntersectionQuery(q);
  const variants = streetOnly || intersection
    ? [
        (() => {
          const road = formatStreetSearchQuery(q) || q;
          return /villavicencio/i.test(road)
            ? road
            : `${road}, Villavicencio, Meta, Colombia`;
        })(),
      ]
    : addressQueryVariants(q).map((v) =>
        /colombia/i.test(v) ? v : `${v.replace(/,?\s*$/, '')}, Colombia`,
      );

  const all: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const address of variants.slice(0, 4)) {
    try {
      const res = await geo.geocode({
        address: address.replace(/\s+/g, ' ').trim(),
        componentRestrictions: { country: 'CO' },
        language: 'es',
      });
      for (const r of res.results || []) {
        const loc = r.geometry.location;
        if (!isWithinServiceArea(loc.lat(), loc.lng())) continue;
        if (
          streetOnly &&
          !matchesSearchAnchor({ label: r.formatted_address || address, kind: 'Dirección' }, q)
        ) {
          continue;
        }
        const id = r.place_id || `${loc.lat()},${loc.lng()}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const types = r.types || [];
        const isRouteOnly = types.includes('route') && !types.includes('street_address');
        all.push({
          id: `gc-${id}`,
          placeId: r.place_id,
          label: r.formatted_address || q,
          secondary: r.formatted_address || 'Villavicencio, Meta',
          kind: intersection
            ? 'Dirección'
            : isRouteOnly
              ? 'Calle / avenida'
              : kindFromTypes(types) || 'Dirección',
          source: 'google',
          lat: loc.lat(),
          lng: loc.lng(),
        });
      }
      if (all.length) break;
    } catch (err) {
      console.warn('[DomiClick] Geocoder', address, err);
    }
  }
  return all.slice(0, 6);
}

async function textSearchFreeForm(
  places: typeof google.maps.places,
  q: string,
): Promise<PlaceSuggestion[]> {
  if (!places.PlacesService) return [];
  const host = document.createElement('div');
  const svc = new places.PlacesService(host);
  const query = /villavicencio/i.test(q) ? q : `${q} Villavicencio Meta`;
  const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
    svc.textSearch(
      {
        query,
        location: VILLAVICENCIO_CENTER,
        radius: 32000,
      },
      (res, status) => {
        if (
          status !== places.PlacesServiceStatus.OK &&
          status !== places.PlacesServiceStatus.ZERO_RESULTS
        ) {
          console.warn('[DomiClick] Places textSearch free status:', status);
          resolve([]);
          return;
        }
        resolve(res || []);
      },
    );
  });
  return results.slice(0, 12).map((p) => {
    const loc = p.geometry?.location;
    return {
      id: `tf-${p.place_id || p.name}`,
      placeId: p.place_id,
      label: p.name || p.formatted_address || q,
      secondary: p.vicinity || p.formatted_address || 'Villavicencio, Meta',
      kind: kindFromTypes(p.types) || 'Lugar',
      source: 'google' as const,
      lat: loc ? loc.lat() : undefined,
      lng: loc ? loc.lng() : undefined,
    };
  });
}

/**
 * Motor estilo Google Maps:
 * 1) Autocomplete (direcciones + establecimientos)
 * 2) TextSearch para negocios / hospitales / parques / urbanizaciones
 * 3) Geocode si hay vía/#
 * 4) Nominatim si hace falta
 */
async function searchGooglePlaces(
  places: typeof google.maps.places,
  q: string,
): Promise<PlaceSuggestion[]> {
  const category = resolvePlaceCategory(q);
  const streetQuery = isStreetSearchQuery(q);
  const intersection = isIntersectionQuery(q);
  const streetOnly = isStreetOnlyQuery(q);
  const exactPlate =
    /#\s*[\dA-Za-z]|\bno\.?\s*\d|\b\d{1,4}[a-zA-Z]?\s*[-–]\s*\d{1,4}\b/i.test(q);
  const placeLike = looksLikePlaceQuery(q) || !!category || hasUrbanizationIntent(q);
  const wantsExactAddress = exactPlate || streetQuery || intersection;

  const autoPromise = predictGoogle(places, q).catch(() => [] as PlaceSuggestion[]);
  const geoPromise = wantsExactAddress
    ? geocodeGoogle(q).catch(() => [] as PlaceSuggestion[])
    : Promise.resolve([] as PlaceSuggestion[]);

  // Lugares / categorías: TextSearch siempre (negocios, hospitales, parques…).
  // Direcciones con placa: también TextSearch (Maps).
  // Vía sola pura: no saturar con POIs.
  const textPromise =
    category
      ? Promise.all([
          textSearchGoogle(places, q).catch(() => [] as PlaceSuggestion[]),
          textSearchFreeForm(places, q).catch(() => [] as PlaceSuggestion[]),
        ]).then(([a, b]) => [...a, ...b])
      : placeLike || exactPlate || !streetOnly
        ? textSearchFreeForm(places, q).catch(() => [] as PlaceSuggestion[])
        : Promise.resolve([] as PlaceSuggestion[]);

  const [autoHits, geoHits, textHits] = await Promise.all([autoPromise, geoPromise, textPromise]);

  if (placeLike && !exactPlate && !intersection) {
    return mergeSuggestions([textHits, autoHits, geoHits], q);
  }
  if (intersection || exactPlate) {
    return mergeSuggestions([textHits, geoHits, autoHits], q);
  }
  if (streetOnly) {
    return mergeSuggestions([geoHits, autoHits, textHits], q);
  }
  return mergeSuggestions([autoHits, textHits, geoHits], q);
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

/**
 * Ranking: con placa → dirección puntual; vía sola → calle/ruta (no placa ajena).
 */
function precisionScore(hit: PlaceSuggestion, query?: string): number {
  const streetOnly = query ? isStreetOnlyQuery(query) : false;
  const intersection = query ? isIntersectionQuery(query) : false;
  const urbIntent = query ? hasUrbanizationIntent(query) : false;
  const compound = query ? parseColombianCompoundAddress(query) : null;
  const hasPlate = query
    ? /#\s*[\dA-Za-z]|\b\d{1,4}[a-zA-Z]?\s*[-–]\s*\d{1,4}\b/i.test(query)
    : false;
  const placeLike = query ? looksLikePlaceQuery(query) : false;
  const category = query ? resolvePlaceCategory(query) : null;
  let score = 0;
  if (hit.placeId) score += streetOnly ? 20 : 45;
  if (hit.source === 'local') score += streetOnly ? 35 : hasPlate || intersection ? -40 : placeLike ? 25 : 10;
  else if (hit.source === 'google') score += 18;
  else score += 4;

  switch (hit.kind) {
    case 'Dirección':
      score += intersection ? 70 : streetOnly ? 8 : urbIntent ? 20 : hasPlate ? 80 : 40;
      break;
    case 'Urbanización':
      score += urbIntent || placeLike ? 80 : streetOnly || intersection ? 10 : 45;
      break;
    case 'Negocio':
    case 'Hospital':
    case 'Clínica':
    case 'Colegio':
    case 'Universidad':
    case 'Centro comercial':
    case 'Supermercado':
    case 'Farmacia':
    case 'Hotel':
    case 'Parque':
    case 'Estadio':
    case 'Aeropuerto':
    case 'Terminal':
    case 'Iglesia':
    case 'Banco':
    case 'Gasolinera':
    case 'Restaurante':
    case 'Lugar':
      score += streetOnly || intersection ? 8 : placeLike || category ? 55 : 32;
      break;
    case 'Calle / avenida':
      score += intersection
        ? -50
        : urbIntent || placeLike
          ? -45
          : streetOnly
            ? 55
            : hasPlate
              ? -60
              : 6;
      break;
    case 'Barrio':
    case 'Zona':
      score += urbIntent || placeLike || category ? 55 : streetOnly ? -12 : 30;
      break;
    default:
      score += placeLike ? 28 : 14;
  }

  if (hit.lat != null && hit.lng != null) {
    const d = haversineKm({ lat: hit.lat, lng: hit.lng }, VILLAVICENCIO_CENTER);
    score += Math.max(0, 18 - d * 1.2);
  }

  if (query && compound?.urbanization) {
    const name = foldKey(compound.urbanization);
    const hay = foldKey(`${hit.label} ${hit.secondary}`);
    if (name && hay.includes(name)) score += 90;
  }

  if (query) {
    const streetPart = extractStreetFromQuery(query);
    const qRoad = roadNumberFromLabel(streetPart);
    const hitRoad = roadNumberFromLabel(hit.label);
    if (qRoad && hitRoad) {
      const qParts = qRoad.split(' ');
      const hParts = hitRoad.split(' ');
      if (qParts[0] === hParts[0]) score += 30;
      // Letra/cardinal exactos
      if (qRoad === hitRoad) score += 25;
      else if (qParts[0] !== hParts[0]) score -= 50;
    }
    const q = foldKey(streetPart);
    const label = foldKey(hit.label);
    if (q && (label === q || label.startsWith(q + ' ') || label.includes(q))) score += 12;
    if (/\b(norte|sur|este|oeste)\b/i.test(query) && /\b(norte|sur|este|oeste)\b/i.test(hit.label)) {
      const qCard = query.match(/\b(norte|sur|este|oeste)\b/i)?.[1]?.toLowerCase();
      const hCard = hit.label.match(/\b(norte|sur|este|oeste)\b/i)?.[1]?.toLowerCase();
      if (qCard && hCard && qCard === hCard) score += 20;
      if (qCard && hCard && qCard !== hCard) score -= 35;
    }
    if (/#\s*\d/.test(query) && /#\s*\d/.test(hit.label + hit.secondary)) score += 12;
  }
  return score;
}

function mergeSuggestions(groups: PlaceSuggestion[][], query?: string): PlaceSuggestion[] {
  const category = query ? resolvePlaceCategory(query) : null;
  const streetQuery = query ? isStreetSearchQuery(query) : null;
  const limit = category ? 10 : streetQuery ? 12 : 10;
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const group of groups) {
    for (const hit of group) {
      if (!inServiceAreaHit(hit)) continue;
      // Google ya rankea (estilo Maps). El ancla estricto solo filtra gazetteer / Nominatim.
      if (query && hit.source !== 'google' && !matchesSearchAnchor(hit, query)) continue;
      const key =
        hit.placeId ||
        (streetQuery && (hit.kind === 'Calle / avenida' || hit.kind === 'Dirección')
          ? streetSuggestionKey(hit.label)
          : foldKey(`${hit.label} ${hit.lat?.toFixed(4) || ''} ${hit.lng?.toFixed(4) || ''}`));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(withStreetViewPhoto(hit));
    }
  }
  out.sort((a, b) => precisionScore(b, query) - precisionScore(a, query));
  return out.slice(0, limit).map(withStreetViewPhoto);
}

async function searchNominatimSuggestions(query: string): Promise<PlaceSuggestion[]> {
  const normalized = extractStreetFromQuery(query);
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: `${normalized}, Villavicencio, Meta, Colombia`,
      format: 'json',
      limit: '8',
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
  const q = normalizeColombianQuery(query);
  if (q.length < 2) return [];

  const localHits = searchLocalPlaces(q);
  const places = placesFromLib(placesLib);
  const streetOnly = isStreetOnlyQuery(q);

  let googleHits: PlaceSuggestion[] = [];
  if (places) {
    googleHits = await searchGooglePlaces(places, q).catch((err) => {
      console.warn('[DomiClick] Places', err);
      return [] as PlaceSuggestion[];
    });
  } else {
    googleHits = await geocodeGoogle(q).catch(() => [] as PlaceSuggestion[]);
  }

  // Nominatim solo si Google no dio resultados útiles.
  const needFallback = googleHits.length < 2;
  const nominatimHits = needFallback
    ? await searchNominatimSuggestions(q).catch(() => [] as PlaceSuggestion[])
    : [];

  // Vía sola: Google primero (etiqueta Cl./Cra. como Maps); local refuerza coords.
  const groups = streetOnly
    ? [googleHits, localHits, nominatimHits]
    : [googleHits, localHits, nominatimHits];
  return dedupeStreetSuggestions(mergeSuggestions(groups, q));
}

/** Secondary de UI (tramos, hints) — no debe ir a la barra de dirección. */
function isMetaSecondary(secondary: string): boolean {
  return /tramo|casco urbano|b[uú]squeda reciente|·\s*\d/i.test(secondary);
}

/**
 * Etiqueta estilo Google Maps para la barra:
 * “Cl. 31, Villavicencio, Meta” / “Cra. 40 # 12-34, Villavicencio, Meta”
 */
export function formatMapsStyleAddress(label: string, secondary?: string): string {
  let primary = label.trim().replace(/\s+/g, ' ');
  primary = primary
    .replace(/\s*·\s*\d+\s*tramo.*/i, '')
    .replace(/,?\s*Villavicencio\s*·.*/i, '')
    .trim();

  // Abreviaturas como en Maps (Cl. / Cra. / Av.)
  primary = primary
    .replace(/^Calle\s+/i, 'Cl. ')
    .replace(/^Carrera\s+/i, 'Cra. ')
    .replace(/^Avenida\s+/i, 'Av. ')
    .replace(/^Diagonal\s+/i, 'Dg. ')
    .replace(/^Transversal\s+/i, 'Tv. ')
    .replace(/^Circunvalar\s+/i, 'Circunvalar ');

  const sec = (secondary || '').trim();
  if (sec && !isMetaSecondary(sec)) {
    if (sec.startsWith(primary)) return sec;
    if (/villavicencio/i.test(primary)) return primary;
    if (/villavicencio/i.test(sec) && !/^villavicencio/i.test(sec)) {
      // secondary ya es dirección completa de Google
      if (/#|cl\.|cra\.|calle|carrera/i.test(sec)) return sec;
    }
    if (/^villavicencio/i.test(sec)) return `${primary}, ${sec.replace(/,?\s*colombia\s*$/i, '').trim()}`;
  }

  if (/villavicencio/i.test(primary)) {
    if (!/,?\s*meta\b/i.test(primary)) return `${primary.replace(/,?\s*colombia\s*$/i, '').trim()}, Meta`;
    return primary.replace(/,?\s*colombia\s*$/i, '').trim();
  }
  return `${primary}, Villavicencio, Meta`;
}

function formatPickedLabel(suggestion: PlaceSuggestion): string {
  // Si Google ya dio formatted_address largo, respétalo.
  if (
    suggestion.source === 'google' &&
    /villavicencio/i.test(suggestion.label) &&
    !isMetaSecondary(suggestion.label)
  ) {
    return suggestion.label.replace(/,?\s*colombia\s*$/i, '').trim();
  }
  return formatMapsStyleAddress(suggestion.label, suggestion.secondary);
}

export async function resolvePlaceSuggestion(
  suggestion: PlaceSuggestion,
  placesLib?: google.maps.PlacesLibrary,
): Promise<(LatLng & { label: string }) | null> {
  // Siempre Place Details con placeId (coords de geocode/local pueden ser centroides).
  if (suggestion.placeId) {
    const places = placesFromLib(placesLib);
    if (places?.PlacesService) {
      const host = document.createElement('div');
      const svc = new places.PlacesService(host);
      const details = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
        svc.getDetails(
          {
            placeId: suggestion.placeId!,
            fields: ['geometry', 'formatted_address', 'name', 'types', 'photos'],
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
        const placePhoto = details.photos?.[0]?.getUrl?.({ maxWidth: 240, maxHeight: 240 });
        return {
          lat,
          lng,
          label: formatMapsStyleAddress(
            details.formatted_address || details.name || formatPickedLabel(suggestion),
          ),
          ...(placePhoto ? { photoUrl: placePhoto } : {}),
        };
      }
    }
  }
  if (suggestion.lat != null && suggestion.lng != null) {
    if (!isWithinServiceArea(suggestion.lat, suggestion.lng)) return null;
    let label = formatPickedLabel(suggestion);
    // Calle local: intentar etiqueta Google (Cl. 31, Villavicencio, Meta) sin “tramos”.
    if (suggestion.kind === 'Calle / avenida' || suggestion.source === 'local') {
      try {
        const gHits = await geocodeGoogle(
          formatStreetSearchQuery(suggestion.label) || suggestion.label,
        );
        const match = gHits.find(
          (h) =>
            h.lat != null &&
            matchesSearchAnchor({ label: h.label, kind: h.kind }, suggestion.label),
        );
        if (match?.label) {
          label = formatMapsStyleAddress(match.label);
          return {
            lat: match.lat ?? suggestion.lat,
            lng: match.lng ?? suggestion.lng,
            label,
          };
        }
      } catch {
        /* keep local */
      }
      label = formatMapsStyleAddress(suggestion.label);
    }
    return {
      lat: suggestion.lat,
      lng: suggestion.lng,
      label,
    };
  }
  return geocodeAddressNominatim(qSafe(suggestion.label));
}

/** Normaliza abreviaturas y formato # colombiano en una sola pasada. */
function normalizeColombianQuery(q: string): string {
  const compound = parseColombianCompoundAddress(q);
  if (compound.isCompound && compound.geocodeQuery) return compound.geocodeQuery;
  if (compound.isCompound && compound.searchQuery) return compound.searchQuery;
  // Cruce sin placa → “Avenida 40 con Carrera 31”
  if (isIntersectionQuery(q) && isStreetOnlyQuery(q)) return formatStreetSearchQuery(q);
  // Vía sola sin # → canónica; CON placa (#37l-9) → no botar el número
  if (isStreetSearchQuery(q) && isStreetOnlyQuery(q)) return formatStreetSearchQuery(q);
  return normalizePastedAddress(q) || q.trim();
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
  const typed = query.trim();
  const q = normalizeColombianQuery(typed);
  if (q.length < 3) return null;

  const withCity = /villavicencio/i.test(q) ? q : `${q}, Villavicencio, Meta`;
  const streetOnly = isStreetOnlyQuery(withCity);
  const intersection = isIntersectionQuery(typed) || isIntersectionQuery(withCity);
  const hasPlate = /#\s*[\dA-Za-z]|\b\d{1,4}[a-zA-Z]?\s*[-–]\s*\d{1,4}\b/i.test(withCity);
  const places = placesFromLib(placesLib);

  // Como Google Maps: Places findPlace / textSearch con el texto escrito (Cl. 23 # 37L-9).
  if (places && (hasPlate || !streetOnly)) {
    const variants = addressQueryVariants(typed || q).slice(0, 3);
    for (const variant of variants) {
      const found = await findPlaceFromQuery(places, variant).catch(() => [] as PlaceSuggestion[]);
      const hit =
        found.find((h) => h.lat != null && h.lng != null) ||
        (found[0]?.placeId
          ? await resolvePlaceSuggestion(found[0], placesLib)
          : null);
      if (hit && 'lat' in hit && hit.lat != null && hit.lng != null) {
        return {
          lat: hit.lat,
          lng: hit.lng,
          label: formatMapsStyleAddress(hit.label),
        };
      }
      const textHits = await textSearchFreeForm(places, variant).catch(
        () => [] as PlaceSuggestion[],
      );
      const ranked = [...textHits].sort(
        (a, b) => precisionScore(b, variant) - precisionScore(a, variant),
      );
      const pick =
        ranked.find((h) => /#|37l|street_address|premise/i.test(`${h.label} ${h.secondary} ${h.kind}`)) ||
        ranked.find((h) => h.kind === 'Dirección' && h.lat != null) ||
        ranked.find((h) => h.lat != null && h.kind !== 'Calle / avenida') ||
        null;
      if (pick) {
        const resolved = await resolvePlaceSuggestion(pick, placesLib);
        if (resolved) return resolved;
      }
    }
  }

  // Geocoder (variantes Cl./Calle).
  const geoHits = await geocodeGoogle(withCity).catch(() => [] as PlaceSuggestion[]);
  if (geoHits.length) {
    const ranked = [...geoHits].sort(
      (a, b) => precisionScore(b, withCity) - precisionScore(a, withCity),
    );
    const pick = intersection
      ? ranked.find((h) => h.lat != null) || ranked[0]
      : hasPlate || !streetOnly
        ? ranked.find((h) => h.kind === 'Dirección' && h.lat != null) ||
          ranked.find((h) => h.lat != null && h.kind !== 'Calle / avenida') ||
          ranked.find((h) => h.lat != null) ||
          ranked[0]
        : ranked.find((h) => h.kind === 'Calle / avenida' && h.lat != null) ||
          ranked.find((h) => h.lat != null) ||
          ranked[0];
    if (pick?.lat != null && pick.lng != null) {
      return {
        lat: pick.lat,
        lng: pick.lng,
        label: formatMapsStyleAddress(pick.label, pick.secondary),
      };
    }
  }

  // Último recurso: motor de sugerencias (sin forzar calle local si hay placa).
  const hits = await searchPlaceSuggestions(withCity, placesLib);
  if (hits[0]) {
    const ranked = [...hits].sort((a, b) => precisionScore(b, withCity) - precisionScore(a, withCity));
    const pick = hasPlate
      ? ranked.find((h) => h.source === 'google' && h.placeId) ||
        ranked.find((h) => h.source === 'google' && h.lat != null) ||
        null
      : streetOnly
        ? ranked.find((h) => h.kind === 'Calle / avenida' && h.lat != null) ||
          ranked.find((h) => h.lat != null) ||
          ranked[0]
        : ranked.find((h) => h.placeId) || ranked[0];
    if (pick) {
      const resolved = await resolvePlaceSuggestion(pick, placesLib);
      if (resolved) return resolved;
    }
  }
  return geocodeAddressNominatim(withCity);
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const g = (window as unknown as { google?: typeof google }).google?.maps;
  if (g?.Geocoder) {
    try {
      const geo = new g.Geocoder();
      const res = await geo.geocode({ location: { lat, lng }, language: 'es' });
      const ranked = [...(res.results || [])].sort(
        (a, b) => geocodeTypeRank(b.types) - geocodeTypeRank(a.types),
      );
      const best = ranked[0]?.formatted_address || res.results?.[0]?.formatted_address;
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

  const requestOnce = (travelMode: google.maps.TravelMode) =>
    new Promise<RouteEstimate | null>((resolve) => {
      const timer = window.setTimeout(() => {
        console.warn('[DomiClick] Google Directions timeout', travelMode);
        resolve(null);
      }, 5000);

      service.route(
        {
          origin: from,
          destination: to,
          travelMode,
          provideRouteAlternatives: false,
          optimizeWaypoints: false,
        },
        (result, status) => {
          window.clearTimeout(timer);
          if (status !== g.maps.DirectionsStatus.OK || !result?.routes?.[0]?.legs?.[0]) {
            console.warn('[DomiClick] Google Directions:', status, travelMode);
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

  return (async () => {
    const driving = await requestOnce(g.maps.TravelMode.DRIVING);
    if (driving && driving.path.length > 2) return driving;
    const twoWheeler = (g.maps.TravelMode as { TWO_WHEELER?: google.maps.TravelMode }).TWO_WHEELER;
    if (twoWheeler) {
      const bike = await requestOnce(twoWheeler);
      if (bike && bike.path.length > 2) return bike;
    }
    return driving;
  })();
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
      const t = window.setTimeout(() => controller.abort(), 8000);
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
 * Ruta por calles: OSRM (rápido/fiable) → Google Directions → línea aproximada.
 * OSRM primero porque la key de Maps en "development only" a menudo bloquea Directions.
 */
export async function estimateRoute(from: LatLng, to: LatLng): Promise<RouteEstimate> {
  const osrm = await estimateRouteWithOsrm(from, to);
  if (osrm && osrm.path.length > 2) return osrm;

  if (GOOGLE_MAPS_API_KEY) {
    const googleRoute = await estimateRouteWithGoogle(from, to);
    if (googleRoute && googleRoute.path.length > 2) return googleRoute;
    if (googleRoute) return googleRoute;
  }

  if (osrm) return osrm;
  return approxRoute(from, to);
}

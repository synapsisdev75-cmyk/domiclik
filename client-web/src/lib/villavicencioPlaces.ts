import type { PlaceSuggestion } from './geo';
import gazetteer from '../data/villavicencio-map.json' with { type: 'json' };
import businesses from '../data/villavicencio-businesses.json' with { type: 'json' };
import {
  resolvePlaceCategory,
  categoryMatchesPlace,
  type PlaceCategory,
} from './placeCategories';

type NamedPlace = {
  label: string;
  secondary: string;
  kind: string;
  aliases?: string[];
  lat: number;
  lng: number;
};

/** Sitios frecuentes de Villavicencio para adivinar mientras el usuario escribe. */
export const VILLAVICENCIO_PLACES: Array<{
  label: string;
  secondary: string;
  kind: string;
  aliases: string[];
  lat: number;
  lng: number;
}> = [
  {
    label: 'Universidad de los Llanos (Unillanos)',
    secondary: 'Km 12 Vía Puerto López, Villavicencio',
    kind: 'Universidad',
    aliases: ['universidad', 'unillanos', 'llanos', 'uni llanos', 'sede barcelona'],
    lat: 4.0748,
    lng: -73.5852,
  },
  {
    label: 'Universidad Cooperativa de Colombia',
    secondary: 'Calle 35, Villavicencio',
    kind: 'Universidad',
    aliases: ['universidad', 'cooperativa', 'ucc', 'ucc villavo'],
    lat: 4.1426,
    lng: -73.6358,
  },
  {
    label: 'Universidad Santo Tomás',
    secondary: 'Av. Circunvalar, Villavicencio',
    kind: 'Universidad',
    aliases: ['universidad', 'santo tomas', 'usta', 'tomas'],
    lat: 4.1382,
    lng: -73.6261,
  },
  {
    label: 'Corporación Universitaria del Meta (UNIMETA)',
    secondary: 'Av. 40, Villavicencio',
    kind: 'Universidad',
    aliases: ['universidad', 'unimeta', 'meta', 'corporacion'],
    lat: 4.1368,
    lng: -73.6269,
  },
  {
    label: 'SENA Centro Agroindustrial del Meta',
    secondary: 'Villavicencio, Meta',
    kind: 'Universidad',
    aliases: ['sena', 'universidad', 'agroindustrial'],
    lat: 4.1234,
    lng: -73.618,
  },
  {
    label: 'Unicentro Villavicencio',
    secondary: 'Calle 26B, Nuevo Maizaro',
    kind: 'Centro comercial',
    aliases: ['unicentro', 'uni', 'centro comercial unicentro'],
    lat: 4.14185,
    lng: -73.63398,
  },
  {
    label: 'C.C. Viva Villavicencio',
    secondary: 'Avenida 40',
    kind: 'Centro comercial',
    aliases: ['viva', 'centro comercial viva', 'cc viva'],
    lat: 4.135,
    lng: -73.625,
  },
  {
    label: 'Hospital Militar de Oriente',
    secondary: 'Vía Villavicencio – Puerto López',
    kind: 'Hospital',
    aliases: ['hospital militar', 'militar', 'oriente', 'hospital'],
    lat: 4.1294,
    lng: -73.6088,
  },
  {
    label: 'Hospital Departamental de Villavicencio',
    secondary: 'Barzal, Villavicencio',
    kind: 'Hospital',
    aliases: ['hospital', 'departamental', 'barzal'],
    lat: 4.1458,
    lng: -73.6324,
  },
  {
    label: 'Clínica Meta',
    secondary: 'Barzal, Villavicencio',
    kind: 'Salud',
    aliases: ['clinica', 'clinica meta', 'barzal'],
    lat: 4.1452,
    lng: -73.6331,
  },
  {
    label: 'Terminal de Transportes',
    secondary: 'Anillo Vial, Villavicencio',
    kind: 'Terminal',
    aliases: ['terminal', 'bus', 'transportes'],
    lat: 4.118,
    lng: -73.615,
  },
  {
    label: 'Aeropuerto Vanguardia',
    secondary: 'Villavicencio, Meta',
    kind: 'Aeropuerto',
    aliases: ['aeropuerto', 'vanguardia', 'avion'],
    lat: 4.1678,
    lng: -73.6138,
  },
  {
    label: 'Plaza Los Centauros',
    secondary: 'Centro, Villavicencio',
    kind: 'Sitio',
    aliases: ['plaza', 'centauros', 'centro', 'parque centauros'],
    lat: 4.1502,
    lng: -73.6372,
  },
  {
    label: 'Parque Los Fundadores',
    secondary: 'Centro, Villavicencio',
    kind: 'Parque',
    aliases: ['parque', 'fundadores'],
    lat: 4.1514,
    lng: -73.6388,
  },
  {
    label: 'Parque La Llanura',
    secondary: 'Villavicencio',
    kind: 'Parque',
    aliases: ['parque', 'llanura'],
    lat: 4.1429,
    lng: -73.6294,
  },
  {
    label: 'Catedral Nuestra Señora del Carmen',
    secondary: 'Centro, Villavicencio',
    kind: 'Iglesia',
    aliases: ['catedral', 'iglesia', 'carmen'],
    lat: 4.1508,
    lng: -73.6378,
  },
  {
    label: 'Estadio Manuel Calle Lombana',
    secondary: 'Villavicencio',
    kind: 'Estadio',
    aliases: ['estadio', 'calle lombana', 'futbol'],
    lat: 4.1466,
    lng: -73.6198,
  },
  {
    label: 'Alcaldía de Villavicencio',
    secondary: 'Centro',
    kind: 'Sitio',
    aliases: ['alcaldia', 'alcaldía', 'prefectura', 'gobierno'],
    lat: 4.1429,
    lng: -73.6266,
  },
  {
    label: 'Barzal Alto',
    secondary: 'Zona médica',
    kind: 'Barrio',
    aliases: ['barzal', 'zona medica', 'clinicas'],
    lat: 4.145,
    lng: -73.633,
  },
  {
    label: 'Siete de Agosto',
    secondary: 'Zona comercial',
    kind: 'Barrio',
    aliases: ['siete de agosto', '7 de agosto', 'agosto', 'galeria', 'galería'],
    lat: 4.1415,
    lng: -73.628,
  },
  {
    label: 'La Grama',
    secondary: 'Salida a Restrepo',
    kind: 'Barrio',
    aliases: ['grama', 'la grama', 'restrepo'],
    lat: 4.161,
    lng: -73.641,
  },
  {
    label: 'El Buque',
    secondary: 'Villavicencio',
    kind: 'Barrio',
    aliases: ['buque', 'el buque'],
    lat: 4.152,
    lng: -73.629,
  },
  {
    label: 'San Benito',
    secondary: 'Centro tradicional',
    kind: 'Barrio',
    aliases: ['san benito', 'benito'],
    lat: 4.147,
    lng: -73.638,
  },
  {
    label: 'Nuevo Maizaro',
    secondary: 'Comuna 6',
    kind: 'Barrio',
    aliases: ['maizaro', 'nuevo maizaro'],
    lat: 4.142,
    lng: -73.634,
  },
  {
    label: 'Amarilo / Llano Lindo',
    secondary: 'Sur de Villavicencio',
    kind: 'Urbanización',
    aliases: ['amarilo', 'llano lindo', 'sur'],
    lat: 4.108,
    lng: -73.595,
  },
  {
    label: 'Catama',
    secondary: 'Villavicencio',
    kind: 'Barrio',
    aliases: ['catama'],
    lat: 4.128,
    lng: -73.64,
  },
  {
    label: 'La Esperanza',
    secondary: 'Villavicencio',
    kind: 'Barrio',
    aliases: ['esperanza', 'la esperanza'],
    lat: 4.155,
    lng: -73.62,
  },
  {
    label: 'Pombo',
    secondary: 'Villavicencio',
    kind: 'Barrio',
    aliases: ['pombo'],
    lat: 4.1485,
    lng: -73.621,
  },
  {
    label: 'Galería 7 de Agosto',
    secondary: 'Plaza de mercado, Villavicencio',
    kind: 'Mercado',
    aliases: ['galeria', 'galería', 'galeria 7 de agosto', 'plaza de mercado', 'siete de agosto'],
    lat: 4.1419,
    lng: -73.6294,
  },
  {
    label: 'Polideportivo Barrio Morichal',
    secondary: 'Morichal, Villavicencio',
    kind: 'Sitio',
    aliases: ['poli', 'polideportivo', 'morichal'],
    lat: 4.1562,
    lng: -73.6184,
  },
  {
    label: 'Club Villavicencio',
    secondary: 'Villavicencio',
    kind: 'Sitio',
    aliases: ['club', 'club villavicencio'],
    lat: 4.1438,
    lng: -73.6312,
  },
  {
    label: 'Servimedicos',
    secondary: 'Cerca a Unicentro',
    kind: 'Salud',
    aliases: ['servimedicos', 'servi medicos'],
    lat: 4.1424,
    lng: -73.6332,
  },
  {
    label: 'Heladería Popsy Unicentro',
    secondary: 'Unicentro Villavicencio',
    kind: 'Heladería',
    aliases: ['heladeria', 'heladería', 'popsy', 'helado'],
    lat: 4.1419,
    lng: -73.634,
  },
  {
    label: 'Heladería Corocora',
    secondary: 'Villavicencio',
    kind: 'Heladería',
    aliases: ['heladeria', 'heladería', 'corocora', 'helado'],
    lat: 4.1501,
    lng: -73.6368,
  },
  {
    label: 'Plaza de Mercado La Grama',
    secondary: 'La Grama',
    kind: 'Mercado',
    aliases: ['galeria', 'mercado', 'grama'],
    lat: 4.1604,
    lng: -73.6402,
  },
  {
    label: 'Mirador La Piedra del Amor',
    secondary: 'Km 7 vía antigua Bogotá, Buenavista',
    kind: 'Museo / mirador',
    aliases: [
      'museo mirador de piedra',
      'museo mirador piedra del amor',
      'mirador piedra del amor',
      'piedra del amor',
      'mirador la piedra',
      'museo',
      'mirador',
      'piedra',
      'buenavista',
    ],
    lat: 4.17153,
    lng: -73.67521,
  },
];

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const STOP_WORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'en',
  'y',
  'a',
  'al',
  'un',
  'una',
  'por',
  'con',
  'para',
]);

const GENERIC_KINDS = new Set(['calle / avenida', 'direccion', 'dirección', 'lugar', 'negocio']);

const STREET_WORDS = new Set([
  'calle',
  'carrera',
  'avenida',
  'diagonal',
  'transversal',
  'travesia',
  'circunvalar',
  'cl',
  'cra',
  'cr',
  'kr',
  'av',
  'ak',
  'dg',
  'diag',
  'trans',
  'trv',
  'tv',
]);

const STREET_ABBREV: Array<[RegExp, string]> = [
  [/\bcl\.?\b/gi, 'calle'],
  [/\bcra\.?\b/gi, 'carrera'],
  [/\bcr\.?\b/gi, 'carrera'],
  [/\bkr\.?\b/gi, 'carrera'],
  [/\bav\.?\b/gi, 'avenida'],
  [/\bak\.?\b/gi, 'avenida'],
  [/\bdg\.?\b/gi, 'diagonal'],
  [/\bdiag\.?\b/gi, 'diagonal'],
  [/\btrans\.?\b/gi, 'transversal'],
  [/\btrv\.?\b/gi, 'travesia'],
  [/\btv\.?\b/gi, 'travesia'],
];

export function normalizeStreetQuery(query: string): string {
  let q = query.trim();
  for (const [re, rep] of STREET_ABBREV) q = q.replace(re, rep);
  return q.replace(/\s+/g, ' ').trim();
}

/** Quita ciudad / departamento cuando el usuario pega una dirección completa. */
export function extractStreetFromQuery(query: string): string {
  return normalizeStreetQuery(query)
    .replace(/,?\s*villavicencio\b[\s,].*$/i, '')
    .replace(/,?\s*meta\b[\s,].*$/i, '')
    .replace(/,?\s*colombia\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isStreetSearchQuery(query: string): boolean {
  const raw = fold(query.trim());
  if (/\b(cl|cra|cr|kr|av|ak|dg|diag|trans|trv|tv)\b/.test(raw)) return true;
  if (/\d+\s*[-#]\s*\d+/.test(raw)) return true;
  const q = fold(normalizeStreetQuery(query));
  return /\b(calle|carrera|avenida|diagonal|transversal|travesia|circunvalar)\b/.test(q);
}

export function parseSearchTokens(query: string): string[] {
  return fold(query.trim())
    .split(/\s+/)
    .filter((t) => (t.length >= 2 || /^\d+[a-z]?$/.test(t)) && !STOP_WORDS.has(t));
}

function labelHay(place: Pick<NamedPlace, 'label' | 'kind' | 'aliases'>) {
  return fold([place.label, place.kind, ...(place.aliases || [])].join(' '));
}

function placeHay(place: NamedPlace) {
  return fold([place.label, place.secondary, place.kind, ...(place.aliases || [])].join(' '));
}

export function matchesSearchAnchor(
  fields: { label: string; kind?: string; secondary?: string; aliases?: string[] },
  query: string,
): boolean {
  const category = resolvePlaceCategory(query);
  if (category) {
    return categoryMatchesPlace(category, fields);
  }

  const streetQuery = isStreetSearchQuery(query);
  const normalized = streetQuery ? extractStreetFromQuery(query) : query;
  const tokens = parseSearchTokens(normalized);
  if (!tokens.length) return true;

  const kindFold = fold(fields.kind || '');
  const kindForMatch = GENERIC_KINDS.has(kindFold) ? '' : fields.kind || '';
  const labelHay = fold(normalizeStreetQuery([fields.label, ...(fields.aliases || [])].join(' ')));
  const fullHay = fold(
    normalizeStreetQuery(
      [fields.label, fields.secondary || '', kindForMatch, ...(fields.aliases || [])].join(' '),
    ),
  );

  if (streetQuery) {
    const numTokens = tokens.filter((t) => /\d/.test(t));
    const typeTokens = tokens.filter((t) => STREET_WORDS.has(t));
    const labelMatch = (t: string) => labelHay.includes(t);
    const typeOk =
      !typeTokens.length ||
      typeTokens.some((t) => labelMatch(t) || (t.length >= 3 && labelHay.includes(t)));
    const numOk =
      !numTokens.length || numTokens.every((n) => labelHay.includes(n) || fullHay.includes(n));
    if (typeOk && numOk) return true;
    return false;
  }

  const anchor = tokens[0];
  if (labelHay.includes(anchor)) return true;
  return tokens.every((t) => fullHay.includes(t));
}

function scoreCategoryPlace(place: NamedPlace, cat: PlaceCategory, query: string): number {
  if (!categoryMatchesPlace(cat, place)) return 0;

  const q = fold(query.trim());
  const hay = placeHay(place);
  const lh = labelHay(place);
  let score = 60;
  if (cat.kindLabels.some((k) => fold(place.kind).includes(fold(k)))) score += 40;
  if (fold(place.label).startsWith(q) || lh.includes(q)) score += 30;
  if (cat.labelHints.some((h) => hay.includes(fold(h)))) score += 15;
  return score;
}

function scorePlace(place: NamedPlace, query: string): number {
  const q = fold(query.trim());
  const tokens = parseSearchTokens(query);
  if (!tokens.length) return 0;
  if (!matchesSearchAnchor(place, query)) return 0;

  const label = fold(place.label);
  const lh = labelHay(place);
  const hay = placeHay(place);
  const labelWords = label.split(/\s+/).filter(Boolean);

  if (label === q) return 120;
  if (hay.includes(q)) return 115;
  if (label.startsWith(q)) return 110;
  if ((place.aliases || []).some((a) => fold(a) === q || fold(a).includes(q))) return 105;
  if (labelWords.some((w) => w.startsWith(tokens[0]))) return 100;

  const labelMatches = tokens.filter((t) => lh.includes(t)).length;
  const hayMatches = tokens.filter((t) => hay.includes(t)).length;
  if (labelMatches === tokens.length) return 90;
  if (hayMatches === tokens.length) return 75;
  return 40 + labelMatches * 20 + hayMatches * 5;
}

function scoreStreet(place: NamedPlace, query: string): number {
  const streetPart = extractStreetFromQuery(query);
  const q = fold(streetPart);
  const tokens = parseSearchTokens(q);
  if (!tokens.length) return 0;

  const label = fold(normalizeStreetQuery(place.label));
  const numTokens = tokens.filter((t) => /\d/.test(t));
  const typeTokens = tokens.filter((t) => STREET_WORDS.has(t));

  const typeOk =
    !typeTokens.length ||
    typeTokens.some((t) => {
      if (label.includes(t)) return true;
      if (t === 'carrera' && /\bcarrera\b|\bcra\b|\bcr\b/.test(label)) return true;
      if (t === 'calle' && /\bcalle\b|\bcl\b/.test(label)) return true;
      if (t === 'avenida' && /\bavenida\b|\bav\b|\bak\b/.test(label)) return true;
      return t.length >= 3 && label.includes(t);
    });
  const numOk = !numTokens.length || numTokens.every((n) => label.includes(n));
  if (!typeOk || !numOk) return 0;

  if (label === q) return 130;
  if (label.startsWith(q)) return 120;
  if (numTokens.length && typeTokens.length) return 110;
  if (numTokens.length) return 95;
  return 70;
}

function foldStreetLabel(label: string): string {
  return fold(label.split(',')[0].trim());
}

/** Una calle con número de casa (# 15-20) no se agrupa con el nombre solo. */
export function streetSuggestionKey(label: string): string {
  const primary = label.split(',')[0].trim();
  if (/[#]\s*\d/.test(primary) || /\d+\s*[-–]\s*\d+/.test(primary)) {
    return `addr:${fold(primary)}`;
  }
  return `street:${foldStreetLabel(primary)}`;
}

export function dedupeStreetSuggestions<T extends { label: string; kind: string; secondary?: string; source?: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const hit of items) {
    const isStreet = hit.kind === 'Calle / avenida' || hit.kind === 'Dirección';
    const key = isStreet
      ? streetSuggestionKey(hit.label)
      : `poi:${fold(hit.label)}|${fold(hit.secondary || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

const MAP_INDEX: NamedPlace[] = (gazetteer.places as NamedPlace[]).map((p) => ({
  ...p,
  aliases: [],
}));

const STREET_INDEX: NamedPlace[] = MAP_INDEX.filter((p) => p.kind === 'Calle / avenida');

const BUSINESS_INDEX: NamedPlace[] = (businesses.places as NamedPlace[]).map((p) => ({
  ...p,
  aliases: [],
}));

const LOCAL_POOL: NamedPlace[] = [...VILLAVICENCIO_PLACES, ...BUSINESS_INDEX, ...MAP_INDEX];

function searchLocalStreets(query: string): PlaceSuggestion[] {
  const streetPart = extractStreetFromQuery(query);
  const q = fold(streetPart);
  if (q.length < 2) return [];

  const groups = new Map<string, { places: NamedPlace[]; score: number; i: number }>();

  STREET_INDEX.forEach((place, i) => {
    const score = scoreStreet(place, streetPart);
    if (!score) return;
    const key = foldStreetLabel(place.label);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { places: [place], score, i });
      return;
    }
    group.places.push(place);
    group.score = Math.max(group.score, score);
  });

  return [...groups.values()]
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 20)
    .map(({ places }) => {
      const lat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
      const lng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
      const label = places[0].label;
      return {
        id: `street-${foldStreetLabel(label)}`,
        label,
        secondary: places[0].secondary,
        kind: places[0].kind,
        source: 'local' as const,
        lat,
        lng,
      };
    });
}

export function searchLocalPlaces(query: string): PlaceSuggestion[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];

  if (isStreetSearchQuery(query)) {
    return searchLocalStreets(query);
  }

  const category = resolvePlaceCategory(query);
  const seen = new Set<string>();
  const scored: Array<{ place: NamedPlace; score: number; i: number }> = [];

  LOCAL_POOL.forEach((place, i) => {
    const score = category ? scoreCategoryPlace(place, category, query) : scorePlace(place, q);
    if (!score) return;
    const key = `${fold(place.label)}|${place.lat.toFixed(3)}|${place.lng.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    scored.push({ place, score, i });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, category ? 12 : 8)
    .map(({ place }) => ({
      id: `local-${place.lat}-${place.lng}-${place.label}`,
      label: place.label,
      secondary: place.secondary,
      kind: place.kind,
      source: 'local' as const,
      lat: place.lat,
      lng: place.lng,
    }));
}

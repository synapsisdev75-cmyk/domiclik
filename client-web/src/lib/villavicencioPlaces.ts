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

export function parseSearchTokens(query: string): string[] {
  return fold(query.trim())
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
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

  const tokens = parseSearchTokens(query);
  if (!tokens.length) return true;
  const anchor = tokens[0];
  const lh = fold([fields.label, fields.kind || '', ...(fields.aliases || [])].join(' '));
  if (lh.includes(anchor)) return true;
  const hay = fold([fields.label, fields.secondary || '', fields.kind || '', ...(fields.aliases || [])].join(' '));
  return tokens.every((t) => hay.includes(t));
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

const MAP_INDEX: NamedPlace[] = (gazetteer.places as NamedPlace[]).map((p) => ({
  ...p,
  aliases: [],
}));

const BUSINESS_INDEX: NamedPlace[] = (businesses.places as NamedPlace[]).map((p) => ({
  ...p,
  aliases: [],
}));

const LOCAL_POOL: NamedPlace[] = [...VILLAVICENCIO_PLACES, ...BUSINESS_INDEX, ...MAP_INDEX];

export function searchLocalPlaces(query: string): PlaceSuggestion[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];

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

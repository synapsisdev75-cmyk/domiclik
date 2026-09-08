import type { PlaceSuggestion } from './geo';
import gazetteer from '../data/villavicencio-map.json' with { type: 'json' };
import businesses from '../data/villavicencio-businesses.json' with { type: 'json' };
import { parseColombianCompoundAddress, hasUrbanizationIntent } from './addressParts';
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
    secondary: 'Cl. 37a #28-53, Barzal Alto',
    kind: 'Hospital',
    aliases: ['hospital', 'departamental', 'barzal', 'hdv'],
    lat: 4.1437,
    lng: -73.6444,
  },
  {
    label: 'Clínica Meta',
    secondary: 'Calle 33 #36-50, Barzal Bajo',
    kind: 'Salud',
    aliases: ['clinica', 'clinica meta', 'barzal'],
    lat: 4.1444,
    lng: -73.6369,
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
    label: 'Remansos de Rosablanca',
    secondary: 'También: Remanso Rosablanca, Bosques de Rosablanca · Villavicencio',
    kind: 'Barrio',
    aliases: [
      'remanso rosablanca',
      'remansos rosablanca',
      'remansos de rosa blanca',
      'remanso de rosa blanca',
      'rosa blanca',
      'rosablanca',
      'bosques de rosalblanca',
      'bosques de rosa blanca',
      'bosques rosalblanca',
      'pinchos remansos',
    ],
    lat: 4.116388,
    lng: -73.618027,
  },
  {
    label: 'Rosablanca Oriental',
    secondary: 'También: Rosablanca · Villavicencio',
    kind: 'Barrio',
    aliases: ['rosablanca oriental', 'rosa blanca oriental'],
    lat: 4.12084,
    lng: -73.632758,
  },
  {
    label: 'Ciudad Porfía',
    secondary: 'Comuna 8/9, vía Acacías, Villavicencio',
    kind: 'Barrio',
    aliases: [
      'porfia',
      'porfía',
      'ciudad porfia',
      'ciudad porfía',
      'urb porfia',
      'urbanizacion porfia',
      'barrio porfia',
    ],
    lat: 4.078724,
    lng: -73.672008,
  },
  {
    label: 'Urbanización Teusca',
    secondary: 'Calle 23 # 37L, Villavicencio, Meta',
    kind: 'Urbanización',
    aliases: ['teusca', 'urb teusca', 'urbanizacion teusca', 'urbanización teusca'],
    lat: 4.1386,
    lng: -73.6299,
  },
  {
    label: 'Charrascal',
    secondary: 'Urbanización / barrio, Villavicencio',
    kind: 'Urbanización',
    aliases: ['charrascal', 'urb charrascal', 'urbanizacion charrascal', 'el charrascal'],
    lat: 4.086167,
    lng: -73.658507,
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

function compactFold(s: string) {
  return fold(s).replace(/[^a-z0-9]+/g, '');
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
  // Dirección de conjunto (no deben impedir match de “Charrascal”)
  'mz',
  'mza',
  'manzana',
  'cs',
  'casa',
  'apto',
  'apt',
  'ap',
  'apartamento',
  'torre',
  'tr',
  'bloque',
  'bl',
  'bq',
  'int',
  'interior',
  'etapa',
  'urb',
  'urbanizacion',
  'urbanización',
  'conjunto',
  'conj',
  'residencial',
  'res',
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
  // Solo abreviaturas reales (no “av” dentro de “avenida” ni “cr” dentro de “carrera”).
  [/\bcl\.?\s*(?=\d)/gi, 'calle '],
  [/\bc\/\s*(?=\d)/gi, 'calle '],
  // “Cl. 31,” con coma o fin
  [/\bcl\.\s*(?=\d)/gi, 'calle '],
  [/\bcra\.?\s*(?=\d)/gi, 'carrera '],
  [/\bcarr\.?\s*(?=\d)/gi, 'carrera '],
  [/\bkr\.?\s*(?=\d)/gi, 'carrera '],
  [/\bcr\.?\s*(?=\d)/gi, 'carrera '],
  [/\bavda\.?\s*(?=\d)/gi, 'avenida '],
  [/\bav\.?\s*(?=\d)/gi, 'avenida '],
  [/\bak\.?\s*(?=\d)/gi, 'avenida '],
  [/\bdiag\.?\s*(?=\d)/gi, 'diagonal '],
  [/\bdg\.?\s*(?=\d)/gi, 'diagonal '],
  [/\btransv?\.?\s*(?=\d)/gi, 'transversal '],
  [/\btrv\.?\s*(?=\d)/gi, 'transversal '],
  [/\btv\.?\s*(?=\d)/gi, 'transversal '],
];

const ROAD_TOKEN_RE =
  /\b((?:calle|carrera|avenida|diagonal|transversal|travesia|circunvalar)\s+\d+[a-z]?(?:\s+bis)?(?:\s+(?:este|oeste|norte|sur))?)\b/gi;

export function normalizeStreetQuery(query: string): string {
  let q = query.trim().replace(/\s+/g, ' ');
  for (const [re, rep] of STREET_ABBREV) q = q.replace(re, rep);
  return q.replace(/\s+/g, ' ').trim();
}

/** Extrae vías de un texto (“Avenida 40”, “Carrera 31”). */
export function extractRoadTokens(query: string): string[] {
  const q = normalizeStreetQuery(query)
    .replace(/,?\s*villavicencio\b[\s,].*$/i, '')
    .replace(/,?\s*meta\b[\s,].*$/i, '')
    .replace(/,?\s*colombia\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(ROAD_TOKEN_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const raw = m[1].replace(/\s+/g, ' ').trim();
    const key = fold(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      raw.replace(
        /^(calle|carrera|avenida|diagonal|transversal|travesia|circunvalar)/i,
        (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
      ),
    );
  }
  return out;
}

/** True si hay cruce: “Avenida 40 Carrera 31” / “Calle 15 con Carrera 20”. */
export function isIntersectionQuery(query: string): boolean {
  if (hasUrbanizationIntent(query)) return false;
  return extractRoadTokens(query).length >= 2;
}

/**
 * Query canónica para Maps:
 * - Cruce → “Avenida 40 con Carrera 31”
 * - Una vía → “Avenida 40”
 * - Con placa → se deja el # aparte en normalizePastedAddress
 */
export function formatStreetSearchQuery(query: string): string {
  const roads = extractRoadTokens(query);
  if (roads.length >= 2) return `${roads[0]} con ${roads[1]}`;
  if (roads.length === 1) return roads[0];
  return normalizeStreetQuery(query).trim();
}

/** Quita ciudad / departamento y número de casa (# 20-10) al buscar la vía. */
export function extractStreetFromQuery(query: string): string {
  // Cruce: nunca botar la segunda vía (antes solo devolvía “Avenida 40”).
  if (isIntersectionQuery(query) || extractRoadTokens(query).length >= 2) {
    return formatStreetSearchQuery(query);
  }

  let q = normalizeStreetQuery(query)
    .replace(/,?\s*villavicencio\b[\s,].*$/i, '')
    .replace(/,?\s*meta\b[\s,].*$/i, '')
    .replace(/,?\s*colombia\b\s*$/i, '')
    .replace(/[#]\s*\d[\d\s\-–A-Za-z]*$/i, '')
    .replace(/\b(?:no\.?|nro\.?|num\.?|numero)\s*\d[\d\s\-–A-Za-z]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // "15 bis" → forma canónica; "15b" letra B se deja (salvo bis explícito)
  q = q.replace(/\b(\d+)\s+bis\b/gi, '$1 bis');

  // Calle 15A Sur / Carrera 30 bis norte / Calle 20
  const roadOnly = q.match(
    /^((?:calle|carrera|avenida|diagonal|transversal|travesia|circunvalar)\s+\d+[a-z]?(?:\s+bis)?(?:\s+(?:este|oeste|norte|sur))?)\b/i,
  );
  if (roadOnly) return roadOnly[1].replace(/\s+/g, ' ').trim();

  return q;
}

export function isStreetSearchQuery(query: string): boolean {
  // “urbanizacion teusca Calle 23…” → buscar el conjunto, no la vía genérica.
  if (hasUrbanizationIntent(query)) return false;
  const raw = fold(query.trim());
  if (/\b(cl|cra|cr|kr|av|ak|dg|diag|trans|trv|tv)\b/.test(raw)) return true;
  if (/\d+\s*[-#]\s*\d+/.test(raw)) return true;
  const q = fold(normalizeStreetQuery(query));
  return /\b(calle|carrera|avenida|diagonal|transversal|travesia|circunvalar)\b/.test(q);
}

/** Clave canónica de vía: “carrera|27|a|sur”. */
export function roadKeyFromText(text: string): {
  type: string;
  number: string;
  letter: string;
  cardinal: string;
} | null {
  const folded = fold(normalizeStreetQuery(text)).replace(/\b(\d+)\s+bis\b/g, '$1 bis');
  const m = folded.match(
    /\b(calle|carrera|avenida|diagonal|transversal|travesia|circunvalar)\s+(\d+)(?:\s*(bis|[a-e]))?(?:\s+(norte|sur|este|oeste))?\b/,
  );
  if (!m) return null;
  const letterRaw = (m[3] || '').trim();
  const letter = !letterRaw ? '' : /^bis$/i.test(letterRaw) ? 'bis' : letterRaw;
  return {
    type: m[1],
    number: m[2],
    letter,
    cardinal: (m[4] || '').trim(),
  };
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

/** Número de vía canónico (“Carrera 27A Sur # 2-10” → “27a sur”). */
export function roadNumberFromLabel(label: string): string | null {
  const key = roadKeyFromText(label);
  if (!key) return null;
  return [key.number + (key.letter || ''), key.cardinal].filter(Boolean).join(' ');
}

/** True si la query es vía sin placa (#): “Carrera 27” sí; “Carrera 27 # 10-20” / “#37l-9” no. */
export function isStreetOnlyQuery(query: string): boolean {
  if (!isStreetSearchQuery(query)) return false;
  if (isIntersectionQuery(query)) return false;
  return !/#\s*[\dA-Za-z]|\bno\.?\s*\d|\b\d{1,4}[a-zA-Z]?\s*[-–]\s*\d{1,4}\b/i.test(query);
}

function roadKeysCompatible(
  queryKey: NonNullable<ReturnType<typeof roadKeyFromText>>,
  labelKey: NonNullable<ReturnType<typeof roadKeyFromText>>,
): boolean {
  if (queryKey.number !== labelKey.number) return false;
  // Letra pedida → debe coincidir (20A ≠ 20).
  if (queryKey.letter && queryKey.letter !== labelKey.letter) return false;
  // Cardinal pedido → debe coincidir (Sur ≠ Norte).
  if (queryKey.cardinal && queryKey.cardinal !== labelKey.cardinal) return false;
  return true;
}

export function matchesSearchAnchor(
  fields: { label: string; kind?: string; secondary?: string; aliases?: string[] },
  query: string,
): boolean {
  const category = resolvePlaceCategory(query);
  if (category) {
    return categoryMatchesPlace(category, fields);
  }

  // Quitar ciudad/país del query de sugerencias (no exigir “meta” en cada hit).
  const compound = parseColombianCompoundAddress(query);
  const queryCore = (
    compound.isCompound && compound.urbanization
      ? compound.urbanization
      : query
          .replace(/,?\s*villavicencio\b[\s,]*.*$/i, '')
          .replace(/,?\s*meta\b[\s,]*.*$/i, '')
          .replace(/,?\s*colombia\b\s*$/i, '')
          .trim()
  ) || query;

  const streetQuery = !compound.isCompound && isStreetSearchQuery(queryCore);
  const normalized = streetQuery ? extractStreetFromQuery(queryCore) : queryCore;
  const tokens = parseSearchTokens(normalized).filter(
    (t) => !/^\d+[a-z]?$/i.test(t) || t.length >= 3,
  );
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
    const typeTokens = tokens.filter((t) => STREET_WORDS.has(t));
    const anywhere = (t: string) => labelHay.includes(t) || fullHay.includes(t);
    const typeOk =
      !typeTokens.length ||
      typeTokens.some((t) => {
        if (anywhere(t)) return true;
        if ((t === 'carrera' || t === 'cra' || t === 'cr' || t === 'kr') && /\bcarrera\b|\bcra\b/.test(labelHay))
          return true;
        if ((t === 'calle' || t === 'cl') && /\bcalle\b/.test(labelHay)) return true;
        return t.length >= 3 && fullHay.includes(t);
      });

    const qKey = roadKeyFromText(normalized);
    const lKey = roadKeyFromText(fields.label);
    if (qKey && lKey) {
      return Boolean(typeOk && roadKeysCompatible(qKey, lKey));
    }

    const numTokens = tokens.filter((t) => /^\d+[a-z]?$/.test(t));
    const queryRoadNum = numTokens[0] ? fold(numTokens[0].replace(/bis$/i, 'b')) : null;
    const labelRoadNum = roadNumberFromLabel(fields.label);
    const numOk =
      !queryRoadNum ||
      (labelRoadNum
        ? labelRoadNum.split(' ')[0] === queryRoadNum || labelRoadNum === queryRoadNum
        : new RegExp(`(?:^|\\s)${queryRoadNum}(?:\\s|$|#)`).test(labelHay));
    return Boolean(typeOk && numOk);
  }

  // POI / texto libre / urbanización: “charrascal”, “remanso rosablanca”…
  const nameTokens = tokens.filter((t) => !/^\d/.test(t) && t.length >= 3);
  const anchors = nameTokens.length ? nameTokens : tokens;
  const compactLabel = compactFold(fields.label + ' ' + (fields.aliases || []).join(' '));
  const compactFull = compactFold(
    [fields.label, fields.secondary || '', kindForMatch, ...(fields.aliases || [])].join(' '),
  );
  if (
    anchors.some((t) => {
      if (labelHay.includes(t) || fullHay.includes(t)) return true;
      const c = compactFold(t);
      return c.length >= 4 && (compactLabel.includes(c) || compactFull.includes(c));
    })
  ) {
    return true;
  }
  // Frase completa sin espacios: “remansorosablanca”
  const qCompact = compactFold(normalized);
  if (qCompact.length >= 6 && (compactLabel.includes(qCompact) || compactFull.includes(qCompact))) {
    return true;
  }
  if (qCompact.length >= 6 && compactLabel.includes('remansosderosablanca') && /rosablanca|remanso/.test(qCompact)) {
    return true;
  }
  const anchor = anchors[0];
  if (anchor && anchor.length >= 3 && (labelHay.includes(anchor) || fullHay.includes(anchor.slice(0, 4)))) {
    return true;
  }
  return anchors.every((t) => fullHay.includes(t));
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
  const qKey = roadKeyFromText(streetPart);
  const labelKey = roadKeyFromText(place.label);
  const unified = streetPart.replace(/\b(\d+)\s+bis\b/gi, '$1 bis');
  const q = fold(unified);
  const tokens = parseSearchTokens(q);
  if (!tokens.length) return 0;

  const label = fold(normalizeStreetQuery(place.label)).replace(/\b(\d+)\s+bis\b/g, '$1 bis');
  const typeTokens = tokens.filter((t) => STREET_WORDS.has(t));

  const typeOk =
    !typeTokens.length ||
    typeTokens.some((t) => {
      if (label.includes(t)) return true;
      if ((t === 'carrera' || t === 'cra' || t === 'cr' || t === 'kr') && /\bcarrera\b|\bcra\b|\bcr\b/.test(label))
        return true;
      if ((t === 'calle' || t === 'cl') && /\bcalle\b|\bcl\b/.test(label) && !/\bavenida\s+calle\b/.test(label))
        return true;
      if ((t === 'avenida' || t === 'av' || t === 'ak') && /\bavenida\b|\bav\b|\bak\b/.test(label)) return true;
      return t.length >= 3 && label.includes(t);
    });

  if (qKey && labelKey) {
    if (!roadKeysCompatible(qKey, labelKey)) return 0;
  } else {
    const roadNums = tokens.filter((t) => /^\d+[a-z]?$/.test(t));
    const labelRoadNum = roadNumberFromLabel(place.label);
    const queryRoadNum = roadNums[0] ? fold(roadNums[0]) : null;
    const numOk =
      !queryRoadNum ||
      (labelRoadNum
        ? labelRoadNum.split(' ')[0] === queryRoadNum || labelRoadNum === queryRoadNum
        : new RegExp(`(?:^|\\s)${queryRoadNum}(?:\\s|$)`).test(label));
    if (!typeOk || !numOk) return 0;
  }
  if (!typeOk) return 0;

  let score = 70;
  if (qKey && labelKey && qKey.number === labelKey.number) score += 40;
  if (qKey?.letter && labelKey?.letter === qKey.letter) score += 25;
  if (qKey?.cardinal && labelKey?.cardinal === qKey.cardinal) score += 30;
  // Sin letra/cardinal en la query: preferir vía “limpia” sin sufijo.
  if (qKey && !qKey.letter && !qKey.cardinal && labelKey && !labelKey.letter && !labelKey.cardinal) {
    score += 15;
  }
  if (typeTokens.includes('calle') && /^calle\s/.test(label) && !/^avenida/.test(label)) score += 25;
  if (typeTokens.includes('carrera') && /^carrera\s/.test(label)) score += 25;
  if (typeTokens.includes('avenida') && /^avenida\s/.test(label)) score += 25;
  if (label === q || label.startsWith(q + ' ')) return score + 60;
  if (label.startsWith(q)) return score + 50;
  if (qKey) return score + 40;
  return score + 25;
}

/** Núcleo urbano Villavicencio — evita promediar calles homónimas de Acacías/Restrepo/Cumaral. */
const URBAN_CORE = {
  south: 4.105,
  west: -73.675,
  north: 4.175,
  east: -73.575,
};

function inUrbanCore(lat: number, lng: number): boolean {
  return (
    lat >= URBAN_CORE.south &&
    lat <= URBAN_CORE.north &&
    lng >= URBAN_CORE.west &&
    lng <= URBAN_CORE.east
  );
}

function pickStreetAnchor(places: NamedPlace[]): { lat: number; lng: number } {
  const urban = places.filter((p) => inUrbanCore(p.lat, p.lng));
  const pool = urban.length >= 1 ? urban : places;
  // Punto más cercano al centro operativo (no promedio de todo Meta)
  const center = { lat: 4.142, lng: -73.6266 };
  let best = pool[0];
  let bestD = Infinity;
  for (const p of pool) {
    const d = (p.lat - center.lat) ** 2 + (p.lng - center.lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  // Suaviza con vecinos urbanos cercanos al mejor ancla (±~800 m)
  const near = pool.filter(
    (p) => Math.abs(p.lat - best.lat) < 0.008 && Math.abs(p.lng - best.lng) < 0.008,
  );
  const use = near.length >= 2 ? near : [best];
  return {
    lat: use.reduce((s, p) => s + p.lat, 0) / use.length,
    lng: use.reduce((s, p) => s + p.lng, 0) / use.length,
  };
}

function foldStreetLabel(label: string): string {
  return fold(label.split(',')[0].trim()).replace(/\s*bis\b/g, 'b');
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
      const anchor = pickStreetAnchor(places);
      const label = places[0].label;
      const urbanCount = places.filter((p) => inUrbanCore(p.lat, p.lng)).length;
      return {
        id: `street-${foldStreetLabel(label)}`,
        label,
        secondary:
          urbanCount > 0
            ? `Villavicencio, Meta · ${urbanCount} tramo(s)`
            : places[0].secondary || 'Villavicencio, Meta',
        kind: places[0].kind,
        source: 'local' as const,
        lat: anchor.lat,
        lng: anchor.lng,
      };
    });
}

export function searchLocalPlaces(query: string): PlaceSuggestion[] {
  const compound = parseColombianCompoundAddress(query);
  const stripped = query
    .replace(/,?\s*villavicencio\b[\s,]*.*$/i, '')
    .replace(/,?\s*meta\b[\s,]*.*$/i, '')
    .replace(/,?\s*colombia\b\s*$/i, '')
    .trim();
  const core =
    (compound.isCompound && compound.urbanization
      ? compound.urbanization
      : stripped) || query;
  const q = fold(core.trim());
  if (q.length < 2) return [];

  if (!compound.isCompound && isStreetSearchQuery(core)) {
    return searchLocalStreets(core);
  }

  const category = resolvePlaceCategory(core);
  const seen = new Set<string>();
  const scored: Array<{ place: NamedPlace; score: number; i: number }> = [];

  LOCAL_POOL.forEach((place, i) => {
    const score = category ? scoreCategoryPlace(place, category, core) : scorePlace(place, core);
    if (!score) return;
    const key = fold(place.label);
    if (seen.has(key)) return;
    seen.add(key);
    scored.push({ place, score, i });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 12)
    .map(({ place }) => ({
      id: `local-${place.label}-${place.lat}`,
      label: place.label,
      secondary: place.secondary,
      kind: place.kind,
      source: 'local' as const,
      lat: place.lat,
      lng: place.lng,
    }));
}

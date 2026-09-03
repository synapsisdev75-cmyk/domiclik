/**
 * Direcciones colombianas (Villavicencio): Calle / Carrera / Avenida / Diagonal / Transversal.
 * Formato típico: "Calle 15 # 20-10", "Cra 30", "Av. 40 #26-15".
 */

export const STREET_TYPE_CANON: Record<string, string> = {
  calle: 'calle',
  cl: 'calle',
  carrera: 'carrera',
  cra: 'carrera',
  cr: 'carrera',
  kr: 'carrera',
  avenida: 'avenida',
  av: 'avenida',
  ak: 'avenida',
  diagonal: 'diagonal',
  dg: 'diagonal',
  diag: 'diagonal',
  transversal: 'transversal',
  trans: 'transversal',
  travesia: 'travesia',
  trv: 'travesia',
  tv: 'travesia',
  circunvalar: 'circunvalar',
};

export const STREET_TYPE_TITLE: Record<string, string> = {
  calle: 'Calle',
  carrera: 'Carrera',
  avenida: 'Avenida',
  diagonal: 'Diagonal',
  transversal: 'Transversal',
  travesia: 'Travesía',
  circunvalar: 'Circunvalar',
};

const STREET_ABBREV: Array<[RegExp, string]> = [
  [/\bcl\.?(?=\s|$|\d|#)/gi, 'calle '],
  [/\bcra\.?(?=\s|$|\d|#)/gi, 'carrera '],
  [/\bcr\.?(?=\s|$|\d|#)/gi, 'carrera '],
  [/\bkr\.?(?=\s|$|\d|#)/gi, 'carrera '],
  [/\bav\.?(?=\s|$|\d|#)/gi, 'avenida '],
  [/\bak\.?(?=\s|$|\d|#)/gi, 'avenida '],
  [/\bdg\.?(?=\s|$|\d|#)/gi, 'diagonal '],
  [/\bdiag\.?(?=\s|$|\d|#)/gi, 'diagonal '],
  [/\btrans\.?(?=\s|$|\d|#)/gi, 'transversal '],
  [/\btrv\.?(?=\s|$|\d|#)/gi, 'travesia '],
  [/\btv\.?(?=\s|$|\d|#)/gi, 'travesia '],
];

const VIA_TYPE_RE =
  'calle|carrera|avenida|diagonal|transversal|travesia|circunvalar';

const NAMED_WAYS = ['circunvalar', 'anillo vial', 'anilo vial'];

export type ColombianAddress = {
  viaType: string | null;
  viaNumber: string | null;
  cardinal: string | null;
  crossing: string | null;
  house: string | null;
  namedWay: string | null;
  hasComplement: boolean;
  isStreet: boolean;
  displayVia: string;
};

export function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

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

function titleVia(type: string, number: string | null, cardinal: string | null): string {
  const name = STREET_TYPE_TITLE[type] || type;
  const parts = [name];
  if (number) parts.push(number.toUpperCase());
  if (cardinal) parts.push(cardinal[0].toUpperCase() + cardinal.slice(1));
  return parts.join(' ');
}

export function parseColombianAddress(query: string): ColombianAddress {
  const raw = extractStreetFromQuery(query);
  const folded = foldText(raw);

  const empty: ColombianAddress = {
    viaType: null,
    viaNumber: null,
    cardinal: null,
    crossing: null,
    house: null,
    namedWay: null,
    hasComplement: false,
    isStreet: false,
    displayVia: raw,
  };

  if (!folded) return empty;

  let crossing: string | null = null;
  let house: string | null = null;
  let viaPart = folded;

  const hash = folded.match(
    /#\s*(\d+[a-z]?)(?:\s*[-–]\s*(\d+[a-z]?))?/,
  );
  if (hash) {
    crossing = hash[1];
    house = hash[2] || null;
    viaPart = folded.slice(0, hash.index).trim();
  } else {
    const dash = folded.match(/\s(\d+[a-z]?)\s*[-–]\s*(\d+[a-z]?)\s*$/);
    if (dash) {
      crossing = dash[1];
      house = dash[2];
      viaPart = folded.slice(0, dash.index).trim();
    }
  }

  let namedWay: string | null = null;
  for (const name of NAMED_WAYS) {
    if (viaPart.includes(name)) {
      namedWay = name === 'anilo vial' ? 'anillo vial' : name;
      break;
    }
  }

  const viaMatch = viaPart.match(
    new RegExp(
      `(?:avenida\\s+)?(${VIA_TYPE_RE})\\s+(\\d+[a-z]?)(?:\\s+(sur|norte|este|oeste|bis))?\\b`,
    ),
  );

  const viaType = viaMatch ? viaMatch[1] : namedWay === 'circunvalar' ? 'circunvalar' : null;
  const viaNumber = viaMatch ? viaMatch[2] : null;
  const cardinal = viaMatch?.[3] || null;
  const hasComplement = Boolean(crossing || house);
  const isStreet = Boolean((viaType && viaNumber) || namedWay);

  const displayVia = viaType
    ? titleVia(viaType, viaNumber, cardinal)
    : namedWay
      ? namedWay
          .split(' ')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' ')
      : raw;

  return {
    viaType,
    viaNumber,
    cardinal,
    crossing,
    house,
    namedWay,
    hasComplement,
    isStreet,
    displayVia,
  };
}

export function isStreetSearchQuery(query: string): boolean {
  const parsed = parseColombianAddress(query);
  if (parsed.isStreet) return true;
  const raw = foldText(query.trim());
  if (/\b(cl|cra|cr|kr|av|ak|dg|diag|trans|trv|tv)\.?\s*\d/.test(raw)) return true;
  return false;
}

/** Consultas que Google / Nominatim reconocen en Villavicencio. */
export function formatColombianGeocodeQueries(query: string): string[] {
  const parsed = parseColombianAddress(query);
  const city = 'Villavicencio, Meta, Colombia';
  const out: string[] = [];
  const add = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim();
    if (t && !out.includes(t)) out.push(t);
  };

  if (parsed.viaType && parsed.viaNumber) {
    const via = parsed.displayVia;
    if (parsed.hasComplement) {
      const cr = parsed.crossing || '';
      const hs = parsed.house || '';
      const nomenclatura = hs ? `${cr}-${hs}` : cr;
      add(`${via} #${nomenclatura}, ${city}`);
      add(`${via} # ${nomenclatura}, ${city}`);
      if (cr) {
        const cruz =
          parsed.viaType === 'carrera' || parsed.viaType === 'avenida'
            ? `Calle ${cr}`
            : `Carrera ${cr}`;
        add(`${via} con ${cruz}, ${city}`);
      }
    }
    add(`${via}, ${city}`);
  } else if (parsed.namedWay) {
    add(`${parsed.displayVia}, ${city}`);
  }

  const original = extractStreetFromQuery(query);
  if (original) add(`${original}, ${city}`);
  return out.length ? out : [`${query.trim()}, ${city}`];
}

export function viaTypeInLabel(labelFold: string, viaType: string): boolean {
  if (labelFold.includes(viaType)) return true;
  if (viaType === 'carrera' && /\bcra\b|\bcr\b|\bkr\b/.test(labelFold)) return true;
  if (viaType === 'calle' && /\bcl\b/.test(labelFold)) return true;
  if (viaType === 'avenida' && /\bav\b|\bak\b/.test(labelFold)) return true;
  if (viaType === 'diagonal' && /\bdg\b|\bdiag\b/.test(labelFold)) return true;
  if (viaType === 'transversal' && /\btrans\b|\btrv\b|\btv\b/.test(labelFold)) return true;
  return false;
}

export function viaNumberInLabel(labelFold: string, viaNumber: string): boolean {
  const n = foldText(viaNumber);
  if (!n) return true;
  const re = new RegExp(`(?:^|[^a-z0-9])${n}(?:[a-z])?(?:[^a-z0-9]|$)`, 'i');
  return re.test(labelFold);
}

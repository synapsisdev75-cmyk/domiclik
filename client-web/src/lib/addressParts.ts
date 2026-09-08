/** Partes de dirección para anclar mejor la búsqueda en Villavicencio. */

export const ROAD_TYPES = [
  'Calle',
  'Carrera',
  'Avenida',
  'Transversal',
  'Diagonal',
  'Circunvalar',
  'Otro',
] as const;

export type RoadType = (typeof ROAD_TYPES)[number];

/** Letras / bis frecuentes en nomenclatura colombiana. */
export const ROAD_LETTERS = ['', 'A', 'B', 'C', 'D', 'E', 'Bis'] as const;
export type RoadLetter = (typeof ROAD_LETTERS)[number];

/** Puntos cardinales de vía. */
export const ROAD_CARDINALS = ['', 'Norte', 'Sur', 'Este', 'Oeste'] as const;
export type RoadCardinal = (typeof ROAD_CARDINALS)[number];

export type AddressParts = {
  /** Tipo de vía colombiana */
  roadType: RoadType;
  /** Número de la vía: 25, 26, 19, 40… */
  roadNumber: string;
  /** Letra o Bis: A, B, C… */
  roadLetter: RoadLetter | string;
  /** Norte / Sur / Este / Oeste */
  roadCardinal: RoadCardinal | string;
  /**
   * Texto de vía completo (se arma con tipo+número, o se edita si es “Otro” / lugar).
   * También alimenta el buscador.
   */
  street: string;
  /** Cruce opcional: “Carrera 19” (sin “con”) */
  cross: string;
  /** Letra del cruce */
  crossLetter: RoadLetter | string;
  /** Cardinal del cruce */
  crossCardinal: RoadCardinal | string;
  /** Número de casa/placa colombiano: 22-10 → Calle 15 # 22-10 */
  houseNumber: string;
  /** Barrio o comuna */
  barrio: string;
  city: string;
  department: string;
  /** Complemento: torre, apto, casa, referencia… */
  general: string;
};

export const EMPTY_ADDRESS_PARTS: AddressParts = {
  roadType: 'Calle',
  roadNumber: '',
  roadLetter: '',
  roadCardinal: '',
  street: '',
  cross: '',
  crossLetter: '',
  crossCardinal: '',
  houseNumber: '',
  barrio: '',
  city: 'Villavicencio',
  department: 'Meta',
  general: '',
};

const NOISE =
  /per[ií]metro\s+urbano|rap\s*\(?especial\)?|central|colombia|cundinamarca/i;
const POSTAL = /^\d{4,6}$/;

const ROAD_DETECT: Array<{ type: RoadType; re: RegExp }> = [
  { type: 'Transversal', re: /^(transversal|tv\.?|transv\.?)\s*/i },
  { type: 'Diagonal', re: /^(diagonal|dg\.?|diag\.?)\s*/i },
  { type: 'Circunvalar', re: /^(circunvalar|anillo\s+vial)\s*/i },
  { type: 'Avenida', re: /^(avenida|av\.?|avda\.?)\s*/i },
  { type: 'Carrera', re: /^(carrera|cra\.?|cr\.?|kr\.?|k\.?)\s*/i },
  { type: 'Calle', re: /^(calle|cl\.?|c\/)\s*/i },
];

const CARDINAL_RE = /\b(norte|sur|este|oeste)\b/i;
const LETTER_TOKEN_RE = /^(bis|[a-e])$/i;

/** Une número + letra + cardinal → “20”, “20A”, “20 Sur”, “20A Sur”. */
export function composeRoadToken(
  number: string,
  letter = '',
  cardinal = '',
): string {
  const n = number.trim();
  if (!n) return '';
  const letRaw = letter.trim();
  const letPart =
    !letRaw || /^bis$/i.test(letRaw)
      ? letRaw
        ? ' Bis'
        : ''
      : ` ${letRaw.toUpperCase()}`;
  const card = cardinal.trim();
  const cardPart = card ? ` ${card.charAt(0).toUpperCase()}${card.slice(1).toLowerCase()}` : '';
  // “20 Bis” vs “20A”
  if (/^bis$/i.test(letRaw)) return `${n} Bis${cardPart}`;
  if (letRaw && !/\s/.test(letRaw) && letRaw.length <= 2) {
    return `${n}${letRaw.toUpperCase()}${cardPart}`;
  }
  return `${n}${letPart}${cardPart}`.replace(/\s+/g, ' ').trim();
}

/** Parsea “20A Sur”, “20 bis norte”, “26c” → número / letra / cardinal. */
export function parseRoadToken(raw: string): {
  number: string;
  letter: string;
  cardinal: string;
} {
  let s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { number: '', letter: '', cardinal: '' };

  let cardinal = '';
  const cardMatch = s.match(CARDINAL_RE);
  if (cardMatch) {
    cardinal = cardMatch[1].charAt(0).toUpperCase() + cardMatch[1].slice(1).toLowerCase();
    s = s.replace(CARDINAL_RE, '').replace(/\s+/g, ' ').trim();
  }

  // 20A / 20a / 15B
  const glued = s.match(/^(\d+)\s*([a-e])$/i);
  if (glued) {
    return { number: glued[1], letter: glued[2].toUpperCase(), cardinal };
  }

  // 20 Bis / 20 bis
  const bis = s.match(/^(\d+)\s+bis$/i);
  if (bis) return { number: bis[1], letter: 'Bis', cardinal };

  const parts = s.split(/\s+/);
  const number = parts[0]?.replace(/[^0-9a-z]/gi, '') || '';
  const numOnly = number.match(/^(\d+)([a-e])?$/i);
  if (numOnly) {
    let letter = numOnly[2] ? numOnly[2].toUpperCase() : '';
    const rest = parts.slice(1);
    for (const t of rest) {
      if (LETTER_TOKEN_RE.test(t)) {
        letter = /^bis$/i.test(t) ? 'Bis' : t.toUpperCase();
      }
    }
    return { number: numOnly[1], letter, cardinal };
  }

  return { number: s, letter: '', cardinal };
}

function formatCrossLine(cross: string, letter: string, cardinal: string): string {
  const base = cross.trim().replace(/^con\s+/i, '');
  if (!base) return '';
  // Si el cruce ya trae tipo+número, añade letra/cardinal al final del número.
  const roadish = base.match(
    /^((?:calle|carrera|avenida|diagonal|transversal|travesia|circunvalar)\s+)(.+)$/i,
  );
  if (roadish) {
    const parsed = parseRoadToken(roadish[2]);
    const token = composeRoadToken(
      parsed.number || roadish[2],
      letter || parsed.letter,
      cardinal || parsed.cardinal,
    );
    return `${roadish[1].replace(/\s+$/, '')} ${token}`.replace(/\s+/g, ' ').trim();
  }
  const token = composeRoadToken(base, letter, cardinal);
  return token || base;
}

/** Arma la línea de vía: “Calle 15A Sur # 22-10” o “Calle 20 con Carrera 19A”. */
export function composeStreetLine(
  parts: Pick<
    AddressParts,
    | 'roadType'
    | 'roadNumber'
    | 'roadLetter'
    | 'roadCardinal'
    | 'street'
    | 'cross'
    | 'crossLetter'
    | 'crossCardinal'
    | 'houseNumber'
  >,
): string {
  const roadTok = composeRoadToken(parts.roadNumber, parts.roadLetter, parts.roadCardinal);
  const typed =
    parts.roadType !== 'Otro' && roadTok
      ? `${parts.roadType} ${roadTok}`
      : parts.street.trim();
  const house = parts.houseNumber.trim().replace(/^#\s*/, '');
  const withHouse = typed && house ? `${typed} # ${house}` : typed;
  const crossLine = formatCrossLine(parts.cross, parts.crossLetter, parts.crossCardinal);
  if (!withHouse) return crossLine ? `con ${crossLine}` : '';
  if (!crossLine) return withHouse;
  return `${withHouse} con ${crossLine}`;
}

/** Query estilo Uber/Rappi: vía + # + barrio + ciudad + país. */
export function composeSearchQuery(parts: AddressParts): string {
  // Texto libre / dirección completa de pin o Google: no rearmar ni acortar.
  if (parts.roadType === 'Otro') {
    return parts.street.trim();
  }
  const street = composeStreetLine(parts);
  const bits = [
    street,
    parts.barrio.trim(),
    parts.city.trim() || 'Villavicencio',
    parts.department.trim() || 'Meta',
    'Colombia',
  ].filter(Boolean);
  return bits.join(', ');
}

/**
 * Guarda la dirección tal cual (pin / Buscar / sugerencia), sin partirla en Calle+número.
 */
export function partsFromFullAddress(label: string, keepGeneral = ''): AddressParts {
  const full = label.replace(/\s+/g, ' ').trim();
  if (!full) {
    return { ...EMPTY_ADDRESS_PARTS, roadType: 'Otro', general: keepGeneral };
  }
  const parsed = parseAddressLabel(full, keepGeneral);
  return {
    ...parsed,
    roadType: 'Otro',
    roadNumber: '',
    roadLetter: '',
    roadCardinal: '',
    cross: '',
    crossLetter: '',
    crossCardinal: '',
    houseNumber: '',
    street: full,
    general: keepGeneral,
  };
}

/** Texto completo para el pedido (incluye complemento). */
export function composeFullAddress(parts: AddressParts): string {
  const base = composeSearchQuery(parts);
  const extra = parts.general.trim();
  if (!base) return extra;
  if (!extra) return base;
  return `${base} — ${extra}`;
}

export function addressHasRoad(parts: AddressParts): boolean {
  return Boolean(parts.street.trim() || composeStreetLine(parts).trim());
}

/**
 * Actualiza street a partir de tipo + número (excepto “Otro”).
 */
export function syncStreetFromTypeNumber(parts: AddressParts): AddressParts {
  if (parts.roadType === 'Otro') return parts;
  const tok = composeRoadToken(parts.roadNumber, parts.roadLetter, parts.roadCardinal);
  return {
    ...parts,
    street: tok ? `${parts.roadType} ${tok}` : '',
  };
}

/**
 * Normaliza pegado informal colombiano:
 * "Calle 23 37k 28" / "Calle 23 37-28" / "Cl 23 #37-28" → "Calle 23 # 37-28"
 * También: "mz b2 cs 4 apto 202 urb charrascal" → busca urbanización + complemento.
 */
export function normalizePastedAddress(raw: string): string {
  let q = raw.trim().replace(/\s+/g, ' ');
  if (!q) return '';

  const compound = parseColombianCompoundAddress(q);
  if (compound.isCompound && compound.searchQuery) {
    return compound.searchQuery;
  }

  q = q
    .replace(/\b(cl|c\/)\.?\s*(?=\d)/gi, 'Calle ')
    .replace(/\b(cra|carr|kr)\.?\s*(?=\d)/gi, 'Carrera ')
    .replace(/\bcr\.?\s*(?=\d)/gi, 'Carrera ')
    .replace(/\b(avda|av)\.?\s*(?=\d)/gi, 'Avenida ')
    .replace(/\b(tv|transv)\.?\s*(?=\d)/gi, 'Transversal ')
    .replace(/\b(dg|diag)\.?\s*(?=\d)/gi, 'Diagonal ');

  // Cruce sencillo: “Avenida 40 Carrera 31” → “Avenida 40 con Carrera 31”
  const roads = q.match(
    /\b((?:Calle|Carrera|Avenida|Transversal|Diagonal|Circunvalar)\s+\d+[A-Za-z]?(?:\s+(?:Bis|Norte|Sur|Este|Oeste))?)/gi,
  );
  if (roads && roads.length >= 2 && !/\bcon\b/i.test(q)) {
    return `${roads[0]} con ${roads[1]}, Villavicencio, Meta`;
  }

  if (/#\s*[\dA-Za-z]/.test(q)) {
    return q
      .replace(/#\s*/g, '# ')
      .replace(/#\s*([\dA-Za-z]+)\s*[-–]\s*([\dA-Za-z]+)/gi, (_, a, b) => `# ${a.toUpperCase()}-${b}`)
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Calle 23 37l-9 / 37L-9 (placa con letra, sin #)
  q = q.replace(
    /\b((?:Calle|Carrera|Avenida|Transversal|Diagonal|Circunvalar)\s+\d+[A-Za-z]?(?:\s+(?:Bis|Norte|Sur|Este|Oeste))?)\s+(\d{1,4}[A-Za-z])\s*[-–]\s*(\d{1,4})\b/i,
    (_, road, a, b) => `${road} # ${String(a).toUpperCase()}-${b}`,
  );
  // Calle 23 37k 28 / 37k28 / 37 K 28
  q = q.replace(
    /\b((?:Calle|Carrera|Avenida|Transversal|Diagonal|Circunvalar)\s+\d+[A-Za-z]?(?:\s+(?:Bis|Norte|Sur|Este|Oeste))?)\s+(\d{1,4})\s*[kK]\s*(\d{1,4})\b/i,
    '$1 # $2-$3',
  );
  // Calle 23 37-28
  q = q.replace(
    /\b((?:Calle|Carrera|Avenida|Transversal|Diagonal|Circunvalar)\s+\d+[A-Za-z]?(?:\s+(?:Bis|Norte|Sur|Este|Oeste))?)\s+(\d{1,4})\s*[-–]\s*(\d{1,4})\b/i,
    '$1 # $2-$3',
  );
  // Calle 23 37 28 (dos números al final = placa)
  q = q.replace(
    /\b((?:Calle|Carrera|Avenida|Transversal|Diagonal|Circunvalar)\s+\d+[A-Za-z]?(?:\s+(?:Bis|Norte|Sur|Este|Oeste))?)\s+(\d{1,4})\s+(\d{1,4})\b/i,
    '$1 # $2-$3',
  );

  return q.replace(/\s+/g, ' ').trim();
}

export type CompoundAddressParse = {
  /** Query limpia para sugerencias: “Urbanización Teusca, Villavicencio” */
  searchQuery: string;
  /** Query para geocodificar con placa: “Calle 23 # 37-28, Urbanización Teusca, …” */
  geocodeQuery?: string;
  /** Mz / Casa / Apto / Torre… */
  complement: string;
  isCompound: boolean;
  urbanization?: string;
  streetLine?: string;
};

const URB_PREFIX =
  /\b(?:urb\.?|urbanizaci[oó]n|conjunto|conj\.?|residencial|res\.?)\b/i;
const ROAD_SPLIT =
  /\b(?:calle|carrera|avenida|diagonal|transversal|circunvalar|cl\.?|cra\.?|cr\.?|kr\.?|av\.?|avda\.?|dg\.?|diag\.?|tv\.?)\b/i;

function normalizePlateFragment(raw: string): string {
  let q = raw.trim().replace(/\s+/g, ' ');
  if (!q) return '';
  q = q
    .replace(/\b(cl|c\/)\.?\s+/gi, 'Calle ')
    .replace(/\b(cra|cr|kr)\.?\s+/gi, 'Carrera ')
    .replace(/\b(av|avda)\.?\s+/gi, 'Avenida ')
    .replace(/\b(tv|transv)\.?\s+/gi, 'Transversal ')
    .replace(/\b(dg|diag)\.?\s+/gi, 'Diagonal ');
  if (/#\s*\d/.test(q)) return q.replace(/#\s*/g, '# ').replace(/\s+/g, ' ').trim();
  q = q.replace(
    /\b((?:Calle|Carrera|Avenida|Transversal|Diagonal|Circunvalar)\s+\d+[A-Za-z]?(?:\s+(?:Bis|Norte|Sur|Este|Oeste))?)\s+(\d{1,4})\s*[kK]\s*(\d{1,4})\b/i,
    '$1 # $2-$3',
  );
  q = q.replace(
    /\b((?:Calle|Carrera|Avenida|Transversal|Diagonal|Circunvalar)\s+\d+[A-Za-z]?(?:\s+(?:Bis|Norte|Sur|Este|Oeste))?)\s+(\d{1,4})\s*[-–]\s*(\d{1,4})\b/i,
    '$1 # $2-$3',
  );
  q = q.replace(
    /\b((?:Calle|Carrera|Avenida|Transversal|Diagonal|Circunvalar)\s+\d+[A-Za-z]?(?:\s+(?:Bis|Norte|Sur|Este|Oeste))?)\s+(\d{1,4})\s+(\d{1,4})\b/i,
    '$1 # $2-$3',
  );
  return q.replace(/\s+/g, ' ').trim();
}

/**
 * Interpreta direcciones de conjunto/urbanización estilo Colombia:
 * “mz b2 cs 4 apto 202 urb charrascal”
 * “urbanizacion teusca Calle 23 37k 28”
 */
export function parseColombianCompoundAddress(raw: string): CompoundAddressParse {
  const original = raw.trim().replace(/\s+/g, ' ');
  if (!original) return { searchQuery: '', complement: '', isCompound: false };

  let rest = original;
  const complementParts: string[] = [];

  const take = (re: RegExp, label: string) => {
    const m = rest.match(re);
    if (!m) return;
    complementParts.push(`${label} ${m[1].toUpperCase()}`);
    rest = `${rest.slice(0, m.index)}${rest.slice((m.index || 0) + m[0].length)}`
      .replace(/\s+/g, ' ')
      .trim();
  };

  take(/\b(?:mz|mza|manzana)\s*([a-z0-9]+)\b/i, 'Mz');
  // “mz 2 25” / “manzana 25” ya tomado; “casa 1” sin abreviatura cs
  take(/\b(?:cs|casa)\s*([a-z0-9]+)\b/i, 'Casa');
  // “casa” suelta al final sin número → ignorar
  take(/\b(?:apto|apt|apartamento|ap)\s*([a-z0-9]+)\b/i, 'Apto');
  take(/\b(?:torre)\s*([a-z0-9]+)\b/i, 'Torre');
  take(/\b(?:bloque|bl|bq)\s*([a-z0-9]+)\b/i, 'Bloque');
  take(/\b(?:int|interior)\s*([a-z0-9]+)\b/i, 'Int');
  take(/\b(?:etapa)\s*([a-z0-9]+)\b/i, 'Etapa');
  // Números sueltos tras quitar mz (ej. “mz 2 25” → queda “25”) → Mz extra
  if (complementParts.some((c) => c.startsWith('Mz '))) {
    const orphan = rest.match(/^\s*(\d{1,4})\b/);
    if (orphan) {
      complementParts.push(`Mz ${orphan[1]}`);
      rest = rest.slice(orphan.index! + orphan[0].length).replace(/\s+/g, ' ').trim();
    }
  }

  let urbanization = '';
  let streetLine = '';
  const hasUrbKeyword = URB_PREFIX.test(rest);

  // “urbanizacion teusca Calle 23 37k 28” → nombre + vía/placa
  const urbHead = rest.match(
    /^(.*?)?\b(?:urb\.?|urbanizaci[oó]n|conjunto|conj\.?|residencial|res\.?)\s+(.+)$/i,
  );
  if (urbHead) {
    const before = (urbHead[1] || '').trim();
    let after = urbHead[2].replace(/,?\s*(villavicencio|meta|colombia)\s*$/i, '').trim();
    const roadAt = after.search(ROAD_SPLIT);
    if (roadAt >= 0) {
      urbanization = after.slice(0, roadAt).trim();
      streetLine = normalizePlateFragment(after.slice(roadAt));
    } else {
      urbanization = after;
    }
    // Vía/placa escrita antes del “urb …”
    if (before && ROAD_SPLIT.test(before)) {
      streetLine = streetLine || normalizePlateFragment(before);
    }
    rest = '';
  }

  // “charrascal mz b2…” sin palabra urb, solo complemento mz/cs
  if (!urbanization && complementParts.length) {
    const cleaned = rest
      .replace(/,?\s*(villavicencio|meta|colombia)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned && !ROAD_SPLIT.test(cleaned)) {
      urbanization = cleaned;
      rest = '';
    }
  }

  const complement = complementParts.join(' ');
  const isCompound = Boolean(complement || hasUrbKeyword || urbanization);
  if (!isCompound) {
    return { searchQuery: original, complement: '', isCompound: false };
  }

  const name = urbanization.replace(/\s+/g, ' ').trim();
  if (!name && !streetLine) {
    return {
      searchQuery: original,
      complement,
      isCompound: Boolean(complement),
    };
  }

  const urbLabel = name
    ? /urbanizaci|conjunto|residencial|remanso|bosque|barrio/i.test(name)
      ? name.replace(/\bremanso\b/gi, 'Remansos').replace(/\brosablanca\b/gi, 'Rosablanca')
      : `Urbanización ${name}`
    : '';

  // Alias frecuentes Villavicencio (antes / ahora)
  let searchQuery = urbLabel
    ? `${urbLabel}, Villavicencio, Meta`
    : original;
  const foldName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/remanso.*rosa\s*blanca|rosa\s*blanca.*remanso|rosablanca/.test(foldName)) {
    searchQuery = 'Remansos de Rosablanca, Villavicencio, Meta';
  } else if (/charrascal/.test(foldName)) {
    searchQuery = 'Charrascal, Villavicencio, Meta';
  } else if (/porf[ií]a|ciudad porf/.test(foldName)) {
    searchQuery = 'Ciudad Porfía, Villavicencio, Meta';
  } else if (/teusca/.test(foldName)) {
    searchQuery = 'Urbanización Teusca, Villavicencio, Meta';
  }

  const geocodeQuery = streetLine
    ? [streetLine, searchQuery.replace(/,?\s*Villavicencio,?\s*Meta\s*$/i, '').trim(), 'Villavicencio', 'Meta']
        .filter(Boolean)
        .join(', ')
    : searchQuery;

  return {
    searchQuery,
    geocodeQuery,
    complement: [complement, streetLine && !urbLabel ? streetLine : ''].filter(Boolean).join(' · '),
    isCompound: true,
    urbanization: name || undefined,
    streetLine: streetLine || undefined,
  };
}

/** True si el usuario busca un conjunto/urbanización (no solo la vía). */
export function hasUrbanizationIntent(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (URB_PREFIX.test(q)) return true;
  const parsed = parseColombianCompoundAddress(q);
  return Boolean(parsed.isCompound && parsed.urbanization);
}

/** Extrae placa colombiana “# 22-10”, “37k 28”, “37-28”. */
function extractHouseNumber(seg: string): { withoutHouse: string; houseNumber: string } {
  const normalized = normalizePastedAddress(seg);
  const hash = normalized.match(/(?:#|n[oº°]\.?)\s*([\dA-Za-z]+(?:\s*-\s*[\dA-Za-z]+)?)/i);
  if (hash) {
    return {
      withoutHouse: normalized
        .replace(/(?:#|n[oº°]\.?)\s*[\dA-Za-z]+(?:\s*-\s*[\dA-Za-z]+)?/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
      houseNumber: hash[1].replace(/\s+/g, ''),
    };
  }

  const informalK = seg.match(/\s+(\d{1,4})\s*[kK]\s*(\d{1,4})\s*$/);
  if (informalK && informalK.index != null) {
    return {
      withoutHouse: seg.slice(0, informalK.index).trim(),
      houseNumber: `${informalK[1]}-${informalK[2]}`,
    };
  }
  const informalDash = seg.match(/\s+(\d{1,4})\s*[-–]\s*(\d{1,4})\s*$/);
  if (informalDash && informalDash.index != null) {
    return {
      withoutHouse: seg.slice(0, informalDash.index).trim(),
      houseNumber: `${informalDash[1]}-${informalDash[2]}`,
    };
  }
  return { withoutHouse: seg.trim(), houseNumber: '' };
}

function splitRoadSegment(seg: string): {
  roadType: RoadType;
  roadNumber: string;
  roadLetter: string;
  roadCardinal: string;
  street: string;
  houseNumber: string;
  cross: string;
  crossLetter: string;
  crossCardinal: string;
} {
  const { withoutHouse, houseNumber } = extractHouseNumber(seg);
  let cross = '';
  let crossLetter = '';
  let crossCardinal = '';
  let line = withoutHouse;
  const conMatch = line.match(/\bcon\s+(.+)$/i);
  if (conMatch) {
    const crossRaw = conMatch[1].trim();
    line = line.replace(/\bcon\s+.+$/i, '').trim();
    let crossRest = crossRaw;
    for (const { type, re } of ROAD_DETECT) {
      if (re.test(crossRest)) {
        const rest = crossRest.replace(re, '').trim();
        const parsed = parseRoadToken(rest);
        cross = `${type} ${parsed.number || rest}`.trim();
        crossLetter = parsed.letter;
        crossCardinal = parsed.cardinal;
        break;
      }
    }
    if (!cross) {
      const parsed = parseRoadToken(crossRaw);
      cross = parsed.number || crossRaw;
      crossLetter = parsed.letter;
      crossCardinal = parsed.cardinal;
    }
  }
  for (const { type, re } of ROAD_DETECT) {
    if (re.test(line)) {
      const rest = line.replace(re, '').trim();
      const parsed = parseRoadToken(rest);
      const tok = composeRoadToken(parsed.number, parsed.letter, parsed.cardinal);
      return {
        roadType: type,
        roadNumber: parsed.number,
        roadLetter: parsed.letter,
        roadCardinal: parsed.cardinal,
        street: `${type} ${tok || rest}`.trim(),
        houseNumber,
        cross,
        crossLetter,
        crossCardinal,
      };
    }
  }
  return {
    roadType: 'Otro',
    roadNumber: '',
    roadLetter: '',
    roadCardinal: '',
    street: line || seg.trim(),
    houseNumber,
    cross,
    crossLetter,
    crossCardinal,
  };
}

/**
 * Parte una dirección larga de Google/OSM en tipo/número/#/barrio/ciudad/Meta.
 */
export function parseAddressLabel(label: string, keepGeneral = ''): AddressParts {
  const raw = normalizePastedAddress(label.replace(/\s+/g, ' ').trim());
  if (!raw) {
    return { ...EMPTY_ADDRESS_PARTS, general: keepGeneral };
  }

  const segments = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !NOISE.test(s) && !POSTAL.test(s) && !/^colombia$/i.test(s));

  let department = 'Meta';
  let city = 'Villavicencio';
  const rest: string[] = [];

  for (const seg of segments) {
    if (/^meta$/i.test(seg)) {
      department = 'Meta';
      continue;
    }
    if (/villavicencio/i.test(seg)) {
      city = 'Villavicencio';
      continue;
    }
    if (/^(acac[ií]as|restrepo|cumaral|guamal|puerto\s+l[oó]pez)$/i.test(seg)) {
      city = seg;
      continue;
    }
    rest.push(seg);
  }

  const first = rest[0] || segments[0] || '';
  const road = splitRoadSegment(first);

  const barrioBits = rest.slice(1).filter((s) => !/^meta$/i.test(s));
  const barrio = barrioBits.join(', ').trim();

  return {
    roadType: road.roadType,
    roadNumber: road.roadNumber,
    roadLetter: road.roadLetter,
    roadCardinal: road.roadCardinal,
    street: road.street || first,
    cross: road.cross,
    crossLetter: road.crossLetter,
    crossCardinal: road.crossCardinal,
    houseNumber: road.houseNumber,
    barrio,
    city,
    department,
    general: keepGeneral,
  };
}

/** Barrios frecuentes (sugerencias opcionales). */
export const VILLAVICENCIO_BARRIOS = [
  'Veinte de Julio',
  'La Esperanza',
  'El Porvenir',
  'Popular',
  'Centro',
  'La Grama',
  'Catama',
  'Morichal',
  'La Reliquia',
  'Buenos Aires',
  'Villa Julia',
  'El Remanso',
  'San Antonio',
  'Barzal',
  'La Rosita',
  'Jordan',
  'Altos de la Sabana',
  'Vanguardia',
  'Covicom',
  'La Castilla',
  'Cedritos',
  'El Recreo',
  'Bello Horizonte',
] as const;

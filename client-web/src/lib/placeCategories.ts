export type PlaceCategory = {
  id: string;
  label: string;
  kindLabels: string[];
  labelHints: string[];
  terms: string[];
  googleIncludedType?: string;
};

const CATEGORIES: PlaceCategory[] = [
  {
    id: 'hospital',
    label: 'Hospital',
    kindLabels: ['Hospital', 'Clínica'],
    labelHints: ['hospital', 'clinica', 'clínica', 'urgencia', 'ips'],
    terms: ['hospital', 'clinica', 'clínica', 'ips', 'urgencia', 'urgencias'],
    googleIncludedType: 'hospital',
  },
  {
    id: 'clinica',
    label: 'Clínica',
    kindLabels: ['Clínica', 'Hospital'],
    labelHints: ['clinica', 'clínica', 'consultorio'],
    terms: ['clinica', 'clínica', 'consultorio'],
    googleIncludedType: 'hospital',
  },
  {
    id: 'parque',
    label: 'Parque',
    kindLabels: ['Parque'],
    labelHints: ['parque', 'parqueadero', 'fundadores', 'los fundadores'],
    terms: ['parque', 'parques'],
    googleIncludedType: 'park',
  },
  {
    id: 'polideportivo',
    label: 'Polideportivo',
    kindLabels: ['Estadio', 'Parque', 'Lugar'],
    labelHints: ['polideportivo', 'cancha', 'estadio', 'coliseo', 'deportivo'],
    terms: ['polideportivo', 'cancha', 'estadio', 'coliseo', 'gimnasio', 'gym'],
    googleIncludedType: 'stadium',
  },
  {
    id: 'urbanizacion',
    label: 'Urbanización',
    kindLabels: ['Urbanización', 'Barrio', 'Zona'],
    labelHints: ['urbanizacion', 'urbanización', 'conjunto', 'residencial'],
    terms: ['urbanizacion', 'urbanización', 'urb', 'conjunto', 'conj', 'residencial'],
  },
  {
    id: 'barrio',
    label: 'Barrio',
    kindLabels: ['Barrio', 'Zona', 'Urbanización'],
    labelHints: ['barrio', 'sector', 'zona'],
    terms: ['barrio', 'barrios', 'sector'],
  },
  {
    id: 'colegio',
    label: 'Colegio',
    kindLabels: ['Colegio', 'Universidad'],
    labelHints: ['colegio', 'escuela', 'instituto', 'jardin', 'jardín'],
    terms: ['colegio', 'escuela', 'instituto', 'jardin', 'jardín'],
    googleIncludedType: 'school',
  },
  {
    id: 'universidad',
    label: 'Universidad',
    kindLabels: ['Universidad', 'Colegio'],
    labelHints: ['universidad', 'universitario', 'unal', 'santo tomas'],
    terms: ['universidad', 'universitario', 'campus'],
    googleIncludedType: 'university',
  },
  {
    id: 'iglesia',
    label: 'Iglesia',
    kindLabels: ['Iglesia', 'Lugar'],
    labelHints: ['iglesia', 'capilla', 'catedral', 'parroquia'],
    terms: ['iglesia', 'capilla', 'catedral', 'parroquia', 'templo'],
    googleIncludedType: 'church',
  },
  {
    id: 'banco',
    label: 'Banco',
    kindLabels: ['Banco', 'Negocio'],
    labelHints: ['banco', 'bancolombia', 'davivienda', 'bbva', 'cajero'],
    terms: ['banco', 'bancolombia', 'davivienda', 'bbva', 'cajero'],
    googleIncludedType: 'bank',
  },
  {
    id: 'gasolinera',
    label: 'Gasolinera',
    kindLabels: ['Gasolinera', 'Negocio'],
    labelHints: ['gasolinera', 'eds', 'terpel', 'mobil', 'primax'],
    terms: ['gasolinera', 'eds', 'combustible', 'terpel', 'primax'],
    googleIncludedType: 'gas_station',
  },
  {
    id: 'carniceria',
    label: 'Carnicería',
    kindLabels: ['Carnicería'],
    labelHints: ['carnes', 'carniceria', 'carnicos', 'grumet', 'districarnes'],
    terms: ['carniceria', 'carnicería', 'caniceria', 'carnes', 'carnicos', 'butcher'],
    googleIncludedType: 'butcher_shop',
  },
  {
    id: 'restaurante',
    label: 'Restaurante',
    kindLabels: ['Restaurante', 'Comida rápida'],
    labelHints: ['restaurante', 'restaurant', 'asadero', 'pizzeria', 'pizzería', 'comidas'],
    terms: ['restaurante', 'restaurant', 'comida', 'asadero', 'pizzeria', 'pizzería'],
    googleIncludedType: 'restaurant',
  },
  {
    id: 'heladeria',
    label: 'Heladería',
    kindLabels: ['Heladería'],
    labelHints: ['helado', 'helados', 'popsy', 'corocora'],
    terms: ['heladeria', 'heladería', 'helado', 'helados', 'ice cream'],
    googleIncludedType: 'ice_cream_shop',
  },
  {
    id: 'farmacia',
    label: 'Farmacia',
    kindLabels: ['Farmacia'],
    labelHints: ['farmacia', 'drogueria', 'droguería', 'cruz verde', 'cafam'],
    terms: ['farmacia', 'drogueria', 'droguería'],
    googleIncludedType: 'pharmacy',
  },
  {
    id: 'supermercado',
    label: 'Supermercado',
    kindLabels: ['Supermercado'],
    labelHints: ['supermercado', 'exito', 'éxito', 'olimpica', 'olímpica', 'd1', 'ara'],
    terms: ['supermercado', 'super', 'mercado', 'exito', 'éxito', 'olimpica', 'alkosto', 'makro'],
    googleIncludedType: 'supermarket',
  },
  {
    id: 'cafe',
    label: 'Café',
    kindLabels: ['Café'],
    labelHints: ['cafe', 'café', 'cafeteria', 'cafetería', 'coffee'],
    terms: ['cafe', 'café', 'cafeteria', 'cafetería', 'coffee'],
    googleIncludedType: 'cafe',
  },
  {
    id: 'panaderia',
    label: 'Panadería',
    kindLabels: ['Panadería'],
    labelHints: ['panaderia', 'panadería', 'pan', 'chantilly'],
    terms: ['panaderia', 'panadería', 'pan'],
    googleIncludedType: 'bakery',
  },
  {
    id: 'bar',
    label: 'Bar',
    kindLabels: ['Bar'],
    labelHints: ['bar', 'cerveza', 'discoteca'],
    terms: ['bar', 'cerveceria', 'cervecería', 'discoteca'],
    googleIncludedType: 'bar',
  },
  {
    id: 'hotel',
    label: 'Hotel',
    kindLabels: ['Hotel'],
    labelHints: ['hotel', 'hostal', 'hospedaje'],
    terms: ['hotel', 'hostal', 'hospedaje', 'lodging'],
    googleIncludedType: 'lodging',
  },
  {
    id: 'museo',
    label: 'Museo',
    kindLabels: ['Museo', 'Museo / mirador'],
    labelHints: ['museo', 'piedra del amor', 'historia natural'],
    terms: ['museo'],
    googleIncludedType: 'museum',
  },
  {
    id: 'centro_comercial',
    label: 'Centro comercial',
    kindLabels: ['Centro comercial'],
    labelHints: ['centro comercial', 'unicentro', 'viva', 'mall', 'villacentro'],
    terms: ['centro comercial', 'cc', 'mall', 'unicentro', 'viva', 'villacentro'],
    googleIncludedType: 'shopping_mall',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    kindLabels: ['Terminal', 'Aeropuerto'],
    labelHints: ['terminal', 'transporte'],
    terms: ['terminal', 'terminal de transportes'],
    googleIncludedType: 'bus_station',
  },
  {
    id: 'aeropuerto',
    label: 'Aeropuerto',
    kindLabels: ['Aeropuerto'],
    labelHints: ['aeropuerto', 'vanguardia'],
    terms: ['aeropuerto', 'aeropuerto vanguardia'],
    googleIncludedType: 'airport',
  },
];

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function resolvePlaceCategory(query: string): PlaceCategory | null {
  const q = fold(query.trim());
  if (q.length < 2) return null;
  let best: { cat: PlaceCategory; score: number } | null = null;
  for (const cat of CATEGORIES) {
    for (const term of cat.terms) {
      const t = fold(term);
      if (q === t) return cat;
      if (q.includes(t) || t.startsWith(q) || q.startsWith(t)) {
        const score = Math.min(q.length, t.length) + (q.includes(t) ? 5 : 0);
        if (!best || score > best.score) best = { cat, score };
      }
    }
  }
  return best?.cat || null;
}

export function isCategoryQuery(query: string): boolean {
  return resolvePlaceCategory(query) !== null;
}

/** True si la query parece nombre de lugar / POI (no solo vía con placa). */
export function looksLikePlaceQuery(query: string): boolean {
  const q = fold(query.trim());
  if (q.length < 2) return false;
  if (resolvePlaceCategory(query)) return true;
  if (/\b(urb|urbanizacion|urbanización|conjunto|conj|residencial|barrio|sector)\b/.test(q)) {
    return true;
  }
  // Nombre propio / negocio: letras sin patrón claro de vía+placa
  if (/#\s*[\da-z]/.test(q)) return false;
  if (
    /^(calle|carrera|avenida|diagonal|transversal|cl|cra|cr|av|dg|tv)\b/.test(q) &&
    /\d/.test(q)
  ) {
    return false;
  }
  return /[a-z]{3,}/.test(q);
}

export function categoryMatchesPlace(
  cat: PlaceCategory,
  fields: { label: string; kind?: string; secondary?: string },
): boolean {
  const kind = fold(fields.kind || '');
  if (cat.kindLabels.some((k) => kind.includes(fold(k)))) return true;
  const hay = fold([fields.label, fields.secondary || ''].join(' '));
  if (cat.labelHints.some((h) => hay.includes(fold(h)))) return true;
  return cat.terms.some((t) => hay.includes(fold(t)));
}

export function categorySearchQuery(cat: PlaceCategory, rawQuery: string): string {
  const q = rawQuery.trim();
  if (q.length >= 4 && !cat.terms.some((t) => fold(q) === fold(t))) {
    return `${q} ${cat.label} Villavicencio Meta`;
  }
  return `${cat.label} Villavicencio Meta Colombia`;
}

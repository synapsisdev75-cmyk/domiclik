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
    terms: ['supermercado', 'super', 'mercado', 'exito', 'éxito', 'olimpica'],
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
    labelHints: ['centro comercial', 'unicentro', 'viva', 'mall'],
    terms: ['centro comercial', 'cc', 'mall', 'unicentro', 'viva'],
    googleIncludedType: 'shopping_mall',
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
  if (q.length < 3) return null;
  let best: { cat: PlaceCategory; score: number } | null = null;
  for (const cat of CATEGORIES) {
    for (const term of cat.terms) {
      const t = fold(term);
      if (q === t) return cat;
      if (q.startsWith(t) || t.startsWith(q)) {
        const score = Math.min(q.length, t.length);
        if (!best || score > best.score) best = { cat, score };
      }
    }
  }
  return best?.cat || null;
}

export function isCategoryQuery(query: string): boolean {
  return resolvePlaceCategory(query) !== null;
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

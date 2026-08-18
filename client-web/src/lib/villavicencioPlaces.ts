import type { PlaceSuggestion } from './geo';

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
    aliases: ['siete de agosto', '7 de agosto', 'agosto'],
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
];

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function searchLocalPlaces(query: string): PlaceSuggestion[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];

  const scored = VILLAVICENCIO_PLACES.map((place, i) => {
    const hay = fold([place.label, place.secondary, place.kind, ...place.aliases].join(' '));
    let score = 0;
    if (fold(place.label).startsWith(q) || place.aliases.some((a) => fold(a).startsWith(q))) score = 100;
    else if (place.aliases.some((a) => fold(a) === q || fold(a).includes(q))) score = 80;
    else if (hay.includes(q)) score = 50;
    else {
      const tokens = q.split(/\s+/).filter(Boolean);
      const hits = tokens.filter((t) => hay.includes(t)).length;
      if (hits) score = 20 + hits * 10;
    }
    return { place, score, i };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 8);

  return scored.map(({ place }) => ({
    id: `local-${place.lat}-${place.lng}-${place.label}`,
    label: place.label,
    secondary: place.secondary,
    kind: place.kind,
    source: 'local' as const,
    lat: place.lat,
    lng: place.lng,
  }));
}

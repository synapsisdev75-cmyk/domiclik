/**
 * Descarga directorio OSM Villavicencio: barrios, urbanizaciones, hospitales,
 * parques, vías, comercios y POIs.
 * Uso: node scripts/download-villavicencio-map.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'client-web', 'src', 'data', 'villavicencio-map.json');

/** Sur, oeste, norte, este — Villavicencio + Restrepo, Acacías, vía Pto. López, Cumaral. */
const BBOX = '3.95,-73.88,4.32,-73.38';

const KIND = {
  city: 'Ciudad',
  town: 'Pueblo',
  village: 'Vereda / pueblo',
  suburb: 'Barrio',
  neighbourhood: 'Barrio',
  quarter: 'Barrio',
  hamlet: 'Vereda',
  isolated_dwelling: 'Vereda',
  residential: 'Urbanización',
  apartments: 'Urbanización',
  hospital: 'Hospital',
  clinic: 'Salud',
  doctors: 'Salud',
  dentist: 'Salud',
  nursing_home: 'Salud',
  social_facility: 'Salud',
  university: 'Universidad',
  college: 'Universidad',
  school: 'Colegio',
  kindergarten: 'Colegio',
  library: 'Biblioteca',
  pharmacy: 'Farmacia',
  police: 'Policía',
  fire_station: 'Sitio',
  fuel: 'Estación',
  bus_station: 'Terminal',
  bank: 'Banco',
  atm: 'Banco',
  place_of_worship: 'Iglesia',
  marketplace: 'Plaza / mercado',
  community_centre: 'Sitio',
  townhall: 'Sitio',
  post_office: 'Sitio',
  cinema: 'Cine',
  theatre: 'Sitio',
  mall: 'Centro comercial',
  supermarket: 'Supermercado',
  department_store: 'Local',
  convenience: 'Tienda',
  bakery: 'Panadería',
  butcher: 'Carnicería',
  clothes: 'Comercio',
  electronics: 'Comercio',
  hardware: 'Ferretería',
  furniture: 'Comercio',
  car: 'Comercio',
  car_repair: 'Taller',
  beauty: 'Comercio',
  hairdresser: 'Comercio',
  laundry: 'Comercio',
  mobile_phone: 'Comercio',
  florist: 'Comercio',
  books: 'Comercio',
  sports: 'Comercio',
  park: 'Parque',
  playground: 'Parque',
  garden: 'Parque',
  recreation_ground: 'Parque',
  pitch: 'Cancha',
  sports_centre: 'Deportes',
  fitness_centre: 'Gimnasio',
  stadium: 'Estadio',
  hotel: 'Hotel',
  guest_house: 'Hotel',
  attraction: 'Sitio',
  museum: 'Museo',
  viewpoint: 'Sitio',
  aerodrome: 'Aeropuerto',
  restaurant: 'Restaurante',
  fast_food: 'Comida rápida',
  cafe: 'Café',
  bar: 'Bar',
  ice_cream: 'Heladería',
  motorway: 'Calle / avenida',
  trunk: 'Calle / avenida',
  primary: 'Calle / avenida',
  secondary: 'Calle / avenida',
  tertiary: 'Calle / avenida',
  unclassified: 'Calle / avenida',
  living_street: 'Calle / avenida',
};

const QUERIES = [
  // Barrios / lugares
  `[out:json][timeout:90];(nwr["place"~"^(city|town|village|suburb|neighbourhood|hamlet|quarter|isolated_dwelling)$"](${BBOX}););out center tags;`,
  // Urbanizaciones / conjuntos (landuse + building con nombre)
  `[out:json][timeout:90];(nwr["landuse"="residential"]["name"](${BBOX});nwr["residential"]["name"](${BBOX});nwr["building"~"^(apartments|residential)$"]["name"](${BBOX});nwr["place"="neighbourhood"]["name"](${BBOX}););out center tags;`,
  // Salud / educación / seguridad / civico
  `[out:json][timeout:90];(nwr["amenity"~"^(hospital|clinic|doctors|dentist|nursing_home|social_facility|university|college|school|kindergarten|library|pharmacy|police|fire_station|fuel|bus_station|bank|atm|place_of_worship|marketplace|community_centre|townhall|post_office|cinema|theatre)$"](${BBOX});nwr["healthcare"]["name"](${BBOX});nwr["aeroway"="aerodrome"](${BBOX}););out center tags;`,
  // Parques y deporte
  `[out:json][timeout:90];(nwr["leisure"~"^(park|playground|garden|recreation_ground|pitch|sports_centre|fitness_centre|stadium)$"](${BBOX});nwr["tourism"~"^(hotel|guest_house|attraction|museum|viewpoint)$"](${BBOX}););out center tags;`,
  // Comercios (shop) — lote 1
  `[out:json][timeout:120];(nwr["shop"~"^(mall|supermarket|department_store|convenience|bakery|butcher|greengrocer|seafood|deli|clothes|electronics|hardware|furniture|car|car_repair|beauty|hairdresser|laundry|mobile_phone|florist|books|sports|chemist|optician|shoes|jewelry)$"](${BBOX}););out center tags;`,
  // Comida / cafés
  `[out:json][timeout:90];(nwr["amenity"~"^(restaurant|fast_food|cafe|bar|food_court|ice_cream|pub)$"](${BBOX}););out center tags;`,
  // Vías principales
  `[out:json][timeout:120];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]["name"](${BBOX}););out center tags;`,
  // Vías residenciales
  `[out:json][timeout:120];(way["highway"~"^(unclassified|residential|living_street)$"]["name"](${BBOX}););out center tags;`,
];

const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function overpass(ql) {
  let last;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'DomiClick/1.0 (villavicencio map gazetteer)',
        },
        body: new URLSearchParams({ data: ql }),
      });
      if (!res.ok) {
        last = new Error(`${url} ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error('Overpass failed');
}

function coords(el) {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function kindOf(tags = {}) {
  if (tags.landuse === 'residential' || tags.residential || tags.building === 'apartments') {
    return 'Urbanización';
  }
  if (tags.healthcare) return 'Salud';
  if (tags.shop && !KIND[tags.shop]) return 'Comercio';
  return (
    KIND[tags.place] ||
    KIND[tags.amenity] ||
    KIND[tags.shop] ||
    KIND[tags.leisure] ||
    KIND[tags.tourism] ||
    KIND[tags.aeroway] ||
    KIND[tags.highway] ||
    KIND[tags.building] ||
    'Lugar'
  );
}

function secondary(tags = {}) {
  return (
    [
      tags['addr:street'],
      tags['addr:suburb'] || tags.suburb || tags['addr:neighbourhood'],
      tags['addr:city'] || 'Villavicencio, Meta',
    ]
      .filter(Boolean)
      .join(', ') || 'Villavicencio y alrededores'
  );
}

function fold(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function main() {
  const elements = [];
  for (let i = 0; i < QUERIES.length; i++) {
    console.log(`Overpass lote ${i + 1}/${QUERIES.length}…`);
    try {
      const data = await overpass(QUERIES[i]);
      const batch = data.elements || [];
      console.log(`  ${batch.length} elementos`);
      elements.push(...batch);
    } catch (err) {
      console.warn(`  Falló lote ${i + 1}:`, err?.message || err);
    }
    await new Promise((r) => setTimeout(r, 3500));
  }

  const seen = new Set();
  const places = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:es'] || tags.brand || tags['addr:street'];
    const xy = coords(el);
    if (!name || !xy) continue;
    const key = `${fold(name)}|${xy.lat.toFixed(3)}|${xy.lng.toFixed(3)}|${kindOf(tags)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      label: name,
      secondary: secondary(tags),
      kind: kindOf(tags),
      lat: Math.round(xy.lat * 1e6) / 1e6,
      lng: Math.round(xy.lng * 1e6) / 1e6,
    });
  }

  places.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  mkdirSync(dirname(OUT), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'OpenStreetMap / Overpass',
    bbox: BBOX,
    count: places.length,
    places,
  };
  writeFileSync(OUT, JSON.stringify(payload));
  console.log(`Guardado ${places.length} lugares en ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Descarga el directorio OSM de Villavicencio y alrededores (barrios, vías, POIs).
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
  hospital: 'Hospital',
  clinic: 'Salud',
  doctors: 'Salud',
  university: 'Universidad',
  college: 'Universidad',
  school: 'Colegio',
  kindergarten: 'Colegio',
  pharmacy: 'Farmacia',
  police: 'Policía',
  fire_station: 'Sitio',
  fuel: 'Estación',
  bus_station: 'Terminal',
  bank: 'Banco',
  place_of_worship: 'Iglesia',
  marketplace: 'Sitio',
  community_centre: 'Sitio',
  mall: 'Centro comercial',
  supermarket: 'Supermercado',
  department_store: 'Local',
  park: 'Parque',
  stadium: 'Estadio',
  sports_centre: 'Sitio',
  hotel: 'Sitio',
  attraction: 'Sitio',
  museum: 'Sitio',
  aerodrome: 'Aeropuerto',
  motorway: 'Calle / avenida',
  trunk: 'Calle / avenida',
  primary: 'Calle / avenida',
  secondary: 'Calle / avenida',
  tertiary: 'Calle / avenida',
  unclassified: 'Calle / avenida',
  residential: 'Calle / avenida',
  living_street: 'Calle / avenida',
};

const QUERIES = [
  `[out:json][timeout:90];(nwr["place"~"^(city|town|village|suburb|neighbourhood|hamlet|quarter)$"](${BBOX}););out center tags;`,
  `[out:json][timeout:90];(nwr["amenity"~"^(hospital|clinic|doctors|university|college|school|kindergarten|pharmacy|police|fire_station|fuel|bus_station|bank|place_of_worship|marketplace)$"](${BBOX});nwr["shop"~"^(mall|supermarket|department_store)$"](${BBOX});nwr["leisure"~"^(park|stadium|sports_centre)$"](${BBOX});nwr["tourism"~"^(hotel|attraction|museum)$"](${BBOX});nwr["aeroway"="aerodrome"](${BBOX}););out center tags;`,
  `[out:json][timeout:120];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]["name"](${BBOX}););out center tags;`,
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
  return (
    KIND[tags.place] ||
    KIND[tags.amenity] ||
    KIND[tags.shop] ||
    KIND[tags.leisure] ||
    KIND[tags.tourism] ||
    KIND[tags.aeroway] ||
    KIND[tags.highway] ||
    'Lugar'
  );
}

function secondary(tags = {}) {
  return (
    [tags['addr:street'], tags['addr:suburb'] || tags.suburb, tags['addr:city'] || 'Villavicencio, Meta']
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
    const data = await overpass(QUERIES[i]);
    const batch = data.elements || [];
    console.log(`  ${batch.length} elementos`);
    elements.push(...batch);
    await new Promise((r) => setTimeout(r, 4000));
  }

  const seen = new Set();
  const places = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:es'] || tags['addr:street'];
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

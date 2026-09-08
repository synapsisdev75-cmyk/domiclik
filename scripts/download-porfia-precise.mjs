/**
 * Descarga OSM de alta precisión: Ciudad Porfía + alrededores
 * (Charrascal, Villa Juliana, Darién, Brasilia, La Madrid, Pinares, vía Acacías).
 * Fusiona en client-web/src/data/villavicencio-map.json
 *
 * Uso: node scripts/download-porfia-precise.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'client-web', 'src', 'data', 'villavicencio-map.json');
const OUT_BIZ = join(__dirname, '..', 'client-web', 'src', 'data', 'villavicencio-businesses.json');

/** Sur, oeste, norte, este — Porfía y corredor suroccidental. */
const BBOX = '4.05,-73.705,4.125,-73.635';

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
  restaurant: 'Restaurante',
  fast_food: 'Comida rápida',
  cafe: 'Café',
  bar: 'Bar',
  pub: 'Bar',
  ice_cream: 'Heladería',
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
  chemist: 'Farmacia',
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
  motorway: 'Calle / avenida',
  trunk: 'Calle / avenida',
  primary: 'Calle / avenida',
  secondary: 'Calle / avenida',
  tertiary: 'Calle / avenida',
  unclassified: 'Calle / avenida',
  residential: 'Calle / avenida',
  living_street: 'Calle / avenida',
  service: 'Calle / avenida',
  pedestrian: 'Calle / avenida',
  footway: 'Calle / avenida',
  path: 'Calle / avenida',
};

const QUERIES = [
  // Lugares / barrios / urbanizaciones
  `[out:json][timeout:120];(
    nwr["place"]["name"](${BBOX});
    nwr["landuse"="residential"]["name"](${BBOX});
    nwr["residential"]["name"](${BBOX});
    nwr["building"~"^(apartments|residential|yes)$"]["name"](${BBOX});
  );out center tags;`,
  // Salud, educación, civico, culto
  `[out:json][timeout:120];(
    nwr["amenity"]["name"](${BBOX});
    nwr["healthcare"]["name"](${BBOX});
    nwr["office"]["name"](${BBOX});
    nwr["craft"]["name"](${BBOX});
  );out center tags;`,
  // Parques, deporte, turismo
  `[out:json][timeout:90];(
    nwr["leisure"]["name"](${BBOX});
    nwr["tourism"]["name"](${BBOX});
    nwr["sport"]["name"](${BBOX});
  );out center tags;`,
  // Todos los comercios con nombre
  `[out:json][timeout:120];(
    nwr["shop"]["name"](${BBOX});
  );out center tags;`,
  // Vías con nombre (incluye Sur / service)
  `[out:json][timeout:150];(
    way["highway"]["name"](${BBOX});
  );out center tags;`,
  // Direcciones / números de casa OSM
  `[out:json][timeout:120];(
    nwr["addr:street"](${BBOX});
    nwr["addr:housenumber"](${BBOX});
  );out center tags;`,
];

const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
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
          'User-Agent': 'DomiClick/1.0 (Porfia precise gazetteer)',
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
  if (tags.landuse === 'residential' && !tags.highway) return 'Urbanización';
  if (tags.building === 'apartments' || tags.building === 'residential') return 'Urbanización';
  if (tags.healthcare) return 'Salud';
  if (tags.shop && !KIND[tags.shop]) return 'Comercio';
  if (tags.craft) return 'Taller';
  if (tags.office) return 'Oficina';
  if (tags.highway) return KIND[tags.highway] || 'Calle / avenida';
  return (
    KIND[tags.place] ||
    KIND[tags.amenity] ||
    KIND[tags.shop] ||
    KIND[tags.leisure] ||
    KIND[tags.tourism] ||
    KIND[tags.building] ||
    (tags['addr:street'] ? 'Dirección' : 'Lugar')
  );
}

function secondary(tags = {}) {
  const bits = [
    tags['addr:street']
      ? `${tags['addr:street']}${tags['addr:housenumber'] ? ` # ${tags['addr:housenumber']}` : ''}`
      : null,
    tags['addr:suburb'] || tags.suburb || tags['addr:neighbourhood'],
    tags['addr:city'] || 'Porfía, Villavicencio, Meta',
  ].filter(Boolean);
  return bits.join(', ') || 'Porfía y alrededores, Villavicencio';
}

function fold(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function placeKey(p) {
  return `${fold(p.label)}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}|${fold(p.kind)}`;
}

function toPlace(el) {
  const tags = el.tags || {};
  const name =
    tags.name ||
    tags['name:es'] ||
    tags.brand ||
    (tags['addr:street']
      ? `${tags['addr:street']}${tags['addr:housenumber'] ? ` # ${tags['addr:housenumber']}` : ''}`
      : null);
  const xy = coords(el);
  if (!name || !xy) return null;
  return {
    label: name,
    secondary: secondary(tags),
    kind: kindOf(tags),
    lat: Math.round(xy.lat * 1e6) / 1e6,
    lng: Math.round(xy.lng * 1e6) / 1e6,
  };
}

const SEED_PORFIA = [
  {
    label: 'Ciudad Porfía',
    secondary: 'Comuna 8 / 9, vía Acacías, Villavicencio',
    kind: 'Barrio',
    lat: 4.078724,
    lng: -73.672008,
  },
  {
    label: 'Urbanización Ciudad Porfía',
    secondary: 'Porfía, Villavicencio, Meta',
    kind: 'Urbanización',
    lat: 4.078724,
    lng: -73.672008,
  },
  {
    label: 'Rotonda de Porfía',
    secondary: 'Corredor Villavicencio – Acacías',
    kind: 'Sitio',
    lat: 4.0885,
    lng: -73.6704,
  },
  {
    label: 'Centro de Salud Porfía',
    secondary: 'Calle 55 con Carrera 44, Porfía',
    kind: 'Salud',
    lat: 4.081945,
    lng: -73.670646,
  },
  {
    label: 'CAI Porfía',
    secondary: 'Carrera 44, Porfía',
    kind: 'Policía',
    lat: 4.077844,
    lng: -73.670274,
  },
  {
    label: 'Charrascal',
    secondary: 'Alrededores de Porfía, Villavicencio',
    kind: 'Urbanización',
    lat: 4.086167,
    lng: -73.658507,
  },
  {
    label: 'Villa Juliana',
    secondary: 'Alrededores de Porfía, Villavicencio',
    kind: 'Barrio',
    lat: 4.09,
    lng: -73.665,
  },
  {
    label: 'Brasilia',
    secondary: 'Alrededores de Porfía, Villavicencio',
    kind: 'Barrio',
    lat: 4.095,
    lng: -73.668,
  },
  {
    label: 'La Madrid',
    secondary: 'Alrededores de Porfía, Villavicencio',
    kind: 'Barrio',
    lat: 4.1,
    lng: -73.66,
  },
  {
    label: 'Pinares de Oriente',
    secondary: 'Alrededores de Porfía, Villavicencio',
    kind: 'Barrio',
    lat: 4.092,
    lng: -73.655,
  },
];

function loadJson(path) {
  if (!existsSync(path)) return { places: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { places: [] };
  }
}

function mergePlaces(base, extra) {
  const seen = new Set();
  const out = [];
  for (const p of [...extra, ...base]) {
    if (!p?.label || p.lat == null || p.lng == null) continue;
    const key = placeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: p.label,
      secondary: p.secondary || 'Villavicencio, Meta',
      kind: p.kind || 'Lugar',
      lat: p.lat,
      lng: p.lng,
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return out;
}

async function main() {
  console.log(`Descargando Porfía preciso bbox=${BBOX}…`);
  const elements = [];
  for (let i = 0; i < QUERIES.length; i++) {
    console.log(`  Lote ${i + 1}/${QUERIES.length}…`);
    try {
      const data = await overpass(QUERIES[i]);
      const batch = data.elements || [];
      console.log(`    ${batch.length} elementos`);
      elements.push(...batch);
    } catch (err) {
      console.warn(`    Falló lote ${i + 1}:`, err?.message || err);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  const fresh = [];
  const seen = new Set();
  for (const el of elements) {
    const p = toPlace(el);
    if (!p) continue;
    const key = placeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(p);
  }
  for (const p of SEED_PORFIA) {
    const key = placeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(p);
  }
  console.log(`Porfía nuevo: ${fresh.length} lugares`);

  mkdirSync(dirname(OUT), { recursive: true });
  const existing = loadJson(OUT);
  const places = mergePlaces(existing.places || [], fresh);
  writeFileSync(
    OUT,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: 'OpenStreetMap / Overpass (Villavicencio + Porfía preciso)',
      bbox: existing.bbox || '3.95,-73.88,4.32,-73.38',
      porfiaBbox: BBOX,
      count: places.length,
      places,
    }),
  );
  console.log(`Mapa total: ${places.length} → ${OUT}`);

  const bizKinds = new Set([
    'Restaurante',
    'Comida rápida',
    'Café',
    'Bar',
    'Heladería',
    'Carnicería',
    'Panadería',
    'Tienda',
    'Supermercado',
    'Centro comercial',
    'Local',
    'Comercio',
    'Ferretería',
    'Taller',
    'Farmacia',
    'Hotel',
    'Oficina',
  ]);
  const bizExisting = loadJson(OUT_BIZ);
  const bizFresh = fresh.filter((p) => bizKinds.has(p.kind));
  const biz = mergePlaces(bizExisting.places || [], bizFresh);
  writeFileSync(
    OUT_BIZ,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: 'OpenStreetMap / Overpass (negocios + Porfía)',
      bbox: existing.bbox || '3.95,-73.88,4.32,-73.38',
      count: biz.length,
      places: biz,
    }),
  );
  console.log(`Negocios total: ${biz.length} → ${OUT_BIZ}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

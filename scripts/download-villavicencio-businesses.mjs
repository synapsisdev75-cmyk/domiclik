/**
 * Descarga negocios OSM (restaurantes, carnicerías, etc.) para Villavicencio.
 * Uso: node scripts/download-villavicencio-businesses.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'client-web', 'src', 'data', 'villavicencio-businesses.json');
const BBOX = '3.95,-73.88,4.32,-73.38';

const KIND = {
  restaurant: 'Restaurante',
  fast_food: 'Comida rápida',
  cafe: 'Café',
  bar: 'Bar',
  food_court: 'Restaurante',
  ice_cream: 'Heladería',
  butcher: 'Carnicería',
  bakery: 'Panadería',
  convenience: 'Tienda',
  supermarket: 'Supermercado',
  mall: 'Centro comercial',
  department_store: 'Local',
  greengrocer: 'Frutería',
  seafood: 'Pescadería',
  deli: 'Deli',
  hotel: 'Hotel',
  guest_house: 'Hotel',
  hostel: 'Hotel',
  motel: 'Hotel',
};

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

const QL = `[out:json][timeout:120];(nwr["amenity"~"^(restaurant|fast_food|cafe|bar|food_court|ice_cream)$"](${BBOX});nwr["shop"~"^(butcher|bakery|convenience|supermarket|mall|department_store|greengrocer|seafood|deli)$"](${BBOX});nwr["tourism"~"^(hotel|guest_house|hostel|motel)$"](${BBOX}););out center tags;`;

async function overpass() {
  let last;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'DomiClick/1.0 (business gazetteer)',
        },
        body: new URLSearchParams({ data: QL }),
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
  return KIND[tags.amenity] || KIND[tags.shop] || KIND[tags.tourism] || 'Negocio';
}

function secondary(tags = {}) {
  return (
    [tags['addr:street'], tags['addr:suburb'] || tags.suburb, tags['addr:city'] || 'Villavicencio, Meta']
      .filter(Boolean)
      .join(', ') || 'Villavicencio, Meta'
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
  console.log('Descargando negocios OSM…');
  const data = await overpass();
  const seen = new Set();
  const places = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:es'] || tags.brand;
    const xy = coords(el);
    if (!name || !xy) continue;
    const key = `${fold(name)}|${xy.lat.toFixed(4)}|${xy.lng.toFixed(4)}`;
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
  writeFileSync(
    OUT,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: 'OpenStreetMap / Overpass (businesses)',
      bbox: BBOX,
      count: places.length,
      places,
    }),
  );
  console.log(`Guardado ${places.length} negocios en ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

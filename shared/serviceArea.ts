/** Villavicencio + Restrepo, Acacías, Cumaral y vía Puerto López. */
export const VILLAVICENCIO_CENTER = { lat: 4.142, lng: -73.6266 };

export const VILLAVICENCIO_MAP_BOUNDS = {
  south: 3.95,
  west: -73.88,
  north: 4.32,
  east: -73.38,
};

export function isWithinServiceArea(lat: number, lng: number): boolean {
  return (
    lat >= VILLAVICENCIO_MAP_BOUNDS.south &&
    lat <= VILLAVICENCIO_MAP_BOUNDS.north &&
    lng >= VILLAVICENCIO_MAP_BOUNDS.west &&
    lng <= VILLAVICENCIO_MAP_BOUNDS.east
  );
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const AREA_NAME_RE =
  /\b(villavicencio|acacias|acacías|restrepo|cumaral|puerto lopez|puerto lópez|meta)\b/;

/** Predicciones de Places sin lat/lng: exigir ciudad del área. */
export function descriptionInServiceArea(text: string): boolean {
  return AREA_NAME_RE.test(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  );
}

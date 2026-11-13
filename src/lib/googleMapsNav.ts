/** Deep links a Google Maps. Prioriza el pin (lat/lng) guardado en DomiClick. */

export type LatLng = { lat: number; lng: number };

export type NavPoint = LatLng & {
  address?: string | null;
  placeId?: string | null;
};

export function navStop(
  coords: LatLng,
  address?: string | null,
  placeId?: string | null,
): NavPoint {
  return { lat: coords.lat, lng: coords.lng, address, placeId };
}

function fmt(p: LatLng): string {
  return `${p.lat},${p.lng}`;
}

function isValid(p?: LatLng | null): p is LatLng {
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    !(p.lat === 0 && p.lng === 0)
  );
}

function savedAddress(address?: string | null): string {
  const text = (address || '').replace(/\s+/g, ' ').trim();
  if (text.length < 8) return '';
  if (/^punto de recolecci[oó]n$/i.test(text)) return '';
  if (/^sin (recogida|entrega)$/i.test(text)) return '';
  return text;
}

/**
 * Destino/origen para Maps: si hay coordenadas DomiClick, van primero
 * (antes se prefería solo la dirección y Maps re-geocodificaba mal).
 */
function endpoint(point: NavPoint): { query: string; placeId?: string } {
  const placeId = point.placeId?.trim() || '';
  const address = savedAddress(point.address);
  if (isValid(point)) {
    if (placeId && address) return { query: address, placeId };
    return { query: fmt(point) };
  }
  if (placeId) return { query: address || '.', placeId };
  if (address) return { query: address };
  return { query: '0,0' };
}

/**
 * URL de direcciones Google Maps.
 */
export function buildGoogleMapsDirectionsUrl(opts: {
  destination: NavPoint;
  origin?: NavPoint | 'current';
  waypoint?: NavPoint;
  navigate?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('travelmode', 'driving');
  if (opts.origin && opts.origin !== 'current' && isValid(opts.origin)) {
    const origin = endpoint(opts.origin);
    params.set('origin', origin.query);
    if (origin.placeId) params.set('origin_place_id', origin.placeId);
  }
  const destination = endpoint(opts.destination);
  params.set('destination', destination.query);
  if (destination.placeId) params.set('destination_place_id', destination.placeId);
  if (opts.waypoint && isValid(opts.waypoint)) {
    const waypoint = endpoint(opts.waypoint);
    params.set('waypoints', waypoint.query);
    if (waypoint.placeId) params.set('waypoint_place_ids', waypoint.placeId);
  }
  if (opts.navigate) params.set('dir_action', 'navigate');
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Ruta completa A (recolección) → B (entrega). */
export function buildGoogleMapsAbRouteUrl(pickup: NavPoint, delivery: NavPoint, navigate = false): string {
  return buildGoogleMapsDirectionsUrl({
    origin: pickup,
    destination: delivery,
    navigate,
  });
}

/** Navegar hacia un punto. El origen es el GPS; el destino es el pin DomiClick. */
export function buildGoogleMapsNavigateToUrl(destination: NavPoint, origin?: LatLng | null): string {
  return buildGoogleMapsDirectionsUrl({
    origin: origin && isValid(origin) ? origin : 'current',
    destination,
    navigate: true,
  });
}

/** Abre Maps. En móvil/APK: misma ventana para que Android entregue a la app Maps. */
export function openGoogleMapsNav(url: string): void {
  if (typeof window === 'undefined') return;
  const ua = navigator.userAgent || '';
  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) {
    window.location.assign(url);
    return;
  }
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) window.location.assign(url);
}

/** Deep links a Google Maps. El destino es la dirección guardada en DomiClick, no un pin suelto. */

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

function endpoint(point: NavPoint): { query: string; placeId?: string } {
  const placeId = point.placeId?.trim() || '';
  const address = savedAddress(point.address);
  if (placeId) return { query: address || fmt(point), placeId };
  if (address) return { query: address };
  return { query: fmt(point) };
}

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

export function buildGoogleMapsAbRouteUrl(pickup: NavPoint, delivery: NavPoint, navigate = false): string {
  return buildGoogleMapsDirectionsUrl({
    origin: pickup,
    destination: delivery,
    navigate,
  });
}

export function buildGoogleMapsNavigateToUrl(destination: NavPoint, origin?: LatLng | null): string {
  return buildGoogleMapsDirectionsUrl({
    origin: origin && isValid(origin) ? origin : 'current',
    destination,
    navigate: true,
  });
}

function isMapsUrl(url: string): boolean {
  return /google\.[^/]+\/maps/i.test(url);
}

export function openGoogleMapsNav(url: string): void {
  if (typeof window === 'undefined') return;
  const home = window.location.href;
  window.open(url, '_blank', 'noopener,noreferrer');
  const back = () => {
    if (!isMapsUrl(window.location.href)) return;
    if (!home || isMapsUrl(home)) return;
    window.location.replace(home);
  };
  window.setTimeout(back, 600);
  window.setTimeout(back, 1500);
}

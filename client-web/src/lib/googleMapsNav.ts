/** Deep links a Google Maps (navegación turn-by-turn / ruta optimizada). */

export type LatLng = { lat: number; lng: number };

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

export function buildGoogleMapsDirectionsUrl(opts: {
  destination: LatLng;
  origin?: LatLng | 'current';
  waypoint?: LatLng;
  navigate?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('travelmode', 'driving');
  if (opts.origin && opts.origin !== 'current' && isValid(opts.origin)) {
    params.set('origin', fmt(opts.origin));
  }
  params.set('destination', fmt(opts.destination));
  if (opts.waypoint && isValid(opts.waypoint)) {
    params.set('waypoints', fmt(opts.waypoint));
  }
  if (opts.navigate) {
    params.set('dir_action', 'navigate');
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsAbRouteUrl(pickup: LatLng, delivery: LatLng, navigate = false): string {
  return buildGoogleMapsDirectionsUrl({
    origin: pickup,
    destination: delivery,
    navigate,
  });
}

export function buildGoogleMapsNavigateToUrl(destination: LatLng, origin?: LatLng | null): string {
  return buildGoogleMapsDirectionsUrl({
    origin: origin && isValid(origin) ? origin : 'current',
    destination,
    navigate: true,
  });
}

function isMapsUrl(url: string): boolean {
  return /google\.[^/]+\/maps/i.test(url);
}

/** Abre Maps en otra pestaña. Si esta pantalla se va a Maps, vuelve sola a DomiClick. */
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

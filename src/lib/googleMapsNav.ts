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

/**
 * URL de direcciones Google Maps.
 * Con `navigate: true` intenta abrir modo navegación (dir_action=navigate).
 */
export function buildGoogleMapsDirectionsUrl(opts: {
  destination: LatLng;
  origin?: LatLng | 'current';
  waypoint?: LatLng;
  navigate?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('travelmode', 'driving');
  if (opts.origin === 'current' || !opts.origin) {
    // Sin origin → Maps usa ubicación del dispositivo
  } else if (isValid(opts.origin)) {
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

/** Ruta completa A (recolección) → B (entrega). */
export function buildGoogleMapsAbRouteUrl(pickup: LatLng, delivery: LatLng, navigate = false): string {
  return buildGoogleMapsDirectionsUrl({
    origin: pickup,
    destination: delivery,
    navigate,
  });
}

/** Navegar desde GPS actual hacia un punto (A o B). */
export function buildGoogleMapsNavigateToUrl(destination: LatLng): string {
  return buildGoogleMapsDirectionsUrl({
    origin: 'current',
    destination,
    navigate: true,
  });
}

export function openGoogleMapsNav(url: string): void {
  if (typeof window === 'undefined') return;
  // En WebView / móvil, location.href abre Google Maps (app o web) de forma más fiable.
  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) {
    window.location.href = url;
    return;
  }
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) window.location.href = url;
}

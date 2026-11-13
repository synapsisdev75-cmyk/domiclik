/** Deep links a Google Maps. Prioriza el pin (lat/lng) guardado en DomiClick. */

export type LatLng = { lat: number; lng: number };

export type NavPoint = LatLng & {
  address?: string | null;
  placeId?: string | null;
  /** Distintivo DomiClick (R1, E2…). Maps sigue usando A/B/C en el pin; esto sale en el nombre. */
  label?: string | null;
};

export function navStop(
  coords: LatLng,
  address?: string | null,
  placeId?: string | null,
  label?: string | null,
): NavPoint {
  return { lat: coords.lat, lng: coords.lng, address, placeId, label };
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
 * Con `label` (R1/E1) el nombre lleva el distintivo: Maps no deja cambiar A/B/C del pin.
 */
function endpoint(point: NavPoint): { query: string; placeId?: string } {
  const placeId = point.placeId?.trim() || '';
  const address = savedAddress(point.address);
  const label = (point.label || '').replace(/\s+/g, ' ').trim();
  if (isValid(point)) {
    if (label) {
      // Nombre con distintivo + pin exacto (Maps muestra el texto; el @ fija coords)
      const named = address ? `${label} · ${address}` : label;
      return { query: `${named} @${fmt(point)}` };
    }
    // Pin exacto de DomiClick; placeId solo si hay etiqueta de dirección
    if (placeId && address) return { query: address, placeId };
    return { query: fmt(point) };
  }
  if (placeId) return { query: (label ? `${label} · ` : '') + (address || '.'), placeId };
  if (address) return { query: label ? `${label} · ${address}` : address };
  if (label) return { query: label };
  return { query: '0,0' };
}

export function buildGoogleMapsDirectionsUrl(opts: {
  destination: NavPoint;
  origin?: NavPoint | 'current';
  waypoint?: NavPoint;
  /** Paradas intermedias (como “Agregar paradas” en Maps). Máx. ~9. */
  waypoints?: NavPoint[];
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

  const middles: NavPoint[] = [];
  if (opts.waypoints?.length) {
    for (const w of opts.waypoints) {
      if (isValid(w)) middles.push(w);
    }
  } else if (opts.waypoint && isValid(opts.waypoint)) {
    middles.push(opts.waypoint);
  }
  // Google Maps URL: hasta 9 waypoints separados por |
  const capped = middles.slice(0, 9);
  if (capped.length) {
    const ends = capped.map((w) => endpoint(w));
    params.set('waypoints', ends.map((e) => e.query).join('|'));
    if (ends.every((e) => e.placeId)) {
      params.set('waypoint_place_ids', ends.map((e) => e.placeId!).join('|'));
    }
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

/**
 * Ruta multi-parada como “Agregar paradas” en Maps.
 * Usa SOLO lat,lng (path /dir/a/b/c): en móvil las URLs con texto/@ rompen las paradas.
 */
export function buildGoogleMapsMultiStopUrl(
  stops: NavPoint[],
  origin?: LatLng | null,
  _navigate = true,
): string | null {
  const valid = stops.filter((s) => isValid(s));
  if (!valid.length) return null;
  if (valid.length === 1) {
    return buildGoogleMapsNavigateToUrl(valid[0], origin);
  }

  // Formato path: Google Maps importa todas las paradas de forma fiable
  // https://www.google.com/maps/dir/lat,lng/lat,lng/lat,lng
  const parts: string[] = [];
  if (origin && isValid(origin)) {
    parts.push(fmt(origin));
  }
  for (const s of valid) {
    parts.push(fmt(s));
  }
  if (parts.length < 2) return null;

  // data=!3e0 → modo conducir (driving)
  return `https://www.google.com/maps/dir/${parts.join('/')}/data=!4m2!4m1!3e0`;
}

/**
 * Abre Maps fuera de la cabina.
 * En el celular no reemplaza la app: al cerrar Maps se vuelve a DomiClick para confirmar o escribir a la torre.
 */
export function openGoogleMapsNav(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return;
  } catch {
    /* fallback abajo */
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

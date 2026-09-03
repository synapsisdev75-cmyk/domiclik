/**
 * Sectores sin cobertura — Villavicencio 2026 (compartido cliente / ops / API).
 * Fuentes: Observatorio de Convivencia y Seguridad, Secretaría de Gobierno Meta,
 * Seguridad al Barrio, Mevil. Revisar trimestralmente.
 */

export type RiskLevel = 'critico' | 'alto' | 'moderado';

export type RiskZone = {
  id: string;
  name: string;
  comuna: string;
  level: RiskLevel;
  reason: string;
  source: string;
  polygon: Array<{ lat: number; lng: number }>;
  serviceBlocked: boolean;
};

export const SERVICE_BLOCKED_MESSAGE =
  'Lo sentimos, en este momento no estamos realizando servicios en tu barrio.';

function box(
  centerLat: number,
  centerLng: number,
  dLat: number,
  dLng: number,
): Array<{ lat: number; lng: number }> {
  return [
    { lat: centerLat - dLat, lng: centerLng - dLng },
    { lat: centerLat - dLat, lng: centerLng + dLng },
    { lat: centerLat + dLat, lng: centerLng + dLng },
    { lat: centerLat + dLat, lng: centerLng - dLng },
  ];
}

export const VILLAVICENCIO_RISK_ZONES: RiskZone[] = [
  {
    id: 'san-isidro-c3',
    name: 'San Isidro',
    comuna: 'Comuna 3',
    level: 'critico',
    reason: 'Microtráfico, hurto y violencia cerca de instituciones educativas (2026).',
    source: 'Diario del Sur / Seguridad al Barrio · ago 2026',
    polygon: box(4.136, -73.652, 0.011, 0.013),
    serviceBlocked: true,
  },
  {
    id: 'malvinas-c3',
    name: 'Malvinas / La Reliquia',
    comuna: 'Comuna 3',
    level: 'alto',
    reason: 'Intervención focalizada por hurto y microtráfico — comuna priorizada.',
    source: 'Observatorio Seguridad Villavicencio · 2026',
    polygon: box(4.132, -73.645, 0.010, 0.012),
    serviceBlocked: true,
  },
  {
    id: 'porvenir-c7',
    name: 'Porvenir / La Reliquia norte',
    comuna: 'Comuna 7',
    level: 'alto',
    reason: 'Mayor concentración de hurtos y capturas flagrancia — Consejo Seguridad 2026.',
    source: 'Secretaría de Gobierno Meta · 2026',
    polygon: box(4.122, -73.628, 0.014, 0.016),
    serviceBlocked: true,
  },
  {
    id: 'morichal-c7',
    name: 'Morichal',
    comuna: 'Comuna 7',
    level: 'moderado',
    reason: 'Operativos Plan Fastidio y patrullaje reforzado en 2026.',
    source: 'Alcaldía Villavicencio · Seguridad al Barrio',
    polygon: box(4.156, -73.618, 0.009, 0.011),
    serviceBlocked: true,
  },
  {
    id: 'el-triunfo-c4',
    name: 'El Triunfo / La Hilda',
    comuna: 'Comuna 4',
    level: 'alto',
    reason: 'Sector priorizado en mesas de seguridad departamental 2026.',
    source: 'Consejo Seguridad Departamental · 2026',
    polygon: box(4.154, -73.658, 0.011, 0.013),
    serviceBlocked: true,
  },
  {
    id: 'la-esmeralda-c5',
    name: 'La Esmeralda / La Badea',
    comuna: 'Comuna 5',
    level: 'alto',
    reason: 'Comuna 5 — intervención integral Seguridad al Barrio.',
    source: 'Observatorio Seguridad · 2026',
    polygon: box(4.145, -73.672, 0.011, 0.012),
    serviceBlocked: true,
  },
  {
    id: 'brisas-c8',
    name: 'Brisas del Llano sur',
    comuna: 'Comuna 8',
    level: 'alto',
    reason: 'Comuna 8 — puntos de intervención estratégica 2026.',
    source: 'Plan Villavo Somos Todos · 2026',
    polygon: box(4.112, -73.662, 0.013, 0.014),
    serviceBlocked: true,
  },
  {
    id: 'amarilo-sur',
    name: 'Amarilo / Llano Lindo',
    comuna: 'Comuna 2 sur',
    level: 'moderado',
    reason: 'Periferia sur — patrullaje mixto y controles nocturnos.',
    source: 'Mevil / MOSER · 2026',
    polygon: box(4.108, -73.595, 0.016, 0.018),
    serviceBlocked: true,
  },
  {
    id: 'catama-c6',
    name: 'Catama',
    comuna: 'Comuna 6',
    level: 'moderado',
    reason: 'Reportes de hurto y recuperación de espacio público.',
    source: 'Seguridad al Barrio · 2026',
    polygon: box(4.128, -73.64, 0.009, 0.011),
    serviceBlocked: true,
  },
];

const LEVEL_RANK: Record<RiskLevel, number> = {
  critico: 3,
  alto: 2,
  moderado: 1,
};

export function pointInPolygon(
  lat: number,
  lng: number,
  polygon: Array<{ lat: number; lng: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function findRiskZoneAt(lat: number, lng: number): RiskZone | null {
  let best: RiskZone | null = null;
  for (const zone of VILLAVICENCIO_RISK_ZONES) {
    if (!pointInPolygon(lat, lng, zone.polygon)) continue;
    if (!best || LEVEL_RANK[zone.level] > LEVEL_RANK[best.level]) best = zone;
  }
  return best;
}

export function findBlockedZoneAt(_lat: number, _lng: number): RiskZone | null {
  return null;
}

export function isServiceBlockedAt(_lat: number, _lng: number): boolean {
  return false;
}

export function assertServiceAllowedAt(_lat: number, _lng: number): void {
  /* Cobertura por sectores retirada: el mapa solo marca recolección y entrega. */
}

export {
  VILLAVICENCIO_RISK_ZONES,
  SERVICE_BLOCKED_MESSAGE,
  pointInPolygon,
  findRiskZoneAt,
  findBlockedZoneAt,
  isServiceBlockedAt,
  assertServiceAllowedAt,
  type RiskLevel,
  type RiskZone,
} from '../../shared/riskZones.ts';

import {
  pointInPolygon,
  type RiskLevel,
  type RiskZone,
} from '../../shared/riskZones.ts';

export function riskLevelColor(level: RiskLevel): string {
  if (level === 'critico') return '#ef4444';
  if (level === 'alto') return '#f97316';
  return '#eab308';
}

export function riskLevelLabel(level: RiskLevel): string {
  if (level === 'critico') return 'Crítico';
  if (level === 'alto') return 'Alto';
  return 'Moderado';
}

export function countIncidentsInZone(
  zone: RiskZone,
  incidents: Array<{ lat?: number; lng?: number }>,
): number {
  return incidents.filter(
    (inc) =>
      inc.lat != null &&
      inc.lng != null &&
      pointInPolygon(inc.lat, inc.lng, zone.polygon),
  ).length;
}

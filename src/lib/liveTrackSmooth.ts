import { bearingDeg, metersBetween, type RoadPoint } from './roadFollow';

export type SmoothFix = RoadPoint & {
  heading?: number;
  updatedAt?: number | string;
  moving?: boolean;
};

type DriverSmooth = {
  lat: number;
  lng: number;
  heading: number;
  updatedAt: number;
  /** Últimos along en calle; evita ir y volver por proyección ruidosa. */
  along?: number;
  backStreak: number;
};

const EMA = 0.32;
const MAX_DISPLAY_JUMP_M = 70;
const BACK_ALONG_TOL_M = 28;

function lerpAngle(from: number, to: number, t: number) {
  const d = ((to - from + 540) % 360) - 180;
  return ((from + d * t) % 360 + 360) % 360;
}

/**
 * Suaviza el punto mostrado en el radar operativo.
 * - EMA entre snapshots Firestore
 * - Limita teleports de display
 * - Heading estable por movimiento real
 * - En calle, no deja que `along` retroceda salvo U-turn confirmado
 */
export function createRadarTrackSmoother() {
  const byDriver = new Map<string, DriverSmooth>();

  return {
    applyRaw(driverId: string, fix: SmoothFix, now = Date.now()): SmoothFix {
      if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return fix;
      const prev = byDriver.get(driverId);
      if (!prev) {
        const heading =
          fix.heading != null && Number.isFinite(fix.heading) ? fix.heading : 0;
        byDriver.set(driverId, {
          lat: fix.lat,
          lng: fix.lng,
          heading,
          updatedAt: now,
          backStreak: 0,
        });
        return { ...fix, heading: heading || undefined };
      }

      const jump = metersBetween(prev, fix);
      let lat = fix.lat;
      let lng = fix.lng;
      if (jump > MAX_DISPLAY_JUMP_M) {
        // Acerca un paso; si el siguiente snapshot confirma, llega.
        const t = MAX_DISPLAY_JUMP_M / jump;
        lat = prev.lat + (fix.lat - prev.lat) * t;
        lng = prev.lng + (fix.lng - prev.lng) * t;
      } else {
        lat = prev.lat + (fix.lat - prev.lat) * EMA;
        lng = prev.lng + (fix.lng - prev.lng) * EMA;
      }

      const moved = metersBetween(prev, { lat, lng });
      let heading = prev.heading;
      if (fix.heading != null && Number.isFinite(fix.heading) && moved >= 1.5) {
        heading = lerpAngle(prev.heading, fix.heading, 0.4);
      } else if (moved >= 3) {
        heading = lerpAngle(prev.heading, bearingDeg(prev, { lat, lng }), 0.5);
      }

      byDriver.set(driverId, {
        ...prev,
        lat,
        lng,
        heading,
        updatedAt: now,
      });
      return { ...fix, lat, lng, heading: heading || undefined };
    },

    /**
     * Ajusta el `along` sobre la polyline: no retrocede por ruido;
     * solo si hay 2 lecturas seguidas claramente atrás (regreso real).
     */
    clampAlong(driverId: string, nextAlong: number): number {
      const prev = byDriver.get(driverId);
      if (!prev || !Number.isFinite(prev.along)) {
        if (prev) {
          byDriver.set(driverId, { ...prev, along: nextAlong, backStreak: 0 });
        }
        return nextAlong;
      }
      if (nextAlong + BACK_ALONG_TOL_M >= prev.along) {
        byDriver.set(driverId, { ...prev, along: nextAlong, backStreak: 0 });
        return nextAlong;
      }
      const streak = prev.backStreak + 1;
      if (streak >= 2) {
        byDriver.set(driverId, { ...prev, along: nextAlong, backStreak: 0 });
        return nextAlong;
      }
      byDriver.set(driverId, { ...prev, backStreak: streak });
      return prev.along;
    },

    rememberAlong(driverId: string, along: number) {
      const prev = byDriver.get(driverId);
      if (!prev) return;
      byDriver.set(driverId, { ...prev, along, backStreak: 0 });
    },

    prune(activeIds: Set<string>) {
      for (const id of byDriver.keys()) {
        if (!activeIds.has(id)) byDriver.delete(id);
      }
    },
  };
}

export type RadarTrackSmoother = ReturnType<typeof createRadarTrackSmoother>;

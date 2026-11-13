type LatLng = { lat: number; lng: number };

export type GpsFixIn = LatLng & {
  heading?: number;
  speedMps?: number;
  accuracyM?: number;
  /** Origen del fix: native gana frente a browser si hay conflicto. */
  source?: 'native' | 'browser' | 'manual';
};

export type GpsFixOut = LatLng & {
  heading?: number;
  speedMps?: number;
  accuracyM?: number;
  moving: boolean;
};

type TrackState = {
  lat: number;
  lng: number;
  heading: number;
  updatedAt: number;
  accuracyM: number;
  source: 'native' | 'browser' | 'manual';
  /** Saltos rechazados seguidos: si persisten, aceptamos (sí se movió). */
  rejectStreak: number;
};

const MAX_ACCURACY_M = 65;
const MAX_SPEED_MPS = 42; // ~150 km/h techo moto + margen
const MAX_JUMP_M = 90;
const MIN_MOVE_M = 2.5;
const EMA_GOOD = 0.38;
const EMA_BAD = 0.18;

function metersBetween(a: LatLng, b: LatLng) {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dy = (b.lat - a.lat) * 111_320;
  const dx = (b.lng - a.lng) * 111_320 * cos;
  return Math.hypot(dx, dy);
}

function bearingDeg(a: LatLng, b: LatLng) {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function lerpAngle(from: number, to: number, t: number) {
  let d = ((to - from + 540) % 360) - 180;
  return ((from + d * t) % 360 + 360) % 360;
}

/**
 * Filtro de trayectoria GPS para cabina: evita saltos de esquina a esquina
 * por fixes malos o por mezclar native + browser. Si el movimiento es real
 * (varios fixes seguidos en la misma dirección), lo deja pasar.
 */
export function createGpsTrackFilter() {
  let state: TrackState | null = null;

  return {
    /** `null` = descartar fix (no publicar / no mover pin local). */
    push(fix: GpsFixIn, now = Date.now()): GpsFixOut | null {
      if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return null;
      const source = fix.source || 'browser';
      const accuracy =
        fix.accuracyM != null && Number.isFinite(fix.accuracyM) ? fix.accuracyM : 40;

      if (!state) {
        const heading =
          fix.heading != null && Number.isFinite(fix.heading) && fix.heading >= 0
            ? fix.heading
            : 0;
        state = {
          lat: fix.lat,
          lng: fix.lng,
          heading,
          updatedAt: now,
          accuracyM: accuracy,
          source,
          rejectStreak: 0,
        };
        return {
          lat: fix.lat,
          lng: fix.lng,
          heading: heading || undefined,
          speedMps: fix.speedMps,
          accuracyM: accuracy,
          moving: false,
        };
      }

      const dtSec = Math.max(0.05, (now - state.updatedAt) / 1000);
      const jump = metersBetween(state, fix);

      // Browser no debe pelear con native reciente (causa el "rebote" típico).
      if (source === 'browser' && state.source === 'native' && now - state.updatedAt < 4000) {
        if (jump < 25 && accuracy >= state.accuracyM) return null;
      }

      // Accuracy muy mala con track reciente bueno → ignorar.
      if (accuracy > MAX_ACCURACY_M && state.accuracyM <= 35 && now - state.updatedAt < 12000) {
        state.rejectStreak += 1;
        if (state.rejectStreak < 3) return null;
      }

      const impliedSpeed =
        fix.speedMps != null && fix.speedMps >= 0 ? fix.speedMps : jump / dtSec;
      const teleport = jump > MAX_JUMP_M && impliedSpeed > MAX_SPEED_MPS;
      const wild = jump > 180 && dtSec < 4;

      if ((teleport || wild) && state.rejectStreak < 2) {
        state.rejectStreak += 1;
        return null;
      }

      // EMA más suave si el fix es impreciso.
      const alpha = accuracy > 28 ? EMA_BAD : EMA_GOOD;
      const lat = state.lat + (fix.lat - state.lat) * alpha;
      const lng = state.lng + (fix.lng - state.lng) * alpha;
      const smoothed = { lat, lng };
      const moved = metersBetween(state, smoothed);

      let heading = state.heading;
      if (fix.heading != null && Number.isFinite(fix.heading) && fix.heading >= 0 && moved >= 1) {
        heading = lerpAngle(state.heading, fix.heading, 0.45);
      } else if (moved >= MIN_MOVE_M) {
        heading = lerpAngle(state.heading, bearingDeg(state, smoothed), 0.55);
      }

      const speedKnown = fix.speedMps != null && fix.speedMps >= 0;
      const moving = speedKnown ? (fix.speedMps as number) >= 0.8 : moved >= MIN_MOVE_M;

      state = {
        lat: smoothed.lat,
        lng: smoothed.lng,
        heading,
        updatedAt: now,
        accuracyM: Math.min(state.accuracyM * 0.7 + accuracy * 0.3, accuracy),
        source,
        rejectStreak: 0,
      };

      return {
        lat: smoothed.lat,
        lng: smoothed.lng,
        heading: heading || undefined,
        speedMps: speedKnown ? fix.speedMps : moved / dtSec,
        accuracyM: accuracy,
        moving,
      };
    },
    reset() {
      state = null;
    },
  };
}

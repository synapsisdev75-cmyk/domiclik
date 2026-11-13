/**
 * Orientación híbrida estilo Google Maps / Uber / inDrive:
 * - Detenido (< 3 km/h): brújula con zona muerta (sin temblor)
 * - En marcha (≥ 3 km/h): rumbo GPS si es válido
 */

import {
  normalizeHeading,
  requestCompassPermission,
  screenOrientationAngle,
  shortestHeadingDelta,
  lerpHeading,
} from './headingSmooth';

/** Offset del GLB respecto al norte del mapa (editable). */
export const MODEL_ROTATION_OFFSET_DEG = -90;

/** Umbral Maps-like: debajo = brújula; arriba = GPS heading. */
export const MOVING_SPEED_KMH = 3;

/** Factor lerp angular en movimiento. */
export const HEADING_LERP_FACTOR = 0.15;

/**
 * Teléfono quieto: ignora ruido del magnetómetro hasta un giro real.
 * ~10–14° es típico en Maps/Uber para el cono azul parado.
 */
export const STILL_DEADZONE_DEG = 12;
/** Muestras sostenidas fuera de la zona muerta antes de aceptar el giro. */
export const STILL_CONFIRM_SAMPLES = 10;
/** En marcha: umbral fino. */
export const MOVING_DEADZONE_DEG = 2.5;

export type NavMapMode = 'free' | 'headingUp';

export function speedMpsToKmh(speedMps: number | null | undefined): number {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps < 0) return 0;
  return speedMps * 3.6;
}

export function isMovingForOrientation(speedMps: number | null | undefined): boolean {
  return speedMpsToKmh(speedMps) >= MOVING_SPEED_KMH;
}

/** Rumbo brújula (iOS webkit / Android 360−alpha + pantalla). */
export function compassHeadingFromEvent(event: DeviceOrientationEvent): number | null {
  const webkit = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
    .webkitCompassHeading;
  if (typeof webkit === 'number' && Number.isFinite(webkit)) {
    return normalizeHeading(webkit + screenOrientationAngle());
  }
  if (event.alpha == null || !Number.isFinite(event.alpha)) return null;
  return normalizeHeading(360 - event.alpha - screenOrientationAngle());
}

/**
 * Ángulo Three.js (rad) para rotation.y con la matriz de Google Maps.
 * targetAngleRad = −degToRad((rawHeading + OFFSET) % 360)
 */
export function modelYawFromHeadingDeg(
  rawHeadingDeg: number,
  offsetDeg = MODEL_ROTATION_OFFSET_DEG,
): number {
  const deg = normalizeHeading(rawHeadingDeg + offsetDeg);
  return -((deg * Math.PI) / 180);
}

/** Lerp angular corto (evita vueltas al cruzar 0°/360°). */
export function lerpAngleRad(current: number, target: number, t = HEADING_LERP_FACTOR): number {
  const twoPi = Math.PI * 2;
  let diff = (target - current) % twoPi;
  if (diff < -Math.PI) diff += twoPi;
  if (diff > Math.PI) diff -= twoPi;
  return current + diff * t;
}

export function angleNeedsRedraw(current: number, target: number, eps = 0.002): boolean {
  const twoPi = Math.PI * 2;
  let diff = (target - current) % twoPi;
  if (diff < -Math.PI) diff += twoPi;
  if (diff > Math.PI) diff -= twoPi;
  return Math.abs(diff) > eps;
}

function circularMeanDeg(samples: number[]): number | null {
  if (!samples.length) return null;
  let sx = 0;
  let sy = 0;
  for (const s of samples) {
    const r = (s * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  const n = samples.length;
  return normalizeHeading((Math.atan2(sy / n, sx / n) * 180) / Math.PI);
}

export type HybridOrientationHandle = {
  stop: () => void;
  recalibrate: () => void;
  setGps: (headingDeg: number | null, speedMps: number | null) => void;
  peek: () => number | null;
};

/**
 * Motor híbrido: emite rumbo objetivo (grados, 0=norte).
 * Parado → congela rumbo; solo gira si el cambio se sostiene (~giro real).
 */
export function startHybridOrientation(opts: {
  onHeading: (headingDeg: number, source: 'compass' | 'gps') => void;
}): HybridOrientationHandle {
  let compassRaw: number | null = null;
  let gpsHeading: number | null = null;
  let speedMps: number | null = null;
  let lockedHeading: number | null = null;
  let preferAbsolute = false;
  let stillConfirm = 0;
  const stillWindow: number[] = [];

  const publish = (next: number, source: 'compass' | 'gps') => {
    const value = normalizeHeading(next);
    if (lockedHeading != null) {
      const delta = Math.abs(shortestHeadingDelta(lockedHeading, value));
      const moving = isMovingForOrientation(speedMps);
      const minDelta = moving ? MOVING_DEADZONE_DEG : STILL_DEADZONE_DEG;
      if (delta < minDelta) return;
    }
    lockedHeading = value;
    opts.onHeading(value, source);
  };

  const emit = () => {
    const moving = isMovingForOrientation(speedMps);

    if (
      moving &&
      gpsHeading != null &&
      Number.isFinite(gpsHeading) &&
      !Number.isNaN(gpsHeading) &&
      gpsHeading >= 0
    ) {
      stillConfirm = 0;
      stillWindow.length = 0;
      publish(gpsHeading, 'gps');
      return;
    }

    if (compassRaw == null) {
      if (gpsHeading != null && Number.isFinite(gpsHeading) && gpsHeading >= 0) {
        publish(gpsHeading, 'gps');
      }
      return;
    }

    if (moving) {
      stillConfirm = 0;
      stillWindow.length = 0;
      publish(compassRaw, 'compass');
      return;
    }

    // ——— Teléfono quieto: media circular + confirmación sostenida ———
    stillWindow.push(compassRaw);
    if (stillWindow.length > 14) stillWindow.shift();
    const avg = circularMeanDeg(stillWindow);
    if (avg == null) return;

    if (lockedHeading == null) {
      publish(avg, 'compass');
      stillConfirm = 0;
      return;
    }

    const delta = Math.abs(shortestHeadingDelta(lockedHeading, avg));
    if (delta < STILL_DEADZONE_DEG) {
      stillConfirm = 0;
      return;
    }

    stillConfirm += 1;
    if (stillConfirm < STILL_CONFIRM_SAMPLES) return;
    // Giro real sostenido → actualiza una sola vez (sin perseguir el ruido).
    publish(avg, 'compass');
    stillConfirm = 0;
    stillWindow.length = 0;
  };

  const onAbsolute = (event: Event) => {
    preferAbsolute = true;
    const h = compassHeadingFromEvent(event as DeviceOrientationEvent);
    if (h == null) return;
    // Low-pass suave sobre la muestra cruda (sigue filtrando temblor).
    compassRaw =
      compassRaw == null ? h : lerpHeading(compassRaw, h, isMovingForOrientation(speedMps) ? 0.35 : 0.12);
    emit();
  };

  const onRelative = (event: Event) => {
    if (preferAbsolute) return;
    const h = compassHeadingFromEvent(event as DeviceOrientationEvent);
    if (h == null) return;
    compassRaw =
      compassRaw == null ? h : lerpHeading(compassRaw, h, isMovingForOrientation(speedMps) ? 0.35 : 0.12);
    emit();
  };

  window.addEventListener('deviceorientationabsolute', onAbsolute, true);
  window.addEventListener('deviceorientation', onRelative, true);

  return {
    stop() {
      window.removeEventListener('deviceorientationabsolute', onAbsolute, true);
      window.removeEventListener('deviceorientation', onRelative, true);
    },
    recalibrate() {
      lockedHeading = null;
      stillConfirm = 0;
      stillWindow.length = 0;
      preferAbsolute = false;
      compassRaw = null;
    },
    setGps(headingDeg, nextSpeed) {
      gpsHeading =
        headingDeg != null && Number.isFinite(headingDeg) && !Number.isNaN(headingDeg) && headingDeg >= 0
          ? normalizeHeading(headingDeg)
          : null;
      speedMps = nextSpeed != null && Number.isFinite(nextSpeed) ? nextSpeed : null;
      emit();
    },
    peek() {
      return lockedHeading;
    },
  };
}

export { requestCompassPermission, normalizeHeading };

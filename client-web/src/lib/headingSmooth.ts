/**
 * Rumbo estilo Google Maps (cono azul):
 * - AbsoluteOrientationSensor cuando existe (fusión magnetómetro+giro, como Maps)
 * - deviceorientationabsolute + compensación de inclinación (spec W3C)
 * - iOS: webkitCompassHeading + ángulo de pantalla
 *
 * 0° = norte geográfico, sentido horario (igual que Maps / GPS heading).
 */

export function normalizeHeading(deg: number) {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

/** Diferencia angular más corta (−180…180). */
export function shortestHeadingDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

export function lerpHeading(from: number, to: number, t: number) {
  return normalizeHeading(from + shortestHeadingDelta(from, to) * t);
}

export type HeadingSmootherOptions = {
  /** 0.08–0.18 típico en nav; más bajo = más estable. */
  alpha?: number;
  /** Ignora cambios menores (temblor de mano / magnetómetro). */
  deadZoneDeg?: number;
  /** Si el salto es mayor, aplica más rápido (giro real). */
  snapDeg?: number;
  /** Alpha cuando el salto supera snapDeg. */
  snapAlpha?: number;
};

export function createHeadingSmoother(opts: HeadingSmootherOptions = {}) {
  const alpha = opts.alpha ?? 0.12;
  const deadZoneDeg = opts.deadZoneDeg ?? 4;
  const snapDeg = opts.snapDeg ?? 55;
  const snapAlpha = opts.snapAlpha ?? 0.45;
  let value: number | null = null;

  return {
    /** Devuelve el rumbo suavizado (o null si aún no hay muestra). */
    push(raw: number): number {
      const next = normalizeHeading(raw);
      if (value == null) {
        value = next;
        return value;
      }
      const delta = Math.abs(shortestHeadingDelta(value, next));
      if (delta < deadZoneDeg) return value;
      const t = delta >= snapDeg ? snapAlpha : alpha;
      value = lerpHeading(value, next, t);
      return value;
    },
    peek() {
      return value;
    },
    reset() {
      value = null;
    },
  };
}

/** Ángulo de rotación de la pantalla (0/90/180/270), como usa Maps / leaflet. */
export function screenOrientationAngle(): number {
  try {
    const angle = window.screen?.orientation?.angle;
    if (typeof angle === 'number' && Number.isFinite(angle)) return angle;
  } catch {
    /* ignore */
  }
  const legacy = (window as unknown as { orientation?: number }).orientation;
  if (typeof legacy === 'number' && Number.isFinite(legacy)) return legacy;
  return 0;
}

/**
 * Compensación de inclinación (worked example W3C Device Orientation).
 * Es la misma proyección horizontal que usa el cono azul al sostener el teléfono.
 */
export function tiltCompensatedHeading(alpha: number, beta: number, gamma: number): number {
  const a = (alpha * Math.PI) / 180;
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;

  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);

  // Componentes del eje “adelante” del teléfono proyectados al plano horizontal.
  const rA = -cA * sG - sA * sB * cG;
  const rB = -sA * sG + cA * sB * cG;

  // atan2 evita los saltos de cuadrante del atan(rA/rB) del ejemplo original.
  return normalizeHeading((Math.atan2(rA, rB) * 180) / Math.PI);
}

/** Yaw → rumbo brújula desde cuaternión AbsoluteOrientationSensor. */
export function headingFromQuaternion(q: ReadonlyArray<number>): number | null {
  if (!q || q.length < 4) return null;
  const [x, y, z, w] = q;
  if (![x, y, z, w].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  // Yaw alrededor del eje vertical del mundo (referencia Earth).
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  // Maps: 0 = norte, horario → invertimos el sentido matemático CCW.
  return normalizeHeading((-yaw * 180) / Math.PI - screenOrientationAngle());
}

/**
 * Rumbo como el cono azul de Google Maps: dirección a la que apunta el teléfono.
 */
export function headingFromOrientation(event: DeviceOrientationEvent): number | null {
  const webkit = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
    .webkitCompassHeading;
  // iOS: rumbo de brújula + rotación de pantalla (landscape).
  if (typeof webkit === 'number' && Number.isFinite(webkit)) {
    return normalizeHeading(webkit + screenOrientationAngle());
  }

  if (event.alpha == null || !Number.isFinite(event.alpha)) return null;

  const beta = event.beta;
  const gamma = event.gamma;
  if (
    beta != null &&
    gamma != null &&
    Number.isFinite(beta) &&
    Number.isFinite(gamma)
  ) {
    return normalizeHeading(
      tiltCompensatedHeading(event.alpha, beta, gamma) - screenOrientationAngle(),
    );
  }

  // Plano / sin tilt: 360 − alpha (spec).
  return normalizeHeading(360 - event.alpha - screenOrientationAngle());
}

export async function requestCompassPermission(): Promise<boolean> {
  let ok = true;
  try {
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<PermissionState | string>;
    };
    if (typeof DOE.requestPermission === 'function') {
      const state = await DOE.requestPermission();
      ok = state === 'granted';
    }
  } catch {
    ok = false;
  }
  // Chrome / Maps-like AbsoluteOrientationSensor: magnetómetro + giro + accel.
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      const names = ['accelerometer', 'gyroscope', 'magnetometer'] as const;
      await Promise.all(
        names.map(async (name) => {
          try {
            await perms.query({ name: name as PermissionName });
          } catch {
            /* nombre no soportado en este browser */
          }
        }),
      );
    }
  } catch {
    /* ignore */
  }
  return ok;
}

type AbsoluteOrientationSensorLike = {
  quaternion: number[];
  start: () => void;
  stop: () => void;
  addEventListener: (type: 'reading' | 'error', fn: (ev?: Event) => void) => void;
  removeEventListener: (type: 'reading' | 'error', fn: (ev?: Event) => void) => void;
};

type AbsoluteOrientationSensorCtor = new (opts?: {
  frequency?: number;
  referenceFrame?: 'device' | 'screen';
}) => AbsoluteOrientationSensorLike;

function getAbsoluteOrientationSensorCtor(): AbsoluteOrientationSensorCtor | null {
  const Ctor = (window as unknown as { AbsoluteOrientationSensor?: AbsoluteOrientationSensorCtor })
    .AbsoluteOrientationSensor;
  return typeof Ctor === 'function' ? Ctor : null;
}

export type MapsCompassHandle = {
  stop: () => void;
  /** Fuerza relectura absoluta (botón brújula / calibrar ∞). */
  recalibrate: () => void;
};

export type StartMapsCompassOptions = {
  /** Hz del sensor absoluto (Maps ~60). */
  frequency?: number;
  onHeading: (headingDeg: number, source: 'sensor' | 'absolute' | 'webkit' | 'relative') => void;
};

/**
 * Misma pila que el cono de Maps: sensor absoluto → orientation absolute → webkit → relative.
 */
export function startMapsCompass(opts: StartMapsCompassOptions): MapsCompassHandle {
  const onHeading = opts.onHeading;
  const frequency = opts.frequency ?? 60;
  let stopped = false;
  let sensor: AbsoluteOrientationSensorLike | null = null;
  let preferAbsoluteEvent = false;
  let usingSensor = false;

  const onAbsolute = (event: Event) => {
    if (stopped || usingSensor) return;
    preferAbsoluteEvent = true;
    const h = headingFromOrientation(event as DeviceOrientationEvent);
    if (h != null) onHeading(h, 'absolute');
  };

  const onRelative = (event: Event) => {
    if (stopped || usingSensor || preferAbsoluteEvent) return;
    const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
    const h = headingFromOrientation(e);
    if (h == null) return;
    const source =
      typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)
        ? 'webkit'
        : 'relative';
    onHeading(h, source);
  };

  const bindDom = () => {
    window.addEventListener('deviceorientationabsolute', onAbsolute, true);
    window.addEventListener('deviceorientation', onRelative, true);
  };

  const unbindDom = () => {
    window.removeEventListener('deviceorientationabsolute', onAbsolute, true);
    window.removeEventListener('deviceorientation', onRelative, true);
  };

  const stopSensor = () => {
    if (!sensor) return;
    try {
      sensor.stop();
    } catch {
      /* ignore */
    }
    sensor = null;
    usingSensor = false;
  };

  const startSensor = () => {
    const Ctor = getAbsoluteOrientationSensorCtor();
    if (!Ctor) return false;
    try {
      const next = new Ctor({ frequency, referenceFrame: 'device' });
      const onReading = () => {
        if (stopped) return;
        const h = headingFromQuaternion(next.quaternion);
        if (h != null) {
          usingSensor = true;
          onHeading(h, 'sensor');
        }
      };
      const onError = () => {
        stopSensor();
      };
      next.addEventListener('reading', onReading);
      next.addEventListener('error', onError);
      next.start();
      sensor = next;
      return true;
    } catch {
      stopSensor();
      return false;
    }
  };

  bindDom();
  startSensor();

  return {
    stop() {
      stopped = true;
      stopSensor();
      unbindDom();
    },
    recalibrate() {
      // Como el botón de brújula de Maps: corta el filtro y reapunta al sensor absoluto.
      preferAbsoluteEvent = false;
      usingSensor = false;
      stopSensor();
      unbindDom();
      bindDom();
      startSensor();
    },
  };
}

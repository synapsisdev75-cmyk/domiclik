/** Tarifa pública DomiClick (Villavicencio). */

export const PRICE_PER_KM_COP = 2300;
/** Recargo hora pico (multiplicador sobre tarifa normal). */
export const PEAK_MULTIPLIER = 1.35;
/** Mínimo de envío. */
export const MIN_SHIPPING_FEE_COP = 5000;
/** Factor carretera aproximado si no hay ruta OSRM. */
export const ROAD_FACTOR = 1.3;

/** Velocidad operativa moto: hora pico (más lento) … hora normal. */
export const SPEED_KMH_PEAK = 60;
export const SPEED_KMH_NORMAL = 75;
/** Minutos fijos de margen (recolección + entrega) que se suman al viaje. */
export const SERVICE_BUFFER_MIN = 10;
/** Piso mínimo de anticipación al programar (minutos). */
export const MIN_SCHEDULE_LEAD_MIN = 5;

export type PricingBand = 'peak' | 'normal';

export type TravelTimeEstimate = {
  distanceKm: number;
  band: PricingBand;
  speedKmh: number;
  /** Solo trayecto: km ÷ velocidad. */
  travelMin: number;
  /** Margen fijo de servicio. */
  bufferMin: number;
  /** Total = travelMin + bufferMin (variable que se suma bien). */
  totalMin: number;
};

export type ShippingQuote = {
  distanceKm: number;
  band: PricingBand;
  pricePerKm: number;
  multiplier: number;
  subtotal: number;
  shippingFee: number;
  label: string;
  formula: string;
  /** ETA operativo (minutos totales). */
  durationMin: number;
  speedKmh: number;
  travelMin: number;
  bufferMin: number;
};

/** Zona horaria operativa. */
const TZ = 'America/Bogota';

function bogotaParts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const weekday = parts.weekday; // Mon, Tue, ...
  return { hour, minute, weekday, minutes: hour * 60 + minute };
}

/**
 * Horas pico Villavicencio (aprox.):
 * Lun–Vie: 06:30–09:00 · 11:30–14:00 · 17:00–20:00
 * Sáb: 10:00–14:00
 */
export function isPeakHour(date: Date = new Date()): boolean {
  const { weekday, minutes } = bogotaParts(date);
  const inRange = (aH: number, aM: number, bH: number, bM: number) => {
    const a = aH * 60 + aM;
    const b = bH * 60 + bM;
    return minutes >= a && minutes < b;
  };

  if (weekday === 'Sun') return false;
  if (weekday === 'Sat') return inRange(10, 0, 14, 0);
  return (
    inRange(6, 30, 9, 0) || inRange(11, 30, 14, 0) || inRange(17, 0, 20, 0)
  );
}

export function pricingBandFor(date: Date = new Date()): PricingBand {
  return isPeakHour(date) ? 'peak' : 'normal';
}

/** km/h según bandera: pico 60 · normal 75. */
export function speedKmhForBand(band: PricingBand): number {
  return band === 'peak' ? SPEED_KMH_PEAK : SPEED_KMH_NORMAL;
}

/**
 * Tiempo estimado: (distancia ÷ velocidad) + buffer de servicio.
 * En pico usa 60 km/h; en normal 75 km/h.
 */
export function estimateTravelMinutes(
  distanceKm: number,
  when: Date = new Date(),
): TravelTimeEstimate {
  const km = Math.max(0, Number(distanceKm) || 0);
  const band = pricingBandFor(when);
  const speedKmh = speedKmhForBand(band);
  const travelMin = km > 0 ? Math.max(1, Math.ceil((km / speedKmh) * 60)) : 0;
  const bufferMin = km > 0 ? SERVICE_BUFFER_MIN : 0;
  const totalMin = travelMin + bufferMin;
  return {
    distanceKm: Math.round(km * 100) / 100,
    band,
    speedKmh,
    travelMin,
    bufferMin,
    totalMin,
  };
}

export function computeShippingQuote(
  distanceKm: number,
  when: Date = new Date(),
): ShippingQuote {
  const km = Math.max(0, Number(distanceKm) || 0);
  const band = pricingBandFor(when);
  const multiplier = band === 'peak' ? PEAK_MULTIPLIER : 1;
  const subtotal = km * PRICE_PER_KM_COP * multiplier;
  const shippingFee = Math.max(MIN_SHIPPING_FEE_COP, Math.round(subtotal));
  const label = band === 'peak' ? 'Hora pico' : 'Hora normal';
  const eta = estimateTravelMinutes(km, when);
  const formula =
    band === 'peak'
      ? `${km.toFixed(2)} km × $${PRICE_PER_KM_COP.toLocaleString('es-CO')} × ${PEAK_MULTIPLIER} (${label})`
      : `${km.toFixed(2)} km × $${PRICE_PER_KM_COP.toLocaleString('es-CO')} (${label})`;

  return {
    distanceKm: Math.round(km * 100) / 100,
    band,
    pricePerKm: PRICE_PER_KM_COP,
    multiplier,
    subtotal: Math.round(subtotal),
    shippingFee,
    label,
    formula,
    durationMin: eta.totalMin,
    speedKmh: eta.speedKmh,
    travelMin: eta.travelMin,
    bufferMin: eta.bufferMin,
  };
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}

/**
 * Ventana de programación: ahora + leadMin … +15 días.
 * leadMin = ETA (viaje + buffer) o al menos MIN_SCHEDULE_LEAD_MIN.
 */
export function scheduleWindow(now = new Date(), leadMin = MIN_SCHEDULE_LEAD_MIN) {
  const lead = Math.max(MIN_SCHEDULE_LEAD_MIN, Math.ceil(Number(leadMin) || 0));
  const min = new Date(now.getTime() + lead * 60 * 1000);
  const max = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  return { min, max, leadMin: lead };
}

export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Interpreta datetime-local como hora local (no UTC). */
export function parseDatetimeLocal(value: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      0,
      0,
    );
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateScheduledFor(
  value: string,
  now = new Date(),
  leadMin = MIN_SCHEDULE_LEAD_MIN,
): string | null {
  const d = parseDatetimeLocal(value);
  if (!d) return 'Elige fecha y hora de entrega';
  const { min, max, leadMin: lead } = scheduleWindow(now, leadMin);
  // Gracia 3 min: el input no se actualiza solo mientras esperas
  if (d.getTime() < min.getTime() - 3 * 60 * 1000) {
    return `La entrega debe ser al menos en ${lead} minutos`;
  }
  if (d > max) return 'Solo se puede programar hasta 15 días de antelación';
  return null;
}

/** Si el horario quedó justo abajo del mínimo, lo sube automáticamente. */
export function resolveScheduledFor(
  value: string,
  now = new Date(),
  leadMin = MIN_SCHEDULE_LEAD_MIN,
): Date | null {
  const d = parseDatetimeLocal(value);
  if (!d) return null;
  const { min, max } = scheduleWindow(now, leadMin);
  if (d > max) return null;
  if (d.getTime() < min.getTime()) return min;
  return d;
}

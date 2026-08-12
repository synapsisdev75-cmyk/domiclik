/** Tarifa pública DomiClick (Villavicencio). */

export const PRICE_PER_KM_COP = 2300;
/** Recargo hora pico (multiplicador sobre tarifa normal). */
export const PEAK_MULTIPLIER = 1.35;
/** Mínimo de envío. */
export const MIN_SHIPPING_FEE_COP = 5000;
/** Factor carretera aproximado si no hay ruta OSRM. */
export const ROAD_FACTOR = 1.3;

export type PricingBand = 'peak' | 'normal';

export type ShippingQuote = {
  distanceKm: number;
  band: PricingBand;
  pricePerKm: number;
  multiplier: number;
  subtotal: number;
  shippingFee: number;
  label: string;
  formula: string;
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
  };
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}

/** Ventana de programación: ahora+5min … +15 días. */
export function scheduleWindow(now = new Date()) {
  const min = new Date(now.getTime() + 5 * 60 * 1000);
  const max = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  return { min, max };
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

export function validateScheduledFor(value: string, now = new Date()): string | null {
  const d = parseDatetimeLocal(value);
  if (!d) return 'Elige fecha y hora de entrega';
  const { min, max } = scheduleWindow(now);
  // Gracia 3 min: el input no se actualiza solo mientras esperas
  if (d.getTime() < min.getTime() - 3 * 60 * 1000) {
    return 'La entrega debe ser al menos en 5 minutos';
  }
  if (d > max) return 'Solo se puede programar hasta 15 días de antelación';
  return null;
}

/** Si el horario quedó justo abajo del mínimo, lo sube automáticamente. */
export function resolveScheduledFor(value: string, now = new Date()): Date | null {
  const d = parseDatetimeLocal(value);
  if (!d) return null;
  const { min, max } = scheduleWindow(now);
  if (d > max) return null;
  if (d.getTime() < min.getTime()) return min;
  return d;
}

import {
  DeliveryOrder,
  DriverReview,
  MotorizadoDriver,
  PayrollLine,
  PayrollSettings,
  DispatchSettings,
} from '../types';
import { isLiveOrderStatus } from './orderFlow';

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  id: 'payroll',
  commissionPercent: 70,
  payPerDelivery: 0,
  ratingBonusThreshold: 4.5,
  ratingBonusAmount: 20000,
  basePay: 0,
  fuelCostPerKm: 280,
  updatedAt: new Date().toISOString(),
};

/** Jornada laboral esperada del motorizado (horas). */
export const EXPECTED_SHIFT_HOURS = 8;
/** COP / km para estimado de gasolina si no hay setting. */
export const DEFAULT_FUEL_COP_PER_KM = 280;

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = {
  id: 'dispatch',
  searchRadiusKm: 15,
  baseFee: 3000,
  perKmRate: 800,
  autoAssignEnabled: true,
  updatedAt: new Date().toISOString(),
};

export function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}

export function startOfWeekISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

export function startOfMonthISO(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfDayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDateKey(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

export function inRange(iso: string | undefined, from: Date, to: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export type DriverOpsStats = {
  driver: MotorizadoDriver;
  assigned: number;
  delivered: number;
  cancelled: number;
  inProgress: number;
  successPct: number;
  revenue: number;
  avgFee: number;
  rating: number;
  reviewCount: number;
  lastDeliveryAt: string | null;
  /** Índice compuesto 0–100 (entregas, éxito, rating, baja cancelación). */
  performanceIndex: number;
  /** Minutos promedio recepción → asignación (timeline / autoAssignedAt). */
  avgAssignMin: number | null;
};

export function buildDriverStats(
  drivers: MotorizadoDriver[],
  orders: DeliveryOrder[],
  reviews: DriverReview[],
  from?: Date,
  to?: Date
): DriverOpsStats[] {
  const rangeOrders =
    from && to
      ? orders.filter((o) => inRange(o.updatedAt || o.createdAt, from, to))
      : orders;

  return drivers
    .filter((d) => d.status === 'approved')
    .map((driver) => {
      const mine = rangeOrders.filter((o) => o.assignedDriverId === driver.id);
      const delivered = mine.filter((o) => o.status === 'delivered');
      const cancelled = mine.filter((o) => o.status === 'cancelled');
      const inProgress = mine.filter((o) => isLiveOrderStatus(o.status));
      const revenue = delivered.reduce((s, o) => s + (Number(o.shippingFee) || 0), 0);
      const drvReviews = reviews.filter((r) => r.driverId === driver.id);
      const reviewAvg =
        drvReviews.length > 0
          ? drvReviews.reduce((s, r) => s + r.stars, 0) / drvReviews.length
          : driver.rating || 0;
      const last = delivered
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        )[0];

      // Tiempo de gestión: createdAt → autoAssignedAt o primer evento "assigned" en timeline
      const assignMins: number[] = [];
      for (const o of mine) {
        const start = new Date(o.createdAt).getTime();
        const assignedIso =
          o.autoAssignedAt ||
          o.timeline?.find((t) => t.to === 'assigned')?.at ||
          '';
        if (!assignedIso) continue;
        const end = new Date(assignedIso).getTime();
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          assignMins.push((end - start) / 60000);
        }
      }
      const avgAssignMin = assignMins.length
        ? Math.round((assignMins.reduce((s, n) => s + n, 0) / assignMins.length) * 10) / 10
        : null;

      const ratingScore = Math.min(100, (reviewAvg / 5) * 100);
      const cancelPct = mine.length ? (cancelled.length / mine.length) * 100 : 0;
      const volumeScore = Math.min(100, delivered.length * 8);
      const performanceIndex = Math.round(
        Math.max(
          0,
          Math.min(
            100,
            volumeScore * 0.25 +
              (mine.length ? (delivered.length / mine.length) * 100 : 0) * 0.3 +
              ratingScore * 0.3 +
              Math.max(0, 100 - cancelPct * 4) * 0.15
          )
        )
      );

      return {
        driver,
        assigned: mine.length,
        delivered: delivered.length,
        cancelled: cancelled.length,
        inProgress: inProgress.length,
        successPct: mine.length ? Math.round((delivered.length / mine.length) * 1000) / 10 : 0,
        revenue,
        avgFee: delivered.length ? revenue / delivered.length : 0,
        rating: Math.round(reviewAvg * 10) / 10,
        reviewCount: drvReviews.length || driver.ratingCount || 0,
        lastDeliveryAt: last?.updatedAt || last?.createdAt || null,
        performanceIndex,
        avgAssignMin,
      };
    })
    .sort((a, b) => b.performanceIndex - a.performanceIndex || b.delivered - a.delivered);
}

export type DailyPoint = { date: string; label: string; delivered: number; created: number; revenue: number };

export function buildDailySeries(orders: DeliveryOrder[], days = 14): DailyPoint[] {
  const out: DailyPoint[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = toDateKey(d);
    const created = orders.filter((o) => toDateKey(o.createdAt) === key);
    const delivered = orders.filter(
      (o) => o.status === 'delivered' && toDateKey(o.updatedAt || o.createdAt) === key
    );
    out.push({
      date: key,
      label: d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
      created: created.length,
      delivered: delivered.length,
      revenue: delivered.reduce((s, o) => s + (Number(o.shippingFee) || 0), 0),
    });
  }
  return out;
}

export function computePayrollLines(
  drivers: MotorizadoDriver[],
  orders: DeliveryOrder[],
  reviews: DriverReview[],
  settings: PayrollSettings,
  from: Date,
  to: Date
): PayrollLine[] {
  const stats = buildDriverStats(drivers, orders, reviews, from, to);
  return stats.map((s) => {
    const commission = (s.revenue * (settings.commissionPercent || 0)) / 100;
    const perDeliveryPay = s.delivered * (settings.payPerDelivery || 0);
    const ratingBonus =
      s.rating >= (settings.ratingBonusThreshold || 5) && s.delivered > 0
        ? settings.ratingBonusAmount || 0
        : 0;
    const basePay = settings.basePay || 0;
    const deductions = 0;
    const total = commission + perDeliveryPay + ratingBonus + basePay - deductions;
    return {
      driverId: s.driver.id,
      driverName: s.driver.fullName,
      plateNumber: s.driver.plateNumber || '',
      documentId: s.driver.documentId || '',
      deliveries: s.delivered,
      cancelled: s.cancelled,
      grossFees: s.revenue,
      commission,
      perDeliveryPay,
      ratingAvg: s.rating,
      ratingBonus,
      basePay,
      deductions,
      total,
    };
  });
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Escapa celdas para CSV compatible con Excel (Colombia usa `;`). */
function escapeCsvCell(v: string | number) {
  const s = String(v ?? '');
  if (/[",\n;\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * CSV con BOM + sep=; para que Excel abra cada valor en su propia columna
 * (evita que todo quede en la columna A).
 */
export function toCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return '\uFEFF';
  const headers = Object.keys(rows[0]);
  const lines = [
    'sep=;',
    headers.map(escapeCsvCell).join(';'),
    ...rows.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(';')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * Tabla HTML .xls — Excel siempre separa casillas (más fiable que CSV).
 */
export function toExcelHtml(rows: Record<string, string | number>[], sheetName = 'DomiClick') {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: string | number) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows
    .map(
      (r) =>
        `<tr>${headers.map((h) => `<td>${esc(r[h])}</td>`).join('')}</tr>`
    )
    .join('');
  return (
    `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook>` +
    `<x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(sheetName)}</x:Name>` +
    `<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>` +
    `</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->` +
    `<style>td,th{border:1px solid #ccc;padding:4px 8px;font-family:Calibri,Arial;font-size:11pt}` +
    `th{background:#1a2744;color:#fff;font-weight:700}</style></head>` +
    `<body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`
  );
}

export function downloadExcel(
  filename: string,
  rows: Record<string, string | number>[],
  sheetName = 'DomiClick'
) {
  const name = filename.endsWith('.xls') ? filename : `${filename.replace(/\.csv$/i, '')}.xls`;
  downloadTextFile(name, toExcelHtml(rows, sheetName), 'application/vnd.ms-excel');
}

import type { AttendancePunch, WorkShiftDay } from '../types';
import {
  DEFAULT_FUEL_COP_PER_KM,
  EXPECTED_SHIFT_HOURS,
} from './adminMetrics';

export function hoursBetween(fromIso?: string, toIso?: string): number {
  if (!fromIso || !toIso) return 0;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 36e5) * 100) / 100;
}

export function summarizeDriverShift(
  punches: AttendancePunch[],
  driverId: string,
  driverName: string,
  dateKey: string,
  fuelCostPerKm = DEFAULT_FUEL_COP_PER_KM
): WorkShiftDay {
  const mine = punches
    .filter((p) => p.driverId === driverId)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const firstIn = mine.find((p) => p.type === 'in' && Number(p.odometerKm) > 0);
  const outs = mine.filter((p) => p.type === 'out' && Number(p.odometerKm) > 0);
  const lastOut = outs.length ? outs[outs.length - 1] : undefined;

  const kmIn = firstIn?.odometerKm;
  const kmOut = lastOut?.odometerKm;
  const kmDriven =
    typeof kmIn === 'number' && typeof kmOut === 'number' && kmOut >= kmIn
      ? Math.round((kmOut - kmIn) * 10) / 10
      : 0;

  const inAt = firstIn?.at || mine.find((p) => p.type === 'in')?.at;
  const outAt = lastOut?.at || [...mine].reverse().find((p) => p.type === 'out')?.at;
  const hoursWorked = hoursBetween(inAt, outAt);

  return {
    driverId,
    driverName,
    dateKey,
    inAt,
    outAt,
    kmIn,
    kmOut,
    kmDriven,
    hoursWorked,
    expectedHours: EXPECTED_SHIFT_HOURS,
    fuelEstimateCop: Math.round(kmDriven * (fuelCostPerKm || DEFAULT_FUEL_COP_PER_KM)),
    photoInUrl: firstIn?.odometerPhotoUrl,
    photoOutUrl: lastOut?.odometerPhotoUrl,
    open: Boolean(inAt) && !outAt,
  };
}

export function parseOdometerKm(raw: string): number | null {
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 2_000_000) return null;
  return Math.round(n);
}

export function buildDriverShiftHistory(
  punches: AttendancePunch[],
  driverId: string,
  driverName: string,
  fuelCostPerKm = DEFAULT_FUEL_COP_PER_KM
): { days: WorkShiftDay[]; totalKm: number; totalHours: number; totalFuelCop: number } {
  const mine = punches.filter((p) => p.driverId === driverId);
  const keys = [...new Set(mine.map((p) => p.dateKey).filter(Boolean))].sort().reverse();
  const days = keys.map((dateKey) =>
    summarizeDriverShift(
      mine.filter((p) => p.dateKey === dateKey),
      driverId,
      driverName,
      dateKey,
      fuelCostPerKm
    )
  );
  return {
    days,
    totalKm: Math.round(days.reduce((s, d) => s + d.kmDriven, 0) * 10) / 10,
    totalHours: Math.round(days.reduce((s, d) => s + d.hoursWorked, 0) * 100) / 100,
    totalFuelCop: days.reduce((s, d) => s + d.fuelEstimateCop, 0),
  };
}

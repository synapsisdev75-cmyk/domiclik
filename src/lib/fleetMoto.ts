import type { AttendancePunch, FleetMoto, FleetSettings, MotorizadoDriver } from '../types';
import {
  calcMaintenanceDueItems,
  resolveMotoSpec,
  type MaintenanceStatus,
} from './motoFuel';

export type FleetMotoStatusLabel = {
  key: FleetMoto['status'];
  label: string;
  color: string;
};

export const FLEET_MOTO_STATUS: FleetMotoStatusLabel[] = [
  { key: 'available', label: 'Disponible', color: 'text-emerald-400 border-emerald-500/40' },
  { key: 'assigned', label: 'Vinculada', color: 'text-[#00E5FF] border-[#00E5FF]/40' },
  { key: 'maintenance', label: 'Mantenimiento', color: 'text-amber-300 border-amber-500/40' },
  { key: 'unavailable', label: 'No disponible', color: 'text-red-300 border-red-500/40' },
];

export function motoAsDriverContext(
  moto: FleetMoto
): Pick<
  MotorizadoDriver,
  'lastOilChangeKm' | 'lastOdometerKm' | 'motoModel' | 'motoKmPerGallon' | 'fleetVehicleId'
> {
  return {
    lastOilChangeKm: moto.lastOilChangeKm,
    lastOdometerKm: moto.lastOdometerKm,
    motoModel: moto.motoModel,
    fleetVehicleId: moto.fleetVehicleId,
  };
}

export function calcMotoMaintenance(moto: FleetMoto, fleet: FleetSettings): MaintenanceStatus {
  return calcMaintenanceDueItems(motoAsDriverContext(moto), fleet);
}

export type FuelStatus = {
  fuelType: 'gasolina' | 'diesel';
  fuelLabel: string;
  tankLiters: number;
  litersUsedSinceFill: number;
  litersRemaining: number;
  kmSinceFill: number;
  kmUntilEmpty: number;
  needsRefuel: boolean;
  refillSoon: boolean;
  specKmPerLiter: number;
  avgKmPerLiter?: number;
  performanceOk: boolean;
  performanceWarning: boolean;
};

export function calcMotoFuelStatus(
  moto: FleetMoto,
  fleet: FleetSettings,
  recentPunches: AttendancePunch[] = []
): FuelStatus {
  const spec = resolveMotoSpec(moto.motoModel, fleet, undefined, moto.fleetVehicleId);
  const tankLiters =
    spec.maintenance.tankLiters ?? (moto.fuelType === 'diesel' ? 12 : 10.5);
  const specKmPerLiter = spec.kmPerLiter;

  const driverPunches = moto.currentDriverId
    ? recentPunches.filter((p) => p.driverId === moto.currentDriverId && p.type === 'out')
    : [];
  const kmReadings = driverPunches
    .map((p) => p.kmPerLiterUsed)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const avgFromPunches =
    kmReadings.length > 0
      ? Math.round((kmReadings.reduce((s, v) => s + v, 0) / kmReadings.length) * 10) / 10
      : undefined;
  const avgKmPerLiter = moto.avgKmPerLiter ?? avgFromPunches ?? specKmPerLiter;
  const effectiveKmPerLiter = avgKmPerLiter > 0 ? avgKmPerLiter : specKmPerLiter;

  const currentKm = moto.lastOdometerKm ?? 0;
  const fillKm = moto.lastFuelFillOdometerKm ?? 0;
  const kmSinceFill = fillKm > 0 && currentKm > fillKm ? currentKm - fillKm : 0;
  const litersUsedSinceFill =
    kmSinceFill > 0 && effectiveKmPerLiter > 0
      ? Math.round((kmSinceFill / effectiveKmPerLiter) * 100) / 100
      : 0;
  const litersRemaining = Math.max(0, Math.round((tankLiters - litersUsedSinceFill) * 100) / 100);
  const kmUntilEmpty =
    effectiveKmPerLiter > 0 ? Math.round(litersRemaining * effectiveKmPerLiter) : 0;

  const performanceRatio = specKmPerLiter > 0 ? avgKmPerLiter / specKmPerLiter : 1;
  const performanceWarning = performanceRatio < 0.85 && kmReadings.length >= 2;
  const performanceOk = !performanceWarning;

  return {
    fuelType: moto.fuelType,
    fuelLabel: moto.fuelType === 'diesel' ? 'Diésel' : 'Gasolina',
    tankLiters,
    litersUsedSinceFill,
    litersRemaining,
    kmSinceFill,
    kmUntilEmpty,
    needsRefuel: litersRemaining <= tankLiters * 0.15 || kmUntilEmpty <= 30,
    refillSoon: litersRemaining <= tankLiters * 0.35 || kmUntilEmpty <= 80,
    specKmPerLiter,
    avgKmPerLiter,
    performanceOk,
    performanceWarning,
  };
}

export type MotoFleetSummary = {
  moto: FleetMoto;
  maintenance: MaintenanceStatus;
  fuel: FuelStatus;
  assignedDriverName?: string;
};

export function summarizeFleetMoto(
  moto: FleetMoto,
  fleet: FleetSettings,
  drivers: MotorizadoDriver[],
  punches: AttendancePunch[] = []
): MotoFleetSummary {
  const driver = moto.currentDriverId
    ? drivers.find((d) => d.id === moto.currentDriverId)
    : undefined;
  return {
    moto,
    maintenance: calcMotoMaintenance(moto, fleet),
    fuel: calcMotoFuelStatus(moto, fleet, punches),
    assignedDriverName: driver?.fullName,
  };
}

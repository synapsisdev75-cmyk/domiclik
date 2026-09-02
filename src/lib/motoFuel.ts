import type { FleetSettings, FleetVehicleSpec, MotorizadoDriver } from '../types';

/** 1 galón US ≈ 3.785 L (Colombia comercial). */
export const LITERS_PER_GALLON = 3.78541;

/** Programa de mantenimiento por modelo (manual Bajaj / uso flota). */
export type MotoMaintenanceSchedule = {
  firstServiceKm: number;
  firstServiceDays: number;
  oilChangeKm: number;
  chainLubeKm: number;
  airFilterCleanKm: number;
  airFilterReplaceKm: number;
  sparkPlugReplaceKm: number;
  fuelBowlCleanKm: number;
  carbBowlCleanKm: number;
  /** Aceite 20W50 API SL JASO MA · ~0.9 L en Boxer 125. */
  engineOilLiters?: number;
  /** Tanque de combustible (litros). */
  tankLiters?: number;
  notes?: string;
};

export type MotoCatalogEntry = {
  id: string;
  match: RegExp;
  label: string;
  /** Rendimiento operativo km/galón (promedio flota domicilios). */
  kmPerGallon: number;
  /** km/L equivalente. */
  kmPerLiter: number;
  kmPerGallonMin: number;
  kmPerGallonMax: number;
  fuelType: 'gasolina' | 'diesel';
  maintenance: MotoMaintenanceSchedule;
  sources?: string;
};

/**
 * Catálogo técnico DomiClick.
 * Boxer 125: datos de manual PM Bajaj, reportes usuarios Colombia y uso domicilios.
 */
export const MOTO_FUEL_CATALOG: MotoCatalogEntry[] = [
  {
    id: 'bajaj-boxer-125',
    match: /boxer\s*(ct|x|bm)?\s*125|boxer125|boxer-125/i,
    label: 'Bajaj Boxer 125 (CT/X/BM)',
    /** 40 km/L × 3.785 ≈ 151 km/gal — mix ciudad domicilios con carga. */
    kmPerLiter: 40,
    kmPerGallon: 151,
    /** Carga pesada / muchas paradas: ~35 km/L ≈ 132 km/gal. */
    kmPerGallonMin: 132,
    /** Ciudad ligera: ~45 km/L ≈ 170 km/gal. */
    kmPerGallonMax: 170,
    fuelType: 'gasolina',
    maintenance: {
      firstServiceKm: 750,
      firstServiceDays: 30,
      oilChangeKm: 5000,
      chainLubeKm: 5000,
      airFilterCleanKm: 5000,
      airFilterReplaceKm: 15000,
      sparkPlugReplaceKm: 15000,
      fuelBowlCleanKm: 5000,
      carbBowlCleanKm: 10000,
      engineOilLiters: 0.9,
      tankLiters: 10.5,
      notes:
        'Manual Bajaj: aceite 20W50 API SL JASO MA. En domicilios intensos considerar aceite cada 3.000 km.',
    },
    sources: 'Manual PM Boxer X125 (Bajaj); usuarios CO 35–45 km/L; Grupo UMA CT100≠125',
  },
  {
    id: 'bajaj-boxer-100',
    match: /boxer\s*(ct)?\s*100|boxer100|boxer-100/i,
    label: 'Bajaj Boxer CT 100',
    kmPerLiter: 97,
    kmPerGallon: 370,
    kmPerGallonMin: 300,
    kmPerGallonMax: 370,
    fuelType: 'gasolina',
    maintenance: {
      firstServiceKm: 750,
      firstServiceDays: 30,
      oilChangeKm: 5000,
      chainLubeKm: 5000,
      airFilterCleanKm: 5000,
      airFilterReplaceKm: 15000,
      sparkPlugReplaceKm: 15000,
      fuelBowlCleanKm: 5000,
      carbBowlCleanKm: 10000,
      tankLiters: 10,
    },
  },
  { match: /biz|wave|110/i, id: 'generic-110', label: '110 cc (Biz/Wave)', kmPerLiter: 42, kmPerGallon: 159, kmPerGallonMin: 140, kmPerGallonMax: 175, fuelType: 'gasolina', maintenance: defaultMaint() },
  { match: /125|150|160|pulsar|ns|fz|xtz/i, id: 'generic-125-160', label: '125–160 cc genérica', kmPerLiter: 38, kmPerGallon: 144, kmPerGallonMin: 125, kmPerGallonMax: 160, fuelType: 'gasolina', maintenance: defaultMaint() },
  { match: /200|250|tw|xr|tornado/i, id: 'generic-200', label: '200–250 cc', kmPerLiter: 32, kmPerGallon: 121, kmPerGallonMin: 105, kmPerGallonMax: 140, fuelType: 'gasolina', maintenance: defaultMaint() },
  { match: /nmax|bws|125i|scooter/i, id: 'scooter', label: 'Scooter 125–155', kmPerLiter: 36, kmPerGallon: 136, kmPerGallonMin: 120, kmPerGallonMax: 155, fuelType: 'gasolina', maintenance: defaultMaint() },
  { match: /diesel|dt/i, id: 'diesel', label: 'Diésel', kmPerLiter: 55, kmPerGallon: 208, kmPerGallonMin: 180, kmPerGallonMax: 230, fuelType: 'diesel', maintenance: defaultMaint() },
];

function defaultMaint(): MotoMaintenanceSchedule {
  return {
    firstServiceKm: 1000,
    firstServiceDays: 30,
    oilChangeKm: 3000,
    chainLubeKm: 500,
    airFilterCleanKm: 5000,
    airFilterReplaceKm: 15000,
    sparkPlugReplaceKm: 15000,
    fuelBowlCleanKm: 5000,
    carbBowlCleanKm: 10000,
  };
}

export const DEFAULT_FLEET_SETTINGS: FleetSettings = {
  id: 'fleet',
  fuelPricePerGallonCop: 16500,
  /** Default alineado a Boxer 125 operativa (151 km/gal). */
  defaultKmPerGallon: 151,
  /** Manual Bajaj Boxer 125. */
  oilChangeIntervalKm: 5000,
  oilChangeIntervalDays: 90,
  updatedAt: new Date().toISOString(),
};

export type ResolvedMotoSpec = {
  catalogId: string;
  label: string;
  kmPerGallon: number;
  kmPerLiter: number;
  kmPerGallonMin: number;
  kmPerGallonMax: number;
  fuelType: 'gasolina' | 'diesel';
  maintenance: MotoMaintenanceSchedule;
};

export type ShiftFuelResult = {
  kmIn: number;
  kmOut: number;
  kmDriven: number;
  kmPerGallon: number;
  kmPerLiter: number;
  gallonsUsed: number;
  litersUsed: number;
  gallonsPerKm: number;
  litersPerKm: number;
  copPerKm: number;
  fuelPricePerGallonCop: number;
  fuelCostCop: number;
  fuelType: 'gasolina' | 'diesel';
  motoModelLabel: string;
  motoCatalogId: string;
};

export type MaintenanceDueItem = {
  key: string;
  label: string;
  intervalKm: number;
  lastDoneKm?: number;
  nextDueKm?: number;
  kmRemaining?: number;
  dueSoon: boolean;
  overdue: boolean;
};

export function kmPerGallonToKmPerLiter(kmPerGallon: number): number {
  return Math.round((kmPerGallon / LITERS_PER_GALLON) * 10) / 10;
}

export function kmPerLiterToKmPerGallon(kmPerLiter: number): number {
  return Math.round(kmPerLiter * LITERS_PER_GALLON);
}

function specFromCustomVehicle(
  v: FleetVehicleSpec,
  motoModel: string,
  driverOverrideKmPerGallon?: number
): ResolvedMotoSpec {
  const kmPerLiter = v.kmPerLiter;
  const kmPerGallon =
    driverOverrideKmPerGallon && driverOverrideKmPerGallon > 0
      ? driverOverrideKmPerGallon
      : kmPerLiterToKmPerGallon(kmPerLiter);
  const min = v.kmPerGallonMin ?? Math.round(kmPerGallon * 0.88);
  const max = v.kmPerGallonMax ?? Math.round(kmPerGallon * 1.12);
  return {
    catalogId: v.id,
    label: motoModel || v.label,
    kmPerGallon,
    kmPerLiter: driverOverrideKmPerGallon
      ? kmPerGallonToKmPerLiter(kmPerGallon)
      : kmPerLiter,
    kmPerGallonMin: min,
    kmPerGallonMax: max,
    fuelType: v.fuelType,
    maintenance: v.maintenance,
  };
}

export function matchesFleetVehicle(model: string, vehicle: FleetVehicleSpec): boolean {
  const m = model.toLowerCase().trim();
  const label = vehicle.label.toLowerCase().trim();
  if (label && m.includes(label)) return true;
  const keys = (vehicle.matchKeywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (keys.length === 0) return false;
  return keys.every((k) => m.includes(k));
}

export function findCustomFleetVehicle(
  motoModel: string | undefined,
  fleetVehicleId: string | undefined,
  customVehicles?: FleetVehicleSpec[]
): FleetVehicleSpec | undefined {
  const list = (customVehicles || []).filter((v) => v.active !== false);
  if (fleetVehicleId) {
    const byId = list.find((v) => v.id === fleetVehicleId);
    if (byId) return byId;
  }
  const model = (motoModel || '').trim();
  if (!model) return undefined;
  const sorted = [...list].sort((a, b) => b.label.length - a.label.length);
  return sorted.find((v) => matchesFleetVehicle(model, v));
}

export function resolveMotoSpec(
  motoModel: string | undefined,
  fleet: Pick<FleetSettings, 'defaultKmPerGallon' | 'customVehicles'>,
  driverOverrideKmPerGallon?: number,
  fleetVehicleId?: string
): ResolvedMotoSpec {
  const model = (motoModel || '').trim();
  const custom = findCustomFleetVehicle(model, fleetVehicleId, fleet.customVehicles);
  if (custom) {
    return specFromCustomVehicle(custom, model, driverOverrideKmPerGallon);
  }

  for (const entry of MOTO_FUEL_CATALOG) {
    if (entry.match.test(model)) {
      const kmPerGallon =
        driverOverrideKmPerGallon && driverOverrideKmPerGallon > 0
          ? driverOverrideKmPerGallon
          : entry.kmPerGallon;
      return {
        catalogId: entry.id,
        label: model || entry.label,
        kmPerGallon,
        kmPerLiter: kmPerGallonToKmPerLiter(kmPerGallon),
        kmPerGallonMin: entry.kmPerGallonMin,
        kmPerGallonMax: entry.kmPerGallonMax,
        fuelType: entry.fuelType,
        maintenance: entry.maintenance,
      };
    }
  }
  const kmPerGallon =
    driverOverrideKmPerGallon && driverOverrideKmPerGallon > 0
      ? driverOverrideKmPerGallon
      : fleet.defaultKmPerGallon || DEFAULT_FLEET_SETTINGS.defaultKmPerGallon;
  return {
    catalogId: 'generic',
    label: model || 'Moto genérica',
    kmPerGallon,
    kmPerLiter: kmPerGallonToKmPerLiter(kmPerGallon),
    kmPerGallonMin: Math.round(kmPerGallon * 0.85),
    kmPerGallonMax: Math.round(kmPerGallon * 1.12),
    fuelType: 'gasolina',
    maintenance: defaultMaint(),
  };
}

/** @deprecated use resolveMotoSpec */
export function resolveKmPerGallon(
  motoModel: string | undefined,
  fleet: Pick<FleetSettings, 'defaultKmPerGallon'>,
  driverOverride?: number
) {
  const s = resolveMotoSpec(motoModel, fleet, driverOverride);
  return { kmPerGallon: s.kmPerGallon, fuelType: s.fuelType, label: s.label };
}

/**
 * Fórmula turno DomiClick:
 * km recorrido = km salida − km entrada
 * litros = km ÷ km/L  (= galones × 3.785)
 * galones = km ÷ km/galón
 * costo COP = galones × precio galón
 */
export function calcShiftFuel(params: {
  kmIn: number;
  kmOut: number;
  motoModel?: string;
  motoKmPerGallon?: number;
  fleetVehicleId?: string;
  fleet?: Pick<FleetSettings, 'fuelPricePerGallonCop' | 'defaultKmPerGallon' | 'customVehicles'>;
}): ShiftFuelResult | null {
  const kmIn = Math.round(Number(params.kmIn));
  const kmOut = Math.round(Number(params.kmOut));
  if (!Number.isFinite(kmIn) || !Number.isFinite(kmOut) || kmOut < kmIn || kmIn <= 0) {
    return null;
  }

  const fleet = params.fleet || DEFAULT_FLEET_SETTINGS;
  const spec = resolveMotoSpec(
    params.motoModel,
    fleet,
    params.motoKmPerGallon,
    params.fleetVehicleId
  );
  const kmDriven = Math.round((kmOut - kmIn) * 10) / 10;
  const gallonsUsed = Math.round((kmDriven / spec.kmPerGallon) * 1000) / 1000;
  const litersUsed = Math.round((kmDriven / spec.kmPerLiter) * 1000) / 1000;
  const price = fleet.fuelPricePerGallonCop || DEFAULT_FLEET_SETTINGS.fuelPricePerGallonCop;
  const fuelCostCop = Math.round(gallonsUsed * price);
  const gallonsPerKm = kmDriven > 0 ? Math.round((gallonsUsed / kmDriven) * 10000) / 10000 : 0;
  const litersPerKm = kmDriven > 0 ? Math.round((litersUsed / kmDriven) * 10000) / 10000 : 0;
  const copPerKm = kmDriven > 0 ? Math.round(fuelCostCop / kmDriven) : 0;

  return {
    kmIn,
    kmOut,
    kmDriven,
    kmPerGallon: spec.kmPerGallon,
    kmPerLiter: spec.kmPerLiter,
    gallonsUsed,
    litersUsed,
    gallonsPerKm,
    litersPerKm,
    copPerKm,
    fuelPricePerGallonCop: price,
    fuelCostCop,
    fuelType: spec.fuelType,
    motoModelLabel: spec.label,
    motoCatalogId: spec.catalogId,
  };
}

export function formatGallons(n: number): string {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export function formatLiters(n: number): string {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export type MaintenanceStatus = {
  catalogId: string;
  schedule: MotoMaintenanceSchedule;
  lastOilChangeKm?: number;
  currentOdometerKm?: number;
  nextOilChangeKm?: number;
  kmUntilOilChange?: number;
  dueSoon: boolean;
  overdue: boolean;
  dueItems: MaintenanceDueItem[];
};

export function calcMaintenanceDueItems(
  driver: Pick<
    MotorizadoDriver,
    'lastOilChangeKm' | 'lastOdometerKm' | 'motoModel' | 'motoKmPerGallon' | 'fleetVehicleId'
  >,
  fleet: FleetSettings = DEFAULT_FLEET_SETTINGS
): MaintenanceStatus {
  const spec = resolveMotoSpec(
    driver.motoModel,
    fleet,
    driver.motoKmPerGallon,
    driver.fleetVehicleId
  );
  const sched = spec.maintenance;
  const current = Number(driver.lastOdometerKm) || 0;
  const lastOil = Number(driver.lastOilChangeKm) || 0;

  const tasks: Array<{ key: string; label: string; intervalKm: number; lastKm?: number }> = [
    { key: 'aceite', label: 'Cambio aceite', intervalKm: sched.oilChangeKm, lastKm: lastOil || undefined },
    { key: 'cadena', label: 'Lubricar cadena', intervalKm: sched.chainLubeKm },
    { key: 'filtro', label: 'Limpiar filtro aire', intervalKm: sched.airFilterCleanKm },
    { key: 'bujia', label: 'Revisar/cambiar bujía', intervalKm: sched.sparkPlugReplaceKm },
    { key: 'combustible', label: 'Limpiar bowl combustible', intervalKm: sched.fuelBowlCleanKm },
  ];

  const dueItems: MaintenanceDueItem[] = tasks.map((t) => {
    const base = t.lastKm ?? 0;
    const nextDueKm = base > 0 ? base + t.intervalKm : current > 0 ? sched.firstServiceKm : undefined;
    const kmRemaining =
      nextDueKm != null && current > 0 ? nextDueKm - current : undefined;
    return {
      key: t.key,
      label: t.label,
      intervalKm: t.intervalKm,
      lastDoneKm: t.lastKm,
      nextDueKm,
      kmRemaining,
      dueSoon: kmRemaining != null && kmRemaining <= 500 && kmRemaining > 0,
      overdue: kmRemaining != null && kmRemaining <= 0,
    };
  });

  const oilItem = dueItems.find((d) => d.key === 'aceite');
  const nextOilChangeKm = oilItem?.nextDueKm;
  const kmUntilOilChange = oilItem?.kmRemaining;

  return {
    catalogId: spec.catalogId,
    schedule: sched,
    lastOilChangeKm: lastOil || undefined,
    currentOdometerKm: current || undefined,
    nextOilChangeKm,
    kmUntilOilChange,
    dueSoon: Boolean(oilItem?.dueSoon) || dueItems.some((d) => d.dueSoon),
    overdue: Boolean(oilItem?.overdue) || dueItems.some((d) => d.overdue),
    dueItems,
  };
}

/** @deprecated use calcMaintenanceDueItems */
export function calcMaintenanceStatus(
  driver: Pick<MotorizadoDriver, 'lastOilChangeKm' | 'lastOdometerKm' | 'motoModel'>,
  fleet: Pick<FleetSettings, 'oilChangeIntervalKm'> = DEFAULT_FLEET_SETTINGS
): Omit<MaintenanceStatus, 'dueItems' | 'catalogId' | 'schedule'> {
  const full = calcMaintenanceDueItems(driver, { ...DEFAULT_FLEET_SETTINGS, ...fleet });
  return full;
}

export function formatFuelFormulaSummary(
  f: Partial<ShiftFuelResult> & Pick<ShiftFuelResult, 'kmDriven' | 'gallonsUsed' | 'fuelPricePerGallonCop'>
): string {
  const kmL =
    f.kmPerLiter ||
    (f.kmPerGallon ? Math.round((f.kmPerGallon / LITERS_PER_GALLON) * 10) / 10 : 0);
  const liters = f.litersUsed ?? (f.gallonsUsed || 0) * LITERS_PER_GALLON;
  return (
    `${(f.kmDriven || 0).toLocaleString('es-CO')} km ÷ ${kmL} km/L = ${formatLiters(liters)} L ` +
    `(${formatGallons(f.gallonsUsed || 0)} gal) × ${(f.fuelPricePerGallonCop || 0).toLocaleString('es-CO')} COP/gal`
  );
}

export function formatFuelRateSummary(f: Pick<ShiftFuelResult, 'litersPerKm' | 'gallonsPerKm' | 'copPerKm' | 'kmPerLiter'>): string {
  return `${f.litersPerKm} L/km · ${f.gallonsPerKm} gal/km · ${f.copPerKm.toLocaleString('es-CO')} COP/km (${f.kmPerLiter} km/L)`;
}

export function getBoxer125ReferenceMetrics(pricePerGallonCop = 16500) {
  const spec = MOTO_FUEL_CATALOG.find((e) => e.id === 'bajaj-boxer-125')!;
  const sample = calcShiftFuel({
    kmIn: 45200,
    kmOut: 45280,
    motoModel: 'Boxer 125',
    fleet: { fuelPricePerGallonCop: pricePerGallonCop, defaultKmPerGallon: spec.kmPerGallon },
  })!;
  return { spec, sample80km: sample };
}

import React, { useEffect, useMemo, useState } from 'react';
import { AttendancePunch, FleetSettings, MotorizadoDriver, MotoMaintenanceType } from '../../types';
import {
  addMotoMaintenanceLog,
  saveFleetSettings,
  subscribeAttendancePunches,
  subscribeFleetSettings,
  subscribeMotoMaintenanceLogs,
  updateDriverMotoFields,
} from '../../lib/firebase';
import { formatCOP } from '../../lib/adminMetrics';
import { summarizeDriverShift } from '../../lib/workShift';
import {
  calcMaintenanceDueItems,
  DEFAULT_FLEET_SETTINGS,
  formatFuelFormulaSummary,
  formatFuelRateSummary,
  formatGallons,
  formatLiters,
  getBoxer125ReferenceMetrics,
  MOTO_FUEL_CATALOG,
  resolveMotoSpec,
} from '../../lib/motoFuel';
import { Bike, Fuel, Settings, Wrench, AlertTriangle } from 'lucide-react';
import { FleetVehicleManager } from './FleetVehicleManager';

interface FleetControlPanelProps {
  drivers: MotorizadoDriver[];
}

export const FleetControlPanel: React.FC<FleetControlPanelProps> = ({ drivers }) => {
  const [fleet, setFleet] = useState<FleetSettings>(DEFAULT_FLEET_SETTINGS);
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const [draft, setDraft] = useState(DEFAULT_FLEET_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);

  const todayKey = new Date().toISOString().split('T')[0];
  const approved = drivers.filter((d) => d.status === 'approved');

  useEffect(() => subscribeFleetSettings(setFleet), []);
  useEffect(() => setDraft(fleet), [fleet]);
  useEffect(() => subscribeAttendancePunches(setPunches, todayKey), [todayKey]);

  const closedShiftsToday = useMemo(() => {
    return approved
      .map((d) => {
        const shift = summarizeDriverShift(
          punches.filter((p) => p.driverId === d.id),
          d.id,
          d.fullName,
          todayKey,
          undefined,
          fleet,
          d.motoModel,
          d.motoKmPerGallon,
          d.fleetVehicleId
        );
        return { driver: d, shift };
      })
      .filter(({ shift }) => shift.kmDriven > 0 && !shift.open);
  }, [approved, punches, todayKey, fleet]);

  const fleetFuelToday = closedShiftsToday.reduce((s, x) => s + x.shift.fuelEstimateCop, 0);
  const fleetGallonsToday = closedShiftsToday.reduce(
    (s, x) => s + (x.shift.gallonsUsed || 0),
    0
  );
  const fleetLitersToday = closedShiftsToday.reduce(
    (s, x) => s + (x.shift.litersUsed || 0),
    0
  );
  const boxerRef = useMemo(
    () => getBoxer125ReferenceMetrics(draft.fuelPricePerGallonCop),
    [draft.fuelPricePerGallonCop]
  );

  const handleSaveFleet = async () => {
    setSaving(true);
    try {
      await saveFleetSettings({
        fuelPricePerGallonCop: Number(draft.fuelPricePerGallonCop),
        defaultKmPerGallon: Number(draft.defaultKmPerGallon),
        oilChangeIntervalKm: Number(draft.oilChangeIntervalKm),
        oilChangeIntervalDays: Number(draft.oilChangeIntervalDays),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bike className="w-4 h-4 text-[#FF5722]" />
        <h3 className="text-sm font-bold text-white">Control de motos · combustible y mantenimiento</h3>
      </div>
      <p className="text-xs text-slate-400">
        Flota Boxer 125: <strong className="text-white">151 km/gal</strong> (40 km/L) en mix domicilios.
        Fórmula: litros = km ÷ km/L · galones = km ÷ km/gal · costo = gal × precio galón.
        Si cambian de moto, agregue el nuevo modelo en <strong className="text-emerald-400">Flota personalizada</strong> abajo.
      </p>

      <FleetVehicleManager fleet={fleet} drivers={drivers} />

      <div className="rounded-xl border border-[#FF5722]/25 bg-[#FF5722]/05 p-3 space-y-2">
        <p className="text-[11px] font-bold text-[#FF5722]">Bajaj Boxer 125 — métricas de referencia</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-tech">
          <div>
            <span className="text-slate-500 block">Rendimiento</span>
            <span className="text-white">{boxerRef.spec.kmPerLiter} km/L · {boxerRef.spec.kmPerGallon} km/gal</span>
          </div>
          <div>
            <span className="text-slate-500 block">Rango</span>
            <span className="text-white">{boxerRef.spec.kmPerGallonMin}–{boxerRef.spec.kmPerGallonMax} km/gal</span>
          </div>
          <div>
            <span className="text-slate-500 block">Ejemplo 80 km</span>
            <span className="text-amber-300">{formatLiters(boxerRef.sample80km.litersUsed)} L · {formatGallons(boxerRef.sample80km.gallonsUsed)} gal</span>
          </div>
          <div>
            <span className="text-slate-500 block">Costo 80 km</span>
            <span className="text-[#FF5722]">{formatCOP(boxerRef.sample80km.fuelCostCop)}</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-500">{formatFuelRateSummary(boxerRef.sample80km)}</p>
        <p className="text-[10px] text-slate-500">
          Aceite cada {boxerRef.spec.maintenance.oilChangeKm.toLocaleString('es-CO')} km · 1.er servicio {boxerRef.spec.maintenance.firstServiceKm} km
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="bg-[#0A1020] border border-[#162748] rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Turnos cerrados hoy</div>
          <div className="text-sm font-black text-white font-tech">{closedShiftsToday.length}</div>
        </div>
        <div className="bg-[#0A1020] border border-amber-500/30 rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Galones hoy</div>
          <div className="text-sm font-black text-amber-300 font-tech">
            {formatGallons(fleetGallonsToday)}
          </div>
        </div>
        <div className="bg-[#0A1020] border border-[#00E5FF]/30 rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Litros hoy</div>
          <div className="text-sm font-black text-[#00E5FF] font-tech">
            {formatLiters(fleetLitersToday)}
          </div>
        </div>
        <div className="bg-[#0A1020] border border-[#FF5722]/30 rounded-xl px-3 py-2 col-span-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Reposición combustible hoy</div>
          <div className="text-sm font-black text-[#FF5722] font-tech">{formatCOP(fleetFuelToday)}</div>
        </div>
      </div>

      <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-[#00E5FF]">
          <Settings className="w-4 h-4" />
          <h4 className="text-xs font-bold text-white">Parámetros de cálculo</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-xs">
            <span className="text-slate-500">Precio galón (COP)</span>
            <input
              type="number"
              className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono text-sm"
              value={draft.fuelPricePerGallonCop}
              onChange={(e) =>
                setDraft({ ...draft, fuelPricePerGallonCop: Number(e.target.value) })
              }
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Rendimiento default (km/gal)</span>
            <input
              type="number"
              className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono text-sm"
              value={draft.defaultKmPerGallon}
              onChange={(e) =>
                setDraft({ ...draft, defaultKmPerGallon: Number(e.target.value) })
              }
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Cambio aceite cada (km)</span>
            <input
              type="number"
              className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono text-sm"
              value={draft.oilChangeIntervalKm}
              onChange={(e) =>
                setDraft({ ...draft, oilChangeIntervalKm: Number(e.target.value) })
              }
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Cambio aceite cada (días)</span>
            <input
              type="number"
              className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono text-sm"
              value={draft.oilChangeIntervalDays}
              onChange={(e) =>
                setDraft({ ...draft, oilChangeIntervalDays: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveFleet()}
          className="text-xs font-black px-4 py-2.5 rounded-xl bg-[#2B6CFF] text-white"
        >
          {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar parámetros flota'}
        </button>
        <details className="text-[10px] text-slate-500">
          <summary className="cursor-pointer text-slate-400">Catálogo rendimiento por modelo</summary>
          <ul className="mt-2 space-y-1">
            {MOTO_FUEL_CATALOG.map((m) => (
              <li key={m.id}>
                <span className="text-white">{m.label}</span>: {m.kmPerLiter} km/L · {m.kmPerGallon} km/gal
                {m.maintenance.oilChangeKm ? ` · aceite ${m.maintenance.oilChangeKm} km` : ''}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] text-slate-500 font-tech uppercase">Motos · turno cerrado hoy</div>
        {closedShiftsToday.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-[#1a2744] rounded-xl">
            Sin turnos cerrados con km hoy.
          </p>
        ) : (
          closedShiftsToday.map(({ driver, shift }) => {
            const maint = calcMaintenanceDueItems(driver, fleet);
            const motoSpec = resolveMotoSpec(
              driver.motoModel,
              fleet,
              driver.motoKmPerGallon,
              driver.fleetVehicleId
            );
            const outPunch = punches.find(
              (p) => p.driverId === driver.id && p.type === 'out' && p.dateKey === todayKey
            );
            return (
              <div
                key={driver.id}
                className="bg-[#0A1020] border border-[#162748] rounded-xl p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">{driver.fullName}</div>
                    <div className="text-[10px] text-[#FF5722] font-mono">
                      {driver.plateNumber} · {driver.motoModel || 'Sin modelo'}
                      {motoSpec.catalogId.startsWith('fv_') && (
                        <span className="text-emerald-400"> · Flota custom ✓</span>
                      )}
                      {motoSpec.catalogId === 'bajaj-boxer-125' && (
                        <span className="text-emerald-400"> · Boxer 125 ✓</span>
                      )}
                    </div>
                  </div>
                  {(maint.dueSoon || maint.overdue) && (
                    <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {maint.overdue ? 'Aceite vencido' : 'Aceite pronto'}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-tech space-y-0.5">
                  <div>
                    {shift.kmIn?.toLocaleString('es-CO')} → {shift.kmOut?.toLocaleString('es-CO')} km
                    · <span className="text-[#00E5FF]">+{shift.kmDriven.toLocaleString('es-CO')} km</span>
                  </div>
                  {shift.gallonsUsed != null && (
                    <div className="flex items-center gap-1 text-amber-300">
                      <Fuel className="w-3 h-3" />
                      {formatLiters(shift.litersUsed || 0)} L · {formatGallons(shift.gallonsUsed)} gal ·{' '}
                      {formatCOP(shift.fuelEstimateCop)}
                      {shift.kmPerLiterUsed != null && (
                        <span className="text-slate-500">
                          ({shift.kmPerLiterUsed} km/L @ {shift.kmPerGallonUsed} km/gal)
                        </span>
                      )}
                    </div>
                  )}
                  {shift.litersPerKm != null && shift.litersPerKm > 0 && (
                    <div className="text-slate-500">
                      Consumo: {shift.litersPerKm} L/km · {formatCOP(shift.copPerKm || 0)}/km
                    </div>
                  )}
                  {outPunch?.shiftKmDriven != null && (
                    <div className="text-slate-500 italic">
                      {formatFuelFormulaSummary({
                        kmIn: shift.kmIn!,
                        kmOut: shift.kmOut!,
                        kmDriven: outPunch.shiftKmDriven,
                        kmPerGallon: outPunch.kmPerGallonUsed || shift.kmPerGallonUsed || 35,
                        kmPerLiter:
                          shift.kmPerLiterUsed ||
                          Math.round(
                            ((outPunch.kmPerGallonUsed || shift.kmPerGallonUsed || 35) / 3.78541) *
                              10
                          ) / 10,
                        gallonsUsed: outPunch.shiftGallons || shift.gallonsUsed || 0,
                        litersUsed: shift.litersUsed || 0,
                        gallonsPerKm: shift.gallonsPerKm || 0,
                        litersPerKm: shift.litersPerKm || 0,
                        copPerKm: shift.copPerKm || 0,
                        fuelPricePerGallonCop:
                          outPunch.fuelPricePerGallonUsed || shift.fuelPricePerGallonCop || 16500,
                        fuelCostCop: outPunch.shiftFuelCostCop || shift.fuelEstimateCop,
                        fuelType: 'gasolina',
                        motoModelLabel: driver.motoModel || 'Moto',
                        motoCatalogId: 'custom',
                      })}
                    </div>
                  )}
                  {maint.dueItems.some((d) => d.dueSoon || d.overdue) && (
                    <div className="space-y-0.5 pt-1">
                      {maint.dueItems
                        .filter((d) => d.dueSoon || d.overdue)
                        .map((d) => (
                          <div
                            key={d.key}
                            className={`flex items-center gap-1 ${d.overdue ? 'text-red-300' : 'text-amber-300'}`}
                          >
                            <Wrench className="w-3 h-3" />
                            {d.label}: {d.overdue ? 'vencido' : `en ${d.kmRemaining?.toLocaleString('es-CO')} km`}
                          </div>
                        ))}
                    </div>
                  )}
                  {maint.nextOilChangeKm != null && (
                    <div className="flex items-center gap-1 text-slate-500">
                      <Wrench className="w-3 h-3" />
                      Próx. aceite: {maint.nextOilChangeKm.toLocaleString('es-CO')} km
                      {maint.kmUntilOilChange != null &&
                        ` (faltan ${maint.kmUntilOilChange.toLocaleString('es-CO')} km)`}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="text-[10px] font-bold px-2 py-1 rounded-lg border border-[#1a2744] text-slate-300"
                    onClick={() =>
                      setExpandedDriverId(expandedDriverId === driver.id ? null : driver.id)
                    }
                  >
                    {expandedDriverId === driver.id ? 'Ocultar' : 'Mantenimiento'}
                  </button>
                  <label className="text-[10px] text-slate-500 flex items-center gap-1">
                    km/gal moto:
                    <input
                      type="number"
                      className="w-16 bg-[#070B16] border border-[#1a2744] rounded px-1 py-0.5 text-white font-mono"
                      placeholder="auto"
                      defaultValue={driver.motoKmPerGallon ?? ''}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const v = raw ? Number(raw) : undefined;
                        void updateDriverMotoFields(driver.id, { motoKmPerGallon: v });
                      }}
                    />
                  </label>
                </div>
                {expandedDriverId === driver.id && (
                  <DriverMaintenanceForm driver={driver} fleet={fleet} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

function DriverMaintenanceForm({
  driver,
  fleet,
}: {
  driver: MotorizadoDriver;
  fleet: FleetSettings;
}) {
  const [logs, setLogs] = useState<import('../../types').MotoMaintenanceLog[]>([]);
  const [type, setType] = useState<MotoMaintenanceType>('aceite');
  const [desc, setDesc] = useState('');
  const [km, setKm] = useState(String(driver.lastOdometerKm || ''));
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeMotoMaintenanceLogs(driver.id, setLogs), [driver.id]);

  const handleAdd = async () => {
    const odometerKm = Number(km);
    if (!odometerKm) return;
    setBusy(true);
    try {
      await addMotoMaintenanceLog({
        driverId: driver.id,
        fleetMotoId: driver.assignedMotoId,
        driverName: driver.fullName,
        plateNumber: driver.plateNumber,
        motoModel: driver.motoModel,
        type,
        description: desc.trim() || type,
        odometerKm,
        costCop: cost ? Number(cost) : undefined,
        updateOilChange: type === 'aceite',
      });
      setDesc('');
      setCost('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-[#1a2744] pt-3 space-y-2">
      <p className="text-[10px] text-slate-500">
        Registro mantenimiento · intervalo aceite {fleet.oilChangeIntervalKm.toLocaleString('es-CO')} km
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as MotoMaintenanceType)}
          className="bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-1 text-[10px] text-white"
        >
          <option value="aceite">Aceite</option>
          <option value="llantas">Llantas</option>
          <option value="frenos">Frenos</option>
          <option value="cadena">Cadena</option>
          <option value="general">General</option>
          <option value="otro">Otro</option>
        </select>
        <input
          className="flex-1 min-w-[8rem] bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-1 text-[10px] text-white"
          placeholder="Descripción"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <input
          className="w-24 bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-1 text-[10px] text-white font-mono"
          placeholder="Km"
          value={km}
          onChange={(e) => setKm(e.target.value.replace(/[^\d]/g, ''))}
        />
        <input
          className="w-24 bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-1 text-[10px] text-white font-mono"
          placeholder="Costo"
          value={cost}
          onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ''))}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleAdd()}
          className="text-[10px] font-black px-3 py-1 rounded-lg bg-[#FF5722] text-white"
        >
          Registrar
        </button>
      </div>
      {logs.length > 0 && (
        <ul className="text-[10px] text-slate-500 space-y-1 max-h-24 overflow-y-auto">
          {logs.slice(0, 5).map((l) => (
            <li key={l.id}>
              {new Date(l.at).toLocaleDateString('es-CO')} · {l.type} · {l.odometerKm.toLocaleString('es-CO')} km
              {l.costCop ? ` · ${formatCOP(l.costCop)}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

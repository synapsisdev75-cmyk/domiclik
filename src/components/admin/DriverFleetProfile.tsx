import React, { useEffect, useMemo, useState } from 'react';
import { AttendancePunch, MotorizadoDriver } from '../../types';
import { subscribeDriverAttendancePunches } from '../../lib/firebase';
import {
  DEFAULT_FUEL_COP_PER_KM,
  EXPECTED_SHIFT_HOURS,
  formatCOP,
} from '../../lib/adminMetrics';
import { buildDriverShiftHistory, summarizeDriverShift } from '../../lib/workShift';
import { calcMaintenanceDueItems, DEFAULT_FLEET_SETTINGS, formatGallons, formatLiters } from '../../lib/motoFuel';
import { subscribeFleetSettings } from '../../lib/firebase';
import { Fingerprint, Gauge, LogIn, LogOut, X, Wrench, AlertTriangle } from 'lucide-react';

interface DriverFleetProfileProps {
  driver: MotorizadoDriver;
  onClose: () => void;
  onOpenChat?: () => void;
}

export const DriverFleetProfile: React.FC<DriverFleetProfileProps> = ({
  driver,
  onClose,
  onOpenChat,
}) => {
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const [fleet, setFleet] = useState(DEFAULT_FLEET_SETTINGS);
  const todayKey = new Date().toISOString().split('T')[0];

  useEffect(() => subscribeFleetSettings(setFleet), []);

  useEffect(() => {
    return subscribeDriverAttendancePunches(driver.id, setPunches);
  }, [driver.id]);

  const today = useMemo(
    () =>
      summarizeDriverShift(
        punches.filter((p) => p.dateKey === todayKey),
        driver.id,
        driver.fullName,
        todayKey,
        DEFAULT_FUEL_COP_PER_KM,
        fleet,
        driver.motoModel,
        driver.motoKmPerGallon,
        driver.fleetVehicleId
      ),
    [punches, driver.id, driver.fullName, todayKey, fleet, driver.motoModel, driver.motoKmPerGallon, driver.fleetVehicleId]
  );

  const history = useMemo(
    () =>
      buildDriverShiftHistory(
        punches,
        driver.id,
        driver.fullName,
        DEFAULT_FUEL_COP_PER_KM,
        fleet,
        driver.motoModel,
        driver.motoKmPerGallon,
        driver.fleetVehicleId
      ),
    [punches, driver.id, driver.fullName, fleet, driver.motoModel, driver.motoKmPerGallon, driver.fleetVehicleId]
  );

  const maint = useMemo(() => calcMaintenanceDueItems(driver, fleet), [driver, fleet]);

  return (
    <div className="bg-[#070B16] border border-[#FF5722]/35 rounded-3xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={driver.photoUrl || '/brand/logo-mark.png'}
            alt={driver.fullName}
            className="w-14 h-14 rounded-2xl object-cover border-2 border-[#FF5722]"
          />
          <div className="min-w-0">
            <h3 className="text-base font-black text-white truncate">{driver.fullName}</h3>
            <p className="text-[11px] text-slate-400 font-tech">
              {driver.plateNumber ? `${driver.plateNumber} · ` : ''}
              {driver.phone}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {driver.email}
              {driver.motoModel ? ` · ${driver.motoModel}` : !driver.assignedMotoId ? ' · Sin moto asignada' : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1.5 rounded-lg border border-[#1a2744]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Km hoy" value={today.kmDriven > 0 ? String(today.kmDriven) : '—'} accent="text-[#00E5FF]" />
        <Kpi
          label="Horas hoy"
          value={`${today.open ? 'abierto' : (today.hoursWorked || 0).toFixed(1)} / ${EXPECTED_SHIFT_HOURS}`}
          accent={today.open ? 'text-amber-300' : 'text-white'}
        />
        <Kpi label="Km acumulados" value={history.totalKm.toLocaleString('es-CO')} accent="text-white" />
        <Kpi label="Gasolina est." value={formatCOP(history.totalFuelCop)} accent="text-amber-300" />
        <Kpi label="Litros acum." value={history.totalLiters > 0 ? formatLiters(history.totalLiters) : '—'} accent="text-[#00E5FF]" />
      </div>

      {(maint.dueSoon || maint.overdue || maint.nextOilChangeKm) && (
        <div
          className={`rounded-xl border px-3 py-2 text-[11px] flex items-center gap-2 ${
            maint.overdue
              ? 'border-red-500/40 bg-red-500/10 text-red-300'
              : maint.dueSoon
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-[#162748] bg-[#0A1020] text-slate-400'
          }`}
        >
          <Wrench className="w-3.5 h-3.5 shrink-0" />
          {maint.overdue && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          <span>
            {maint.overdue
              ? 'Cambio de aceite vencido'
              : maint.dueSoon
                ? 'Cambio de aceite próximo'
                : 'Mantenimiento'}
            {maint.nextOilChangeKm != null &&
              ` · próximo a ${maint.nextOilChangeKm.toLocaleString('es-CO')} km`}
            {today.gallonsUsed != null && today.gallonsUsed > 0 &&
              ` · hoy ${formatGallons(today.gallonsUsed)} gal`}
          </span>
        </div>
      )}

      <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[#FF5722]" />
          <span className="text-xs font-black text-white font-tech uppercase">Turno de hoy</span>
          <span
            className={`ml-auto text-[10px] font-tech font-bold px-2 py-0.5 rounded-lg border ${
              today.open
                ? 'text-amber-300 border-amber-500/40'
                : today.inAt
                  ? 'text-emerald-300 border-emerald-500/40'
                  : 'text-slate-400 border-slate-600'
            }`}
          >
            {today.open ? 'EN TURNO' : today.inAt ? 'CERRADO' : 'SIN MARCA'}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 font-tech">
          Entrada {today.kmIn != null ? `${today.kmIn.toLocaleString('es-CO')} km` : '—'}
          {today.inAt ? ` · ${new Date(today.inAt).toLocaleTimeString('es-CO')}` : ''}
          {' → '}
          Salida {today.kmOut != null ? `${today.kmOut.toLocaleString('es-CO')} km` : '—'}
          {today.outAt ? ` · ${new Date(today.outAt).toLocaleTimeString('es-CO')}` : ''}
        </p>
        {(today.photoInUrl || today.photoOutUrl) && (
          <div className="flex gap-2">
            {today.photoInUrl && (
              <a href={today.photoInUrl} target="_blank" rel="noreferrer" className="block">
                <img src={today.photoInUrl} alt="Odómetro entrada" className="h-20 w-28 object-cover rounded-xl border border-[#1a2744]" />
                <span className="block text-[9px] text-slate-500 mt-0.5">Entrada</span>
              </a>
            )}
            {today.photoOutUrl && (
              <a href={today.photoOutUrl} target="_blank" rel="noreferrer" className="block">
                <img src={today.photoOutUrl} alt="Odómetro salida" className="h-20 w-28 object-cover rounded-xl border border-[#1a2744]" />
                <span className="block text-[9px] text-slate-500 mt-0.5">Salida</span>
              </a>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-[#00E5FF]" />
          <span className="text-xs font-black text-white font-tech uppercase">Asistencia y km por día</span>
        </div>
        {history.days.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-[#1a2744] rounded-2xl">
            Aún no hay marcas de huella ni kilometraje.
          </p>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {history.days.map((d) => (
              <div key={d.dateKey} className="bg-[#0A1020] border border-[#162748] rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-tech text-slate-300">{d.dateKey}</span>
                  <span className="text-[#00E5FF] font-tech font-bold">
                    +{d.kmDriven.toLocaleString('es-CO')} km
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-tech mt-0.5">
                  {d.kmIn != null ? d.kmIn.toLocaleString('es-CO') : '—'} →{' '}
                  {d.kmOut != null ? d.kmOut.toLocaleString('es-CO') : '…'} km ·{' '}
                  {d.hoursWorked > 0 ? `${d.hoursWorked.toFixed(2)} h` : 'turno abierto'} ·{' '}
                  {formatCOP(d.fuelEstimateCop)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] text-slate-500 font-tech uppercase">Marcas recientes</div>
        {punches.slice(0, 12).map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-2 bg-[#0A1020] border border-[#162748] rounded-xl px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              {p.type === 'in' ? (
                <LogIn className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
              ) : (
                <LogOut className="w-3.5 h-3.5 text-[#FF5722] shrink-0" />
              )}
              {p.odometerPhotoUrl && (
                <a href={p.odometerPhotoUrl} target="_blank" rel="noreferrer">
                  <img src={p.odometerPhotoUrl} alt="" className="h-8 w-10 object-cover rounded-md border border-[#1a2744]" />
                </a>
              )}
              <div className="min-w-0">
                <span className={p.type === 'in' ? 'text-[#00E676]' : 'text-[#FF5722]'}>
                  {p.type === 'in' ? 'ENTRADA' : 'SALIDA'}
                </span>
                {p.odometerKm != null && (
                  <span className="text-slate-400 font-tech ml-1.5">
                    {p.odometerKm.toLocaleString('es-CO')} km
                  </span>
                )}
              </div>
            </div>
            <span className="text-slate-400 font-tech shrink-0">
              {new Date(p.at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>
        ))}
      </div>

      {onOpenChat && (
        <button
          type="button"
          onClick={onOpenChat}
          className="w-full py-2.5 rounded-xl border border-[#00E5FF]/40 text-[#00E5FF] text-xs font-black"
        >
          Abrir radio / chat
        </button>
      )}
    </div>
  );
};

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-[#0A1020] border border-[#162748] rounded-xl px-3 py-2.5">
      <div className="text-[10px] text-slate-500 font-tech uppercase">{label}</div>
      <div className={`text-sm font-black font-tech truncate ${accent}`}>{value}</div>
    </div>
  );
}

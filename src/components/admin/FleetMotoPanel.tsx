import React, { useEffect, useMemo, useState } from 'react';
import {
  AttendancePunch,
  FleetSettings,
  MotorizadoDriver,
} from '../../types';
import {
  deleteFleetMoto,
  subscribeAttendancePunches,
  subscribeFleetMotos,
  subscribeFleetSettings,
  unlinkFleetMoto,
  updateFleetMotoStatus,
} from '../../lib/firebase';
import { DEFAULT_FLEET_SETTINGS, formatLiters } from '../../lib/motoFuel';
import { FLEET_MOTO_STATUS, summarizeFleetMoto } from '../../lib/fleetMoto';
import { AssignMotoToDriverModal } from './AssignMotoToDriverModal';
import {
  AlertTriangle,
  Bike,
  Fuel,
  Link2,
  Trash2,
  Unlink,
  UserPlus,
  Wrench,
} from 'lucide-react';
import type { FleetMotoStatus } from '../../types';

interface FleetMotoPanelProps {
  drivers: MotorizadoDriver[];
}

export const FleetMotoPanel: React.FC<FleetMotoPanelProps> = ({ drivers }) => {
  const [motos, setMotos] = useState<import('../../types').FleetMoto[]>([]);
  const [fleet, setFleet] = useState<FleetSettings>(DEFAULT_FLEET_SETTINGS);
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [assignDriver, setAssignDriver] = useState<MotorizadoDriver | null>(null);

  const todayKey = new Date().toISOString().split('T')[0];
  const approved = drivers.filter((d) => d.status === 'approved');
  const driversWithoutMoto = approved.filter((d) => !d.assignedMotoId);

  useEffect(() => subscribeFleetMotos(setMotos), []);
  useEffect(() => subscribeFleetSettings(setFleet), []);
  useEffect(() => subscribeAttendancePunches(setPunches, todayKey), [todayKey]);

  const summaries = useMemo(
    () => motos.map((m) => summarizeFleetMoto(m, fleet, drivers, punches)),
    [motos, fleet, drivers, punches]
  );

  const counts = useMemo(
    () => ({
      available: motos.filter((m) => m.status === 'available').length,
      assigned: motos.filter((m) => m.status === 'assigned').length,
      maintenance: motos.filter((m) => m.status === 'maintenance').length,
      unavailable: motos.filter((m) => m.status === 'unavailable').length,
    }),
    [motos]
  );

  const handleStatusChange = async (motoId: string, status: FleetMotoStatus) => {
    await updateFleetMotoStatus(motoId, status);
    if (status === 'maintenance' || status === 'unavailable') {
      await unlinkFleetMoto(motoId);
    }
  };

  const handleUnlink = async (moto: import('../../types').FleetMoto) => {
    const name =
      drivers.find((d) => d.id === moto.currentDriverId)?.fullName || 'el transportista';
    if (
      !window.confirm(
        `¿Desvincular la moto ${moto.plateNumber} de ${name}? Quedará disponible para otra asignación.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await unlinkFleetMoto(moto.id);
      setMsg('Moto desvinculada.');
      setTimeout(() => setMsg(''), 2000);
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (status: FleetMotoStatus) => {
    const s = FLEET_MOTO_STATUS.find((x) => x.key === status);
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${s?.color || ''}`}>
        {s?.label || status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <AssignMotoToDriverModal
        driver={assignDriver}
        onClose={() => setAssignDriver(null)}
        onAssigned={() => setMsg('Moto vinculada al transportista.')}
      />

      <div className="flex items-center gap-2">
        <Bike className="w-5 h-5 text-[#FF5722]" />
        <h3 className="text-sm font-bold text-white">Motos de flota · vinculación fija</h3>
      </div>
      <p className="text-xs text-slate-400">
        El transportista solo registra datos personales. Usted como administrador registra la moto
        (placa, modelo, km inicial) al vincularla. Esa moto queda asignada mientras trabaje con
        ustedes.
      </p>

      {msg && <p className="text-[11px] text-emerald-300">{msg}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Disponibles" value={counts.available} color="text-emerald-400" />
        <StatCard label="Vinculadas" value={counts.assigned} color="text-[#00E5FF]" />
        <StatCard label="Mantenimiento" value={counts.maintenance} color="text-amber-300" />
        <StatCard label="Sin moto" value={driversWithoutMoto.length} color="text-slate-300" />
      </div>

      {driversWithoutMoto.length > 0 && (
        <div className="bg-[#0A1020] border border-amber-500/25 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
            <UserPlus className="w-4 h-4" />
            Transportistas sin moto asignada
          </div>
          {driversWithoutMoto.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 bg-[#070B16] border border-[#162748] rounded-xl px-3 py-2"
            >
              <div>
                <div className="text-xs font-bold text-white">{d.fullName}</div>
                <div className="text-[10px] text-slate-500">{d.phone} · {d.documentId}</div>
              </div>
              <button
                type="button"
                className="text-[10px] font-black px-3 py-1.5 rounded-lg bg-[#FF5722] text-white flex items-center gap-1"
                onClick={() => setAssignDriver(d)}
              >
                <Link2 className="w-3 h-3" />
                Vincular moto
              </button>
            </div>
          ))}
        </div>
      )}

      {summaries.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-[#1a2744] rounded-xl">
          Aún no hay motos en la flota. Use &quot;Vincular moto&quot; en un transportista aprobado.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Motos registradas</div>
          {summaries.map(({ moto, maintenance, fuel, assignedDriverName }) => (
            <div
              key={moto.id}
              className="bg-[#0A1020] border border-[#162748] rounded-xl p-3 space-y-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white font-mono">{moto.plateNumber}</span>
                    {statusBadge(moto.status)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {moto.motoModel || 'Sin modelo'} · {fuel.fuelLabel}
                    {moto.assignedAtOdometerKm != null && (
                      <span className="text-slate-500">
                        {' '}
                        · km inicial {moto.assignedAtOdometerKm.toLocaleString('es-CO')}
                      </span>
                    )}
                    {moto.lastOdometerKm != null && (
                      <span> · odómetro {moto.lastOdometerKm.toLocaleString('es-CO')} km</span>
                    )}
                  </div>
                  {assignedDriverName ? (
                    <div className="mt-1 text-[11px] font-bold text-[#00E5FF] flex items-center gap-1">
                      <Link2 className="w-3.5 h-3.5" />
                      Vinculada a {assignedDriverName}
                    </div>
                  ) : (
                    <div className="mt-1 text-[10px] text-emerald-400">Disponible para vincular</div>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap items-center">
                  <select
                    className="text-[10px] bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-1 text-white"
                    value={moto.status}
                    onChange={(e) =>
                      void handleStatusChange(moto.id, e.target.value as FleetMotoStatus)
                    }
                  >
                    {FLEET_MOTO_STATUS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {moto.currentDriverId && (
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border border-amber-500/40 text-amber-200 flex items-center gap-1"
                      onClick={() => void handleUnlink(moto)}
                    >
                      <Unlink className="w-3 h-3" />
                      Desvincular
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 text-red-300"
                    onClick={() => {
                      if (window.confirm('¿Eliminar esta moto del inventario?')) {
                        void deleteFleetMoto(moto.id);
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                <div
                  className={`rounded-lg border px-2 py-1.5 ${
                    fuel.needsRefuel
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : fuel.refillSoon
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : 'border-[#162748] text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1 font-bold">
                    <Fuel className="w-3 h-3" />
                    {fuel.fuelLabel}
                    {fuel.needsRefuel && ' · RECARGAR'}
                  </div>
                  <div>
                    ~{formatLiters(fuel.litersRemaining)} en tanque · ~{fuel.kmUntilEmpty} km
                  </div>
                </div>

                <div
                  className={`rounded-lg border px-2 py-1.5 ${
                    maintenance.overdue
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : maintenance.dueSoon
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : 'border-[#162748] text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1 font-bold">
                    <Wrench className="w-3 h-3" />
                    Mantenimiento
                    {maintenance.overdue && <AlertTriangle className="w-3 h-3" />}
                  </div>
                  {maintenance.dueItems
                    .filter((d) => d.dueSoon || d.overdue)
                    .slice(0, 2)
                    .map((d) => (
                      <div key={d.key}>
                        {d.label}: {d.overdue ? 'vencido' : `en ${d.kmRemaining?.toLocaleString('es-CO')} km`}
                      </div>
                    ))}
                  {!maintenance.dueSoon && !maintenance.overdue && (
                    <div className="text-slate-500">Al día según odómetro</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[#0A1020] border border-[#162748] rounded-xl px-3 py-2">
      <div className="text-[10px] text-slate-500 font-tech uppercase">{label}</div>
      <div className={`text-lg font-black font-tech ${color}`}>{value}</div>
    </div>
  );
}

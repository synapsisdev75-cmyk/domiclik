import React, { useEffect, useMemo, useState } from 'react';
import { AttendancePunch, MotorizadoDriver } from '../../types';
import { subscribeAttendancePunches } from '../../lib/firebase';
import { DEFAULT_FUEL_COP_PER_KM, formatCOP } from '../../lib/adminMetrics';
import { summarizeDriverShift } from '../../lib/workShift';
import { Fingerprint, LogIn, LogOut, Gauge } from 'lucide-react';

interface AttendancePanelProps {
  drivers: MotorizadoDriver[];
}

export const AttendancePanel: React.FC<AttendancePanelProps> = ({ drivers }) => {
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const todayKey = new Date().toISOString().split('T')[0];

  useEffect(() => {
    return subscribeAttendancePunches(setPunches, todayKey);
  }, [todayKey]);

  const approved = drivers.filter((d) => d.status === 'approved');
  const linked = approved.filter((d) => d.webauthnCredentialId);

  const shifts = useMemo(
    () =>
      approved.map((d) =>
        summarizeDriverShift(punches, d.id, d.fullName, todayKey, DEFAULT_FUEL_COP_PER_KM)
      ),
    [approved, punches, todayKey]
  );

  const fleetKm = shifts.reduce((s, x) => s + x.kmDriven, 0);
  const fleetFuel = shifts.reduce((s, x) => s + x.fuelEstimateCop, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="w-4 h-4 text-[#00E5FF]" />
        <h3 className="text-sm font-bold text-white">Asistencia + kilometraje · hoy</h3>
      </div>
      <p className="text-xs text-slate-400">
        Entrada y salida con huella, foto del odómetro y km. Al cierre: km del día y estimado de
        gasolina (uso de la empresa).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-[#0A1020] border border-[#162748] rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Biometrías</div>
          <div className="text-sm font-black text-white font-tech">
            {linked.length}/{approved.length}
          </div>
        </div>
        <div className="bg-[#0A1020] border border-[#162748] rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Marcas hoy</div>
          <div className="text-sm font-black text-white font-tech">{punches.length}</div>
        </div>
        <div className="bg-[#0A1020] border border-[#00E5FF]/30 rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Km flota</div>
          <div className="text-sm font-black text-[#00E5FF] font-tech">
            {fleetKm.toLocaleString('es-CO')}
          </div>
        </div>
        <div className="bg-[#0A1020] border border-amber-500/30 rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Gasolina est.</div>
          <div className="text-sm font-black text-amber-300 font-tech">{formatCOP(fleetFuel)}</div>
        </div>
      </div>

      {shifts.some((s) => s.inAt || s.outAt) && (
        <div className="space-y-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Turnos del día</div>
          {shifts
            .filter((s) => s.inAt || s.outAt)
            .map((s) => (
              <div
                key={s.driverId}
                className="bg-[#0A1020] border border-[#162748] rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-white truncate">{s.driverName}</div>
                  <span
                    className={`text-[10px] font-tech font-bold px-2 py-0.5 rounded-lg border ${
                      s.open
                        ? 'text-amber-300 border-amber-500/40'
                        : 'text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {s.open ? 'EN TURNO' : 'CERRADO'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400 font-tech">
                  <span>
                    {s.kmIn != null ? `${s.kmIn.toLocaleString('es-CO')} km` : '—'} →{' '}
                    {s.kmOut != null ? `${s.kmOut.toLocaleString('es-CO')} km` : '…'}
                  </span>
                  <span className="text-[#00E5FF]">
                    +{s.kmDriven.toLocaleString('es-CO')} km
                  </span>
                  <span>
                    {s.hoursWorked > 0 ? `${s.hoursWorked.toFixed(2)} h` : '—'} / {s.expectedHours} h
                  </span>
                  <span className="text-amber-300">{formatCOP(s.fuelEstimateCop)}</span>
                </div>
                {(s.photoInUrl || s.photoOutUrl) && (
                  <div className="flex gap-2">
                    {s.photoInUrl && (
                      <a href={s.photoInUrl} target="_blank" rel="noreferrer">
                        <img
                          src={s.photoInUrl}
                          alt="Odómetro entrada"
                          className="h-14 w-20 object-cover rounded-lg border border-[#1a2744]"
                        />
                      </a>
                    )}
                    {s.photoOutUrl && (
                      <a href={s.photoOutUrl} target="_blank" rel="noreferrer">
                        <img
                          src={s.photoOutUrl}
                          alt="Odómetro salida"
                          className="h-14 w-20 object-cover rounded-lg border border-[#1a2744]"
                        />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {punches.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-[#1a2744] rounded-2xl">
          Sin marcas de asistencia hoy.
        </p>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {punches.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 bg-[#0A1020] border border-[#162748] rounded-xl px-3 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                {p.type === 'in' ? (
                  <LogIn className="w-4 h-4 text-[#00E676] shrink-0" />
                ) : (
                  <LogOut className="w-4 h-4 text-[#FF5722] shrink-0" />
                )}
                {p.odometerPhotoUrl ? (
                  <a href={p.odometerPhotoUrl} target="_blank" rel="noreferrer">
                    <img
                      src={p.odometerPhotoUrl}
                      alt="Odómetro"
                      className="h-9 w-12 object-cover rounded-md border border-[#1a2744]"
                    />
                  </a>
                ) : (
                  <Gauge className="w-4 h-4 text-slate-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-white font-bold truncate">{p.driverName || p.driverId}</div>
                  <div className="text-[10px] text-slate-500 font-tech">
                    {p.type === 'in' ? 'ENTRADA' : 'SALIDA'}
                    {p.odometerKm != null
                      ? ` · ${p.odometerKm.toLocaleString('es-CO')} km`
                      : ''}
                  </div>
                </div>
              </div>
              <div className="text-slate-300 font-tech shrink-0">
                {new Date(p.at).toLocaleTimeString('es-CO')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

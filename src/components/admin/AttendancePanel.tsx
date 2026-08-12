import React, { useEffect, useState } from 'react';
import { AttendancePunch, MotorizadoDriver } from '../../types';
import { subscribeAttendancePunches } from '../../lib/firebase';
import { Fingerprint, LogIn, LogOut } from 'lucide-react';

interface AttendancePanelProps {
  drivers: MotorizadoDriver[];
}

export const AttendancePanel: React.FC<AttendancePanelProps> = ({ drivers }) => {
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const todayKey = new Date().toISOString().split('T')[0];

  useEffect(() => {
    return subscribeAttendancePunches(setPunches, todayKey);
  }, [todayKey]);

  const linked = drivers.filter((d) => d.status === 'approved' && d.webauthnCredentialId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="w-4 h-4 text-[#00E5FF]" />
        <h3 className="text-sm font-bold text-white">Asistencia biométrica · hoy</h3>
      </div>
      <p className="text-xs text-slate-400">
        Entradas/salidas con huella o Face ID del móvil del transportista (Firebase).
      </p>
      <div className="text-[11px] text-slate-500 font-tech">
        Biometrías vinculadas: {linked.length} / {drivers.filter((d) => d.status === 'approved').length}
      </div>
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
                <div className="min-w-0">
                  <div className="text-white font-bold truncate">
                    {p.driverName || p.driverId}
                  </div>
                  <div className="text-[10px] text-slate-500 font-tech">
                    {p.type === 'in' ? 'ENTRADA' : 'SALIDA'} · WebAuthn
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

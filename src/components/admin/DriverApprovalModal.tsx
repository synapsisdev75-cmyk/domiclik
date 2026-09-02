import React, { useState } from 'react';
import { MotorizadoDriver } from '../../types';
import { updateDriverApprovalStatus } from '../../lib/firebase';
import { CheckCircle2, XCircle, X } from 'lucide-react';

interface DriverApprovalModalProps {
  driver: MotorizadoDriver | null;
  isOpen: boolean;
  onClose: () => void;
  adminName: string;
}

export const DriverApprovalModal: React.FC<DriverApprovalModalProps> = ({
  driver,
  isOpen,
  onClose,
  adminName,
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !driver) return null;

  const handleApprove = async () => {
    setLoading(true);
    await updateDriverApprovalStatus(driver.id, 'approved', adminName);
    setLoading(false);
    onClose();
  };

  const handleReject = async () => {
    setLoading(true);
    await updateDriverApprovalStatus(driver.id, 'rejected', adminName, rejectReason);
    setLoading(false);
    onClose();
  };

  const birthLabel = driver.birthDate
    ? new Date(driver.birthDate + 'T12:00:00').toLocaleDateString('es-CO')
    : '—';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-2xl">
            🛡️
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Evaluación de transportista</h3>
            <p className="text-xs text-slate-400">
              Solo datos personales. La moto se vincula después en Flota.
            </p>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <img
              src={driver.photoUrl}
              alt={driver.fullName}
              className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shadow-md"
            />
            <div>
              <h4 className="text-base font-extrabold text-white">{driver.fullName}</h4>
              <p className="text-slate-400 text-[11px] mt-0.5">{driver.email}</p>
              <p className="text-[10px] text-amber-400/90 mt-1">
                Moto: {driver.plateNumber || 'pendiente — asignar en Flota'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div>
              <span className="text-slate-500 text-[10px] block uppercase font-bold">Cédula</span>
              <span className="text-white font-medium">{driver.documentId}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block uppercase font-bold">Nacimiento</span>
              <span className="text-white font-medium">{birthLabel}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block uppercase font-bold">Licencia (A2)</span>
              <span className="text-white font-medium">{driver.licenseNumber || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block uppercase font-bold">Teléfono</span>
              <span className="text-white font-medium">{driver.phone}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block uppercase font-bold">Solicitud</span>
              <span className="text-white font-medium">
                {new Date(driver.createdAt).toLocaleDateString('es-CO')}
              </span>
            </div>
          </div>

          {showRejectInput && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs space-y-2">
              <label className="block text-red-300 font-semibold">Motivo del rechazo</label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ej: documento no legible…"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRejectInput(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-bold text-[11px]"
                >
                  Confirmar rechazo
                </button>
              </div>
            </div>
          )}

          {!showRejectInput && (
            <div className="flex flex-col sm:flex-row gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowRejectInput(true)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold py-3.5 px-4 rounded-2xl text-xs border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                Rechazar
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 font-extrabold py-3.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Aprobar ingreso
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

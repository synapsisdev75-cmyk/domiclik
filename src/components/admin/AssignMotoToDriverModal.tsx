import React, { useState } from 'react';
import { MotorizadoDriver } from '../../types';
import { assignMotoToDriverWithSetup } from '../../lib/firebase';
import { Bike, X } from 'lucide-react';

interface AssignMotoToDriverModalProps {
  driver: MotorizadoDriver | null;
  onClose: () => void;
  onAssigned: () => void;
}

export const AssignMotoToDriverModal: React.FC<AssignMotoToDriverModalProps> = ({
  driver,
  onClose,
  onAssigned,
}) => {
  const [plateNumber, setPlateNumber] = useState('');
  const [motoModel, setMotoModel] = useState('');
  const [initialKm, setInitialKm] = useState('');
  const [fuelType, setFuelType] = useState<'gasolina' | 'diesel'>('gasolina');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!driver) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const km = Number(initialKm.replace(/[^\d.]/g, ''));
    if (!plateNumber.trim() || !motoModel.trim() || !Number.isFinite(km) || km <= 0) {
      setError('Complete placa, modelo y kilometraje inicial válido.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await assignMotoToDriverWithSetup({
        driverId: driver.id,
        plateNumber: plateNumber.trim(),
        motoModel: motoModel.trim(),
        initialOdometerKm: km,
        fuelType,
      });
      onAssigned();
      onClose();
    } catch {
      setError('No se pudo vincular la moto. Verifique que la placa no esté en uso.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0A1020] border border-[#FF5722]/40 rounded-2xl max-w-md w-full p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bike className="w-5 h-5 text-[#FF5722]" />
            <div>
              <h3 className="text-sm font-bold text-white">Vincular moto de flota</h3>
              <p className="text-[10px] text-slate-400">{driver.fullName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          Registre la moto que entregará a este transportista. El kilometraje inicial queda como
          referencia para mantenimiento y combustible.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 text-xs">
          <label className="block">
            <span className="text-slate-500">Placa *</span>
            <input
              required
              className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono uppercase"
              placeholder="ABC-12D"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-slate-500">Modelo / marca *</span>
            <input
              required
              className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white"
              placeholder="Bajaj Boxer 125"
              value={motoModel}
              onChange={(e) => setMotoModel(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-slate-500">Kilometraje inicial (odómetro) *</span>
            <input
              required
              type="number"
              min={1}
              className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono"
              placeholder="45200"
              value={initialKm}
              onChange={(e) => setInitialKm(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-slate-500">Combustible</span>
            <select
              className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white"
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as 'gasolina' | 'diesel')}
            >
              <option value="gasolina">Gasolina</option>
              <option value="diesel">Diésel</option>
            </select>
          </label>

          {error && <p className="text-[10px] text-red-300">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#1a2744] text-slate-400"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-[#FF5722] text-white font-black"
            >
              {busy ? 'Vinculando…' : 'Vincular moto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

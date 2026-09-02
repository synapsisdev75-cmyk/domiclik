import React, { useMemo, useState } from 'react';
import { FleetSettings, FleetVehicleSpec, MotorizadoDriver } from '../../types';
import {
  assignDriverFleetVehicle,
  removeFleetVehicle,
  upsertFleetVehicle,
} from '../../lib/firebase';
import {
  kmPerLiterToKmPerGallon,
} from '../../lib/motoFuel';
import { Plus, Trash2, Car, Users } from 'lucide-react';

const DEFAULT_MAINT = {
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
};

function emptyForm() {
  return {
    label: '',
    matchKeywords: '',
    kmPerLiter: 40,
    fuelType: 'gasolina' as const,
    oilChangeKm: DEFAULT_MAINT.oilChangeKm,
    firstServiceKm: DEFAULT_MAINT.firstServiceKm,
    notes: '',
  };
}

interface FleetVehicleManagerProps {
  fleet: FleetSettings;
  drivers: MotorizadoDriver[];
}

export const FleetVehicleManager: React.FC<FleetVehicleManagerProps> = ({ fleet, drivers }) => {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const vehicles = useMemo(
    () => (fleet.customVehicles || []).filter((v) => v.active !== false),
    [fleet.customVehicles]
  );
  const approved = drivers.filter((d) => d.status === 'approved');

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const handleSaveVehicle = async () => {
    const label = form.label.trim();
    if (!label) {
      setMsg('Escribe el nombre del vehículo.');
      return;
    }
    const keywords = form.matchKeywords
      .split(/[,;]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    if (keywords.length === 0) {
      keywords.push(...label.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
    }
    setBusy(true);
    setMsg('');
    try {
      await upsertFleetVehicle({
        id: editingId || undefined,
        label,
        matchKeywords: keywords,
        kmPerLiter: Number(form.kmPerLiter) || 40,
        fuelType: form.fuelType,
        maintenance: {
          ...DEFAULT_MAINT,
          oilChangeKm: Number(form.oilChangeKm) || DEFAULT_MAINT.oilChangeKm,
          firstServiceKm: Number(form.firstServiceKm) || DEFAULT_MAINT.firstServiceKm,
          notes: form.notes.trim() || undefined,
        },
        active: true,
      });
      resetForm();
      setMsg(editingId ? 'Vehículo actualizado.' : 'Vehículo agregado a la flota.');
      setTimeout(() => setMsg(''), 2500);
    } catch {
      setMsg('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (v: FleetVehicleSpec) => {
    setEditingId(v.id);
    setForm({
      label: v.label,
      matchKeywords: (v.matchKeywords || []).join(', '),
      kmPerLiter: v.kmPerLiter,
      fuelType: v.fuelType,
      oilChangeKm: v.maintenance.oilChangeKm,
      firstServiceKm: v.maintenance.firstServiceKm,
      notes: v.notes || v.maintenance.notes || '',
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este vehículo de la flota? Los transportistas asignados quedarán sin perfil.')) {
      return;
    }
    setBusy(true);
    try {
      await removeFleetVehicle(id);
      if (editingId === id) resetForm();
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async (driverId: string, fleetVehicleId: string) => {
    const vehicle = vehicles.find((v) => v.id === fleetVehicleId);
    await assignDriverFleetVehicle(
      driverId,
      fleetVehicleId || null,
      vehicle?.label
    );
  };

  return (
    <div className="bg-[#0A1020] border border-emerald-500/25 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Car className="w-4 h-4 text-emerald-400" />
        <h4 className="text-xs font-bold text-white">Flota personalizada · nuevos vehículos</h4>
      </div>
      <p className="text-[10px] text-slate-400">
        Cuando cambien de moto o agreguen modelos, regístrelos aquí. El sistema calcula litros, galones,
        costo y mantenimiento automáticamente según el rendimiento (km/L) que indiques.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs sm:col-span-2">
          <span className="text-slate-500">Nombre del vehículo</span>
          <input
            className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white text-sm"
            placeholder="Ej. Honda Wave 110, Yamaha NMAX 155"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-slate-500">Palabras clave (opcional, separadas por coma)</span>
          <input
            className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white text-sm"
            placeholder="honda, wave, 110"
            value={form.matchKeywords}
            onChange={(e) => setForm({ ...form, matchKeywords: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="text-slate-500">Rendimiento (km/L)</span>
          <input
            type="number"
            step="0.1"
            className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono text-sm"
            value={form.kmPerLiter}
            onChange={(e) => setForm({ ...form, kmPerLiter: Number(e.target.value) })}
          />
          <span className="text-[10px] text-emerald-400 mt-0.5 block">
            ≈ {kmPerLiterToKmPerGallon(form.kmPerLiter || 0)} km/gal
          </span>
        </label>
        <label className="block text-xs">
          <span className="text-slate-500">Combustible</span>
          <select
            className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white text-sm"
            value={form.fuelType}
            onChange={(e) =>
              setForm({ ...form, fuelType: e.target.value as 'gasolina' | 'diesel' })
            }
          >
            <option value="gasolina">Gasolina</option>
            <option value="diesel">Diésel</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-slate-500">Cambio aceite (km)</span>
          <input
            type="number"
            className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono text-sm"
            value={form.oilChangeKm}
            onChange={(e) => setForm({ ...form, oilChangeKm: Number(e.target.value) })}
          />
        </label>
        <label className="block text-xs">
          <span className="text-slate-500">1.er servicio (km)</span>
          <input
            type="number"
            className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white font-mono text-sm"
            value={form.firstServiceKm}
            onChange={(e) => setForm({ ...form, firstServiceKm: Number(e.target.value) })}
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-slate-500">Notas (opcional)</span>
          <input
            className="mt-1 w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2 text-white text-sm"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSaveVehicle()}
          className="text-xs font-black px-4 py-2 rounded-xl bg-emerald-600 text-white flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          {editingId ? 'Actualizar vehículo' : 'Agregar a la flota'}
        </button>
        {editingId && (
          <button
            type="button"
            className="text-xs px-3 py-2 rounded-xl border border-[#1a2744] text-slate-400"
            onClick={resetForm}
          >
            Cancelar edición
          </button>
        )}
        {msg && <span className="text-[10px] text-emerald-300 self-center">{msg}</span>}
      </div>

      {vehicles.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] text-slate-500 font-tech uppercase">Vehículos registrados</div>
          {vehicles.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 bg-[#070B16] border border-[#162748] rounded-xl px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">{v.label}</div>
                  <div className="text-[10px] text-slate-400 font-tech">
                    {v.kmPerLiter} km/L · {kmPerLiterToKmPerGallon(v.kmPerLiter)} km/gal · aceite cada{' '}
                    {v.maintenance.oilChangeKm.toLocaleString('es-CO')} km
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Claves: {(v.matchKeywords || []).join(', ') || '—'}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded-lg border border-[#1a2744] text-slate-300"
                    onClick={() => handleEdit(v)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 text-red-300"
                    onClick={() => void handleDelete(v.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
          ))}
        </div>
      )}

      {approved.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#162748]">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-tech uppercase">
            <Users className="w-3.5 h-3.5" />
            Asignar vehículo por transportista
          </div>
          {approved.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#070B16] border border-[#162748] rounded-xl px-3 py-2"
            >
              <span className="text-white font-medium">{d.fullName}</span>
              <select
                className="bg-[#0A1020] border border-[#1a2744] rounded-lg px-2 py-1 text-white text-[11px] max-w-[200px]"
                value={d.fleetVehicleId || ''}
                onChange={(e) => void handleAssign(d.id, e.target.value)}
              >
                <option value="">Auto (catálogo / modelo)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

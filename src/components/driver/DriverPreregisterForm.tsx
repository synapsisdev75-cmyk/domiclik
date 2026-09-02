import React, { useState } from 'react';
import { createDriverPreregistration, uploadDriverPhoto } from '../../lib/firebase';
import { MotorizadoDriver } from '../../types';
import { VILLAVICENCIO_CENTER } from '../../data/villavicencio';
import { ShieldCheck, CheckCircle2, AlertCircle, Clock, Send, Upload, Camera } from 'lucide-react';

interface DriverPreregisterFormProps {
  onSubmittedSuccess: (driverId: string) => void;
  existingCandidateDriver?: MotorizadoDriver | null;
}

const DEFAULT_PHOTO =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200';

export const DriverPreregisterForm: React.FC<DriverPreregisterFormProps> = ({
  onSubmittedSuccess,
  existingCandidateDriver,
}) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    documentId: '',
    birthDate: '',
    licenseNumber: '',
    photoUrl: DEFAULT_PHOTO,
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(existingCandidateDriver?.id || null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Solo se permiten imágenes (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('La foto debe pesar menos de 5 MB.');
      return;
    }
    setUploadError(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUploadError(null);

    try {
      const tempId = 'drv_' + Date.now();
      let photoUrl = formData.photoUrl;

      if (photoFile) {
        try {
          photoUrl = await uploadDriverPhoto(photoFile, tempId);
        } catch (storageErr) {
          console.warn('Firebase Storage upload failed, using default photo', storageErr);
          setUploadError('No se pudo subir la foto a Storage; se usará la imagen por defecto.');
        }
      }

      const newId = await createDriverPreregistration(
        {
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          documentId: formData.documentId,
          birthDate: formData.birthDate,
          licenseNumber: formData.licenseNumber.trim(),
          photoUrl,
          location: {
            lat: VILLAVICENCIO_CENTER.lat + (Math.random() - 0.5) * 0.02,
            lng: VILLAVICENCIO_CENTER.lng + (Math.random() - 0.5) * 0.02,
            addressName: 'Villavicencio, Meta',
            neighborhood: 'Centro / Barzal',
            updatedAt: new Date().toISOString(),
          },
        },
        tempId
      );

      setSubmittedId(newId);
      onSubmittedSuccess(newId);
    } catch (err) {
      console.error(err);
      setUploadError('Error al enviar el prerregistro. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (submittedId || existingCandidateDriver) {
    const candidate = existingCandidateDriver || {
      fullName: formData.fullName || 'Candidato Motorizado',
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };

    return (
      <div className="max-w-xl mx-auto my-8 bg-[#161920] border border-[#2d3139] rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-3xl">
            🛵
          </div>

          <h3 className="text-xl font-bold text-white mb-1">Solicitud enviada a DomiClick</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Recibimos tu prerregistro. Un administrador revisará tus datos personales y te asignará la
            moto de flota cuando apruebe tu ingreso.
          </p>

          <div className="my-6 p-4 rounded-xl bg-[#11141a] border border-[#2d3139] text-left">
            <div className="flex items-center justify-between border-b border-[#2d3139] pb-3 mb-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
                  Estado de la solicitud
                </span>
                <span className="text-sm font-extrabold text-white">{candidate.fullName}</span>
              </div>

              {candidate.status === 'pending' && (
                <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 animate-pulse">
                  <Clock className="w-3.5 h-3.5" />
                  Pendiente de autorización
                </span>
              )}

              {candidate.status === 'approved' && (
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Aprobado
                </span>
              )}

              {candidate.status === 'rejected' && (
                <span className="bg-red-500/20 text-red-400 border border-red-500/40 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Rechazado
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">Licencia de conducción</span>
                <span className="font-medium text-slate-200">
                  {candidate.licenseNumber || formData.licenseNumber || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Moto de flota</span>
                <span className="font-medium text-slate-400">
                  {candidate.assignedMotoId || candidate.plateNumber
                    ? candidate.plateNumber || 'Asignada'
                    : 'La asigna el administrador'}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            No necesitas registrar placa ni modelo de moto. Eso lo configura el administrador al
            vincularte con un vehículo de la flota.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto my-6 bg-[#1E293B] border border-[#334155] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#0052FF] via-[#FF5722] to-[#0052FF]" />

      <div className="mb-6 border-b border-[#334155] pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="bg-[#0052FF]/20 text-[#3b82f6] border border-[#0052FF]/40 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase">
            PRERREGISTRO DOMICLICK
          </span>
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight">Registro de transportista</h2>
        <p className="text-xs text-slate-300 mt-1">
          Solo tus datos personales. La moto (placa, modelo y kilometraje inicial) la registra el
          administrador cuando te vincule a la flota.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Nombre completo *</label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Ej: Carlos Alberto Mendoza"
              className="w-full bg-[#11141a] border border-[#2d3139] rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] transition"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Fecha de nacimiento *</label>
            <input
              type="date"
              required
              value={formData.birthDate}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
              className="w-full bg-[#11141a] border border-[#2d3139] rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#f59e0b] transition"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Correo electrónico *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="carlos@ejemplo.com"
              className="w-full bg-[#11141a] border border-[#2d3139] rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] transition"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Teléfono / WhatsApp *</label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+57 312 458 9012"
              className="w-full bg-[#11141a] border border-[#2d3139] rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1">Cédula de ciudadanía *</label>
          <input
            type="text"
            required
            value={formData.documentId}
            onChange={(e) => setFormData({ ...formData, documentId: e.target.value })}
            placeholder="Ej: 1.121.890.342"
            className="w-full bg-[#11141a] border border-[#2d3139] rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] transition"
          />
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1">
            Nº licencia de conducción (A2) *
          </label>
          <input
            type="text"
            required
            value={formData.licenseNumber}
            onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
            placeholder="Ej: A2-9843210"
            className="w-full bg-[#11141a] border border-[#2d3139] rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] transition"
          />
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1">Foto del transportista *</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#11141a] border border-[#2d3139] flex items-center justify-center shrink-0">
              {photoPreview ? (
                <img src={photoPreview} alt="Vista previa" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-6 h-6 text-slate-500" />
              )}
            </div>
            <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 bg-[#11141a] border border-dashed border-[#2d3139] hover:border-[#f59e0b] rounded-xl px-3.5 py-3 text-slate-400 hover:text-[#f59e0b] transition">
              <Upload className="w-4 h-4" />
              <span>{photoFile ? photoFile.name : 'Subir foto (máx. 5 MB)'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </label>
          </div>
          {uploadError && <p className="mt-1.5 text-amber-400 text-[11px]">{uploadError}</p>}
        </div>

        <div className="p-3.5 rounded-xl bg-[#0f172a] border border-[#334155] text-[11px] flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#FF5722] shrink-0 mt-0.5" />
          <p className="text-slate-300">
            Al enviar, tu perfil queda en revisión. El administrador te asignará la moto de la flota
            con placa y kilometraje inicial cuando apruebe tu ingreso.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !photoFile}
          className="w-full bg-[#FF5722] hover:bg-[#e04818] disabled:opacity-50 text-white font-black py-3.5 px-6 rounded-xl text-sm transition shadow-xl shadow-[#FF5722]/20 flex items-center justify-center gap-2"
        >
          {loading ? 'Enviando…' : (
            <>
              <span>Enviar solicitud</span>
              <Send className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};

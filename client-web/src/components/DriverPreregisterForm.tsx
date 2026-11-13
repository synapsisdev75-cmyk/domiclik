import { useState } from 'react';
import { Camera, CheckCircle2, Clock, Loader2, Upload, UserRound } from 'lucide-react';
import type { User } from 'firebase/auth';
import { captureProfilePhoto } from '../lib/deliveryProof';
import {
  submitDriverPreregistration,
  type DriverProfile,
} from '../lib/driverCabin';
import type { CustomerProfile } from '../lib/firebase';

type Props = {
  user: User;
  profile: CustomerProfile | null;
  driver: DriverProfile | null;
  onSubmitted: () => void;
  onSignOut: () => void;
};

export function DriverPreregisterForm({ user, profile, driver, onSubmitted, onSignOut }: Props) {
  const [fullName, setFullName] = useState(driver?.fullName || profile?.displayName || '');
  const [phone, setPhone] = useState(driver?.phone || profile?.phone || '');
  const [documentId, setDocumentId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [preview, setPreview] = useState<string | null>(driver?.photoUrl || null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(source: 'camera' | 'photos') {
    setErr(null);
    try {
      const shot = await captureProfilePhoto(source);
      setPhotoFile(shot.file);
      setPreview(shot.dataUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo tomar la foto');
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photoFile) {
      setErr('Toma o elige tu foto para continuar.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await submitDriverPreregistration({
        uid: user.uid,
        fullName,
        email: user.email || profile?.email || '',
        phone,
        documentId,
        birthDate,
        licenseNumber,
        photoFile,
      });
      onSubmitted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo enviar el prerregistro');
    } finally {
      setBusy(false);
    }
  }

  if (driver?.status === 'pending') {
    return (
      <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
        <header className="mb-6 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            Cabina flota
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-white">Solicitud enviada</h1>
          <p className="mt-2 text-sm text-[var(--domi-muted)]">
            Central revisa tus datos. Esta pantalla se actualiza sola cuando te aprueben: verás
            felicitaciones y tu cabina se abre al instante.
          </p>
        </header>
        <div className="space-y-3 rounded-2xl border border-amber-400/40 bg-amber-950/40 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Clock className="h-4 w-4 animate-pulse text-amber-300" />
            Esperando autorización en vivo…
          </p>
          <p className="text-sm text-white">{driver.fullName}</p>
          <p className="text-xs text-[var(--domi-muted)]">{user.email}</p>
          {driver.photoUrl ? (
            <img
              src={driver.photoUrl}
              alt=""
              className="h-20 w-20 rounded-xl object-cover"
            />
          ) : null}
          <p className="text-[11px] leading-relaxed text-amber-100/80">
            Mantén la app abierta o con notificaciones activas. Te avisamos al instante con un
            mensaje de felicitaciones.
          </p>
        </div>
        <button
          type="button"
          className="mt-4 w-full rounded-xl border border-[var(--domi-border)] py-3 text-sm font-semibold text-[var(--domi-muted)]"
          onClick={onSignOut}
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-10 sm:px-6">
      <header className="mb-5 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
          Cabina flota
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-white">
          Registro de transportista
        </h1>
        <p className="mt-2 text-sm text-[var(--domi-muted)]">
          Cuenta lista ({user.email}). Completa tus datos y foto. Central te asigna la moto al
          aprobarte.
        </p>
      </header>

      {driver?.status === 'rejected' ? (
        <p className="mb-4 rounded-xl border border-red-400/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          Solicitud anterior rechazada{driver.rejectionReason ? `: ${driver.rejectionReason}` : '.'}{' '}
          Puedes enviarla de nuevo.
        </p>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--domi-muted)]">
            Nombre completo *
          </span>
          <input
            className="field-input"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--domi-muted)]">
            WhatsApp *
          </span>
          <input
            className="field-input"
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="312 000 0000"
            autoComplete="tel"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--domi-muted)]">
            Cédula *
          </span>
          <input
            className="field-input"
            required
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="Número de cédula"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--domi-muted)]">
            Fecha de nacimiento *
          </span>
          <input
            className="field-input"
            required
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--domi-muted)]">
            Licencia A2 *
          </span>
          <input
            className="field-input"
            required
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="Número de licencia"
          />
        </label>

        <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
          <p className="mb-2 text-[11px] font-semibold text-[var(--domi-muted)]">
            Foto del transportista *
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-[var(--domi-border)] bg-[#0a101c]">
              {preview ? (
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-7 w-7 text-[var(--domi-muted)]" />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--domi-border)] py-2 text-xs font-bold text-white"
                onClick={() => void pick('camera')}
              >
                <Camera className="h-4 w-4" /> Tomar foto
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--domi-border)] py-2 text-xs font-bold text-[var(--domi-cyan)]"
                onClick={() => void pick('photos')}
              >
                <Upload className="h-4 w-4" /> Elegir de galería
              </button>
            </div>
          </div>
        </div>

        {err ? <p className="text-xs text-amber-200">{err}</p> : null}

        <button type="submit" className="cta-primary w-full !py-3 text-sm" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {busy ? 'Enviando…' : 'Enviar solicitud a Central'}
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-[var(--domi-border)] py-3 text-sm font-semibold text-[var(--domi-muted)]"
          onClick={onSignOut}
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}

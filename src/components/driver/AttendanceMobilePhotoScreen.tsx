import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AttendancePunch, MotorizadoDriver } from '../../types';
import {
  connectFirestore,
  getAttendancePunch,
  subscribeAttendancePunch,
  updateAttendancePunchMobilePhotos,
  uploadOdometerPhoto,
  uploadPlatePhoto,
  fetchAllDrivers,
} from '../../lib/firebase';
import { Camera, CheckCircle2, Gauge, Bike, Smartphone } from 'lucide-react';
import { BrandLogo } from '../brand/BrandAssets';

export function isAttendanceMobilePhotoView(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('view') === 'kiosk-fotos';
}

export function attendanceMobilePhotoUrl(punchId: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('view', 'kiosk-fotos');
  url.searchParams.set('punch', punchId);
  return url.toString();
}

function punchTypeLabel(type: AttendancePunch['type']): string {
  return type === 'in' ? 'ENTRADA' : 'SALIDA';
}

export const AttendanceMobilePhotoScreen: React.FC = () => {
  const punchId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('punch') || ''
      : '';

  const [punch, setPunch] = useState<AttendancePunch | null>(null);
  const [driver, setDriver] = useState<MotorizadoDriver | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [odometerFile, setOdometerFile] = useState<File | null>(null);
  const [odometerPreview, setOdometerPreview] = useState<string | null>(null);
  const [plateFile, setPlateFile] = useState<File | null>(null);
  const [platePreview, setPlatePreview] = useState<string | null>(null);

  const plateRequired = punch?.type === 'in';

  useEffect(() => {
    document.title = 'DomiClick · Fotos moto';
    return () => {
      document.title = 'DomiClick Ops — Administración';
    };
  }, []);

  useEffect(() => {
    if (!punchId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      await connectFirestore();
      if (cancelled) return;
      unsub = subscribeAttendancePunch(punchId, setPunch);
      const initial = await getAttendancePunch(punchId);
      if (!cancelled) setPunch(initial);
      if (initial?.driverId) {
        const drivers = await fetchAllDrivers();
        if (!cancelled) {
          setDriver(drivers.find((d) => d.id === initial.driverId) || null);
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [punchId]);

  useEffect(() => {
    if (!punch?.driverId || driver) return;
    void fetchAllDrivers().then((list) => {
      setDriver(list.find((d) => d.id === punch.driverId) || null);
    });
  }, [punch?.driverId, driver]);

  const alreadyComplete = useMemo(
    () =>
      Boolean(
        punch?.odometerPhotoUrl &&
          (!plateRequired || punch?.platePhotoUrl) &&
          !punch?.mobilePhotosPending
      ),
    [punch, plateRequired]
  );

  const handleSubmit = async () => {
    if (!punch) return;
    setBusy(true);
    setMsg('');
    try {
      if (!odometerFile && !punch.odometerPhotoUrl) {
        throw new Error('Toma la foto del odómetro.');
      }
      if (plateRequired && !plateFile && !punch.platePhotoUrl) {
        throw new Error('En entrada debes fotografiar la placa de la moto.');
      }

      const odometerUrl = odometerFile
        ? await uploadOdometerPhoto(odometerFile, punch.driverId, punch.type)
        : punch.odometerPhotoUrl!;
      const plateUrl =
        plateFile && plateRequired
          ? await uploadPlatePhoto(plateFile, punch.driverId, punch.type)
          : punch.platePhotoUrl;

      await updateAttendancePunchMobilePhotos({
        punchId: punch.id,
        odometerPhotoUrl: odometerUrl,
        platePhotoUrl: plateUrl,
      });
      setDone(true);
      setMsg('Fotos enviadas correctamente. Ya puedes cerrar esta página.');
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'No se pudieron subir las fotos.');
    } finally {
      setBusy(false);
    }
  };

  if (!punchId) {
    return (
      <div className="min-h-screen bg-[#05080f] text-white flex items-center justify-center p-6">
        <p className="text-sm text-slate-400 text-center">Enlace inválido. Escanea el QR de la tablet.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05080f] text-white flex flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-[#2B6CFF] border-t-transparent animate-spin" />
        <p className="text-sm text-slate-400">Cargando marca…</p>
      </div>
    );
  }

  if (!punch) {
    return (
      <div className="min-h-screen bg-[#05080f] text-white flex items-center justify-center p-6">
        <p className="text-sm text-slate-400 text-center">Marca no encontrada o expirada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-dvh bg-[#05080f] text-[#e8eef9]">
      <header className="border-b border-[#1a2744] px-4 py-4 flex items-center gap-3">
        <BrandLogo variant="optimized" height={32} />
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#00E5FF]" />
            <h1 className="text-sm font-black text-white">Fotos de la moto</h1>
          </div>
          <p className="text-[11px] text-slate-500">Junto al vehículo · cámara trasera</p>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 sm:p-6 space-y-5">
        <div className="rounded-2xl border border-[#FF5722]/40 bg-[#0B101D] p-4 space-y-2">
          <p className="text-lg font-black text-white">{punch.driverName || 'Transportista'}</p>
          <p
            className={`text-xs font-bold inline-block px-2 py-1 rounded-lg ${
              punch.type === 'in'
                ? 'bg-[#00E676]/15 text-[#00E676]'
                : 'bg-[#FF5722]/15 text-[#FF5722]'
            }`}
          >
            {punchTypeLabel(punch.type)}
          </p>
          {punch.odometerKm != null && (
            <p className="text-sm text-slate-300 font-mono">
              Km registrado: {punch.odometerKm.toLocaleString('es-CO')}
            </p>
          )}
          {driver?.plateNumber && (
            <p className="text-xs text-[#FF5722] font-mono font-bold">
              Placa esperada: {driver.plateNumber}
            </p>
          )}
        </div>

        {(done || alreadyComplete) && (
          <div className="rounded-2xl border border-[#00E676]/40 bg-[#00E676]/10 p-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-[#00E676] mx-auto" />
            <p className="font-black text-[#00E676]">
              {done ? 'Fotos enviadas' : 'Esta marca ya tiene las fotos'}
            </p>
            {punch.odometerPhotoUrl && (
              <img
                src={punch.odometerPhotoUrl}
                alt="Odómetro"
                className="w-full max-h-40 object-cover rounded-xl border border-[#1a2744] mx-auto"
              />
            )}
            {punch.platePhotoUrl && (
              <img
                src={punch.platePhotoUrl}
                alt="Placa"
                className="w-full max-h-40 object-cover rounded-xl border border-[#1a2744] mx-auto"
              />
            )}
          </div>
        )}

        {!done && !alreadyComplete && (
          <div className="rounded-2xl border border-[#162748] bg-[#0B101D] p-5 space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
                <Gauge className="w-4 h-4" />
                Foto del odómetro *
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="w-full text-sm text-slate-300 file:mr-3 file:py-3 file:px-4 file:rounded-xl file:border-0 file:bg-[#FF5722] file:text-white file:text-sm file:font-black"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (odometerPreview) URL.revokeObjectURL(odometerPreview);
                  setOdometerFile(file);
                  setOdometerPreview(file ? URL.createObjectURL(file) : null);
                }}
              />
            </label>
            {odometerPreview && (
              <img
                src={odometerPreview}
                alt="Vista previa odómetro"
                className="w-full max-h-44 object-cover rounded-xl border border-[#1a2744]"
              />
            )}

            {plateRequired && (
              <>
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
                    <Bike className="w-4 h-4" />
                    Foto de la placa *
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="w-full text-sm text-slate-300 file:mr-3 file:py-3 file:px-4 file:rounded-xl file:border-0 file:bg-[#2B6CFF] file:text-white file:text-sm file:font-black"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (platePreview) URL.revokeObjectURL(platePreview);
                      setPlateFile(file);
                      setPlatePreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </label>
                {platePreview && (
                  <img
                    src={platePreview}
                    alt="Vista previa placa"
                    className="w-full max-h-44 object-cover rounded-xl border border-[#1a2744]"
                  />
                )}
              </>
            )}

            {!plateRequired && (
              <p className="text-[11px] text-slate-500">
                En salida solo se pide odómetro. La placa es obligatoria en entrada.
              </p>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubmit()}
              className="w-full py-4 rounded-2xl bg-[#00E676] text-black text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Camera className="w-5 h-5" />
              {busy ? 'Enviando…' : 'Enviar fotos'}
            </button>
          </div>
        )}

        {msg && (
          <p className="text-sm text-[#00E5FF] bg-[#0A1122] border border-[#1A2D52] rounded-xl px-4 py-3">
            {msg}
          </p>
        )}
      </main>
    </div>
  );
};

/** QR en canvas para mostrar en la tablet tras marcar asistencia. */
export function AttendancePunchQr({
  punchId,
  className = '',
}: {
  punchId: string;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = attendanceMobilePhotoUrl(punchId);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 240,
      margin: 2,
      color: { dark: '#ffffff', light: '#0B101D' },
    }).then((src) => {
      if (!cancelled) setDataUrl(src);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!dataUrl) {
    return (
      <div className={`w-[240px] h-[240px] bg-[#0B101D] rounded-xl animate-pulse ${className}`} />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR fotos moto"
      className={`w-[240px] h-[240px] rounded-xl border border-[#1a2744] ${className}`}
    />
  );
}

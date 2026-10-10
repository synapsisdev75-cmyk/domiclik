import React, { useEffect, useMemo, useState } from 'react';
import { AttendancePunch, MotorizadoDriver } from '../../types';
import {
  connectFirestore,
  recordAttendancePunch,
  revealDailyAttendancePin,
  subscribeAttendancePunches,
  subscribeDrivers,
  subscribeRealtimeStatus,
  RealtimeSyncMeta,
  uploadAttendanceFacePhoto,
  uploadOdometerPhoto,
  uploadPlatePhoto,
  verifyDailyAttendancePin,
} from '../../lib/firebase';
import {
  ATTENDANCE_PIN_RESET_HOUR,
  getAttendancePinDayKey,
} from '../../lib/attendance';
import { EXPECTED_SHIFT_HOURS, formatCOP } from '../../lib/adminMetrics';
import { parseOdometerKm, summarizeDriverShift } from '../../lib/workShift';
import { formatFuelFormulaSummary, formatGallons, formatLiters, formatFuelRateSummary } from '../../lib/motoFuel';
import {
  ArrowLeft,
  Bike,
  Camera,
  Fuel,
  Gauge,
  KeyRound,
  LogIn,
  LogOut,
  MonitorSmartphone,
  Search,
  Smartphone,
  Tablet,
  UserRound,
} from 'lucide-react';
import { BrandLogo } from '../brand/BrandAssets';
import {
  AttendancePunchQr,
  attendanceMobilePhotoUrl,
} from './AttendanceMobilePhotoScreen';
import { opsPublicUrl } from '../../lib/publicUrls';

export function isAttendanceKioskView(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'kiosk-asistencia' || params.get('kiosk') === 'asistencia';
}

/** Abre la terminal tablet multiusuario en pantalla completa. */
export function openAttendanceKioskWindow() {
  const url = new URL(opsPublicUrl('/', { view: 'kiosk-asistencia' }));
  const win = window.open(url.toString(), 'domiclick-kiosk-asistencia');
  win?.focus();
}

export function attendanceKioskUrl(): string {
  return opsPublicUrl('/', { view: 'kiosk-asistencia' });
}

type KioskStep = 'pick' | 'face' | 'punch' | 'salida' | 'done';

export const AttendanceKioskScreen: React.FC = () => {
  const [drivers, setDrivers] = useState<MotorizadoDriver[]>([]);
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const [realtimeMeta, setRealtimeMeta] = useState<RealtimeSyncMeta | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MotorizadoDriver | null>(null);
  const [step, setStep] = useState<KioskStep>('pick');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [facePhotoUrl, setFacePhotoUrl] = useState<string | null>(null);
  const [pinDayKey, setPinDayKey] = useState('');
  const [typedPin, setTypedPin] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [odometerFile, setOdometerFile] = useState<File | null>(null);
  const [odometerPreview, setOdometerPreview] = useState<string | null>(null);
  const [plateFile, setPlateFile] = useState<File | null>(null);
  const [platePreview, setPlatePreview] = useState<string | null>(null);
  const [lastPunchId, setLastPunchId] = useState<string | null>(null);
  const [lastPunchType, setLastPunchType] = useState<'in' | 'out' | null>(null);
  const [lastPunchFuel, setLastPunchFuel] = useState<AttendancePunch | null>(null);
  const [now, setNow] = useState(() => new Date());

  const calendarToday = now.toISOString().split('T')[0];
  const activePinDay = getAttendancePinDayKey(now);

  useEffect(() => {
    document.title = 'DomiClick · Terminal asistencia';
    return () => {
      document.title = 'DomiClick Ops — Administración';
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    return subscribeRealtimeStatus(setRealtimeMeta);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubDrivers: (() => void) | undefined;

    (async () => {
      await connectFirestore();
      if (cancelled) return;
      unsubDrivers = subscribeDrivers(setDrivers);
    })();

    return () => {
      cancelled = true;
      unsubDrivers?.();
    };
  }, []);

  useEffect(() => {
    return subscribeAttendancePunches(setPunches, calendarToday);
  }, [calendarToday]);

  const approved = useMemo(
    () =>
      drivers
        .filter((d) => d.status === 'approved' && !d.suspended)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [drivers]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return approved;
    return approved.filter(
      (d) =>
        d.fullName.toLowerCase().includes(q) ||
        d.plateNumber?.toLowerCase().includes(q) ||
        d.phone.includes(q)
    );
  }, [approved, query]);

  const selectedPunches = useMemo(
    () => (selected ? punches.filter((p) => p.driverId === selected.id) : []),
    [punches, selected]
  );

  const todayShift = useMemo(
    () =>
      selected
        ? summarizeDriverShift(selectedPunches, selected.id, selected.fullName, calendarToday)
        : null,
    [selected, selectedPunches, calendarToday]
  );

  const clearPreviews = () => {
    if (facePreview) URL.revokeObjectURL(facePreview);
    if (odometerPreview) URL.revokeObjectURL(odometerPreview);
    if (platePreview) URL.revokeObjectURL(platePreview);
  };

  const resetSession = () => {
    clearPreviews();
    setFaceFile(null);
    setFacePreview(null);
    setFacePhotoUrl(null);
    setRevealedPin(null);
    setPinDayKey('');
    setTypedPin('');
    setOdometerKm('');
    setOdometerFile(null);
    setOdometerPreview(null);
    setPlateFile(null);
    setPlatePreview(null);
    setLastPunchId(null);
    setLastPunchType(null);
    setLastPunchFuel(null);
    setMsg('');
  };

  const goBack = () => {
    resetSession();
    setSelected(null);
    setStep('pick');
  };

  const pickDriver = (driver: MotorizadoDriver) => {
    const shift = summarizeDriverShift(
      punches.filter((p) => p.driverId === driver.id),
      driver.id,
      driver.fullName,
      calendarToday,
    );
    resetSession();
    setSelected(driver);
    setStep(shift.open ? 'salida' : 'face');
  };

  const handleRevealPin = async () => {
    if (!selected) return;
    setBusy(true);
    setMsg('');
    try {
      if (!faceFile) throw new Error('Sin foto de rostro no se revela el PIN.');
      const url = await uploadAttendanceFacePhoto(faceFile, selected.id);
      const pinDoc = await revealDailyAttendancePin({
        driverId: selected.id,
        driverName: selected.fullName,
        facePhotoUrl: url,
        now,
      });
      setFacePhotoUrl(url);
      setRevealedPin(pinDoc.pin);
      setPinDayKey(pinDoc.pinDayKey);
      setStep('punch');
      setMsg('PIN revelado. Anota el km y digita el PIN. Las fotos del odómetro y placa van por celular.');
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'No se pudo revelar el PIN.');
    } finally {
      setBusy(false);
    }
  };

  const handlePunch = async (type: 'in' | 'out') => {
    if (!selected || !revealedPin || !facePhotoUrl) return;
    setBusy(true);
    setMsg('');
    try {
      const km = parseOdometerKm(odometerKm);
      if (km == null) throw new Error('Anota el kilometraje del tablero.');
      if (!typedPin.trim()) throw new Error('Digita el PIN que se te reveló.');

      const lastPunchKm = selectedPunches
        .map((p) => Number(p.odometerKm))
        .filter((n) => Number.isFinite(n) && n > 0)
        .reduce((max, n) => Math.max(max, n), 0);
      const lastKm = lastPunchKm || Number(selected.lastOdometerKm) || 0;
      if (lastKm > 0 && km < lastKm) {
        throw new Error(
          `Km debe ser ≥ ${lastKm.toLocaleString('es-CO')}. Último registro del turno.`
        );
      }

      const pinDoc = await verifyDailyAttendancePin(selected.id, typedPin, now);
      const entryKm =
        type === 'out'
          ? selectedPunches.find((p) => p.type === 'in')?.odometerKm ?? todayShift?.kmIn
          : undefined;
      const punch = await recordAttendancePunch({
        driverId: selected.id,
        driverName: selected.fullName,
        type,
        credentialId: pinDoc.pin,
        method: 'pin_kiosk',
        odometerKm: km,
        facePhotoUrl,
        pinDayKey: pinDoc.pinDayKey,
        mobilePhotosPending: true,
        entryOdometerKm: entryKm,
        motoModel: selected.motoModel,
        motoKmPerGallon: selected.motoKmPerGallon,
      });

      setLastPunchId(punch.id);
      setLastPunchType(type);
      setLastPunchFuel(type === 'out' ? punch : null);
      setMsg(
        type === 'in'
          ? `Entrada registrada · ${km.toLocaleString('es-CO')} km`
          : punch.shiftKmDriven != null
            ? `Salida · ${punch.shiftKmDriven.toLocaleString('es-CO')} km · ${formatLiters(punch.shiftLiters || 0)} L · ${formatGallons(punch.shiftGallons || 0)} gal · ${formatCOP(punch.shiftFuelCostCop || 0)}`
            : `Salida registrada · ${km.toLocaleString('es-CO')} km`
      );
      setStep('done');
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'No se pudo marcar asistencia.');
    } finally {
      setBusy(false);
    }
  };

  const handleSalida = async () => {
    if (!selected) return;
    setBusy(true);
    setMsg('');
    try {
      if (!odometerFile) throw new Error('Toma la foto del tacómetro.');
      if (!plateFile) throw new Error('Toma la foto de la placa.');
      if (!faceFile) throw new Error('Toma tu foto de salida.');
      const km = parseOdometerKm(odometerKm);
      if (km == null) throw new Error('Anota el kilometraje del tablero.');
      if (!typedPin.trim()) throw new Error('Digita el PIN del día.');

      const lastPunchKm = selectedPunches
        .map((p) => Number(p.odometerKm))
        .filter((n) => Number.isFinite(n) && n > 0)
        .reduce((max, n) => Math.max(max, n), 0);
      const lastKm = lastPunchKm || Number(selected.lastOdometerKm) || 0;
      if (lastKm > 0 && km < lastKm) {
        throw new Error(
          `Km debe ser ≥ ${lastKm.toLocaleString('es-CO')}. Último registro del turno.`,
        );
      }

      const pinDoc = await verifyDailyAttendancePin(selected.id, typedPin, now);
      const [faceUrl, odometerUrl, plateUrl] = await Promise.all([
        uploadAttendanceFacePhoto(faceFile, selected.id),
        uploadOdometerPhoto(odometerFile, selected.id, 'out'),
        uploadPlatePhoto(plateFile, selected.id, 'out'),
      ]);
      const entryKm =
        selectedPunches.find((p) => p.type === 'in')?.odometerKm ?? todayShift?.kmIn;
      const punch = await recordAttendancePunch({
        driverId: selected.id,
        driverName: selected.fullName,
        type: 'out',
        credentialId: pinDoc.pin,
        method: 'pin_kiosk',
        odometerKm: km,
        odometerPhotoUrl: odometerUrl,
        platePhotoUrl: plateUrl,
        facePhotoUrl: faceUrl,
        pinDayKey: pinDoc.pinDayKey,
        mobilePhotosPending: false,
        entryOdometerKm: entryKm,
        motoModel: selected.motoModel,
        motoKmPerGallon: selected.motoKmPerGallon,
      });
      setFacePhotoUrl(faceUrl);
      setLastPunchId(punch.id);
      setLastPunchType('out');
      setLastPunchFuel(punch);
      setMsg(
        punch.shiftKmDriven != null
          ? `Salida · ${km.toLocaleString('es-CO')} km · ${punch.shiftKmDriven.toLocaleString('es-CO')} km recorridos`
          : `Salida registrada · ${km.toLocaleString('es-CO')} km`,
      );
      setStep('done');
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'No se pudo marcar la salida.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-[#05080f] text-[#e8eef9] flex flex-col">
      <header className="shrink-0 border-b border-[#1a2744] bg-[#0B101D]/95 backdrop-blur px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo variant="optimized" height={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Tablet className="w-4 h-4 text-[#00E5FF] shrink-0" />
              <h1 className="text-sm sm:text-base font-black text-white truncate">
                Terminal sede · PIN diario
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              Entrada: rostro + PIN + km · Salida: tacómetro, placa, foto y km
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg sm:text-2xl font-black text-white font-mono tabular-nums">
            {now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[10px] text-slate-500 font-tech">
            {realtimeMeta?.live ? 'EN VIVO' : 'CONECTANDO…'} · PIN rota{' '}
            {ATTENDANCE_PIN_RESET_HOUR.toString().padStart(2, '0')}:00 · {activePinDay}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {step === 'pick' && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="rounded-2xl border border-[#1a2744] bg-[#0B101D] px-4 py-3 text-xs text-slate-400">
              El PIN cambia solo cada día a la{' '}
              <span className="text-white font-bold">
                {ATTENDANCE_PIN_RESET_HOUR.toString().padStart(2, '0')}:00
              </span>
              . Sin foto de rostro en sede, el sistema no muestra el PIN. Las fotos del odómetro y
              placa se toman con el celular escaneando el QR.
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o placa…"
                className="w-full bg-[#0B101D] border border-[#1a2744] rounded-2xl pl-10 pr-4 py-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00E5FF]/50"
              />
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-slate-500 py-16 border border-dashed border-[#1a2744] rounded-2xl">
                No hay transportistas aprobados{query ? ' con ese filtro' : ''}.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {filtered.map((driver) => {
                  const shift = summarizeDriverShift(
                    punches.filter((p) => p.driverId === driver.id),
                    driver.id,
                    driver.fullName,
                    calendarToday
                  );
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => pickDriver(driver)}
                      className="text-left rounded-2xl border border-[#1a2744] bg-[#0B101D] p-4 sm:p-5 hover:border-[#00E5FF]/50 hover:bg-[#0d1424] active:scale-[0.98] transition min-h-[140px] flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={driver.photoUrl}
                          alt=""
                          className="w-14 h-14 rounded-xl object-cover border-2 border-[#FF5722]/60 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-white text-sm sm:text-base truncate">
                            {driver.fullName}
                          </div>
                          <div className="text-[11px] text-[#FF5722] font-mono font-bold">
                            {driver.plateNumber || 'Sin placa'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto">
                        <span
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                            shift.open
                              ? 'text-amber-300 border-amber-500/40'
                              : shift.inAt
                                ? 'text-slate-400 border-slate-600/40'
                                : 'text-slate-500 border-slate-700/40'
                          }`}
                        >
                          {shift.open ? 'EN TURNO' : shift.inAt ? 'CERRADO' : 'SIN MARCA'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <p className="text-center text-[11px] text-slate-600 flex items-center justify-center gap-1.5">
              <MonitorSmartphone className="w-3.5 h-3.5" />
              Tablet fija en sede · fotos de moto por celular (QR).
            </p>
          </div>
        )}

        {(step === 'face' || step === 'punch' || step === 'salida' || step === 'done') && selected && (
          <div className="max-w-lg mx-auto space-y-5">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a la lista
            </button>

            <div className="rounded-2xl border border-[#FF5722]/40 bg-[#0B101D] p-5 flex items-center gap-4">
              <img
                src={selected.photoUrl}
                alt=""
                className="w-20 h-20 rounded-2xl object-cover border-2 border-[#FF5722]"
              />
              <div>
                <h2 className="text-xl font-black text-white">{selected.fullName}</h2>
                <p className="text-sm text-[#FF5722] font-mono font-bold">
                  {selected.plateNumber || 'Sin placa asignada'}
                </p>
                {todayShift && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Hoy: {todayShift.hoursWorked.toFixed(2)} h / {EXPECTED_SHIFT_HOURS} h
                    {todayShift.kmDriven > 0
                      ? ` · ${todayShift.kmDriven.toLocaleString('es-CO')} km`
                      : ''}
                  </p>
                )}
              </div>
            </div>

            {step === 'done' && lastPunchId ? (
              <div className="rounded-2xl border border-[#00E676]/40 bg-[#00E676]/10 p-6 space-y-4 text-center">
                <div className="text-4xl text-[#00E676]">✓</div>
                <p className="text-lg font-black text-[#00E676]">{msg}</p>
                {lastPunchFuel?.shiftKmDriven != null && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                      <Fuel className="w-4 h-4" />
                      Resumen del turno
                    </div>
                    <p className="text-[11px] text-slate-300 font-mono">
                      Recorrido: {lastPunchFuel.shiftKmDriven.toLocaleString('es-CO')} km
                    </p>
                    <p className="text-[11px] text-amber-300 font-mono">
                      Combustible: {formatLiters(lastPunchFuel.shiftLiters || 0)} L ·{' '}
                      {formatGallons(lastPunchFuel.shiftGallons || 0)} gal ·{' '}
                      {formatCOP(lastPunchFuel.shiftFuelCostCop || 0)}
                    </p>
                    {lastPunchFuel.litersPerKmUsed != null && (
                      <p className="text-[10px] text-slate-500">
                        {lastPunchFuel.litersPerKmUsed} L/km · {formatCOP(lastPunchFuel.copPerKmUsed || 0)}/km
                        {lastPunchFuel.kmPerLiterUsed != null && ` · ${lastPunchFuel.kmPerLiterUsed} km/L`}
                      </p>
                    )}
                    {lastPunchFuel.kmPerGallonUsed != null && (
                      <p className="text-[10px] text-slate-500">
                        {formatFuelFormulaSummary({
                          kmIn: todayShift?.kmIn || 0,
                          kmOut: Number(lastPunchFuel.odometerKm) || 0,
                          kmDriven: lastPunchFuel.shiftKmDriven,
                          kmPerGallon: lastPunchFuel.kmPerGallonUsed,
                          gallonsUsed: lastPunchFuel.shiftGallons || 0,
                          fuelPricePerGallonCop: lastPunchFuel.fuelPricePerGallonUsed || 16500,
                          fuelCostCop: lastPunchFuel.shiftFuelCostCop || 0,
                          fuelType: 'gasolina',
                          motoModelLabel: selected.motoModel,
                        })}
                      </p>
                    )}
                  </div>
                )}
                {lastPunchType === 'out' ? (
                  <div className="grid grid-cols-1 gap-3 text-left">
                    {odometerPreview ? (
                      <figure>
                        <figcaption className="mb-1 text-[10px] font-bold uppercase text-slate-400">
                          Tacómetro · {odometerKm} km
                        </figcaption>
                        <img src={odometerPreview} alt="Tacómetro" className="max-h-40 w-full rounded-xl object-cover" />
                      </figure>
                    ) : null}
                    {platePreview ? (
                      <figure>
                        <figcaption className="mb-1 text-[10px] font-bold uppercase text-slate-400">Placa</figcaption>
                        <img src={platePreview} alt="Placa" className="max-h-40 w-full rounded-xl object-cover" />
                      </figure>
                    ) : null}
                    {facePreview ? (
                      <figure>
                        <figcaption className="mb-1 text-[10px] font-bold uppercase text-slate-400">Foto de salida</figcaption>
                        <img src={facePreview} alt="Foto de salida" className="max-h-40 w-full rounded-xl object-cover" />
                      </figure>
                    ) : null}
                  </div>
                ) : null}
                {lastPunchType === 'in' ? (
                <div className="rounded-xl border border-[#1a2744] bg-[#0B101D] p-4 space-y-3">
                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-white">
                    <Smartphone className="w-4 h-4 text-[#00E5FF]" />
                    Escanea con tu celular junto a la moto
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Sube foto del odómetro y de la placa.
                  </p>
                  <div className="flex justify-center">
                    <AttendancePunchQr punchId={lastPunchId} />
                  </div>
                  <p className="text-[10px] text-slate-500 break-all">{attendanceMobilePhotoUrl(lastPunchId)}</p>
                </div>
                ) : null}
                <button
                  type="button"
                  onClick={goBack}
                  className="w-full py-3 rounded-xl bg-[#2B6CFF] text-white text-sm font-black"
                >
                  Siguiente transportista
                </button>
              </div>
            ) : step === 'salida' ? (
              <div className="rounded-2xl border border-[#FF5722]/40 bg-[#0B101D] p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <LogOut className="w-5 h-5 text-[#FF5722]" />
                  <h3 className="text-sm font-black text-white uppercase">Salida en la tablet</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Al revés de la entrada: aquí se ven el tacómetro, la placa, tu foto de salida y los kilómetros.
                </p>
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
                    <Gauge className="w-4 h-4" /> Foto del tacómetro *
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="w-full text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-[#FF5722] file:px-4 file:py-3 file:text-sm file:font-black file:text-white"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (odometerPreview) URL.revokeObjectURL(odometerPreview);
                      setOdometerFile(file);
                      setOdometerPreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </label>
                {odometerPreview ? (
                  <img src={odometerPreview} alt="Tacómetro" className="max-h-44 w-full rounded-xl object-cover" />
                ) : null}
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
                    <Bike className="w-4 h-4" /> Foto de la placa *
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="w-full text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-[#2B6CFF] file:px-4 file:py-3 file:text-sm file:font-black file:text-white"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (platePreview) URL.revokeObjectURL(platePreview);
                      setPlateFile(file);
                      setPlatePreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </label>
                {platePreview ? (
                  <img src={platePreview} alt="Placa" className="max-h-44 w-full rounded-xl object-cover" />
                ) : null}
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
                    <Camera className="w-4 h-4" /> Tu foto de salida *
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="w-full text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-[#00E5FF] file:px-4 file:py-3 file:text-sm file:font-black file:text-black"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (facePreview) URL.revokeObjectURL(facePreview);
                      setFaceFile(file);
                      setFacePreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </label>
                {facePreview ? (
                  <img src={facePreview} alt="Foto de salida" className="max-h-44 w-full rounded-xl object-cover" />
                ) : null}
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
                    <Gauge className="w-4 h-4" /> Kilometraje del tablero *
                  </span>
                  <input
                    className="w-full rounded-xl border border-[#1a2744] bg-[#070B16] px-4 py-4 font-mono text-lg text-white"
                    inputMode="numeric"
                    value={odometerKm}
                    onChange={(e) => setOdometerKm(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder={
                      todayShift?.kmIn
                        ? `≥ ${todayShift.kmIn.toLocaleString('es-CO')}`
                        : 'Ej. 45280'
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
                    <KeyRound className="w-4 h-4" /> PIN del día
                  </span>
                  <input
                    className="w-full rounded-xl border border-[#1a2744] bg-[#070B16] px-4 py-4 text-center font-mono text-2xl tracking-[0.35em] text-white"
                    inputMode="numeric"
                    maxLength={6}
                    value={typedPin}
                    onChange={(e) => setTypedPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSalida()}
                  className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#FF5722] py-4 text-sm font-black text-white disabled:opacity-50"
                >
                  <LogOut className="w-5 h-5" />
                  {busy ? 'Guardando salida…' : 'Marcar salida'}
                </button>
              </div>
            ) : step === 'face' ? (
              <div className="rounded-2xl border border-[#162748] bg-[#0B101D] p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <UserRound className="w-5 h-5 text-[#00E5FF]" />
                  <h3 className="text-sm font-black text-white uppercase">
                    Foto de llegada a sede
                  </h3>
                </div>
                <p className="text-xs text-slate-400">
                  Tómate una foto de rostro clara.{' '}
                  <strong className="text-white">Sin esta foto no se revela el PIN</strong> del día.
                </p>
                <label className="block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                    <Camera className="w-4 h-4" />
                    Cámara frontal
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="w-full text-sm text-slate-300 file:mr-3 file:py-3 file:px-4 file:rounded-xl file:border-0 file:bg-[#2B6CFF] file:text-white file:text-sm file:font-black"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (facePreview) URL.revokeObjectURL(facePreview);
                      setFaceFile(file);
                      setFacePreview(file ? URL.createObjectURL(file) : null);
                      setMsg('');
                    }}
                  />
                </label>
                {facePreview && (
                  <img
                    src={facePreview}
                    alt="Vista previa rostro"
                    className="w-full max-h-56 object-cover rounded-xl border border-[#1a2744]"
                  />
                )}
                <button
                  type="button"
                  disabled={busy || !faceFile}
                  onClick={() => void handleRevealPin()}
                  className="w-full py-4 rounded-2xl bg-[#2B6CFF] text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px]"
                >
                  <KeyRound className="w-5 h-5" />
                  {busy ? 'Subiendo foto…' : 'Revelar PIN del día'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#00E5FF]/40 bg-[#00E5FF]/10 p-5 text-center space-y-2">
                  <p className="text-[11px] text-[#00E5FF] font-bold uppercase tracking-wide">
                    Tu PIN de hoy (rota {ATTENDANCE_PIN_RESET_HOUR.toString().padStart(2, '0')}:00)
                  </p>
                  <p className="text-4xl sm:text-5xl font-black text-white font-mono tracking-[0.35em]">
                    {revealedPin}
                  </p>
                  <p className="text-[10px] text-slate-400">Jornada PIN · {pinDayKey || activePinDay}</p>
                </div>

                <div className="rounded-2xl border border-[#162748] bg-[#0B101D] p-5 space-y-4">
                  <p className="text-[11px] text-slate-500">
                    Anota el km leyendo el tablero. Después de marcar, escanea el QR con tu celular
                    para fotografiar odómetro (entrada: también placa).
                  </p>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                      <Gauge className="w-4 h-4" />
                      Kilometraje del tablero
                    </span>
                    <input
                      className="w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-4 py-4 text-lg text-white font-mono"
                      inputMode="numeric"
                      value={odometerKm}
                      onChange={(e) => setOdometerKm(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder={
                        todayShift?.kmIn || selected.lastOdometerKm
                          ? `≥ ${(todayShift?.kmOut || todayShift?.kmIn || selected.lastOdometerKm)?.toLocaleString('es-CO')}`
                          : 'Ej. 45280'
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                      <KeyRound className="w-4 h-4" />
                      Digita el PIN revelado
                    </span>
                    <input
                      className="w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-4 py-4 text-2xl text-white font-mono tracking-[0.35em] text-center"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={typedPin}
                      onChange={(e) => setTypedPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handlePunch('in')}
                    className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#00E676]/50 bg-[#00E676]/15 py-4 text-sm font-black text-[#00E676] disabled:opacity-50"
                  >
                    <LogIn className="w-5 h-5" /> Marcar entrada
                  </button>
                  <p className="text-center text-[11px] text-slate-500">
                    La salida, si el turno está abierto, pide tacómetro, placa, tu foto y los km en esta tablet.
                  </p>
                </div>
              </div>
            )}

            {msg && step !== 'done' && (
              <p className="text-sm text-[#00E5FF] bg-[#0A1122] border border-[#1A2D52] rounded-xl px-4 py-3">
                {msg}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

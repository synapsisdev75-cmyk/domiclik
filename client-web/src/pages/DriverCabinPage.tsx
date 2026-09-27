import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyRound,
  Tablet,
  Bike,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MapPin,
  Navigation,
  Package,
  QrCode,
  RefreshCw,
  ScanLine,
  UserRound,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../lib/auth';
import { isNativeApp } from '../lib/appNav';
import { opsTowerUrl } from '../lib/config';
import {
  buildGoogleMapsAbRouteUrl,
  buildGoogleMapsNavigateToUrl,
  openGoogleMapsNav,
} from '../lib/googleMapsNav';
import {
  DRIVER_NEXT_STATUS,
  DRIVER_STATUS_LABEL,
  advanceDriverOrderStatus,
  confirmDeliveryWithPin,
  findApprovedDriverByEmail,
  findOrderForScan,
  listDriverOrders,
  parseAttendancePhotoUrl,
  summarizeDriverDay,
  type DriverOrder,
  type DriverProfile,
} from '../lib/driverCabin';

type TabId = 'hoy' | 'escanear' | 'asistencia';

const PICKUP_STATUSES = new Set(['assigned', 'accepted', 'en_route_origin', 'at_origin']);

function goingToPickup(status: string): boolean {
  return PICKUP_STATUSES.has(status);
}

function openExternalUrl(url: string) {
  if (typeof window === 'undefined') return;
  window.location.assign(url);
}

function goToOps(role: 'driver' | 'pending_driver', google = false) {
  const url = new URL(opsTowerUrl());
  url.searchParams.set('role', role);
  if (google) url.searchParams.set('google', '1');
  window.location.assign(url.toString());
}

export function DriverCabinPage() {
  const { user, profile, loading: authLoading, signIn, error: authError, clearError } = useAuth();
  const native = isNativeApp() || Capacitor.isNativePlatform();
  const [tab, setTab] = useState<TabId>('hoy');
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Escaneo
  const [scanCode, setScanCode] = useState('');
  const [scanned, setScanned] = useState<DriverOrder | null>(null);
  const [pin, setPin] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanningCam, setScanningCam] = useState(false);

  const day = useMemo(() => summarizeDriverDay(orders), [orders]);

  const refresh = useCallback(async () => {
    const email = user?.email || profile?.email || '';
    if (!email) {
      setDriver(null);
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const d = await findApprovedDriverByEmail(email);
      setDriver(d);
      if (d?.status === 'approved') {
        const rows = await listDriverOrders(d.id);
        setOrders(rows);
      } else {
        setOrders([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo cargar la cabina');
    } finally {
      setLoading(false);
    }
  }, [user?.email, profile?.email]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function onAdvance(order: DriverOrder) {
    if (!driver) return;
    const next = DRIVER_NEXT_STATUS[order.status];
    if (!next) {
      setTab('escanear');
      setScanned(order);
      setScanCode(order.trackingCode);
      return;
    }
    setBusy(true);
    try {
      await advanceDriverOrderStatus(order.id, next, driver.id, driver.fullName);
      setMsg(`Pedido ${order.trackingCode} → ${DRIVER_STATUS_LABEL[next] || next}`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  }

  async function lookupScan(code = scanCode) {
    const q = code.trim();
    if (q.length < 4) {
      setErr('Escribe o escanea un código DMC, o el QR de la tablet.');
      return;
    }

    const attendanceUrl = parseAttendancePhotoUrl(q);
    if (attendanceUrl) {
      setMsg('Abriendo fotos de asistencia (odómetro / placa)…');
      openExternalUrl(attendanceUrl);
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const order = await findOrderForScan(q);
      if (!order) {
        setScanned(null);
        setErr(
          'No encontramos ese pedido. Si es el QR de la tablet, usa la cámara del teléfono o pega el enlace completo.',
        );
        return;
      }
      if (driver && order.assignedDriverId && order.assignedDriverId !== driver.id) {
        setErr('Este pedido está asignado a otro transportista');
      }
      setScanned(order);
      setMsg(`Pedido ${order.trackingCode} · ${DRIVER_STATUS_LABEL[order.status] || order.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al buscar');
    } finally {
      setBusy(false);
    }
  }

  async function submitPin() {
    if (!scanned) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await confirmDeliveryWithPin(scanned.id, pin);
      if (res.ok === false) {
        setErr(res.error);
        return;
      }
      setMsg(`Entrega confirmada · ${scanned.trackingCode}`);
      setPin('');
      setScanned(null);
      setScanCode('');
      await refresh();
      setTab('hoy');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo confirmar');
    } finally {
      setBusy(false);
    }
  }

  async function startCameraScan() {
    setErr(null);
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      setErr(
        'Este teléfono no soporta escaneo en la app. Usa la cámara del sistema sobre el QR de la tablet, o pega el enlace aquí.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setScanningCam(true);
      await new Promise((r) => setTimeout(r, 80));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      type BarcodeDetectorLike = {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
      };
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector: new (opts: { formats: string[] }) => BarcodeDetectorLike;
        }
      ).BarcodeDetector;
      const detector = new BarcodeDetectorCtor({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13'],
      });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes?.[0]?.rawValue;
          if (raw) {
            stopCameraScan();
            setScanCode(String(raw));
            await lookupScan(String(raw));
            return;
          }
        } catch {
          /* keep scanning */
        }
        if (streamRef.current) requestAnimationFrame(() => void tick());
      };
      requestAnimationFrame(() => void tick());
    } catch {
      setErr('No se pudo abrir la cámara. Revisa permisos.');
      stopCameraScan();
    }
  }

  function stopCameraScan() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanningCam(false);
  }

  if (authLoading || loading) {
    return (
      <div className="app-screen mx-auto flex min-h-[100svh] max-w-lg items-center justify-center px-4">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--domi-cyan)]" />
      </div>
    );
  }

  // Sin sesión
  if (!user) {
    return (
      <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
        <header className="mb-6 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            Cabina flota
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-white">Transportistas</h1>
          <p className="mt-2 text-sm text-[var(--domi-muted)]">
            Inicia sesión con la cuenta Google aprobada por Central para ver pedidos del día,
            escanear y marcar asistencia.
          </p>
        </header>
        <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-5">
          <button
            type="button"
            className="cta-primary w-full"
            disabled={busy}
            onClick={async () => {
              clearError();
              setBusy(true);
              try {
                await signIn();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar con Google
          </button>
          {authError ? <p className="mt-3 text-xs text-amber-200">{authError}</p> : null}
          {!native ? (
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-[var(--domi-border)] px-4 py-3 text-sm font-semibold text-[var(--domi-cyan)]"
              onClick={() => goToOps('driver', true)}
            >
              Abrir cabina web (ops)
            </button>
          ) : null}
          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-[var(--domi-border)] px-4 py-3 text-sm font-semibold text-[var(--domi-orange)]"
            onClick={() => goToOps('pending_driver')}
          >
            Pre-registro a la flota
          </button>
        </div>
      </div>
    );
  }

  // Sesión pero no transportista aprobado
  if (!driver || driver.status !== 'approved') {
    return (
      <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
        <header className="mb-6 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            Cabina flota
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-white">Sin acceso aún</h1>
          <p className="mt-2 text-sm text-[var(--domi-muted)]">
            Tu Google ({user.email}) no está como transportista aprobado. Pide a Central que te
            habilite, o completa el pre-registro.
          </p>
        </header>
        <div className="space-y-3 rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-5">
          <p className="flex items-center gap-2 text-sm text-white">
            <UserRound className="h-4 w-4 text-[var(--domi-cyan)]" />
            {profile?.displayName || user.email}
          </p>
          {driver ? (
            <p className="text-xs text-amber-200">Estado flota: {driver.status}</p>
          ) : null}
          <button
            type="button"
            className="cta-primary w-full"
            onClick={() => goToOps('pending_driver')}
          >
            Ir a pre-registro
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-[var(--domi-border)] px-4 py-3 text-sm font-semibold text-[var(--domi-muted)]"
            onClick={() => void refresh()}
          >
            Volver a comprobar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
      <header className="mb-4 flex items-start justify-between gap-3 pt-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            Cabina móvil
          </p>
          <h1 className="mt-0.5 font-display text-xl font-extrabold text-white">{driver.fullName}</h1>
          <p className="mt-0.5 text-xs text-[var(--domi-muted)]">
            {driver.plateNumber ? `Placa ${driver.plateNumber} · ` : ''}
            {driver.isActive ? 'Disponible' : 'En pausa'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--domi-border)] text-[var(--domi-muted)]"
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {(msg || err) && (
        <div
          className={`mb-3 rounded-xl border px-3 py-2 text-xs ${
            err
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
          }`}
        >
          {err || msg}
        </div>
      )}

      <div
        className={`mb-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left ${
          driver.isActive
            ? 'border-[rgba(0,230,118,0.35)] bg-[rgba(0,230,118,0.1)]'
            : 'border-[var(--domi-border)] bg-[var(--domi-panel)]'
        }`}
      >
        <span className="flex items-center gap-3">
          <Bike className={`h-5 w-5 ${driver.isActive ? 'text-[var(--domi-green)]' : 'text-[var(--domi-muted)]'}`} />
          <span>
            <span className="block text-sm font-bold text-white">
              {driver.isActive ? 'Disponible para Central' : 'No disponible'}
            </span>
            <span className="block text-[11px] text-[var(--domi-muted)]">
              Solo se activa con asistencia en la tablet (PIN)
            </span>
          </span>
        </span>
        <button
          type="button"
          className="rounded-lg border border-[var(--domi-border)] px-2 py-1 text-[10px] font-bold text-[var(--domi-orange)]"
          onClick={() => setTab('asistencia')}
        >
          Cómo marcar
        </button>
      </div>

      <nav className="mb-4 grid grid-cols-3 gap-2">
        {(
          [
            { id: 'hoy' as const, label: 'Hoy', icon: ClipboardList },
            { id: 'escanear' as const, label: 'Escanear', icon: ScanLine },
            { id: 'asistencia' as const, label: 'Asistencia', icon: CheckCircle2 },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-bold ${
              tab === id
                ? 'border-[rgba(255,87,34,0.45)] bg-[rgba(255,87,34,0.12)] text-[var(--domi-orange)]'
                : 'border-[var(--domi-border)] bg-[var(--domi-panel)] text-[var(--domi-muted)]'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'hoy' ? (
        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Asignados hoy', value: day.assignedToday },
              { label: 'En curso', value: day.inProgress },
              { label: 'Entregados', value: day.deliveredToday },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] px-3 py-3 text-center"
              >
                <p className="font-display text-2xl font-extrabold text-white">{k.value}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
                  {k.label}
                </p>
              </div>
            ))}
          </div>

          <div>
            <h2 className="mb-2 font-display text-sm font-semibold text-[var(--domi-muted)]">
              Pedidos activos
            </h2>
            {day.activeOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--domi-border)] px-4 py-8 text-center text-sm text-[var(--domi-muted)]">
                Sin pedidos en curso. Cuando Central te asigne, aparecen aquí.
              </div>
            ) : (
              <ul className="space-y-2">
                {day.activeOrders.map((o) => {
                  const next = DRIVER_NEXT_STATUS[o.status];
                  return (
                    <li
                      key={o.id}
                      className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-display text-sm font-bold text-white">{o.trackingCode}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--domi-cyan)]">
                            {DRIVER_STATUS_LABEL[o.status] || o.status}
                          </p>
                        </div>
                        <Package className="h-4 w-4 text-[var(--domi-orange)]" />
                      </div>
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--domi-muted)]">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2B6CFF]" />
                        <span>
                          <span className="font-bold text-[#7aa2ff]">A · </span>
                          {o.pickupAddress || 'Sin recolección'}
                        </span>
                      </p>
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-[var(--domi-muted)]">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF5722]" />
                        <span>
                          <span className="font-bold text-[#ff8a65]">B · </span>
                          {o.deliveryAddress || 'Sin entrega'}
                        </span>
                      </p>
                      {o.pickupCoords && o.deliveryCoords ? (
                        <div className="mt-3 grid grid-cols-1 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openGoogleMapsNav(
                                buildGoogleMapsAbRouteUrl(o.pickupCoords!, o.deliveryCoords!, true),
                              )
                            }
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2B6CFF] py-2.5 text-xs font-extrabold text-white"
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            Iniciar navegación Google Maps
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openGoogleMapsNav(
                                  buildGoogleMapsNavigateToUrl(
                                    goingToPickup(o.status) ? o.pickupCoords! : o.deliveryCoords!,
                                  ),
                                )
                              }
                              className="rounded-xl border border-[var(--domi-border)] py-2 text-[10px] font-bold text-[var(--domi-cyan)]"
                            >
                              GPS → {goingToPickup(o.status) ? 'A' : 'B'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openGoogleMapsNav(
                                  buildGoogleMapsNavigateToUrl(
                                    goingToPickup(o.status) ? o.deliveryCoords! : o.pickupCoords!,
                                  ),
                                )
                              }
                              className="rounded-xl border border-[var(--domi-border)] py-2 text-[10px] font-bold text-[var(--domi-muted)]"
                            >
                              Ir al otro punto
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-amber-300/90">
                          Sin coordenadas A/B. Central debe marcar recolección y entrega en el mapa.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onAdvance(o)}
                        className="cta-primary mt-3 w-full !py-2.5 text-xs"
                      >
                        {next
                          ? `Siguiente: ${DRIVER_STATUS_LABEL[next] || next}`
                          : 'Confirmar con PIN'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'escanear' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--domi-text)]">
              <QrCode className="h-4 w-4 text-[var(--domi-cyan)]" />
              Pedido DMC o QR de asistencia
            </p>
            <p className="mb-3 text-[11px] leading-relaxed text-[var(--domi-muted)]">
              Escanea un pedido <span className="font-mono text-[var(--domi-text)]">DMC-…</span> o el
              QR de la tablet (fotos de odómetro/placa). Si la cámara de la app falla, usa la cámara
              del teléfono sobre el QR.
            </p>
            <input
              className="field-input mb-3"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="DMC-XXXX o pega el enlace del QR"
              autoCapitalize="characters"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                className="cta-primary !py-2.5 text-xs"
                onClick={() => void lookupScan()}
              >
                Buscar
              </button>
              <button
                type="button"
                disabled={busy || scanningCam}
                className="rounded-xl border border-[var(--domi-border)] px-3 py-2.5 text-xs font-bold text-[var(--domi-cyan)]"
                onClick={() => void startCameraScan()}
              >
                Cámara
              </button>
            </div>
            {scanningCam ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-[var(--domi-border)]">
                <video ref={videoRef} className="h-48 w-full object-cover" muted playsInline />
                <button
                  type="button"
                  className="w-full bg-[#0a101c] py-2 text-xs font-semibold text-[var(--domi-muted)]"
                  onClick={stopCameraScan}
                >
                  Detener cámara
                </button>
              </div>
            ) : null}
          </div>

          {scanned ? (
            <div className="rounded-2xl border border-[rgba(255,87,34,0.35)] bg-[rgba(255,87,34,0.08)] p-4">
              <p className="font-display text-base font-bold text-white">{scanned.trackingCode}</p>
              <p className="mt-1 text-xs text-[var(--domi-cyan)]">
                {DRIVER_STATUS_LABEL[scanned.status] || scanned.status}
              </p>
              <p className="mt-2 text-xs text-[var(--domi-muted)]">
                {scanned.customerName || 'Cliente'} · {scanned.deliveryAddress || '—'}
              </p>
              {DRIVER_NEXT_STATUS[scanned.status] ? (
                <button
                  type="button"
                  disabled={busy}
                  className="cta-primary mt-3 w-full !py-2.5 text-xs"
                  onClick={() => void onAdvance(scanned)}
                >
                  Avanzar estado
                </button>
              ) : (
                <div className="mt-3 space-y-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
                    PIN de entrega (cliente)
                  </label>
                  <input
                    className="field-input tracking-[0.3em]"
                    inputMode="numeric"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                  />
                  <button
                    type="button"
                    disabled={busy || pin.length < 4}
                    className="cta-primary w-full !py-2.5 text-xs"
                    onClick={() => void submitPin()}
                  >
                    Confirmar entrega
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'asistencia' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-5">
            <h2 className="font-display text-lg font-bold text-[var(--domi-text)]">
              Asistencia en sede
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--domi-muted)]">
              La entrada y salida <strong className="text-[var(--domi-text)]">no</strong> se marcan
              desde el celular. Debes hacerlo en la <strong className="text-[var(--domi-text)]">tablet de sede</strong> con el PIN del día.
            </p>

            <ol className="mt-4 space-y-3 text-sm text-[var(--domi-muted)]">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(0,229,255,0.12)] text-xs font-bold text-[var(--domi-cyan)]">
                  1
                </span>
                <span>
                  En la tablet elige tu nombre, toma la <strong className="text-[var(--domi-text)]">foto de rostro</strong> y anota el <strong className="text-[var(--domi-text)]">PIN</strong> que se revela.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(0,229,255,0.12)] text-xs font-bold text-[var(--domi-cyan)]">
                  2
                </span>
                <span>
                  Digita el PIN, el km del odómetro y pulsa Entrada o Salida en la tablet.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(255,87,34,0.15)] text-xs font-bold text-[var(--domi-orange)]">
                  3
                </span>
                <span>
                  Con el celular, escanea el <strong className="text-[var(--domi-text)]">QR de la tablet</strong> (junto a la moto) para subir fotos de odómetro y placa.
                </span>
              </li>
            </ol>

            <div className="mt-5 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setTab('escanear')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--domi-blue)] py-3 text-xs font-extrabold text-white"
              >
                <QrCode className="h-4 w-4" />
                Escanear QR de la tablet
              </button>
              <a
                href={`${opsTowerUrl()}/?view=kiosk-asistencia`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--domi-border)] py-3 text-xs font-bold text-[var(--domi-cyan)]"
              >
                <Tablet className="h-4 w-4" />
                Abrir terminal tablet (sede)
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(255,87,34,0.35)] bg-[rgba(255,87,34,0.08)] px-4 py-3 text-xs leading-relaxed text-[var(--domi-muted)]">
            <p className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--domi-orange)]" />
              <span>
                Sin foto de rostro en la tablet, el sistema no muestra el PIN. Sin PIN no hay marca de asistencia ni cabina activa.
              </span>
            </p>
          </div>

          <p className="text-center text-[11px] text-[var(--domi-muted)]">
            Entregas históricas: {driver.completedDeliveries || 0}
          </p>
        </section>
      ) : null}
    </div>
  );
}

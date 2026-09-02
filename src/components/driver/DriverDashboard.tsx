import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MotorizadoDriver, DeliveryOrder, AttendancePunch } from '../../types';
import {
  toggleDriverActiveState,
  updateDriverLocation,
  updateOrderStatus,
  confirmDeliveryWithCode,
  saveDriverWebAuthnCredential,
  recordAttendancePunch,
  subscribeAttendancePunches,
  createIncident,
  uploadOdometerPhoto,
} from '../../lib/firebase';
import { buildDriverStats, EXPECTED_SHIFT_HOURS, formatCOP } from '../../lib/adminMetrics';
import {
  isWebAuthnAvailable,
  registerDriverBiometric,
  verifyDriverBiometric,
} from '../../lib/attendance';
import { MapComponent } from '../MapComponent';
import { ChatWindow } from '../chat/ChatWindow';
import {
  Power,
  Navigation,
  CheckCircle2,
  Star,
  MapPin,
  Fingerprint,
  LogIn,
  LogOut,
  AlertTriangle,
  Camera,
  Gauge,
} from 'lucide-react';
import { INCIDENT_REASONS } from '../../lib/brandCopy';
import { DRIVER_NEXT_ACTION, ORDER_STATUS_LABEL } from '../../lib/orderFlow';
import { parseOdometerKm, summarizeDriverShift } from '../../lib/workShift';

interface DriverDashboardProps {
  driver: MotorizadoDriver;
  allDrivers: MotorizadoDriver[];
  orders: DeliveryOrder[];
}

export const DriverDashboard: React.FC<DriverDashboardProps> = ({
  driver,
  allDrivers,
  orders,
}) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'map' | 'chat' | 'asistencia'>('orders');
  const [selectedOrderIdForMap, setSelectedOrderIdForMap] = useState<string | null>(null);
  const [isUpdatingGps, setIsUpdatingGps] = useState(false);
  const [gpsLive, setGpsLive] = useState(false);
  const [attendanceMsg, setAttendanceMsg] = useState('');
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [todayPunches, setTodayPunches] = useState<AttendancePunch[]>([]);
  const [odometerKm, setOdometerKm] = useState('');
  const [odometerFile, setOdometerFile] = useState<File | null>(null);
  const [odometerPreview, setOdometerPreview] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [deliveryPin, setDeliveryPin] = useState('');
  const [deliveryPinError, setDeliveryPinError] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [incidentMsg, setIncidentMsg] = useState('');
  const [incidentCategory, setIncidentCategory] = useState<string>(INCIDENT_REASONS[0]);
  const [gpsError, setGpsError] = useState('');
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsPermission, setGpsPermission] = useState<'unknown' | 'prompt' | 'granted' | 'denied'>(
    'unknown'
  );
  const [gpsSecureOk, setGpsSecureOk] = useState(true);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);

  const myAssignedOrders = orders.filter(
    (o) =>
      o.assignedDriverId === driver.id && o.status !== 'delivered' && o.status !== 'cancelled'
  );
  const currentActiveOrder = myAssignedOrders[0] || null;
  const myStats = useMemo(
    () => buildDriverStats([driver], orders, [], undefined, undefined)[0],
    [driver, orders]
  );

  const stopGpsWatch = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const pushLocation = (lat: number, lng: number, heading?: number, force = false) => {
    const now = Date.now();
    if (!force && now - lastSentRef.current < 2500) return;
    lastSentRef.current = now;
    setLiveCoords({ lat, lng });
    updateDriverLocation(
      driver.id,
      {
        lat,
        lng,
        heading: heading || 0,
        addressName: 'GPS en vivo · Villavicencio',
        neighborhood: 'En trayecto',
        updatedAt: new Date().toISOString(),
      },
      { fullName: driver.fullName, plateNumber: driver.plateNumber }
    );
  };

  const startGpsWatch = () => {
    if (!('geolocation' in navigator)) return;
    stopGpsWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsLive(true);
        setGpsError('');
        setGpsPermission('granted');
        pushLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.heading || undefined
        );
      },
      (err) => {
        if (err.code === 1) setGpsPermission('denied');
        setGpsLive(false);
        setGpsError(
          err.code === 1
            ? 'Ubicación bloqueada. En la barra de dirección → ícono de candado/info → Permisos → Ubicación → Permitir, y recarga.'
            : 'No se pudo leer el GPS. Revisa señal o vuelve a pulsar «Activar ubicación».'
        );
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 25000 }
    );
  };

  /**
   * Debe llamarse desde un clic del usuario: así el navegador muestra el diálogo de permiso.
   */
  const requestGpsPermission = () => {
    setIsUpdatingGps(true);
    setGpsError('');

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setGpsSecureOk(false);
      setGpsError(
        'El navegador solo pide GPS en HTTPS o localhost. Abre la app en https:// o http://localhost:…'
      );
      setIsUpdatingGps(false);
      return;
    }
    setGpsSecureOk(true);

    if (!('geolocation' in navigator)) {
      setGpsError('Este navegador no soporta geolocalización.');
      setIsUpdatingGps(false);
      return;
    }

    // getCurrentPosition en respuesta al clic → dispara el popup de permiso
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsPermission('granted');
        setGpsLive(true);
        setGpsError('');
        pushLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.heading || undefined,
          true
        );
        startGpsWatch();
        setIsUpdatingGps(false);
      },
      (err) => {
        setIsUpdatingGps(false);
        if (err.code === 1) {
          setGpsPermission('denied');
          setGpsError(
            'Bloqueaste la ubicación. Clic en el candado de la barra de dirección → Sitio → Ubicación → Permitir → Recargar.'
          );
          return;
        }
        // Timeout / unavailable: igual intenta watch (a veces el diálogo ya se mostró)
        if (liveCoords || (driver.location?.lat && driver.location?.lng)) {
          startGpsWatch();
          setGpsError('');
          return;
        }
        setGpsError(
          'No hubo respuesta del GPS. Pulsa de nuevo «Activar ubicación» y acepta el permiso cuando aparezca.'
        );
        startGpsWatch();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  };

  // Solo lee el estado del permiso; NO pide GPS hasta que el usuario pulse el botón
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setGpsSecureOk(window.isSecureContext);
      if (!window.isSecureContext) {
        setGpsError(
          'Sin contexto seguro: el navegador no pedirá ubicación. Usa https:// o localhost.'
        );
      }
    }
    if (driver.location?.lat && driver.location?.lng) {
      setLiveCoords({ lat: driver.location.lat, lng: driver.location.lng });
    }
    if (!navigator.permissions?.query) {
      setGpsPermission('prompt');
      return;
    }
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setGpsPermission(status.state as 'prompt' | 'granted' | 'denied');
        status.onchange = () => {
          setGpsPermission(status.state as 'prompt' | 'granted' | 'denied');
          if (status.state === 'granted') startGpsWatch();
          if (status.state === 'denied') {
            stopGpsWatch();
            setGpsLive(false);
          }
        };
        // Si ya estaba permitido en una sesión anterior, arranca watch
        if (status.state === 'granted') startGpsWatch();
      })
      .catch(() => setGpsPermission('prompt'));

    return () => {
      cancelled = true;
      stopGpsWatch();
    };
  }, [driver.id]);

  useEffect(() => {
    return subscribeAttendancePunches((list) => {
      setTodayPunches(list.filter((p) => p.driverId === driver.id));
    });
  }, [driver.id]);

  const todayKey = new Date().toISOString().split('T')[0];
  const todayShift = useMemo(
    () =>
      summarizeDriverShift(
        todayPunches,
        driver.id,
        driver.fullName,
        todayKey
      ),
    [todayPunches, driver.id, driver.fullName, todayKey]
  );

  useEffect(() => {
    if (!todayShift.open) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, [todayShift.open]);

  const elapsedShiftHours = todayShift.open && todayShift.inAt
    ? Math.round(((nowTick - new Date(todayShift.inAt).getTime()) / 36e5) * 100) / 100
    : todayShift.hoursWorked;

  const getPunchGeo = (): Promise<{ lat?: number; lng?: number }> =>
    new Promise((resolve) => {
      const fallback =
        liveCoords ||
        (typeof driver.location?.lat === 'number' && typeof driver.location?.lng === 'number'
          ? { lat: driver.location.lat, lng: driver.location.lng }
          : undefined);
      if (!('geolocation' in navigator)) {
        resolve(fallback || {});
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(fallback || {}),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
      );
    });

  const handleRegisterBiometric = async () => {
    setAttendanceBusy(true);
    setAttendanceMsg('');
    try {
      if (!isWebAuthnAvailable()) {
        throw new Error('Este móvil no soporta huella / Face ID (WebAuthn).');
      }
      const credentialId = await registerDriverBiometric(driver.id, driver.fullName);
      await saveDriverWebAuthnCredential(driver.id, credentialId);
      setAttendanceMsg('Biometría vinculada. Ya puedes marcar entrada y salida.');
    } catch (err: any) {
      setAttendanceMsg(err?.message || 'No se pudo registrar la biometría.');
    } finally {
      setAttendanceBusy(false);
    }
  };

  const handlePunch = async (type: 'in' | 'out') => {
    setAttendanceBusy(true);
    setAttendanceMsg('');
    try {
      const cred = driver.webauthnCredentialId;
      if (!cred) throw new Error('Primero registra tu huella o Face ID.');
      const km = parseOdometerKm(odometerKm);
      if (km == null) {
        throw new Error('Anota el kilometraje real del tablero de la moto.');
      }
      if (!odometerFile) {
        throw new Error('Toma una foto clara del odómetro (números visibles).');
      }
      const lastPunchKm = todayPunches
        .map((p) => Number(p.odometerKm))
        .filter((n) => Number.isFinite(n) && n > 0)
        .reduce((max, n) => Math.max(max, n), 0);
      const lastKm = lastPunchKm || Number(driver.lastOdometerKm) || 0;
      if (lastKm > 0 && km < lastKm) {
        throw new Error(
          `El kilometraje debe ser igual o ascendente. Último registro: ${lastKm.toLocaleString('es-CO')} km.`
        );
      }

      const ok = await verifyDriverBiometric(cred);
      if (!ok) throw new Error('Verificación biométrica fallida.');

      const photoUrl = await uploadOdometerPhoto(odometerFile, driver.id, type);
      const geo = await getPunchGeo();
      const entryKm =
        type === 'out'
          ? todayPunches.find((p) => p.type === 'in')?.odometerKm ?? todayShift.kmIn
          : undefined;
      const punch = await recordAttendancePunch({
        driverId: driver.id,
        driverName: driver.fullName,
        type,
        credentialId: cred,
        lat: geo.lat,
        lng: geo.lng,
        odometerKm: km,
        odometerPhotoUrl: photoUrl,
        entryOdometerKm: entryKm,
        motoModel: driver.motoModel,
        motoKmPerGallon: driver.motoKmPerGallon,
      });
      setOdometerKm('');
      setOdometerFile(null);
      if (odometerPreview) URL.revokeObjectURL(odometerPreview);
      setOdometerPreview(null);
      setAttendanceMsg(
        type === 'in'
          ? `Entrada + km ${km.toLocaleString('es-CO')} · ${new Date().toLocaleTimeString('es-CO')}`
          : punch.shiftKmDriven != null
            ? `Salida · ${punch.shiftKmDriven.toLocaleString('es-CO')} km recorridos · ${(punch.shiftGallons || 0).toFixed(2)} gal · gasolina est. ${formatCOP(punch.shiftFuelCostCop || 0)}`
            : `Salida + km ${km.toLocaleString('es-CO')} · ${new Date().toLocaleTimeString('es-CO')}`
      );
    } catch (err: any) {
      setAttendanceMsg(err?.message || 'No se pudo marcar asistencia.');
    } finally {
      setAttendanceBusy(false);
    }
  };

  const handleReportIncident = async (panic = false) => {
    if (panic) {
      const ok = window.confirm(
        '¿Activar BOTÓN DE PÁNICO?\n\nLa torre de control recibirá una alerta urgente con tu ubicación GPS.'
      );
      if (!ok) return;
    } else if (!currentActiveOrder) {
      setIncidentMsg('Usa el botón PÁNICO de emergencia, o reporta incidencia cuando tengas un envío activo.');
      return;
    }

    const category = panic ? 'Accidente / incidente' : incidentCategory;
    const title = panic ? '🚨 Botón de pánico' : category;
    const description = panic
      ? 'El repartidor activó el botón de pánico. Contactar de inmediato.'
      : window.prompt('Describe el problema para la torre:') || '';
    if (!panic && !description.trim()) return;

    const coords = liveCoords ||
      (driver.location?.lat && driver.location?.lng
        ? { lat: driver.location.lat, lng: driver.location.lng }
        : null);

    setIncidentBusy(true);
    setIncidentMsg('');
    try {
      await createIncident({
        orderId: currentActiveOrder?.id,
        trackingCode: currentActiveOrder?.trackingCode,
        driverId: driver.id,
        driverName: driver.fullName,
        reportedByRole: 'driver',
        reportedByName: driver.fullName,
        category,
        title,
        description: description.trim() || title,
        isPanic: panic,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      if (panic) {
        try {
          navigator.vibrate?.([200, 80, 200, 80, 400]);
        } catch {
          /* ignore */
        }
      }
      setIncidentMsg(
        panic
          ? '🚨 Alerta de pánico enviada. La torre fue notificada.'
          : 'Incidencia enviada a la torre. El administrador la resolverá.'
      );
    } catch (err: any) {
      setIncidentMsg(err?.message || 'No se pudo reportar la incidencia.');
    } finally {
      setIncidentBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 relative">
      {/* Botón de pánico — siempre visible para el transportista */}
      <button
        type="button"
        disabled={incidentBusy}
        onClick={() => void handleReportIncident(true)}
        className="fixed bottom-6 right-4 sm:right-6 z-[200] flex items-center gap-2 rounded-2xl border-2 border-red-300 bg-red-600 px-4 py-3 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_28px_rgba(220,38,38,0.55)] hover:bg-red-500 active:scale-[0.98] disabled:opacity-60 animate-pulse"
        title="Emergencia — avisa a la torre de control"
      >
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>Pánico</span>
      </button>
      <div className="bg-[#0B101D] border border-[#FF5722]/50 rounded-2xl p-6 shadow-[0_0_30px_rgba(255,87,34,0.15)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF5722]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={driver.photoUrl}
                alt={driver.fullName}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-[#FF5722]"
              />
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0B101D] ${
                  driver.isActive ? 'bg-[#00E676] animate-pulse' : 'bg-slate-500'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-white font-mono">{driver.fullName}</h2>
                <span className="bg-[#FF5722]/20 text-[#FF5722] font-mono text-xs px-2.5 py-0.5 rounded-lg border border-[#FF5722]/50 font-black">
                  PLACA: {driver.plateNumber}
                </span>
                {gpsLive && (
                  <span className="bg-[#00E676]/15 text-[#00E676] font-mono text-[10px] px-2 py-0.5 rounded-lg border border-[#00E676]/40 font-black">
                    GPS VIVO
                  </span>
                )}
                {gpsPermission === 'denied' && (
                  <span className="bg-red-500/15 text-red-300 font-mono text-[10px] px-2 py-0.5 rounded-lg border border-red-500/40 font-black">
                    GPS BLOQUEADO
                  </span>
                )}
                {liveCoords && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    {liveCoords.lat.toFixed(5)}, {liveCoords.lng.toFixed(5)}
                  </span>
                )}
              </div>
              {!gpsLive && (
                <div className="mt-2 rounded-xl border border-[#00E676]/35 bg-[#00E676]/08 px-3 py-2 space-y-1.5 max-w-lg">
                  <p className="text-[11px] text-[#00E676] font-bold">
                    Para ver el pin en tiempo real debes permitir la ubicación
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Pulsa el botón verde: el navegador mostrará «¿Permitir ubicación?». Elige{' '}
                    <span className="text-white font-semibold">Permitir</span>.
                    {!gpsSecureOk
                      ? ' Si no aparece, abre DomiClick en https:// o en localhost.'
                      : ''}
                  </p>
                  <button
                    type="button"
                    onClick={requestGpsPermission}
                    disabled={isUpdatingGps}
                    className="mt-1 inline-flex items-center gap-2 bg-[#00E676] text-black font-black text-xs font-mono px-4 py-2.5 rounded-xl"
                  >
                    <Navigation className={`w-3.5 h-3.5 ${isUpdatingGps ? 'animate-spin' : ''}`} />
                    {isUpdatingGps ? 'Esperando permiso…' : 'Activar ubicación (pedir permiso)'}
                  </button>
                </div>
              )}
              {gpsError ? (
                <p className="text-[11px] text-amber-300 mt-1 font-semibold">{gpsError}</p>
              ) : null}
              <div className="flex items-center gap-3 mt-2 text-xs font-mono flex-wrap">
                <span className="flex items-center gap-1 text-[#FFC107] font-bold">
                  <Star className="w-3.5 h-3.5 fill-[#FFC107]" />
                  {driver.rating}
                </span>
                <span className="text-emerald-400 font-bold">
                  {myStats?.delivered ?? driver.completedDeliveries} ENTREGAS
                </span>
                <span className="text-[#00E5FF] font-bold">
                  {myStats ? `${myStats.successPct}% ÉXITO` : ''}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={requestGpsPermission}
              disabled={isUpdatingGps}
              className="px-4 py-3 rounded-xl bg-[#070A12] text-slate-200 border border-[#00E676]/50 text-xs font-mono font-black flex items-center gap-2"
            >
              <Navigation className={`w-4 h-4 text-[#00E676] ${isUpdatingGps ? 'animate-spin' : ''}`} />
              {gpsLive ? 'ACTUALIZAR GPS' : 'ACTIVAR UBICACIÓN'}
            </button>
            <button
              onClick={() => {
                if (driver.suspended) return;
                toggleDriverActiveState(driver.id, !driver.isActive, driver.location);
              }}
              disabled={Boolean(driver.suspended)}
              className={`px-6 py-3.5 rounded-xl font-black text-xs font-mono border ${
                driver.isActive
                  ? 'bg-[#FF5722] text-white border-[#FF3D00]'
                  : 'bg-[#1E293B] text-slate-300 border-[#334155]'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Power className="w-4 h-4" />
                {driver.isActive ? 'CABINA EN LÍNEA' : 'FUERA DE SERVICIO'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[#1E293B] pb-2 text-xs font-black flex-wrap">
        {(
          [
            { id: 'orders' as const, label: `Mis domicilios (${myAssignedOrders.length})` },
            { id: 'map' as const, label: 'Navegación' },
            { id: 'chat' as const, label: 'Radio' },
            { id: 'asistencia' as const, label: 'Asistencia' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl font-mono transition border ${
              activeTab === tab.id
                ? 'bg-[#FF5722] text-white border-[#FF3D00]'
                : 'bg-[#0B101D] text-slate-400 border-[#1E293B]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'orders' && (
        <div className="space-y-6">
          {currentActiveOrder ? (
            <div className="bg-[#161920] border-2 border-amber-500/50 rounded-2xl p-6 space-y-6">
              <div className="flex justify-between gap-3 flex-wrap border-b border-[#2d3139] pb-4">
                <div>
                  <span className="bg-amber-500/20 text-amber-300 font-mono text-xs px-2.5 py-1 rounded-lg border border-amber-500/30 font-bold">
                    {currentActiveOrder.trackingCode}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">{currentActiveOrder.description}</h3>
                  <p className="text-[11px] text-cyan-300 font-semibold mt-1">
                    {ORDER_STATUS_LABEL[currentActiveOrder.status]}
                  </p>
                  {currentActiveOrder.invoiceNumber ? (
                    <p className="text-[11px] text-amber-200 mt-1">
                      Factura / orden: {currentActiveOrder.invoiceNumber}
                    </p>
                  ) : null}
                  {currentActiveOrder.routeDistanceKm != null && (
                    <p className="text-[11px] text-slate-400 font-tech mt-1">
                      Ruta ~{currentActiveOrder.routeDistanceKm.toFixed(1)} km
                      {currentActiveOrder.routeDurationMin != null
                        ? ` · ~${currentActiveOrder.routeDurationMin} min`
                        : ''}
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 max-w-[140px] text-right">
                  Precio solo visible en central admin
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#11141a] border border-[#2d3139] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                    <MapPin className="w-4 h-4" /> Recogida
                  </div>
                  <p className="text-sm font-semibold text-white">{currentActiveOrder.pickupAddress}</p>
                  <p className="text-xs text-slate-400">
                    {currentActiveOrder.customerName} · {currentActiveOrder.customerPhone}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#11141a] border border-[#2d3139] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <MapPin className="w-4 h-4" /> Entrega
                  </div>
                  <p className="text-sm font-semibold text-white">{currentActiveOrder.deliveryAddress}</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-3 pt-2 border-t border-[#2d3139]">
                <button
                  onClick={() => {
                    setSelectedOrderIdForMap(currentActiveOrder.id);
                    setActiveTab('map');
                  }}
                  className="bg-[#0052FF] text-white font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                >
                  <Navigation className="w-3.5 h-3.5" /> Ver ruta
                </button>
                <button
                  type="button"
                  disabled={incidentBusy}
                  onClick={() => void handleReportIncident(true)}
                  className="bg-red-600 text-white font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Pánico
                </button>
                <select
                  value={incidentCategory}
                  onChange={(e) => setIncidentCategory(e.target.value)}
                  className="bg-[#11141a] border border-[#2d3139] rounded-xl px-2 py-1.5 text-[10px] text-slate-200"
                >
                  {INCIDENT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={incidentBusy}
                  onClick={() => void handleReportIncident(false)}
                  className="bg-amber-500/15 text-amber-300 border border-amber-500/40 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Reportar incidencia
                </button>
                {DRIVER_NEXT_ACTION[currentActiveOrder.status] && (
                  <button
                    onClick={() =>
                      updateOrderStatus(
                        currentActiveOrder.id,
                        DRIVER_NEXT_ACTION[currentActiveOrder.status]!.next,
                        driver.id,
                        driver.fullName
                      )
                    }
                    className="bg-emerald-500 text-black font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {DRIVER_NEXT_ACTION[currentActiveOrder.status]!.label}
                  </button>
                )}
                {currentActiveOrder.status === 'at_destination' && (
                  <div className="w-full space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      PIN del cliente (entrega exitosa)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={deliveryPin}
                        onChange={(e) => {
                          setDeliveryPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setDeliveryPinError('');
                        }}
                        placeholder="6 dígitos"
                        className="flex-1 min-w-[8rem] bg-[#11141a] border border-[#2d3139] rounded-xl px-3 py-2.5 text-sm font-mono tracking-[0.25em] text-white placeholder:tracking-normal placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                      />
                      <button
                        type="button"
                        disabled={deliveryBusy || deliveryPin.length < 4}
                        onClick={async () => {
                          setDeliveryBusy(true);
                          setDeliveryPinError('');
                          try {
                            const res = await confirmDeliveryWithCode(
                              currentActiveOrder.id,
                              deliveryPin
                            );
                            if (!res.ok) {
                              setDeliveryPinError(res.ok === false ? res.error : 'PIN inválido');
                              return;
                            }
                            setDeliveryPin('');
                          } catch (err: unknown) {
                            setDeliveryPinError(
                              err instanceof Error ? err.message : 'No se pudo confirmar'
                            );
                          } finally {
                            setDeliveryBusy(false);
                          }
                        }}
                        className="bg-emerald-500 text-black font-extrabold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {deliveryBusy ? 'Validando…' : 'Entrega exitosa'}
                      </button>
                    </div>
                    {deliveryPinError ? (
                      <p className="text-xs text-red-400 font-semibold">{deliveryPinError}</p>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Pide al cliente el PIN de 6 dígitos que aparece en su seguimiento.
                      </p>
                    )}
                  </div>
                )}
              </div>
              {incidentMsg ? (
                <p className="text-xs text-amber-300 font-semibold pt-1">{incidentMsg}</p>
              ) : null}
            </div>
          ) : (
            <div className="bg-[#161920] border border-[#2d3139] rounded-2xl p-12 text-center">
              <h3 className="text-lg font-bold text-white mb-1">Sin envíos activos</h3>
              <p className="text-xs text-slate-400">
                Activa cabina: el sistema asigna al más cercano dentro del radio.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'map' && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400 font-mono">
            Tu punto en el mapa se actualiza con GPS real
            {liveCoords
              ? ` · ${liveCoords.lat.toFixed(5)}, ${liveCoords.lng.toFixed(5)}`
              : gpsLive
                ? ' · esperando fix…'
                : ' · activa permisos de ubicación'}
          </p>
          <MapComponent
            drivers={allDrivers}
            orders={orders}
            selectedDriverId={driver.id}
            selectedOrderId={selectedOrderIdForMap || currentActiveOrder?.id}
            height="h-[600px]"
            followSelectedDriver
            showMyLocationButton
            fallbackLocation={
              liveCoords ||
              (driver.location?.lat && driver.location?.lng
                ? { lat: driver.location.lat, lng: driver.location.lng }
                : null)
            }
            onPreciseLocation={(lat, lng) => {
              setLiveCoords({ lat, lng });
              setGpsLive(true);
              setGpsError('');
              setGpsPermission('granted');
              lastSentRef.current = 0;
              updateDriverLocation(
                driver.id,
                {
                  lat,
                  lng,
                  heading: 0,
                  addressName: 'GPS preciso · pin en mapa',
                  neighborhood: 'Ubicación actual',
                  updatedAt: new Date().toISOString(),
                },
                { fullName: driver.fullName, plateNumber: driver.plateNumber }
              );
            }}
          />
        </div>
      )}

      {activeTab === 'chat' && (
        <ChatWindow
          chatId={`chat_${driver.id}`}
          driver={driver}
          currentRole="driver"
          senderName={driver.fullName}
        />
      )}

      {activeTab === 'asistencia' && (
        <div className="bg-[#0B101D] border border-[#162748] rounded-2xl p-5 space-y-4 max-w-xl">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-[#00E5FF]" />
            <h3 className="text-sm font-black text-white font-mono uppercase">
              Jornada · huella + kilometraje
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Al entrar y salir: huella, foto del tablero y el número de kilómetros. Al cierre se
            restan los km (uso de la moto de la empresa, no personal) y se estima gasolina.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#070B16] border border-[#162748] rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-slate-500 font-tech uppercase">Horas hoy</div>
              <div className="text-lg font-black text-white font-tech">
                {elapsedShiftHours.toFixed(2)}
                <span className="text-[10px] text-slate-500 font-normal"> / {EXPECTED_SHIFT_HOURS} h</span>
              </div>
            </div>
            <div className="bg-[#070B16] border border-[#162748] rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-slate-500 font-tech uppercase">Km del turno</div>
              <div className="text-lg font-black text-[#00E5FF] font-tech">
                {todayShift.kmDriven > 0 ? todayShift.kmDriven.toLocaleString('es-CO') : '—'}
              </div>
            </div>
          </div>
          {todayShift.kmIn != null && (
            <p className="text-[11px] text-slate-400 font-tech">
              Entrada {todayShift.kmIn.toLocaleString('es-CO')} km
              {todayShift.kmOut != null
                ? ` → salida ${todayShift.kmOut.toLocaleString('es-CO')} km · gasolina est. ${formatCOP(todayShift.fuelEstimateCop)}`
                : ' · turno abierto'}
            </p>
          )}

          {!driver.webauthnCredentialId ? (
            <button
              type="button"
              disabled={attendanceBusy}
              onClick={handleRegisterBiometric}
              className="w-full py-3 rounded-xl bg-[#2B6CFF] text-white text-xs font-black flex items-center justify-center gap-2"
            >
              <Fingerprint className="w-4 h-4" />
              {attendanceBusy ? 'Registrando…' : 'Registrar huella / Face ID'}
            </button>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <Gauge className="w-3.5 h-3.5" />
                  Kilometraje del tablero *
                </span>
                <input
                  className="w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2.5 text-sm text-white font-mono"
                  inputMode="numeric"
                  value={odometerKm}
                  onChange={(e) => setOdometerKm(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder={
                    (todayShift.kmIn || driver.lastOdometerKm)
                      ? `Igual o mayor a ${(todayShift.kmOut || todayShift.kmIn || driver.lastOdometerKm)?.toLocaleString('es-CO')}`
                      : 'Ej. 45280'
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <Camera className="w-3.5 h-3.5" />
                  Foto del odómetro *
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="w-full text-[11px] text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#FF5722] file:text-white file:text-xs file:font-black"
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
                  className="w-full max-h-40 object-cover rounded-xl border border-[#1a2744]"
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={attendanceBusy}
                  onClick={() => handlePunch('in')}
                  className="py-3 rounded-xl bg-[#00E676]/15 border border-[#00E676]/50 text-[#00E676] text-xs font-black flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" /> Entrada
                </button>
                <button
                  type="button"
                  disabled={attendanceBusy}
                  onClick={() => handlePunch('out')}
                  className="py-3 rounded-xl bg-[#FF5722]/15 border border-[#FF5722]/50 text-[#FF5722] text-xs font-black flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Salida
                </button>
              </div>
            </div>
          )}
          {attendanceMsg && (
            <p className="text-[11px] text-[#00E5FF] font-tech bg-[#0A1122] border border-[#1A2D52] rounded-xl px-3 py-2">
              {attendanceMsg}
            </p>
          )}
          <div className="space-y-2 pt-2 border-t border-[#162748]">
            <div className="text-[10px] text-slate-500 font-tech uppercase">Marcas de hoy</div>
            {todayPunches.length === 0 ? (
              <p className="text-xs text-slate-500">Sin marcas hoy.</p>
            ) : (
              todayPunches.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between gap-2 text-xs bg-[#070B16] border border-[#162748] rounded-xl px-3 py-2"
                >
                  <div>
                    <span className={p.type === 'in' ? 'text-[#00E676]' : 'text-[#FF5722]'}>
                      {p.type === 'in' ? 'ENTRADA' : 'SALIDA'}
                    </span>
                    {p.odometerKm != null && (
                      <span className="text-slate-400 font-tech ml-2">
                        {p.odometerKm.toLocaleString('es-CO')} km
                      </span>
                    )}
                  </div>
                  <span className="text-slate-300 font-tech">
                    {new Date(p.at).toLocaleTimeString('es-CO')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

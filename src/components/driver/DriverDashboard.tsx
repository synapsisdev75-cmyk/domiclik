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
} from '../../lib/firebase';
import { buildDriverStats } from '../../lib/adminMetrics';
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
  Radio,
  Fingerprint,
  LogIn,
  LogOut,
} from 'lucide-react';
import { DomiCargoIcon, DomiRadarIcon, DomiChatRadioIcon } from '../ui/CustomIcons';

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
  const [deliveryPin, setDeliveryPin] = useState('');
  const [deliveryPinError, setDeliveryPinError] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState(false);
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

  const needsLiveGps =
    driver.isActive ||
    Boolean(
      currentActiveOrder &&
        (currentActiveOrder.status === 'assigned' || currentActiveOrder.status === 'in_transit')
    );

  const pushLocation = (lat: number, lng: number, heading?: number) => {
    const now = Date.now();
    if (now - lastSentRef.current < 8000) return;
    lastSentRef.current = now;
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

  useEffect(() => {
    if (!needsLiveGps || !('geolocation' in navigator)) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGpsLive(false);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsLive(true);
        pushLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading || undefined);
      },
      () => setGpsLive(false),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [needsLiveGps, driver.id]);

  useEffect(() => {
    return subscribeAttendancePunches((list) => {
      setTodayPunches(list.filter((p) => p.driverId === driver.id));
    });
  }, [driver.id]);

  const handleUpdateGpsLocation = () => {
    setIsUpdatingGps(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          lastSentRef.current = 0;
          pushLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading || undefined);
          setIsUpdatingGps(false);
          setGpsLive(true);
        },
        () => simulateVillavicencioGps(),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      simulateVillavicencioGps();
    }
  };

  const simulateVillavicencioGps = () => {
    const latOffset = (Math.random() - 0.5) * 0.008;
    const lngOffset = (Math.random() - 0.5) * 0.008;
    lastSentRef.current = 0;
    pushLocation(
      (driver.location?.lat || 4.142) + latOffset,
      (driver.location?.lng || -73.6266) + lngOffset
    );
    setIsUpdatingGps(false);
  };

  const getPunchGeo = (): Promise<{ lat?: number; lng?: number }> =>
    new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        resolve({});
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 4000 }
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
      const ok = await verifyDriverBiometric(cred);
      if (!ok) throw new Error('Verificación biométrica fallida.');
      const geo = await getPunchGeo();
      await recordAttendancePunch({
        driverId: driver.id,
        driverName: driver.fullName,
        type,
        credentialId: cred,
        lat: geo.lat,
        lng: geo.lng,
      });
      setAttendanceMsg(
        type === 'in'
          ? `Entrada registrada · ${new Date().toLocaleTimeString('es-CO')}`
          : `Salida registrada · ${new Date().toLocaleTimeString('es-CO')}`
      );
    } catch (err: any) {
      setAttendanceMsg(err?.message || 'No se pudo marcar asistencia.');
    } finally {
      setAttendanceBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
              </div>
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
              onClick={handleUpdateGpsLocation}
              disabled={isUpdatingGps}
              className="px-4 py-3 rounded-xl bg-[#070A12] text-slate-200 border border-[#00F0FF]/40 text-xs font-mono font-black flex items-center gap-2"
            >
              <Navigation className={`w-4 h-4 text-[#00F0FF] ${isUpdatingGps ? 'animate-spin' : ''}`} />
              PING GPS
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
            { id: 'orders' as const, label: `MIS DOMICILIOS (${myAssignedOrders.length})` },
            { id: 'map' as const, label: 'NAVEGACIÓN GPS' },
            { id: 'chat' as const, label: 'RADIO DESPACHO' },
            { id: 'asistencia' as const, label: 'ASISTENCIA' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl font-mono transition flex items-center gap-2 border ${
              activeTab === tab.id
                ? 'bg-[#FF5722] text-white border-[#FF3D00]'
                : 'bg-[#0B101D] text-slate-400 border-[#1E293B]'
            }`}
          >
            {tab.id === 'asistencia' && <Fingerprint className="w-4 h-4" />}
            {tab.id === 'orders' && <DomiCargoIcon className="w-4 h-4" color="#fff" />}
            {tab.id === 'map' && <DomiRadarIcon className="w-4 h-4" color="#00F0FF" />}
            {tab.id === 'chat' && <DomiChatRadioIcon className="w-4 h-4" color="#00F0FF" />}
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
                {currentActiveOrder.status === 'assigned' && (
                  <button
                    onClick={() => updateOrderStatus(currentActiveOrder.id, 'in_transit')}
                    className="bg-emerald-500 text-black font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Iniciar tránsito
                  </button>
                )}
                {currentActiveOrder.status === 'in_transit' && (
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
                              setDeliveryPinError(res.error);
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
            </div>
          ) : (
            <div className="bg-[#161920] border border-[#2d3139] rounded-2xl p-12 text-center">
              <Radio className="w-7 h-7 text-amber-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">Sin envíos activos</h3>
              <p className="text-xs text-slate-400">
                Activa cabina: el sistema asigna al más cercano dentro del radio.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'map' && (
        <MapComponent
          drivers={allDrivers}
          orders={orders}
          selectedDriverId={driver.id}
          selectedOrderId={selectedOrderIdForMap || currentActiveOrder?.id}
          height="h-[600px]"
        />
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
              Control de horas · biometría
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Usa la huella o Face ID de este teléfono. Los registros van a Firebase.
          </p>
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
                  className="flex justify-between text-xs bg-[#070B16] border border-[#162748] rounded-xl px-3 py-2"
                >
                  <span className={p.type === 'in' ? 'text-[#00E676]' : 'text-[#FF5722]'}>
                    {p.type === 'in' ? 'ENTRADA' : 'SALIDA'}
                  </span>
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

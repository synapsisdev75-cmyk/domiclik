import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  KeyRound,
  Bike,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Home,
  Info,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Route,
  ScanLine,
  Settings2,
  Timer,
  UserRound,
  Volume2,
  VolumeX,
  Vibrate,
  WifiOff,
  X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { nativeLocatorAvailable, startLiveLocator, stopLiveLocator } from '../lib/liveLocator';
import { createGpsTrackFilter } from '../lib/gpsTrackFilter';
import { captureDeliveryPhoto } from '../lib/deliveryProof';
import { uploadDeliveryProof } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { isNativeApp } from '../lib/appNav';
import { opsTowerUrl, WHATSAPP } from '../lib/config';
import { EmailAuthForm } from '../components/EmailAuthForm';
import { ThemeToggle } from '../components/ThemeToggle';
import { DriverPreregisterForm } from '../components/DriverPreregisterForm';
import { LiveTripMap, type MapStopPick } from '../components/LiveTripMap';
import { VipBadge } from '../components/VipBadge';
import {
  planJoinedTourStops,
  planJoinedTourStopsAsync,
  tourPlanSignature,
  type TourStop,
} from '../lib/tour';
import {
  buildGoogleMapsAbRouteUrl,
  buildGoogleMapsMultiStopUrl,
  buildGoogleMapsNavigateToUrl,
  navStop,
  openGoogleMapsNav,
} from '../lib/googleMapsNav';
import {
  applyQueuedStatusToOrders,
  cacheOpenOrders,
  isBrowserOnline,
  isWeakSignal,
  pendingSyncCount,
  readAdvanceQueue,
  readCachedOpenOrders,
  subscribeSignal,
} from '../lib/driverOffline';
import {
  startRadioAlarm,
  stopRadioAlarm,
  stopAssignmentAlarm,
  stopAvailableOrderAlarm,
  alertOrderAssigned,
  alertShiftClose,
  alertOrderAccepted,
  alertNearbySamePlace,
  readCabinAlertSettings,
  unlockAlertAudio,
  writeCabinAlertSettings,
  type CabinAlertSettings,
} from '../lib/alerts';
import { detectNearbySamePlaceOrders } from '../lib/nearbySamePlace';
import { estimateTourRoute } from '../lib/geo';
import {
  checklistProgress,
  customerWhatsAppText,
  fetchDriverLeaderboard,
  PRE_ROUTE_CHECKLIST,
  RADIO_QUICK,
  rankPosition,
  readPreRouteChecklist,
  sendCabinChatMessage,
  setRadioUnread,
  ackCabinChat,
  subscribeCabinChat,
  subscribeRadioUnread,
  tipOfTheDay,
  whatsAppKindForStatus,
  writePreRouteChecklist,
  type CabinChatMessage,
  type CustomerWhatsAppKind,
  type DriverRankRow,
} from '../lib/driverCabinExtras';
import {
  DRIVER_NEXT_STATUS,
  DRIVER_NEXT_LABEL,
  DRIVER_STATUS_LABEL,
  DRIVER_INCIDENT_REASONS,
  advanceDriverOrderStatus,
  confirmDeliveryWithPin,
  flushPinQueue,
  createDriverIncident,
  driverPaymentDetail,
  findDriverProfileByEmail,
  subscribeDriverByEmail,
  findOrderForScan,
  flushAdvanceQueue,
  listDriverOrders,
  openWhatsAppTo,
  parseAttendancePhotoUrl,
  publishDriverLiveLocation,
  subscribeDriverOrders,
  subscribeDriverTodayPunches,
  summarizeCabinEarnings,
  SHIFT_CLOSE_BUFFER_MIN,
  shiftCloseMessage,
  shiftRemainingMinutes,
  summarizeCabinShift,
  summarizeDriverDay,
  todayDateKey,
  type CabinAttendancePunch,
  type DriverOrder,
  type DriverProfile,
} from '../lib/driverCabin';

type TabId = 'hoy' | 'mapa' | 'radio' | 'escanear' | 'turno' | 'perfil';

const TAB_IDS: TabId[] = ['hoy', 'mapa', 'radio', 'escanear', 'turno', 'perfil'];

const PICKUP_STATUSES = new Set(['assigned', 'accepted', 'en_route_origin', 'at_origin']);

function goingToPickup(status: string): boolean {
  return PICKUP_STATUSES.has(status);
}

function parseTab(raw: string | null): TabId {
  if (raw === 'asistencia') return 'turno';
  if (raw && TAB_IDS.includes(raw as TabId)) return raw as TabId;
  return 'hoy';
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

function callPhone(phone?: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return;
  window.location.href = `tel:${digits}`;
}

function formatHours(h: number): string {
  if (!h) return '0 h';
  return `${h.toFixed(h >= 10 ? 0 : 1)} h`;
}

export function DriverCabinPage() {
  const { user, profile, loading: authLoading, signIn, signOut, error: authError, clearError } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const native = isNativeApp() || Capacitor.isNativePlatform();
  const tab = parseTab(searchParams.get('tab'));

  const setTab = useCallback(
    (next: TabId) => {
      setSearchParams({ tab: next }, { replace: true });
    },
    [setSearchParams],
  );

  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [mapStop, setMapStop] = useState<MapStopPick | null>(null);
  /** Al tocar parada 1/R1… solo info + centrar mapa DomiClick (no abre Maps). */
  const [focusStopTarget, setFocusStopTarget] = useState<{
    lat: number;
    lng: number;
    seq: number;
  } | null>(null);
  const focusStopSeqRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [approvalCongrats, setApprovalCongrats] = useState(false);
  const prevDriverStatusRef = useRef<string | null>(null);

  const [scanCode, setScanCode] = useState('');
  const [scanned, setScanned] = useState<DriverOrder | null>(null);
  const [pin, setPin] = useState('');
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanningCam, setScanningCam] = useState(false);

  const [gpsLiveOk, setGpsLiveOk] = useState(false);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** Rumbo GPS/nativo (0–360) para orientar el pin. */
  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  /** Si el GPS detecta avance (para punta = movimiento hacia delante). */
  const [liveMoving, setLiveMoving] = useState(false);
  /** Velocidad m/s para motor híbrido (<3 km/h = brújula). */
  const [liveSpeedMps, setLiveSpeedMps] = useState<number | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  /** Recalibrar lectura de brújula (se incrementaba desde el botón; ahora fijo). */
  const calibrateSeq = 0;
  /** free = norte arriba; headingUp = mapa sigue el rumbo (como Maps nav). */
  const [navMode, setNavMode] = useState<'free' | 'headingUp'>('free');
  /** Seguimiento de posición GPS en el mapa (solo pan; no gira la moto). */
  const [followMe, setFollowMe] = useState(false);
  /** Tras abrir Google Maps: barra para volver a DomiClick al llegar. */
  const [mapsReturn, setMapsReturn] = useState<{
    kind: 'pickup' | 'drop';
    trackingCode: string;
    orderId: string;
    /** Leyenda A=R1, B=E1… (Maps no permite cambiar las letras del pin). */
    legend?: string;
  } | null>(null);
  const mapsAwayRef = useRef(false);
  /** Si el usuario arrastró el mapa, no reactivar follow solo por un fix GPS. */
  const followBrokenRef = useRef(false);
  const [locating, setLocating] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [online, setOnline] = useState(isBrowserOnline());
  const [weakSignal, setWeakSignal] = useState(isWeakSignal());
  const [queueLen, setQueueLen] = useState(() => pendingSyncCount());
  const [punches, setPunches] = useState<CabinAttendancePunch[]>([]);
  const [incidentCategory, setIncidentCategory] = useState<string>(DRIVER_INCIDENT_REASONS[0]);
  const [incidentNote, setIncidentNote] = useState('');
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [showIncident, setShowIncident] = useState(false);

  const [chatMsgs, setChatMsgs] = useState<CabinChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [radioLive, setRadioLive] = useState(false);
  const [radioError, setRadioError] = useState('');
  const [radioResume, setRadioResume] = useState(0);
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [checkState, setCheckState] = useState<Record<string, boolean>>({});
  const [board, setBoard] = useState<DriverRankRow[]>([]);
  const tip = useMemo(() => tipOfTheDay(), []);
  const [alertSettings, setAlertSettings] = useState<CabinAlertSettings>(() =>
    readCabinAlertSettings(),
  );
  const [waPrompt, setWaPrompt] = useState<{
    order: DriverOrder;
    kind: CustomerWhatsAppKind;
  } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [radioUnread, setRadioUnreadBadge] = useState(0);

  const day = useMemo(() => summarizeDriverDay(orders), [orders]);
  const openOrders = day.activeOrders;
  const shift = useMemo(
    () => (driver ? summarizeCabinShift(punches, driver.id) : summarizeCabinShift([], '')),
    [punches, driver],
  );
  const earnings = useMemo(() => summarizeCabinEarnings(orders, shift), [orders, shift]);
  const remainingMin =
    shift.open && shift.inAt ? shiftRemainingMinutes(shift.inAt, nowTick) : null;
  const shiftClosing = remainingMin != null && remainingMin <= SHIFT_CLOSE_BUFFER_MIN;
  const shiftNotice =
    shiftClosing && remainingMin != null
      ? shiftCloseMessage(remainingMin, openOrders.length > 0)
      : null;
  const onShift = punches.length > 0 ? shift.open : Boolean(driver?.isActive);

  async function onPunchShift() {
    if (!driver) return;
    const type = onShift ? 'out' : 'in';
    // Entrada: solo tablet de sede con PIN. Salida: tip tablet (sin cambios).
    if (type === 'in') {
      setTab('perfil');
      setMsg(
        'La entrada se marca en la oficina: tablet de sede con tu PIN de asistencia. No se puede activar desde la app.',
      );
      return;
    }
    setTab('turno');
    setMsg(
      'La salida se marca en la tablet de sede: foto del tacómetro, de la placa, tu foto de salida y los kilómetros.',
    );
  }
  const lastGpsSent = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const pendingGpsRef = useRef<{
    driverId: string;
    lat: number;
    lng: number;
    heading?: number;
    speedMps?: number;
    accuracyM?: number;
    moving?: boolean;
  } | null>(null);
  const didFocusGps = useRef(false);
  const shiftWarnedRef = useRef(false);
  const knownOpenIdsRef = useRef<Set<string> | null>(null);
  /** Evita reencender alarma de tablero tras asignación (carrera con snapshot pending). */
  const hasOpenOrdersRef = useRef(false);
  const chatPrimedRef = useRef(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const lastChatIdRef = useRef<string | null>(null);

  const activeOrder =
    openOrders.find((o) => o.id === selectedOrderId) || openOrders[0] || null;
  /**
   * Firma del lote pendiente: cambia al unirse un pedido o al completar R/E
   * → reoptimiza solo el remanente desde el live actual (GPS no reordena a cada tick).
   */
  const tourSig = useMemo(
    () => tourPlanSignature(openOrders.slice(0, 3)),
    [openOrders],
  );
  const liveCoordsRef = useRef(liveCoords);
  liveCoordsRef.current = liveCoords;
  const openOrdersTourRef = useRef(openOrders);
  openOrdersTourRef.current = openOrders;
  const [tourStopsOrdered, setTourStopsOrdered] = useState<TourStop[]>([]);
  const [tourOptBusy, setTourOptBusy] = useState(false);
  useEffect(() => {
    const orders = openOrdersTourRef.current.slice(0, 3);
    const origin = liveCoordsRef.current;
    const start =
      origin && Number.isFinite(origin.lat) ? { lat: origin.lat, lng: origin.lng } : null;
    // Haversine inmediato; luego refina con tiempo real de calles.
    setTourStopsOrdered(planJoinedTourStops(orders, start));
    let cancel = false;
    void planJoinedTourStopsAsync(orders, start).then((stops) => {
      if (!cancel) setTourStopsOrdered(stops);
    });
    return () => {
      cancel = true;
    };
  }, [tourSig]);

  /** Botón transportista: reacomoda R/E desde el live (más cercana / lineal / calles). */
  const optimizeJoinedRoute = useCallback(async () => {
    const orders = openOrdersTourRef.current.slice(0, 3);
    if (orders.length < 2) {
      setMsg('Necesitas al menos 2 pedidos unidos para optimizar la ruta.');
      return;
    }
    const origin = liveCoordsRef.current;
    const start =
      origin && Number.isFinite(origin.lat) ? { lat: origin.lat, lng: origin.lng } : null;
    if (!start) {
      setErr('Activa el GPS para optimizar desde tu posición.');
      return;
    }
    setTourOptBusy(true);
    setErr(null);
    setMsg('Optimizando ruta desde tu ubicación…');
    setTab('mapa');
    try {
      setTourStopsOrdered(planJoinedTourStops(orders, start));
      const stops = await planJoinedTourStopsAsync(orders, start);
      setTourStopsOrdered(stops);
      setFocusSeq((n) => n + 1);
      setMsg('Ruta reacomodada: más cercana y lineal a tus pedidos.');
    } catch {
      setErr('No se pudo optimizar ahora. Reintenta en unos segundos.');
    } finally {
      setTourOptBusy(false);
    }
  }, []);
  /** Live actual → paradas ya ordenadas; geometría de calles en LiveTripMap. */
  const joinedTour = useMemo(() => {
    if (!tourStopsOrdered.length) return [];
    if (liveCoords && Number.isFinite(liveCoords.lat)) {
      return [{ lat: liveCoords.lat, lng: liveCoords.lng }, ...tourStopsOrdered];
    }
    return tourStopsOrdered;
  }, [tourStopsOrdered, liveCoords]);
  /**
   * Pines numerados (visita 1,2,3…) + badge R1/E1 (slot del pedido).
   * Si hay tour óptimo, el número sigue ese orden (estilo Route4Me).
   */
  const mapStops = useMemo(() => {
    const slotOf = (orderId: string) => {
      const i = openOrders.findIndex((o) => o.id === orderId);
      return i >= 0 ? i + 1 : 0;
    };

    if (tourStopsOrdered.length > 0) {
      return tourStopsOrdered
        .filter((s) => s.kind === 'pickup' || s.kind === 'drop')
        .map((s, i) => ({
          lat: s.lat,
          lng: s.lng,
          kind: (s.kind === 'drop' ? 'drop' : 'pickup') as 'pickup' | 'drop',
          orderId: s.orderId || '',
          index: slotOf(s.orderId || ''),
          visitSeq: i + 1,
        }))
        .filter((s) => s.orderId);
    }

    const out: Array<{
      lat: number;
      lng: number;
      kind: 'pickup' | 'drop';
      orderId: string;
      index: number;
      visitSeq: number;
    }> = [];
    let seq = 0;
    openOrders.slice(0, 3).forEach((order, i) => {
      const index = i + 1;
      if (order.pickupCoords?.lat != null && order.pickupCoords?.lng != null) {
        seq += 1;
        out.push({
          lat: order.pickupCoords.lat,
          lng: order.pickupCoords.lng,
          kind: 'pickup',
          orderId: order.id,
          index,
          visitSeq: seq,
        });
      }
      if (order.deliveryCoords?.lat != null && order.deliveryCoords?.lng != null) {
        seq += 1;
        out.push({
          lat: order.deliveryCoords.lat,
          lng: order.deliveryCoords.lng,
          kind: 'drop',
          orderId: order.id,
          index,
          visitSeq: seq,
        });
      }
    });
    return out;
  }, [openOrders, tourStopsOrdered]);

  /** Filas de la hoja tipo Route4Me (Start + paradas numeradas). */
  const routeStopRows = useMemo(() => {
    const byId = new Map(openOrders.map((o) => [o.id, o]));
    return mapStops.map((s) => {
      const order = byId.get(s.orderId);
      const badge = `${s.kind === 'pickup' ? 'R' : 'E'}${s.index}`;
      return {
        ...s,
        badge,
        trackingCode: order?.trackingCode || '',
        customerName: order?.customerName?.trim() || 'Cliente',
        isVip: Boolean(order?.isVip),
        address:
          s.kind === 'pickup'
            ? order?.pickupAddress || 'Sin recogida'
            : order?.deliveryAddress || 'Sin entrega',
        kindLabel: s.kind === 'pickup' ? 'Recogida' : 'Entrega',
        color: s.kind === 'pickup' ? '#FF5722' : '#2B6CFF',
      };
    });
  }, [mapStops, openOrders]);

  const [tourSheetOpen, setTourSheetOpen] = useState(true);
  const [tourSummary, setTourSummary] = useState<{
    distanceKm: number;
    durationMin: number;
  } | null>(null);

  useEffect(() => {
    if (joinedTour.length < 2) {
      setTourSummary(null);
      return;
    }
    let cancel = false;
    void estimateTourRoute(joinedTour).then((est) => {
      if (cancel) return;
      setTourSummary({
        distanceKm: est.distanceKm,
        durationMin: est.durationMin,
      });
    });
    return () => {
      cancel = true;
    };
  }, [joinedTour]);

  const nearbySamePlace = useMemo(
    () => detectNearbySamePlaceOrders(openOrders.slice(0, 3)),
    [openOrders],
  );
  const nearbyBeepSigRef = useRef<string | null>(null);
  const [nearbyNoticeDismissed, setNearbyNoticeDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!nearbySamePlace) {
      nearbyBeepSigRef.current = null;
      setNearbyNoticeDismissed(null);
      return;
    }
    if (nearbyBeepSigRef.current === nearbySamePlace.signature) return;
    nearbyBeepSigRef.current = nearbySamePlace.signature;
    setNearbyNoticeDismissed(null);
    try {
      unlockAlertAudio();
      alertNearbySamePlace();
    } catch {
      /* ignore */
    }
  }, [nearbySamePlace]);

  const showNearbyNotice =
    Boolean(nearbySamePlace) && nearbyNoticeDismissed !== nearbySamePlace?.signature;

  // Desbloquear audio del navegador (requiere gesto del usuario)
  useEffect(() => {
    const unlock = () => unlockAlertAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!openOrders.length) {
      if (selectedOrderId) setSelectedOrderId(null);
      return;
    }
    if (selectedOrderId && openOrders.some((o) => o.id === selectedOrderId)) return;
    setSelectedOrderId(openOrders[0].id);
  }, [openOrders, selectedOrderId]);

  const driverRef = useRef<DriverProfile | null>(null);
  driverRef.current = driver;

  const refresh = useCallback(async () => {
    const email = user?.email || profile?.email || '';
    if (!email) {
      setDriver(null);
      setOrders([]);
      setLoading(false);
      return;
    }
    const soft = Boolean(driverRef.current);
    if (!soft) setLoading(true);
    setErr(null);
    try {
      const d = await findDriverProfileByEmail(email);
      setDriver(d);
      if (d?.status === 'approved') {
        // No bloquear la UI: pedidos llegan por subscribe; esto es un respaldo rápido
        const rows = await Promise.race([
          listDriverOrders(d.id),
          new Promise<DriverOrder[]>((resolve) => setTimeout(() => resolve([]), 7000)),
        ]);
        if (rows.length) setOrders(rows);
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

  // Red de seguridad: nunca dejar el spinner eterno
  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => setLoading(false), 12000);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    const email = user?.email || profile?.email || '';
    if (!email) return;
    return subscribeDriverByEmail(email, (next) => {
      setDriver(next);
      // Perfil en vivo → pintar cabina aunque listDriverOrders aún no responda
      setLoading(false);
    });
  }, [user?.email, profile?.email]);

  /** Felicitación en vivo al pasar de pendiente → aprobado. */
  useEffect(() => {
    const prev = prevDriverStatusRef.current;
    const next = driver?.status || null;
    if (
      next === 'approved' &&
      prev != null &&
      prev !== 'approved' &&
      (prev === 'pending' || prev === 'rejected')
    ) {
      setApprovalCongrats(true);
      setMsg('¡Felicidades! Central te aprobó. Ya puedes marcar entrada.');
      try {
        unlockAlertAudio();
        alertOrderAccepted();
      } catch {
        /* ignore */
      }
    }
    if (next) prevDriverStatusRef.current = next;
  }, [driver?.status]);

  useEffect(() => {
    if (!driver?.id || driver.status !== 'approved') return;
    knownOpenIdsRef.current = null;
    const unsub = subscribeDriverOrders(driver.id, (rows) => {
      const withQueue = applyQueuedStatusToOrders(rows, readAdvanceQueue());
      const open = withQueue.filter(
        (o) => o.status !== 'delivered' && o.status !== 'cancelled',
      );
      const ids = new Set(open.map((o) => o.id));
      if (knownOpenIdsRef.current == null) {
        knownOpenIdsRef.current = ids;
      } else {
        let arrived = false;
        for (const id of ids) {
          if (!knownOpenIdsRef.current.has(id)) {
            arrived = true;
            break;
          }
        }
        if (arrived) {
          // Solo ESTE transportista: el pedido llegó a su cola (assignedDriverId = yo).
          stopAvailableOrderAlarm();
          stopAssignmentAlarm();
          alertOrderAssigned();
          const newest = open.find((o) => !knownOpenIdsRef.current?.has(o.id));
          setMsg(
            newest?.isVip
              ? `VIP asignado a ti · ${newest.trackingCode}. Revisa Pedidos / Mapa.`
              : `Pedido asignado a ti · ${newest?.trackingCode || 'nuevo'}. Revisa Pedidos / Mapa.`,
          );
          setSelectedOrderId(newest?.id || open[0]?.id || null);
        }
        knownOpenIdsRef.current = ids;
      }
      setOrders(withQueue);
      cacheOpenOrders(driver.id, withQueue);
      setLoading(false);
    });
    return () => unsub();
  }, [driver?.id, driver?.status]);

  // Si ya tiene pedido asignado/en curso, no debe sonar la alarma de “solicitud en espera”.
  useEffect(() => {
    const busy = orders.some((o) => o.status !== 'delivered' && o.status !== 'cancelled');
    hasOpenOrdersRef.current = busy;
    if (busy) {
      stopAvailableOrderAlarm();
      stopAssignmentAlarm();
    }
  }, [orders]);

  /**
   * Aviso sonoro/visual de pedido: SOLO cuando Central asigna a ESTE motorizado.
   * No se alerta el tablero de pendientes de la ciudad (evita que suenen 1, 2 y 4
   * cuando el pedido le llegó al 3).
   */
  useEffect(() => {
    stopAvailableOrderAlarm();
  }, [driver?.id, driver?.isActive]);

  useEffect(() => {
    if (!driver?.id || driver.status !== 'approved') return;
    return subscribeDriverTodayPunches(driver.id, setPunches);
  }, [driver?.id, driver?.status]);

  useEffect(() => {
    if (!driver?.id) return;
    setCheckState(readPreRouteChecklist(driver.id, todayDateKey()));
  }, [driver?.id]);

  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'hidden') return;
      setRadioResume((n) => n + 1);
      if (mapsAwayRef.current) {
        mapsAwayRef.current = false;
        setTab('mapa');
        setMsg('Ya estás de vuelta · toca Volver a DomiClick al llegar a la parada.');
      }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    let removeApp: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void import('@capacitor/app').then(({ App }) => {
        const handle = App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) wake();
        });
        removeApp = () => {
          void handle.then((sub) => sub.remove());
        };
      });
    }
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      removeApp?.();
    };
  }, []);

  useEffect(() => {
    if (!driver?.id || driver.status !== 'approved') return;
    chatPrimedRef.current = false;
    lastChatIdRef.current = null;
    const chatId = `chat_${driver.id}`;
    return subscribeCabinChat(
      chatId,
      (msgs) => {
        setChatMsgs(msgs);
        setRadioError('');
        if (!msgs.length) return;
        const last = msgs[msgs.length - 1];
        if (!chatPrimedRef.current) {
          chatPrimedRef.current = true;
          lastChatIdRef.current = last.id;
          return;
        }
        if (last.id !== lastChatIdRef.current) {
          lastChatIdRef.current = last.id;
          if (last.senderRole !== 'driver') {
            if (tabRef.current !== 'radio') startRadioAlarm();
          }
        }
      },
      (live, error) => {
        setRadioLive(live);
        setRadioError(error || '');
      },
    );
  }, [driver?.id, driver?.status, radioResume]);

  useEffect(() => {
    if (!driver?.id) return;
    const chatId = `chat_${driver.id}`;
    const incoming = chatMsgs.filter((msg) => msg.senderRole !== 'driver' && msg.receipt !== 'seen');
    setRadioUnread(tab === 'radio' ? 0 : incoming.length);
    const needsDelivered = chatMsgs.some(
      (msg) => msg.senderRole === 'admin' && msg.receipt !== 'delivered' && msg.receipt !== 'seen',
    );
    if (needsDelivered) void ackCabinChat(chatId, 'delivered');
    if (tab === 'radio') {
      if (incoming.length) void ackCabinChat(chatId, 'seen');
      stopRadioAlarm();
      return;
    }
    if (incoming.length) startRadioAlarm();
    else stopRadioAlarm();
  }, [chatMsgs, tab, driver?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs, tab]);

  useEffect(() => subscribeRadioUnread(setRadioUnreadBadge), []);

  useEffect(() => {
    setQuickMenuOpen(false);
  }, [tab]);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickMenuOpen]);

  useEffect(() => {
    if (!driver?.id) return;
    void fetchDriverLeaderboard(8)
      .then(setBoard)
      .catch(() => setBoard([]));
  }, [driver?.id, day.deliveredToday]);

  useEffect(() => {
    const syncOnline = () => {
      const on = isBrowserOnline();
      setOnline(on);
      setWeakSignal(isWeakSignal());
      setQueueLen(pendingSyncCount());
      if (on) {
        void flushAdvanceQueue().then(async (r) => {
          const pins = await flushPinQueue();
          setQueueLen(pendingSyncCount());
          if (pins.rejected) setErr(pins.rejected);
          const sent = r.sent + pins.sent;
          if (sent > 0) {
            setMsg(`Sincronizados ${sent} avance(s) pendientes.`);
            void refresh();
          }
        });
      }
    };
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    const unsubSignal = subscribeSignal(() => {
      setWeakSignal(isWeakSignal());
      setQueueLen(pendingSyncCount());
      if (isBrowserOnline() && !isWeakSignal()) syncOnline();
    });
    syncOnline();
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
      unsubSignal();
    };
  }, [refresh]);

  useEffect(() => {
    if (!driver?.id || online) return;
    const cached = readCachedOpenOrders(driver.id);
    if (cached.length) {
      setOrders(applyQueuedStatusToOrders(cached, readAdvanceQueue()));
      setLoading(false);
    }
  }, [driver?.id, online]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 20000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!shiftClosing) {
      shiftWarnedRef.current = false;
      return;
    }
    if (shiftWarnedRef.current) return;
    shiftWarnedRef.current = true;
    alertShiftClose();
  }, [shiftClosing]);

  /** Semilla: si aún no hay GPS del teléfono, pinta la última ubicación de Firestore. */
  useEffect(() => {
    if (!driver?.lastLocation) return;
    if (liveCoordsRef.current) return;
    const seed = driver.lastLocation;
    setLiveCoords({ lat: seed.lat, lng: seed.lng });
    if (seed.heading != null && seed.heading >= 0) setLiveHeading(seed.heading);
    if (!didFocusGps.current) {
      didFocusGps.current = true;
      setFocusSeq((n) => n + 1);
    }
  }, [driver?.id, driver?.lastLocation?.lat, driver?.lastLocation?.lng]);

  /** En Mapa con GPS: activa seguimiento + orientación hacia la ruta (como Maps). */
  useEffect(() => {
    const root = document.documentElement;
    const onMap = tab === 'mapa';
    root.classList.toggle('driver-map-gestures', onMap);
    return () => root.classList.remove('driver-map-gestures');
  }, [tab]);

  // En mapa: brújula lista, pero NO seguimiento forzado.
  // Solo “Ubicarme” activa follow; un gesto lo suelta y el GPS no lo reactiva.
  useEffect(() => {
    if (tab !== 'mapa') {
      setFollowMe(false);
      followBrokenRef.current = false;
      return;
    }
    void ensureCompassPermission();
  }, [tab]);

  useEffect(() => {
    if (!driver?.id) return;
    if (!nativeLocatorAvailable() && !('geolocation' in navigator)) return;
    const driverId = driver.id;
    const driverName = driver.fullName;
    const plateNumber = driver.plateNumber;
    let lastPoint: { lat: number; lng: number } | null = null;
    let cancelled = false;
    let removeNative: (() => void) | undefined;
    const track = createGpsTrackFilter();
    const useNative = nativeLocatorAvailable();
    const geoOpts: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    };

    function publishPoint(point: {
      lat: number;
      lng: number;
      heading?: number;
      speedMps?: number;
      accuracyM?: number;
      source?: 'native' | 'browser' | 'manual';
    }) {
      const filtered = track.push({
        lat: point.lat,
        lng: point.lng,
        heading: point.heading,
        speedMps: point.speedMps,
        accuracyM: point.accuracyM,
        source: point.source || 'browser',
      });
      if (!filtered) return;

      const coords = { lat: filtered.lat, lng: filtered.lng };
      setLiveCoords(coords);
      if (filtered.heading != null && Number.isFinite(filtered.heading) && filtered.heading >= 0) {
        setLiveHeading(filtered.heading);
      }
      setLiveMoving(Boolean(filtered.moving));
      setLiveSpeedMps(
        filtered.speedMps != null && Number.isFinite(filtered.speedMps) ? filtered.speedMps : null,
      );
      setGpsLiveOk(true);
      if (!didFocusGps.current) {
        didFocusGps.current = true;
        setFocusSeq((n) => n + 1);
      }
      const moved =
        lastPoint == null
          ? Infinity
          : Math.hypot(
              (coords.lat - lastPoint.lat) * 111_320,
              (coords.lng - lastPoint.lng) * 111_320 * Math.cos((lastPoint.lat * Math.PI) / 180),
            );
      const now = Date.now();
      const waited = now - lastGpsSent.current;
      const moving = filtered.moving;
      if (moving) {
        if (moved < 4 && waited < 2000) return;
      } else if (moved < 4 && waited < 5000) {
        return;
      }
      lastGpsSent.current = now;
      lastPoint = coords;
      const fix = {
        driverId,
        driverName,
        plateNumber,
        lat: coords.lat,
        lng: coords.lng,
        heading: filtered.heading,
        speedMps: filtered.speedMps,
        accuracyM: filtered.accuracyM,
        moving,
      };
      void publishDriverLiveLocation(fix).then((ok) => {
        pendingGpsRef.current = ok ? null : fix;
      });
    }

    function applyBrowserFix(pos: GeolocationPosition) {
      const speed = pos.coords.speed;
      publishPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading || undefined,
        speedMps: speed != null && speed >= 0 ? speed : undefined,
        accuracyM: pos.coords.accuracy,
        source: 'browser',
      });
    }

    function geoFailHint(err?: GeolocationPositionError) {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setErr(
          'GPS bloqueado: abre la cabina por HTTPS (https://TU-IP:5174). En http://IP el teléfono no da ubicación.',
        );
        return;
      }
      if (err?.code === 1) {
        setGpsLiveOk(false);
        setErr('Activa el permiso de ubicación precisa del navegador para esta página.');
      }
    }

    function startBrowserWatch() {
      if (!('geolocation' in navigator)) return;
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        geoFailHint();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => applyBrowserFix(pos),
        (err) => geoFailHint(err),
        geoOpts,
      );
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => applyBrowserFix(pos),
        (err) => geoFailHint(err),
        { ...geoOpts, maximumAge: 1000, timeout: 15000 },
      );
    }

    let nativeStarted = false;
    if (useNative) {
      void startLiveLocator((fix) => {
        if (cancelled) return;
        publishPoint({
          lat: fix.lat,
          lng: fix.lng,
          heading: fix.heading || undefined,
          speedMps: fix.speed >= 0 ? fix.speed : undefined,
          accuracyM: fix.accuracy,
          source: 'native',
        });
      })
        .then((remove) => {
          if (cancelled) {
            remove();
            void stopLiveLocator();
            return;
          }
          nativeStarted = true;
          removeNative = remove;
        })
        .catch(() => {
          // Sin permiso o FGS rechazado: no tumbar la app; usar geolocation web.
          setGpsLiveOk(false);
          if (!cancelled) startBrowserWatch();
        });
    } else {
      // Con LiveLocator nativo no abrimos watchPosition (evita rebote native↔browser).
      startBrowserWatch();
    }

    const retryId = window.setInterval(() => {
      const pending = pendingGpsRef.current;
      if (!pending || !isBrowserOnline()) return;
      void publishDriverLiveLocation(pending).then((ok) => {
        if (ok && pendingGpsRef.current?.lat === pending.lat && pendingGpsRef.current?.lng === pending.lng) {
          pendingGpsRef.current = null;
        }
      });
    }, 12000);

    const beatId = window.setInterval(() => {
      if (nativeStarted) return;
      if (!('geolocation' in navigator) || !window.isSecureContext) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => applyBrowserFix(pos),
        () => undefined,
        geoOpts,
      );
    }, 8000);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (nativeStarted || !('geolocation' in navigator) || !window.isSecureContext) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => applyBrowserFix(pos),
        () => undefined,
        geoOpts,
      );
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      track.reset();
      removeNative?.();
      void stopLiveLocator();
      window.clearInterval(retryId);
      if (beatId) window.clearInterval(beatId);
      document.removeEventListener('visibilitychange', onVisible);
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [driver?.id]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function ensureCompassPermission() {
    const { requestCompassPermission } = await import('../lib/headingSmooth');
    await requestCompassPermission();
  }

  function locateMe() {
    if (!driver) {
      setErr('Sin perfil de transportista.');
      return;
    }
    // Segundo toque en “Siguiendo” = soltar el mapa (ver calles libres).
    if (followMe) {
      followBrokenRef.current = true;
      setFollowMe(false);
      if (navMode === 'headingUp') setNavMode('free');
      setMsg('Mapa libre. Toca Ubicarme para centrar sin cambiar la orientación de la moto.');
      return;
    }
    void ensureCompassPermission();
    followBrokenRef.current = false;
    // Solo centra (pan); no reinicia la orientación de la moto.
    if (liveCoords && Number.isFinite(liveCoords.lat)) {
      setFollowMe(true);
      setFocusSeq((n) => n + 1);
      setMsg('Centrado en tu GPS. Arrastra o toca Siguiendo para soltar.');
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      // Sin HTTPS el browser no entrega GPS preciso; al menos centra con la semilla.
      const seed = liveCoords || driver.lastLocation;
      if (seed && Number.isFinite(seed.lat)) {
        setLiveCoords({ lat: seed.lat, lng: seed.lng });
        setFollowMe(true);
        setFocusSeq((n) => n + 1);
      }
      setErr(
        'Para GPS preciso en local abre https://' +
          (window.location.hostname || 'TU-IP') +
          ':' +
          (window.location.port || '5174') +
          '/transportista?tab=mapa y acepta el certificado.',
      );
      return;
    }
    if (!('geolocation' in navigator)) {
      if (!liveCoords) setErr('Este teléfono no entregó la ubicación.');
      return;
    }
    setLocating(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLiveCoords(coords);
        if (pos.coords.heading != null && pos.coords.heading >= 0) {
          setLiveHeading(pos.coords.heading);
        }
        setGpsLiveOk(true);
        followBrokenRef.current = false;
        setFollowMe(true);
        setFocusSeq((n) => n + 1);
        setLocating(false);
        setMsg('Mapa orientado hacia la ruta. Arrastra para soltar.');
        void publishDriverLiveLocation({
          driverId: driver.id,
          driverName: driver.fullName,
          plateNumber: driver.plateNumber,
          lat: coords.lat,
          lng: coords.lng,
          heading: pos.coords.heading || undefined,
        }).then((ok) => {
          pendingGpsRef.current = ok
            ? null
            : {
                driverId: driver.id,
                lat: coords.lat,
                lng: coords.lng,
                heading: pos.coords.heading || undefined,
              };
          if (!ok) setMsg('Señal débil. La ubicación se reintenta sola.');
        });
      },
      (err) => {
        setLocating(false);
        const seed = liveCoords || driver.lastLocation;
        if (seed && Number.isFinite(seed.lat)) {
          setLiveCoords({ lat: seed.lat, lng: seed.lng });
          setFollowMe(true);
          setFocusSeq((n) => n + 1);
          setMsg('Usando última ubicación conocida. Activa GPS preciso del navegador.');
          return;
        }
        setGpsLiveOk(false);
        setErr(
          err.code === 1
            ? 'Permiso de ubicación denegado. Actívalo en el navegador (preciso).'
            : 'No se pudo leer el GPS. Activa la ubicación precisa del teléfono.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  function returnToDomiClickFromMaps() {
    mapsAwayRef.current = false;
    setTab('mapa');
    setFocusSeq((n) => n + 1);
    setFollowMe(true);
    followBrokenRef.current = false;
    const kind = mapsReturn?.kind;
    setMapsReturn(null);
    setMapStop(null);
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    setMsg(
      kind === 'pickup'
        ? 'De vuelta en DomiClick · confirma la recogida cuando llegues.'
        : kind === 'drop'
          ? 'De vuelta en DomiClick · confirma la entrega o ingresa el PIN.'
          : 'De vuelta en DomiClick.',
    );
  }

  /** Abre Google Maps en el pin exacto (lat/lng DomiClick) de R o E. */
  function openStopExactInMaps(
    order: DriverOrder,
    kind: 'pickup' | 'drop',
  ): boolean {
    const coords = kind === 'pickup' ? order.pickupCoords : order.deliveryCoords;
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
      setErr(
        kind === 'pickup'
          ? 'Esa recogida no tiene coordenadas. Central debe marcarla en el mapa.'
          : 'Esa entrega no tiene coordenadas. Central debe marcarla en el mapa.',
      );
      return false;
    }
    const dest = navStop(
      coords,
      kind === 'pickup' ? order.pickupAddress : order.deliveryAddress,
      kind === 'pickup' ? order.pickupPlaceId : order.deliveryPlaceId,
    );
    mapsAwayRef.current = true;
    setMapsReturn({
      kind,
      trackingCode: order.trackingCode,
      orderId: order.id,
    });
    setSelectedOrderId(order.id);
    openGoogleMapsNav(buildGoogleMapsNavigateToUrl(dest, liveCoords));
    setMsg(
      kind === 'pickup'
        ? 'Maps → recogida exacta. Al llegar cierra Maps y toca Volver a DomiClick.'
        : 'Maps → entrega exacta. Al llegar cierra Maps y toca Volver a DomiClick.',
    );
    return true;
  }

  /** Abre Maps con todas las R/E del tour como paradas (coords exactas). */
  function openJoinedTourInMaps(): boolean {
    // Misma secuencia numerada que la hoja / pines (Route4Me + DomiClick)
    const rows =
      routeStopRows.length >= 2
        ? routeStopRows
        : mapStops.length >= 2
          ? mapStops.map((s) => ({
              ...s,
              badge: `${s.kind === 'pickup' ? 'R' : 'E'}${s.index}`,
              trackingCode: '',
              kind: s.kind,
            }))
          : [];

    if (rows.length < 2) return false;

    const stops = rows.map((r) => navStop({ lat: r.lat, lng: r.lng }));
    const url = buildGoogleMapsMultiStopUrl(stops, liveCoords, false);
    if (!url) return false;

    // Maps usa A/B/C en el pin; la leyenda traduce a R1/E1…
    const legend = rows
      .map((r, i) => `${String.fromCharCode(65 + i)}=${r.badge}`)
      .join(' · ');

    const first = rows[0];
    const firstOrder = openOrders.find((o) => o.id === first.orderId) || openOrders[0];
    mapsAwayRef.current = true;
    setMapsReturn({
      kind: first.kind === 'drop' ? 'drop' : 'pickup',
      trackingCode: firstOrder?.trackingCode || `${stops.length} paradas`,
      orderId: firstOrder?.id || first.orderId,
      legend,
    });
    if (firstOrder?.id) setSelectedOrderId(firstOrder.id);
    openGoogleMapsNav(url);
    setMsg(
      `Maps → ${stops.length} paradas exportadas (${legend}). Al llegar cierra Maps y toca Volver a DomiClick.`,
    );
    return true;
  }

  function navigateOrder(order: DriverOrder) {
    setTab('mapa');
    setFocusSeq((n) => n + 1);
    // 2+ paradas (varios pedidos o R+E): exportar tour completo a Maps
    if (routeStopRows.length > 1 || mapStops.length > 1) {
      if (openJoinedTourInMaps()) return;
      setErr('No se pudo armar el tour para Maps. Revisa que las paradas tengan coordenadas.');
      return;
    }
    if (!order.pickupCoords || !order.deliveryCoords) {
      setErr('Sin coordenadas de recogida y entrega. Central debe marcarlas en el mapa.');
      return;
    }
    openStopExactInMaps(order, goingToPickup(order.status) ? 'pickup' : 'drop');
  }

  async function onAdvance(order: DriverOrder) {
    if (!driver) return;
    const next = DRIVER_NEXT_STATUS[order.status];
    if (!next) {
      setSelectedOrderId(order.id);
      setTab('escanear');
      setScanned(order);
      setScanCode(order.trackingCode);
      return;
    }
    setBusy(true);
    try {
      const result = await advanceDriverOrderStatus(order.id, next, driver.id, driver.fullName);
      if (next === 'accepted') {
        alertOrderAccepted();
      }
      if (result.queued) {
        setQueueLen(pendingSyncCount());
        setOrders((prev) =>
          applyQueuedStatusToOrders(prev, readAdvanceQueue()).map((o) =>
            o.id === order.id ? { ...o, status: next } : o,
          ),
        );
        setMsg(`Sin red: ${order.trackingCode} → ${DRIVER_STATUS_LABEL[next] || next} (pendiente de sync)`);
      } else {
        setMsg(`Pedido ${order.trackingCode} → ${DRIVER_STATUS_LABEL[next] || next} · Central en vivo`);
      }
      if (order.customerPhone) {
        setWaPrompt({ order: { ...order, status: next }, kind: whatsAppKindForStatus(next) });
      }
      if (
        (next === 'en_route_origin' || next === 'in_transit') &&
        order.pickupCoords &&
        order.deliveryCoords
      ) {
        const joined = openOrders.filter((item) => item.pickupCoords && item.deliveryCoords);
        setTab('mapa');
        if (joined.length > 1) {
          if (!openJoinedTourInMaps()) {
            setMsg('Ruta unida en el mapa de DomiClick.');
          }
        } else {
          const kind = next === 'en_route_origin' ? 'pickup' : 'drop';
          openStopExactInMaps(order, kind);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  }

  async function submitIncident(panic = false) {
    if (!driver) return;
    const category = panic ? 'Accidente / incidente' : incidentCategory;
    const description = panic
      ? 'El repartidor activó el botón de pánico. Contactar de inmediato.'
      : incidentNote.trim();
    if (!panic && !description) {
      setErr('Describe la incidencia para la torre.');
      return;
    }
    setIncidentBusy(true);
    setErr(null);
    try {
      await createDriverIncident({
        driverId: driver.id,
        driverName: driver.fullName,
        category,
        description: description || category,
        orderId: activeOrder?.id,
        trackingCode: activeOrder?.trackingCode,
        isPanic: panic,
        lat: liveCoords?.lat,
        lng: liveCoords?.lng,
      });
      setMsg(
        panic
          ? 'Alerta de pánico enviada a la torre.'
          : 'Incidencia enviada a Central.',
      );
      setIncidentNote('');
      setShowIncident(false);
      try {
        if (panic) navigator.vibrate?.([200, 80, 200, 80, 400]);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo reportar');
    } finally {
      setIncidentBusy(false);
    }
  }

  function toggleCheck(id: string) {
    if (!driver) return;
    const next = { ...checkState, [id]: !checkState[id] };
    setCheckState(next);
    writePreRouteChecklist(driver.id, todayDateKey(), next);
  }

  async function sendRadio(text?: string) {
    if (!driver) return;
    const body = (text || chatInput).trim();
    if (!body) return;
    setChatBusy(true);
    setErr(null);
    try {
      await sendCabinChatMessage({
        chatId: `chat_${driver.id}`,
        driverId: driver.id,
        driverName: driver.fullName,
        text: body,
      });
      if (!text) setChatInput('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo enviar el mensaje');
    } finally {
      setChatBusy(false);
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
      setSelectedOrderId(order.id);
      setMsg(`Pedido ${order.trackingCode} · ${DRIVER_STATUS_LABEL[order.status] || order.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al buscar');
    } finally {
      setBusy(false);
    }
  }

  async function captureProof() {
    setErr(null);
    setProofBusy(true);
    try {
      const shot = await captureDeliveryPhoto();
      setProofPreview(shot.dataUrl);
      setProofFile(shot.file);
      setMsg('Foto de entrega lista. Ahora ingresa el PIN.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo tomar la foto. Inténtalo de nuevo.');
    } finally {
      setProofBusy(false);
    }
  }

  async function submitPin() {
    if (!scanned) return;
    if (!proofFile && !proofPreview) {
      setErr('Toma la foto de entrega antes de confirmar el PIN.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        try {
          proofUrl = await uploadDeliveryProof(proofFile, scanned.id);
        } catch (e) {
          setErr(
            e instanceof Error
              ? `No se subió la foto: ${e.message}. Reintenta.`
              : 'No se subió la foto de entrega. Reintenta.',
          );
          return;
        }
      }
      const res = await confirmDeliveryWithPin(scanned.id, pin, proofUrl);
      if (res.ok === false) {
        setErr(res.error);
        return;
      }
      if (res.queued) {
        setQueueLen(pendingSyncCount());
        setMsg(`PIN guardado. ${scanned.trackingCode} se confirma en la torre cuando vuelva la señal.`);
        setPin('');
        return;
      }
      setMsg(`Entregado · ${scanned.trackingCode} · Central notificada`);
      setPin('');
      setProofFile(null);
      setProofPreview(null);
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

  // Spinner solo al inicio: si ya hay perfil (subscribe) o usuario listo, no bloquear Perfil/asistencia
  if ((authLoading && !user) || (loading && !driver)) {
    return (
      <div className="app-screen mx-auto flex min-h-[100svh] max-w-lg items-center justify-center px-4">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--domi-cyan)]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
        <header className="mb-6 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            Cabina flota
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-white">Transportistas</h1>
          <p className="mt-2 text-sm text-[var(--domi-muted)]">
            Crea tu cuenta o inicia sesión. Luego envías tu prerregistro a Central desde esta misma
            app.
          </p>
        </header>
        <div className="space-y-3">
          <EmailAuthForm />
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
              Continuar con Google
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
          </div>
        </div>
      </div>
    );
  }

  if (!driver || driver.status !== 'approved') {
    return (
      <DriverPreregisterForm
        user={user}
        profile={profile}
        driver={driver}
        onSubmitted={() => void refresh()}
        onSignOut={() => void signOut()}
      />
    );
  }

  const next = activeOrder ? DRIVER_NEXT_STATUS[activeOrder.status] : null;
  const nextLabel = activeOrder ? DRIVER_NEXT_LABEL[activeOrder.status] : null;
  const payDetail = activeOrder ? driverPaymentDetail(activeOrder) : null;

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 pt-[max(5.5rem,calc(env(safe-area-inset-top,0px)+3.25rem))] sm:px-6 sm:pt-8">
      {approvalCongrats ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-5 backdrop-blur-sm"
          role="dialog"
          aria-label="Aprobación"
        >
          <div className="w-full max-w-sm rounded-3xl border border-emerald-400/40 bg-gradient-to-b from-emerald-900/90 to-slate-900 p-6 text-center shadow-2xl">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-300" />
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              DomiClick flota
            </p>
            <h2 className="mt-2 font-display text-2xl font-extrabold text-white">
              ¡Felicidades!
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-50/90">
              Central te aprobó como transportista. Ya puedes marcar entrada y recibir pedidos.
            </p>
            <button
              type="button"
              className="cta-primary mt-5 w-full"
              onClick={() => setApprovalCongrats(false)}
            >
              Entrar a mi cabina
            </button>
          </div>
        </div>
      ) : null}
      {shiftNotice ? (
        <div
          className={`rounded-2xl border border-amber-400/50 bg-amber-500 px-3 py-3 text-sm font-bold leading-snug text-black ${
            tab === 'mapa'
              ? 'fixed inset-x-3 top-[max(4.75rem,env(safe-area-inset-top))] z-[45] shadow-lg'
              : 'mb-3'
          }`}
          role="status"
        >
          {shiftNotice}
        </div>
      ) : null}

      {showNearbyNotice && nearbySamePlace ? (
        <div
          className={`rounded-2xl border border-[#00E5FF]/45 bg-[#0c1220]/95 px-3 py-3 text-sm font-bold leading-snug text-white shadow-lg ${
            tab === 'mapa'
              ? `fixed inset-x-3 z-[46] shadow-lg ${
                  shiftNotice
                    ? 'top-[max(8.5rem,calc(env(safe-area-inset-top)+5.5rem))]'
                    : 'top-[max(4.75rem,env(safe-area-inset-top))]'
                }`
              : 'mb-3'
          }`}
          role="status"
        >
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#00E5FF]" />
            <p className="min-w-0 flex-1">{nearbySamePlace.message}</p>
            <button
              type="button"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black text-white/70"
              onClick={() => setNearbyNoticeDismissed(nearbySamePlace.signature)}
              aria-label="Cerrar aviso"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      <header className={`mb-4 flex items-start justify-between gap-3 ${tab === 'mapa' ? 'hidden' : ''}`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            Cabina delivery
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

      {!online || weakSignal || queueLen > 0 ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-600/40 bg-amber-100 px-3 py-2 text-[11px] font-semibold text-amber-950">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {!online
              ? 'Sin conexión. Puedes avanzar estados y guardar el PIN; se sincronizan al volver la red.'
              : weakSignal
                ? 'Señal débil. La torre puede tardar en ver tu ubicación. Reintentamos solos.'
                : `${queueLen} avance(s) pendientes de sincronizar.`}
          </span>
        </div>
      ) : null}

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
        className={`mb-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
          tab === 'mapa' ? 'hidden' : ''
        } ${
          driver.isActive
            ? 'border-[rgba(0,230,118,0.35)] bg-[rgba(0,230,118,0.1)]'
            : 'border-[var(--domi-border)] bg-[var(--domi-panel)]'
        }`}
      >
        <span className="flex items-center gap-3">
          <Bike
            className={`h-5 w-5 ${driver.isActive ? 'text-[var(--domi-green)]' : 'text-[var(--domi-muted)]'}`}
          />
          <span>
            <span className="block text-sm font-bold text-white">
              {driver.isActive ? 'Disponible para Central' : 'No disponible'}
            </span>
            <span className="block text-[11px] text-[var(--domi-muted)]">
              {onShift
                ? 'La salida del turno se marca en la tablet de sede.'
                : 'Actívate en la oficina: tablet de sede con PIN de asistencia.'}
            </span>
          </span>
        </span>
      </div>
      {onShift ? (
        <button
          type="button"
          onClick={() => void onPunchShift()}
          className={`mb-4 w-full rounded-2xl bg-amber-600 py-3.5 text-sm font-black text-white ${
            tab === 'mapa' ? 'hidden' : ''
          }`}
        >
          Salida del turno
        </button>
      ) : (
        <p
          className={`mb-4 rounded-2xl border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-center text-xs font-semibold text-amber-100 ${
            tab === 'mapa' ? 'hidden' : ''
          }`}
        >
          Entrada solo en tablet de sede (PIN). No se activa desde la app.
        </p>
      )}

      {/* Escritorio: mismo menú de 4. En el celular vive abajo. */}
      <nav className="mb-3 hidden grid-cols-4 gap-2 sm:grid">
        {(
          [
            { id: 'hoy' as const, label: 'Pedidos', icon: ClipboardList },
            { id: 'mapa' as const, label: 'Mapa', icon: MapIcon },
            { id: 'radio' as const, label: 'Radio', icon: Radio },
            { id: 'perfil' as const, label: 'Perfil', icon: UserRound },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-extrabold ${
              tab === id
                ? 'border-[rgba(255,87,34,0.45)] bg-[rgba(255,87,34,0.12)] text-[var(--domi-orange)]'
                : 'border-[var(--domi-border)] bg-[var(--domi-panel)] text-[var(--domi-muted)]'
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={tab === id ? 2.6 : 1.8} />
            {label}
          </button>
        ))}
      </nav>
      <div className={`mb-4 grid grid-cols-2 gap-2 ${tab === 'mapa' ? 'hidden' : ''}`}>
        <button
          type="button"
          onClick={() => setTab('escanear')}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl border py-2.5 text-xs font-extrabold ${
            tab === 'escanear'
              ? 'border-[rgba(255,87,34,0.45)] bg-[rgba(255,87,34,0.12)] text-[var(--domi-orange)]'
              : 'border-[var(--domi-border)] bg-[var(--domi-panel)] text-[var(--domi-muted)]'
          }`}
        >
          <ScanLine className="h-4 w-4" />
          Escanear
        </button>
        <button
          type="button"
          onClick={() => setTab('turno')}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl border py-2.5 text-xs font-extrabold ${
            tab === 'turno'
              ? 'border-[rgba(255,87,34,0.45)] bg-[rgba(255,87,34,0.12)] text-[var(--domi-orange)]'
              : 'border-[var(--domi-border)] bg-[var(--domi-panel)] text-[var(--domi-muted)]'
          }`}
        >
          <Timer className="h-4 w-4" />
          Turno
        </button>
      </div>

      {tab === 'hoy' ? (
        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Abiertos', value: day.activeToday },
              { label: 'En curso', value: day.inProgress },
              { label: 'Entregados hoy', value: day.deliveredToday },
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

          {openOrders.length > 0 ? (
            <p
              className={`rounded-xl px-3 py-2 text-[11px] font-semibold ${
                gpsLiveOk
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              {gpsLiveOk
                ? 'GPS en vivo: el cliente ve tu desplazamiento.'
                : 'Activa ubicación para que el cliente vea tu ruta.'}
            </p>
          ) : null}

          {!activeOrder ? (
            <div className="rounded-2xl border border-dashed border-[var(--domi-border)] px-4 py-8 text-center text-sm text-[var(--domi-muted)]">
              Sin pedidos abiertos. Cuando Central te asigne, aparecen aquí hasta la entrega.
              {!driver.isActive ? (
                <p className="mt-2 text-[11px] text-amber-300">
                  Tip: marca entrada en la tablet de sede con tu PIN para que Central pueda
                  asignarte.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {/* Pedido activo en foco */}
              <div className="rounded-2xl border-2 border-amber-500/45 bg-[var(--domi-panel)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    {activeOrder.customerPhotoURL ? (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(activeOrder.customerPhotoURL || null)}
                        className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--domi-border)]"
                      >
                        <img
                          src={activeOrder.customerPhotoURL}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--domi-border)] bg-[#0a101c]">
                        <Package className="h-5 w-5 text-[var(--domi-orange)]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        Pedido activo
                        {activeOrder.isVip ? <VipBadge size="xs" /> : null}
                      </p>
                      <p className="font-mono mt-0.5 text-lg font-extrabold text-white">
                        {activeOrder.trackingCode}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--domi-cyan)]">
                        {DRIVER_STATUS_LABEL[activeOrder.status] || activeOrder.status}
                        {activeOrder.isVip ? ' · prioridad 1' : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-[#2B6CFF]/35 bg-[#2B6CFF]/10 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#7aa2ff]">
                    Cliente que solicitó la entrega
                  </p>
                  <p className="mt-0.5 text-base font-extrabold text-white">
                    {activeOrder.customerName?.trim() || 'Sin nombre en el pedido'}
                  </p>
                  {activeOrder.customerPhone ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => callPhone(activeOrder.customerPhone)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--domi-border)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--domi-cyan)]"
                      >
                        <Phone className="h-3 w-3" />
                        Llamar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openWhatsAppTo(
                            activeOrder.customerPhone,
                            customerWhatsAppText(whatsAppKindForStatus(activeOrder.status), {
                              trackingCode: activeOrder.trackingCode,
                              customerName: activeOrder.customerName,
                              deliveryAddress: activeOrder.deliveryAddress,
                              driverName: driver.fullName,
                            }),
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300"
                      >
                        <MessageCircle className="h-3 w-3" />
                        WhatsApp
                      </button>
                    </div>
                  ) : null}
                </div>

                <p className="mt-3 flex items-start gap-1.5 text-sm text-[var(--domi-muted)]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#2B6CFF]" />
                  <span>
                    <span className="font-bold text-[#7aa2ff]">Recogida · </span>
                    {activeOrder.pickupAddress || 'Sin recogida'}
                  </span>
                </p>
                <p className="mt-1.5 flex items-start gap-1.5 text-sm text-[var(--domi-muted)]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5722]" />
                  <span>
                    <span className="font-bold text-[#ff8a65]">Entrega · </span>
                    {activeOrder.deliveryAddress || 'Sin entrega'}
                  </span>
                </p>

                {(activeOrder.invoiceNumber || activeOrder.invoicePhotoUrl) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2">
                    {activeOrder.invoiceNumber ? (
                      <p className="text-[11px] font-semibold text-amber-200">
                        Factura: {activeOrder.invoiceNumber}
                      </p>
                    ) : null}
                    {activeOrder.invoicePhotoUrl ? (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(activeOrder.invoicePhotoUrl || null)}
                        className="text-[10px] font-bold text-[var(--domi-cyan)] underline"
                      >
                        Ver foto factura
                      </button>
                    ) : null}
                  </div>
                )}

                {payDetail ? (
                  <div
                    className={`mt-3 rounded-xl border px-3 py-2.5 ${
                      payDetail.alreadyPaid
                        ? 'border-emerald-400/45 bg-emerald-500/10'
                        : payDetail.collectCash
                          ? 'border-amber-400/45 bg-amber-500/10'
                          : 'border-white/15 bg-black/25'
                    }`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-wide text-white/70">
                      Detalles de pago · transportista
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-lg border border-white/20 bg-black/30 px-2 py-1 text-[11px] font-bold text-white">
                        1 · {payDetail.methodLabel}
                      </span>
                      <span
                        className={`rounded-lg px-2 py-1 text-[11px] font-black ${
                          payDetail.alreadyPaid
                            ? 'bg-emerald-500 text-black'
                            : payDetail.collectCash
                              ? 'bg-amber-400 text-black'
                              : 'bg-white/15 text-white'
                        }`}
                      >
                        2 · {payDetail.statusLabel}
                      </span>
                    </div>
                    {typeof activeOrder.shippingFee === 'number' && activeOrder.shippingFee > 0 ? (
                      <p className="mt-1.5 text-[11px] font-semibold text-white">
                        Flete ${activeOrder.shippingFee.toLocaleString('es-CO')}
                        {payDetail.alreadyPaid ? ' · ya incluido en el pago' : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {activeOrder.notes || activeOrder.description ? (
                  <div className="mt-2 space-y-1 text-[11px] text-[var(--domi-muted)]">
                    {activeOrder.description ? <p>{activeOrder.description}</p> : null}
                    {activeOrder.notes ? <p>Nota: {activeOrder.notes}</p> : null}
                  </div>
                ) : null}

                {activeOrder.routeDistanceKm != null ? (
                  <p className="mt-2 text-[10px] font-mono text-[var(--domi-muted)]">
                    Ruta ~{activeOrder.routeDistanceKm.toFixed(1)} km
                    {activeOrder.routeDurationMin != null
                      ? ` · ~${activeOrder.routeDurationMin} min`
                      : ''}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-1 gap-2">
                  {activeOrder.pickupCoords && activeOrder.deliveryCoords ? (
                    <>
                      <button
                        type="button"
                        onClick={() => navigateOrder(activeOrder)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2B6CFF] py-3 text-xs font-extrabold text-white"
                      >
                        <Navigation className="h-4 w-4" />
                        {openOrders.length > 1
                          ? 'Maps · todas las paradas'
                          : goingToPickup(activeOrder.status)
                            ? 'Navegar a la recogida'
                            : 'Navegar a la entrega'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTab('mapa');
                          if (openOrders.length > 1 && openJoinedTourInMaps()) return;
                          mapsAwayRef.current = true;
                          setMapsReturn({
                            kind: goingToPickup(activeOrder.status) ? 'pickup' : 'drop',
                            trackingCode: activeOrder.trackingCode,
                            orderId: activeOrder.id,
                          });
                          setSelectedOrderId(activeOrder.id);
                          openGoogleMapsNav(
                            buildGoogleMapsAbRouteUrl(
                              navStop(
                                activeOrder.pickupCoords!,
                                activeOrder.pickupAddress,
                                activeOrder.pickupPlaceId,
                              ),
                              navStop(
                                activeOrder.deliveryCoords!,
                                activeOrder.deliveryAddress,
                                activeOrder.deliveryPlaceId,
                              ),
                              true,
                            ),
                          );
                          setMsg(
                            'Maps → recogida → entrega. Al llegar cierra Maps y toca Volver a DomiClick.',
                          );
                        }}
                        className="rounded-xl border border-[var(--domi-border)] py-2.5 text-[11px] font-bold text-[var(--domi-cyan)]"
                      >
                        {openOrders.length > 1
                          ? 'Abrir tour en Maps (paradas auto)'
                          : 'Ver ruta recogida → entrega / abrir mapa'}
                      </button>
                    </>
                  ) : (
                    <p className="text-[10px] text-amber-300/90">
                      Sin coordenadas de recogida y entrega. Central debe marcarlas.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onAdvance(activeOrder)}
                    className="cta-primary w-full !py-3 text-xs"
                  >
                    {next
                      ? nextLabel || `Siguiente: ${DRIVER_STATUS_LABEL[next] || next}`
                      : 'Confirmar entrega con PIN'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIncident((v) => !v)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 py-2.5 text-[11px] font-bold text-amber-200"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Reportar incidencia
                  </button>
                </div>

                {showIncident ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-[var(--domi-border)] bg-[#0a101c] p-3">
                    <select
                      className="field-input text-xs"
                      value={incidentCategory}
                      onChange={(e) => setIncidentCategory(e.target.value)}
                    >
                      {DRIVER_INCIDENT_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="field-input min-h-[72px] text-xs"
                      placeholder="Describe el problema para Central…"
                      value={incidentNote}
                      onChange={(e) => setIncidentNote(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={incidentBusy}
                        onClick={() => void submitIncident(false)}
                        className="cta-primary !py-2.5 text-xs"
                      >
                        {incidentBusy ? 'Enviando…' : 'Enviar a Central'}
                      </button>
                      {activeOrder.customerPhone ? (
                        <button
                          type="button"
                          onClick={() =>
                            openWhatsAppTo(
                              activeOrder.customerPhone,
                              customerWhatsAppText('incident', {
                                trackingCode: activeOrder.trackingCode,
                                customerName: activeOrder.customerName,
                                driverName: driver.fullName,
                              }),
                            )
                          }
                          className="rounded-xl border border-emerald-500/40 py-2.5 text-[11px] font-bold text-emerald-300"
                        >
                          WA cliente
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Cola */}
              {openOrders.length > 1 ? (
                <div>
                  <h2 className="mb-2 font-display text-sm font-semibold text-[var(--domi-muted)]">
                    Cola ({openOrders.length})
                  </h2>
                  <ul className="space-y-2">
                    {openOrders.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedOrderId(o.id)}
                          className={`w-full rounded-xl border px-3 py-3 text-left ${
                            activeOrder.id === o.id
                              ? 'border-amber-500/40 bg-amber-500/10'
                              : 'border-[var(--domi-border)] bg-[var(--domi-panel)]'
                          }`}
                        >
                          <p className="font-mono flex flex-wrap items-center gap-2 text-xs font-bold text-white">
                            {o.trackingCode}
                            {o.isVip ? <VipBadge size="xs" /> : null}
                          </p>
                          <p className="mt-0.5 truncate text-[12px] font-bold text-white">
                            {o.customerName?.trim() || 'Cliente sin nombre'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--domi-cyan)]">
                            {DRIVER_STATUS_LABEL[o.status] || o.status}
                          </p>
                          <p className="mt-1 line-clamp-1 text-[11px] text-[var(--domi-muted)]">
                            {o.deliveryAddress || o.pickupAddress || '—'}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === 'mapa' ? (
        <section className="driver-map-stage fixed inset-x-0 top-0 z-30 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-0">
          <LiveTripMap
            fill
            pickup={activeOrder?.pickupCoords}
            delivery={activeOrder?.deliveryCoords}
            driver={liveCoords}
            driverHeading={liveHeading}
            driverMoving={liveMoving}
            driverSpeedMps={liveSpeedMps}
            navMode={navMode}
            calibrateSeq={calibrateSeq}
            status={activeOrder?.status}
            focusSeq={focusSeq}
            followMe={followMe}
            onFollowBreak={() => {
              followBrokenRef.current = true;
              setFollowMe(false);
              if (navMode === 'headingUp') setNavMode('free');
              setMsg('Mapa libre. Toca el icono de ubicación para centrar.');
            }}
            orderId={activeOrder?.id}
            tour={joinedTour.length >= 2 ? joinedTour : undefined}
            stops={mapStops.length > 0 ? mapStops : undefined}
            focusStop={focusStopTarget}
            onPickStop={(stop) => {
              // Pin 1/2/3… o R1/E2: solo ficha informativa + centrar mapa (Maps es botón aparte).
              setMapStop(stop);
              if (openOrders.some((order) => order.id === stop.orderId)) {
                setSelectedOrderId(stop.orderId);
              }
              setFollowMe(false);
              const pin = mapStops.find(
                (s) =>
                  s.orderId === stop.orderId &&
                  s.kind === stop.kind &&
                  (stop.visitSeq == null || s.visitSeq === stop.visitSeq),
              );
              if (pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng)) {
                focusStopSeqRef.current += 1;
                setFocusStopTarget({
                  lat: pin.lat,
                  lng: pin.lng,
                  seq: focusStopSeqRef.current,
                });
              }
            }}
          />
          {mapStop ? (
            (() => {
              const picked = openOrders.find((order) => order.id === mapStop.orderId) || activeOrder;
              if (!picked || picked.id !== mapStop.orderId) return null;
              const stopKind = mapStop.kind === 'pickup' ? 'pickup' : 'drop';
              return (
                <>
                  {/* Tocar fuera del detalle R/E cierra el popup. */}
                  <button
                    type="button"
                    aria-label="Cerrar detalle"
                    className="absolute inset-0 z-[39] cursor-default bg-transparent"
                    onClick={() => setMapStop(null)}
                  />
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="absolute left-3 top-[max(5.5rem,env(safe-area-inset-top))] z-40 w-[min(320px,calc(100%-5.5rem))] rounded-2xl border border-white/80 bg-white p-3 text-[#16324f] shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-[#2B6CFF]">
                          <span>
                            {mapStop.visitSeq ? `Parada ${mapStop.visitSeq} · ` : ''}
                            {mapStop.label} · {picked.trackingCode}
                          </span>
                          {picked.isVip ? <VipBadge size="xs" /> : null}
                        </p>
                        <p className="truncate text-sm font-black">{picked.customerName?.trim() || 'Cliente'}</p>
                        <p className="text-[11px] text-slate-500">{picked.customerPhone || 'Sin teléfono'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMapStop(null)}
                        className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-black text-slate-500 hover:bg-slate-100"
                      >
                        Cerrar
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-[#16324f]">
                      {DRIVER_STATUS_LABEL[picked.status] || picked.status}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug">
                      <span className="font-black text-[#FF5722]">Recogida · </span>
                      {picked.pickupAddress || 'Sin dirección'}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug">
                      <span className="font-black text-[#2B6CFF]">Entrega · </span>
                      {picked.deliveryAddress || 'Sin dirección'}
                    </p>
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        onClick={() => openStopExactInMaps(picked, 'pickup')}
                        disabled={!picked.pickupCoords}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-black text-white disabled:opacity-40 ${
                          stopKind === 'pickup' ? 'bg-[#FF5722] ring-2 ring-[#FF5722]/40' : 'bg-[#FF5722]'
                        }`}
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Maps · recogida exacta
                      </button>
                      <button
                        type="button"
                        onClick={() => openStopExactInMaps(picked, 'drop')}
                        disabled={!picked.deliveryCoords}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-black text-white disabled:opacity-40 ${
                          stopKind === 'drop' ? 'bg-[#1A73E8] ring-2 ring-[#1A73E8]/40' : 'bg-[#1A73E8]'
                        }`}
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Maps · entrega exacta
                      </button>
                    </div>
                  </div>
                </>
              );
            })()
          ) : null}
          {mapsReturn ? (
            <div className="absolute inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[45] rounded-2xl border border-[#16324f]/15 bg-[#16324f] p-3 text-white shadow-2xl">
              <p className="text-[10px] font-black uppercase tracking-wide text-white/70">
                {mapsReturn.kind === 'pickup' ? 'Navegando a recogida' : 'Navegando a entrega'} ·{' '}
                {mapsReturn.trackingCode}
              </p>
              {mapsReturn.legend ? (
                <p className="mt-0.5 text-[11px] font-black leading-snug text-[#00E5FF]">
                  En Maps: {mapsReturn.legend}
                </p>
              ) : null}
              <p className="mt-0.5 text-[12px] font-semibold leading-snug text-white/90">
                Al llegar, cierra Google Maps y vuelve aquí a DomiClick.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={returnToDomiClickFromMaps}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#FF5722] px-3 py-2.5 text-xs font-black text-white"
                >
                  <Bike className="h-3.5 w-3.5" />
                  Volver a DomiClick
                </button>
                <button
                  type="button"
                  onClick={() => setMapsReturn(null)}
                  className="rounded-xl bg-white/15 px-3 py-2.5 text-xs font-black text-white"
                  aria-label="Ocultar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
          <div className="absolute right-3 top-[max(5.5rem,env(safe-area-inset-top))] z-40 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-lg disabled:opacity-60 ${
                followMe
                  ? 'border-[#1A73E8]/50 bg-[#1A73E8] text-white'
                  : 'border-white/80 bg-white text-[#16324f]'
              }`}
              aria-pressed={followMe}
              title={followMe ? 'Siguiendo tu GPS · toca de nuevo para recentrar' : 'Centrar en mi ubicación'}
              aria-label={locating ? 'Buscando ubicación' : followMe ? 'Siguiendo GPS' : 'Centrar en mi ubicación'}
            >
              <LocateFixed className={`h-5 w-5 ${locating || followMe ? 'animate-pulse' : ''}`} />
            </button>
          </div>
          {/* Hoja tipo Route4Me: Start + paradas numeradas + OPTIMIZAR */}
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-40 px-2 sm:px-3 ${
              mapsReturn ? 'pb-[6.5rem] sm:pb-[7.5rem]' : 'pb-1.5 sm:pb-2'
            }`}
          >
            <div className="pointer-events-auto mx-auto max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0c1220]/95 shadow-[0_-8px_28px_rgba(0,0,0,0.4)] backdrop-blur-md">
              {!activeOrder ? (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--domi-cyan)]">
                      En espera
                    </p>
                    <p className="truncate text-sm font-extrabold text-white">
                      {driver.isActive ? 'Listo para un pedido' : 'Fuera de servicio'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickMenuOpen(true)}
                    className="shrink-0 rounded-xl border border-white/15 px-2.5 py-2 text-[10px] font-black text-white"
                  >
                    Detalles
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => setTourSheetOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#00E5FF]">
                        Ruta optimizada · {routeStopRows.length || 0} paradas
                      </p>
                      <p className="truncate text-sm font-black text-white">
                        {tourSummary
                          ? `${tourSummary.durationMin} min · ${tourSummary.distanceKm.toFixed(1)} km`
                          : activeOrder.trackingCode}
                        {tourSummary ? (
                          <span className="ml-2 text-[10px] font-bold text-white/60">
                            ETA ~
                            {new Date(
                              Date.now() + tourSummary.durationMin * 60_000,
                            ).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-[10px] font-black text-white">
                      {tourSheetOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                      Paradas
                    </span>
                  </button>

                  {tourSheetOpen ? (
                    <div className="max-h-[min(36vh,240px)] overflow-y-auto border-t border-white/10 px-3 pb-2 pt-1 sm:max-h-[42vh]">
                      <div className="relative pl-1">
                        <div className="absolute bottom-3 left-[1.15rem] top-3 w-px bg-white/15" />
                        <div className="relative mb-2 flex items-start gap-2.5">
                          <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2B6CFF] text-white shadow">
                            <Home className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <p className="text-[11px] font-black text-white">Inicio · tu ubicación</p>
                            <p className="text-[10px] text-white/55">
                              {gpsLiveOk ? 'GPS en vivo' : 'Activa el GPS para partir desde aquí'}
                            </p>
                          </div>
                        </div>
                        {routeStopRows.map((row) => (
                          <button
                            key={`${row.orderId}-${row.kind}-${row.visitSeq}`}
                            type="button"
                            onClick={() => {
                              // Tocar 1/R1…E2/2…: lleva al pin en el mapa DomiClick y muestra info.
                              // No abre Google Maps (eso va en los botones de la ficha).
                              setSelectedOrderId(row.orderId);
                              setMapStop({
                                orderId: row.orderId,
                                label: row.badge,
                                kind: row.kind,
                                visitSeq: row.visitSeq,
                              });
                              setFollowMe(false);
                              if (Number.isFinite(row.lat) && Number.isFinite(row.lng)) {
                                focusStopSeqRef.current += 1;
                                setFocusStopTarget({
                                  lat: row.lat,
                                  lng: row.lng,
                                  seq: focusStopSeqRef.current,
                                });
                              }
                              setMsg(
                                `Parada ${row.visitSeq} · ${row.badge} — detalle en el mapa`,
                              );
                            }}
                            className="relative mb-2 flex w-full items-start gap-2.5 rounded-xl px-0.5 py-1 text-left hover:bg-white/5"
                          >
                            <span
                              className="relative z-[1] flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-full text-white shadow"
                              style={{ background: row.color }}
                            >
                              <span className="text-[12px] font-black leading-none">{row.visitSeq}</span>
                              <span className="text-[8px] font-black leading-none opacity-95">
                                {row.badge}
                              </span>
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-black text-white">
                                <span className="truncate">{row.kindLabel}</span>
                                <span className="font-mono text-[10px] text-[#00E5FF]">
                                  {row.trackingCode}
                                </span>
                                {row.isVip ? <VipBadge size="xs" /> : null}
                              </p>
                              <p className="truncate text-[10px] font-bold text-white/80">
                                {row.customerName}
                              </p>
                              <p className="truncate text-[10px] text-white/55">{row.address}</p>
                            </div>
                            <Info className="mt-1 h-3.5 w-3.5 shrink-0 text-white/40" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-2.5 py-1.5 sm:px-3 sm:py-2">
                    {activeOrder.pickupCoords && activeOrder.deliveryCoords ? (
                      <button
                        type="button"
                        onClick={() => navigateOrder(activeOrder)}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[#FF5722] px-2 py-1.5 text-[10px] font-black text-white sm:min-h-10 sm:rounded-xl sm:text-[11px]"
                      >
                        <Navigation className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {routeStopRows.length > 1 ? 'Navegar tour' : 'Navegar'}
                      </button>
                    ) : (
                      <p className="w-full text-[10px] text-amber-300">Sin coordenadas</p>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAdvance(activeOrder)}
                      className="min-h-9 flex-1 rounded-lg border border-white/15 px-2 py-1.5 text-[10px] font-extrabold text-white sm:min-h-10 sm:rounded-xl sm:text-[11px]"
                    >
                      {next
                        ? nextLabel || DRIVER_STATUS_LABEL[next] || 'Avanzar'
                        : 'PIN entrega'}
                    </button>
                    {routeStopRows.length > 1 ? (
                      <button
                        type="button"
                        disabled={tourOptBusy || !liveCoords}
                        onClick={() => void optimizeJoinedRoute()}
                        className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-[#22c55e] px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white disabled:opacity-50 sm:min-h-9 sm:px-3 sm:text-[10px]"
                      >
                        <Route className={`h-3 w-3 ${tourOptBusy ? 'animate-pulse' : ''}`} />
                        {tourOptBusy ? '…' : 'Optimizar'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'radio' ? (
        <section className="space-y-3">
          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
              <Radio className="h-4 w-4 text-[var(--domi-cyan)]" />
              Radio con la torre
            </h2>
            <p className="mt-1 text-[11px] text-[var(--domi-muted)]">
              {radioLive
                ? 'Canal directo y en vivo. Lo que escribas llega a Radios en la torre, y lo de la torre aparece aquí.'
                : radioError
                  ? `Radio sin enlace: ${radioError}`
                  : 'Reconectando el radio con la torre…'}
            </p>
          </div>

          <div className="on-dark flex max-h-72 flex-col gap-2 overflow-y-auto rounded-2xl border border-[var(--domi-border)] bg-[#070b14] p-3">
            {chatMsgs.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--domi-muted)]">
                Sin mensajes aún. Saluda a Central o usa un preset.
              </p>
            ) : (
              chatMsgs.map((m) => {
                const mine = m.senderRole === 'driver';
                return (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                      mine
                        ? 'ml-auto bg-[#2B6CFF] text-white'
                        : 'mr-auto bg-[#FF5722] text-white'
                    }`}
                  >
                    <p className="text-[10px] font-semibold opacity-70">
                      {mine ? 'Tú' : m.senderName || 'Central'}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.text}</p>
                    {mine ? (
                      <p className="mt-1 text-right text-[10px] font-bold opacity-80">
                        {m.receipt === 'seen' ? '✓✓ Visto' : m.receipt === 'delivered' ? '✓✓ Entregado' : '✓ Enviado'}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {RADIO_QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={chatBusy}
                onClick={() => void sendRadio(q)}
                className="rounded-full border border-[var(--domi-border)] px-2.5 py-1 text-[10px] font-semibold text-[var(--domi-cyan)]"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendRadio();
            }}
          >
            <input
              className="field-input flex-1 text-sm"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Mensaje a la torre…"
              disabled={chatBusy}
            />
            <button type="submit" disabled={chatBusy || !chatInput.trim()} className="cta-primary shrink-0 !px-3">
              {chatBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
            </button>
          </form>
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
              QR de la tablet (fotos odómetro/placa).
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
                    Foto de entrega
                  </label>
                  {proofPreview ? (
                    <img
                      src={proofPreview}
                      alt="Evidencia de entrega"
                      className="h-36 w-full rounded-xl object-cover border border-[var(--domi-border)]"
                    />
                  ) : (
                    <p className="text-[11px] text-[var(--domi-muted)]">
                      Toma una foto del paquete en el destino. Si falla, puedes reintentar.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy || proofBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--domi-border)] px-3 py-2.5 text-xs font-bold text-[var(--domi-cyan)]"
                    onClick={() => void captureProof()}
                  >
                    <Camera className="h-4 w-4" />
                    {proofPreview ? 'Volver a tomar foto' : 'Abrir cámara'}
                  </button>
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
                    disabled={busy || proofBusy || pin.length < 4}
                    className="cta-primary w-full !py-2.5 text-xs"
                    onClick={() => void submitPin()}
                  >
                    Confirmar entrega
                  </button>
                </div>
              )}
            </div>
          ) : activeOrder && !DRIVER_NEXT_STATUS[activeOrder.status] ? (
            <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
              <p className="text-xs text-[var(--domi-muted)]">
                Pedido activo listo para PIN:{' '}
                <span className="font-mono font-bold text-white">{activeOrder.trackingCode}</span>
              </p>
              <button
                type="button"
                className="cta-primary mt-3 w-full !py-2.5 text-xs"
                onClick={() => {
                  setScanned(activeOrder);
                  setScanCode(activeOrder.trackingCode);
                }}
              >
                Usar pedido activo
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'turno' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.06)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--domi-cyan)]">
              Tip del día
            </p>
            <p className="mt-1 text-sm text-[var(--domi-text)]">{tip}</p>
          </div>

          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-white">Checklist pre-ruta</h3>
              <span className="text-[10px] font-semibold text-[var(--domi-muted)]">
                {checklistProgress(checkState).done}/{checklistProgress(checkState).total}
              </span>
            </div>
            <ul className="space-y-2">
              {PRE_ROUTE_CHECKLIST.map((item) => {
                const on = Boolean(checkState[item.id]);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleCheck(item.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold ${
                        on
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                          : 'border-[var(--domi-border)] bg-[#0a101c] text-[var(--domi-muted)]'
                      }`}
                    >
                      <CheckCircle2 className={`h-4 w-4 shrink-0 ${on ? 'text-emerald-300' : ''}`} />
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            {checklistProgress(checkState).complete ? (
              <p className="mt-2 text-center text-[11px] font-semibold text-emerald-300">
                Listo para salir. ¡Buen turno!
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
            <h3 className="font-display text-sm font-bold text-white">Ranking flota</h3>
            <p className="mt-1 text-[11px] text-[var(--domi-muted)]">
              Por entregas históricas. Tu meta de hoy: {earnings.deliveredToday} entrega(s).
            </p>
            {board.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--domi-muted)]">Cargando ranking…</p>
            ) : (
              <ol className="mt-3 space-y-1.5">
                {board.map((row, i) => {
                  const mine = row.id === driver.id;
                  return (
                    <li
                      key={row.id}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs ${
                        mine
                          ? 'bg-[rgba(255,87,34,0.15)] font-bold text-white'
                          : 'text-[var(--domi-muted)]'
                      }`}
                    >
                      <span>
                        #{i + 1} {row.fullName}
                        {mine ? ' (tú)' : ''}
                      </span>
                      <span className="font-mono text-[var(--domi-cyan)]">
                        {row.completedDeliveries}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {rankPosition(board, driver.id) == null && board.length > 0 ? (
              <p className="mt-2 text-[11px] text-amber-200">
                Aún no apareces en el top {board.length}. ¡Suma entregas!
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-5">
            <h2 className="font-display text-lg font-bold text-[var(--domi-text)]">
              Entrada y salida
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--domi-muted)]">
              La entrada solo se marca en la oficina: tablet de sede con tu PIN de asistencia. La
              salida se hace en la tablet con foto del tacómetro, placa, tu foto y los kilómetros.
            </p>
            {onShift ? (
              <button
                type="button"
                onClick={() => void onPunchShift()}
                className="mt-4 w-full rounded-2xl bg-amber-600 py-3.5 text-sm font-black text-white"
              >
                Salida del turno
              </button>
            ) : (
              <p className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-center text-xs font-semibold text-amber-100">
                Para activarte usa la tablet de sede con PIN. La app no marca entrada.
              </p>
            )}
            <button
              type="button"
              onClick={() => setTab('escanear')}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--domi-border)] py-3 text-xs font-extrabold text-[var(--domi-cyan)]"
            >
              <QrCode className="h-4 w-4" />
              Fotos de odómetro y placa
            </button>
          </div>

          <div className="rounded-2xl border border-[rgba(255,87,34,0.35)] bg-[rgba(255,87,34,0.08)] px-4 py-3 text-xs leading-relaxed text-[var(--domi-muted)]">
            <p className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--domi-orange)]" />
              <span>
                La salida no se cierra en el celular. En la tablet van el tacómetro, la placa, tu
                foto de salida y los kilómetros.
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
            <h3 className="font-display text-sm font-bold text-white">Ganancias / jornada de hoy</h3>
            <p className="mt-1 text-[11px] text-[var(--domi-muted)]">
              Resumen operativo (km y horas según pedidos y asistencia de sede).
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-3 text-center">
                <p className="font-display text-xl font-extrabold text-white">
                  {earnings.deliveredToday}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase text-[var(--domi-muted)]">
                  Entregas
                </p>
              </div>
              <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-3 text-center">
                <p className="font-display text-xl font-extrabold text-white">
                  {earnings.openCount}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase text-[var(--domi-muted)]">
                  Abiertos
                </p>
              </div>
              <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-3 text-center">
                <p className="font-display text-xl font-extrabold text-[var(--domi-cyan)]">
                  {earnings.routeKmToday || '—'}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase text-[var(--domi-muted)]">
                  Km ruta
                </p>
              </div>
              <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-3 text-center">
                <p className="font-display text-xl font-extrabold text-[var(--domi-orange)]">
                  {formatHours(earnings.hoursWorked)}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase text-[var(--domi-muted)]">
                  Horas turno
                </p>
              </div>
            </div>
            {earnings.odometerKm > 0 ? (
              <p className="mt-2 text-center text-[11px] text-[var(--domi-muted)]">
                Odómetro turno: {earnings.odometerKm} km
                {earnings.shiftOpen ? ' · turno abierto' : ''}
              </p>
            ) : (
              <p className="mt-2 text-center text-[11px] text-[var(--domi-muted)]">
                {earnings.shiftOpen
                  ? 'Turno abierto en sede (marca salida al cerrar).'
                  : 'Sin marcas de odómetro hoy en la tablet.'}
              </p>
            )}
            <p className="mt-2 text-center text-[11px] text-[var(--domi-muted)]">
              Históricas totales: {driver.completedDeliveries || 0}
            </p>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--domi-muted)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Estado:{' '}
            <span className={driver.isActive ? 'text-[var(--domi-green)]' : 'text-amber-300'}>
              {driver.isActive ? 'En línea' : 'Fuera de servicio'}
            </span>
          </p>
        </section>
      ) : null}

      {tab === 'perfil' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
            <div className="flex items-center gap-3">
              {driver.photoUrl ? (
                <img
                  src={driver.photoUrl}
                  alt=""
                  className="h-16 w-16 rounded-2xl border border-[var(--domi-border)] object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--domi-border)] bg-[#0a101c]">
                  <UserRound className="h-7 w-7 text-[var(--domi-orange)]" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-display text-lg font-extrabold text-white">{driver.fullName}</p>
                <p className="truncate text-[11px] text-[var(--domi-muted)]">{driver.email}</p>
                <p
                  className={`mt-1 text-[11px] font-bold ${
                    driver.isActive ? 'text-[var(--domi-green)]' : 'text-amber-300'
                  }`}
                >
                  {driver.isActive ? 'Disponible' : 'Fuera de servicio'} · {driver.status}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-2.5">
                <p className="text-[var(--domi-muted)]">Teléfono</p>
                <p className="mt-0.5 font-semibold text-white">{driver.phone || '—'}</p>
              </div>
              <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-2.5">
                <p className="text-[var(--domi-muted)]">Placa</p>
                <p className="mt-0.5 font-semibold text-white">{driver.plateNumber || '—'}</p>
              </div>
              <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-2.5">
                <p className="text-[var(--domi-muted)]">Moto</p>
                <p className="mt-0.5 font-semibold text-white">{driver.motoModel || '—'}</p>
              </div>
              <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-2.5">
                <p className="text-[var(--domi-muted)]">Entregas hoy</p>
                <p className="mt-0.5 font-semibold text-white">{earnings.deliveredToday}</p>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-[var(--domi-muted)]">
              Datos de flota solo lectura. Si hay un error (placa / moto), avisa a Central.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold text-white">
              <Settings2 className="h-4 w-4 text-[var(--domi-cyan)]" />
              Ajustes de cabina
            </h3>
            <div className="mt-3 space-y-2">
              <div className="flex w-full items-center justify-between rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-3">
                <span className="text-xs font-semibold text-white">Apariencia</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = { ...alertSettings, sound: !alertSettings.sound };
                  setAlertSettings(next);
                  writeCabinAlertSettings(next);
                  if (next.sound) unlockAlertAudio();
                }}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-white">
                  {alertSettings.sound ? (
                    <Volume2 className="h-4 w-4 text-[var(--domi-cyan)]" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-[var(--domi-muted)]" />
                  )}
                  Sonido de alertas
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    alertSettings.sound ? 'text-[var(--domi-green)]' : 'text-[var(--domi-muted)]'
                  }`}
                >
                  {alertSettings.sound ? 'ON' : 'OFF'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = { ...alertSettings, vibrate: !alertSettings.vibrate };
                  setAlertSettings(next);
                  writeCabinAlertSettings(next);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Vibrate className="h-4 w-4 text-[var(--domi-orange)]" />
                  Vibración
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    alertSettings.vibrate ? 'text-[var(--domi-green)]' : 'text-[var(--domi-muted)]'
                  }`}
                >
                  {alertSettings.vibrate ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setTab('radio')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--domi-border)] py-3 text-xs font-bold text-[var(--domi-cyan)]"
            >
              <Radio className="h-4 w-4" />
              Abrir radio con Central
            </button>
            <button
              type="button"
              onClick={() =>
                openWhatsAppTo(
                  WHATSAPP,
                  `Hola Central, soy ${driver.fullName} (${driver.plateNumber || 'sin placa'}).`,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-3 text-xs font-bold text-emerald-300"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Central
            </button>
            {onShift ? (
              <button
                type="button"
                onClick={() => void onPunchShift()}
                className="w-full rounded-xl bg-amber-600 py-3.5 text-sm font-black text-white"
              >
                Salida del turno
              </button>
            ) : (
              <p className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-3 py-3 text-center text-[11px] font-semibold text-amber-100">
                Entrada solo en tablet de sede (PIN).
              </p>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-xl border border-red-500/35 py-3 text-xs font-bold text-red-300"
            >
              Cerrar sesión
            </button>
          </div>
        </section>
      ) : null}

      {waPrompt ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-panel)] p-4 shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              Avisar al cliente
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {waPrompt.order.customerName || 'Cliente'} · {waPrompt.order.trackingCode}
            </p>
            <p className="mt-2 rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-2 text-[11px] text-[var(--domi-muted)]">
              {customerWhatsAppText(waPrompt.kind, {
                trackingCode: waPrompt.order.trackingCode,
                customerName: waPrompt.order.customerName,
                deliveryAddress: waPrompt.order.deliveryAddress,
                driverName: driver.fullName,
              })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWaPrompt(null)}
                className="rounded-xl border border-[var(--domi-border)] py-2.5 text-xs font-bold text-[var(--domi-muted)]"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={() => {
                  openWhatsAppTo(
                    waPrompt.order.customerPhone,
                    customerWhatsAppText(waPrompt.kind, {
                      trackingCode: waPrompt.order.trackingCode,
                      customerName: waPrompt.order.customerName,
                      deliveryAddress: waPrompt.order.deliveryAddress,
                      driverName: driver.fullName,
                    }),
                  );
                  setWaPrompt(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Detalle"
            className="max-h-[85vh] max-w-full rounded-xl border border-white/20 object-contain"
          />
        </button>
      ) : null}

      {/* Radio / Pánico / detalles: menú + arriba (no FABs montados sobre el mapa) */}
      <div className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70]">
        <button
          type="button"
          onClick={() => setQuickMenuOpen((v) => !v)}
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-[#0c1220]/95 text-white shadow-lg backdrop-blur-md"
          aria-expanded={quickMenuOpen}
          aria-label={quickMenuOpen ? 'Cerrar menú rápido' : 'Abrir menú rápido'}
        >
          {quickMenuOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          {!quickMenuOpen && radioUnread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00E5FF] px-1 text-[9px] font-black text-black">
              {radioUnread > 9 ? '9+' : radioUnread}
            </span>
          ) : null}
        </button>

        {quickMenuOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[71] cursor-default bg-black/25"
              aria-label="Cerrar"
              onClick={() => setQuickMenuOpen(false)}
            />
            <div className="absolute left-0 top-12 z-[72] w-[min(18.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#0c1220] shadow-2xl">
              <div className="border-b border-white/10 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-white">
                  Accesos rápidos
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setTab('radio');
                  }}
                  className="relative inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-300/40 bg-[#00E5FF]/15 py-2.5 text-[11px] font-black text-[#00E5FF]"
                >
                  <Radio className="h-3.5 w-3.5" />
                  Radio
                  {radioUnread > 0 ? (
                    <span className="absolute -right-1 -top-1 rounded-full bg-[#FF5722] px-1.5 text-[9px] text-white">
                      {radioUnread}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={incidentBusy}
                  onClick={() => {
                    setQuickMenuOpen(false);
                    void submitIncident(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-400/50 bg-red-600/90 py-2.5 text-[11px] font-black text-white disabled:opacity-60"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Pánico
                </button>
                {activeOrder ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || !goingToPickup(activeOrder.status)}
                      onClick={() => {
                        setQuickMenuOpen(false);
                        void onAdvance(activeOrder);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#FF5722]/50 bg-[#FF5722]/20 py-2.5 text-[11px] font-black text-[#FF8A65] disabled:opacity-40"
                    >
                      <Package className="h-3.5 w-3.5" />
                      Confirmar recogida
                    </button>
                    <button
                      type="button"
                      disabled={busy || goingToPickup(activeOrder.status)}
                      onClick={() => {
                        setQuickMenuOpen(false);
                        void onAdvance(activeOrder);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#00E676]/45 bg-[#00E676]/15 py-2.5 text-[11px] font-black text-[#69F0AE] disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {DRIVER_NEXT_STATUS[activeOrder.status]
                        ? 'Confirmar entrega'
                        : 'PIN de entrega'}
                    </button>
                  </>
                ) : null}
                {openOrders.length > 1 ? (
                  <button
                    type="button"
                    disabled={tourOptBusy || !liveCoords}
                    onClick={() => {
                      setQuickMenuOpen(false);
                      void optimizeJoinedRoute();
                    }}
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#00E5FF]/45 bg-[#00E5FF]/15 py-2.5 text-[11px] font-black text-[#00E5FF] disabled:opacity-50"
                  >
                    <Route className={`h-3.5 w-3.5 ${tourOptBusy ? 'animate-pulse' : ''}`} />
                    {tourOptBusy ? 'Optimizando…' : 'Optimizar ruta'}
                  </button>
                ) : null}
              </div>

              {activeOrder ? (
                <div className="space-y-2 border-t border-white/10 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#FF5722]">
                    Detalles del pedido
                  </p>
                  <p className="font-mono flex flex-wrap items-center gap-2 text-sm font-black text-white">
                    {activeOrder.trackingCode}
                    {activeOrder.isVip ? <VipBadge size="xs" /> : null}
                  </p>
                  <p className="text-[11px] font-bold text-[var(--domi-cyan)]">
                    {DRIVER_STATUS_LABEL[activeOrder.status] || activeOrder.status}
                    {activeOrder.isVip ? ' · prioridad 1' : ''}
                  </p>
                  <div className="rounded-lg border border-[#2B6CFF]/30 bg-[#2B6CFF]/10 px-2.5 py-2">
                    <p className="text-[9px] font-black uppercase tracking-wide text-[#7aa2ff]">
                      Cliente que solicitó
                    </p>
                    <p className="text-[13px] font-extrabold text-white">
                      {activeOrder.customerName?.trim() || 'Sin nombre en el pedido'}
                    </p>
                  </div>
                  {payDetail ? (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white">
                        {payDetail.methodLabel}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                          payDetail.alreadyPaid
                            ? 'bg-emerald-500 text-black'
                            : payDetail.collectCash
                              ? 'bg-amber-400 text-black'
                              : 'bg-white/15 text-white'
                        }`}
                      >
                        {payDetail.statusLabel}
                      </span>
                    </div>
                  ) : null}
                  <div className="rounded-xl bg-black/35 px-2.5 py-2 text-[11px] leading-snug text-white">
                    <p>
                      <span className="font-bold text-[#7aa2ff]">Recogida · </span>
                      {activeOrder.pickupAddress || '—'}
                    </p>
                    <p className="mt-1.5">
                      <span className="font-bold text-[#ff8a65]">Entrega · </span>
                      {activeOrder.deliveryAddress || '—'}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {activeOrder.customerPhone ? (
                      <button
                        type="button"
                        onClick={() => callPhone(activeOrder.customerPhone)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 py-2 text-[10px] font-bold text-white"
                      >
                        <Phone className="h-3 w-3" />
                        Llamar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setQuickMenuOpen(false);
                        setTab('hoy');
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 py-2 text-[10px] font-bold text-white"
                    >
                      <Package className="h-3 w-3" />
                      Pedidos
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-white/10 px-3 py-2.5 text-[11px] font-semibold leading-snug text-white">
                  {driver?.isActive
                    ? 'Sin pedido activo. Central te asigna al más cercano.'
                    : 'Fuera de servicio. Marca entrada en la tablet de sede.'}
                  {onShift ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickMenuOpen(false);
                        void onPunchShift();
                      }}
                      className="mt-2 w-full rounded-xl bg-amber-600 py-2 text-[11px] font-black text-white"
                    >
                      Salida del turno
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

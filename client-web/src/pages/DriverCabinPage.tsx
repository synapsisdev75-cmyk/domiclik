import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  KeyRound,
  Bike,
  CheckCircle2,
  ClipboardList,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  QrCode,
  Radio,
  RefreshCw,
  ScanLine,
  Settings2,
  Timer,
  UserRound,
  Volume2,
  VolumeX,
  Vibrate,
  WifiOff,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { nativeLocatorAvailable, startLiveLocator, stopLiveLocator } from '../lib/liveLocator';
import { useAuth } from '../lib/auth';
import { isNativeApp } from '../lib/appNav';
import { opsTowerUrl, WHATSAPP } from '../lib/config';
import { EmailAuthForm } from '../components/EmailAuthForm';
import { LiveTripMap } from '../components/LiveTripMap';
import { planJoinedTour } from '../lib/tour';
import {
  buildGoogleMapsAbRouteUrl,
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
  alertNewMessage,
  alertShiftClose,
  alertOrderAccepted,
  alertOrderAssigned,
  readCabinAlertSettings,
  unlockAlertAudio,
  writeCabinAlertSettings,
  type CabinAlertSettings,
} from '../lib/alerts';
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
  bumpRadioUnread,
  subscribeCabinChat,
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
  findApprovedDriverByEmail,
  findOrderForScan,
  flushAdvanceQueue,
  listDriverOrders,
  openWhatsAppTo,
  parseAttendancePhotoUrl,
  punchCabinShift,
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [scanCode, setScanCode] = useState('');
  const [scanned, setScanned] = useState<DriverOrder | null>(null);
  const [pin, setPin] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanningCam, setScanningCam] = useState(false);

  const [gpsLiveOk, setGpsLiveOk] = useState(false);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [locating, setLocating] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [online, setOnline] = useState(isBrowserOnline());
  const [weakSignal, setWeakSignal] = useState(isWeakSignal());
  const [queueLen, setQueueLen] = useState(() => pendingSyncCount());
  const [punches, setPunches] = useState<CabinAttendancePunch[]>([]);
  const [punchBusy, setPunchBusy] = useState(false);
  const [incidentCategory, setIncidentCategory] = useState<string>(DRIVER_INCIDENT_REASONS[0]);
  const [incidentNote, setIncidentNote] = useState('');
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [showIncident, setShowIncident] = useState(false);

  const [chatMsgs, setChatMsgs] = useState<CabinChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [radioLive, setRadioLive] = useState(false);
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
    if (type === 'out') {
      setTab('turno');
      setMsg(
        'La salida se marca en la tablet de sede: foto del tacómetro, de la placa, tu foto de salida y los kilómetros.',
      );
      return;
    }
    setPunchBusy(true);
    setErr(null);
    try {
      await punchCabinShift({
        driverId: driver.id,
        driverName: driver.fullName,
        type,
        lat: liveCoords?.lat,
        lng: liveCoords?.lng,
      });
      setDriver({ ...driver, isActive: true });
      setMsg('Entrada marcada. Ya estás disponible para Central.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo marcar el turno');
    } finally {
      setPunchBusy(false);
    }
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
  const chatPrimedRef = useRef(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const lastChatIdRef = useRef<string | null>(null);

  const activeOrder =
    openOrders.find((o) => o.id === selectedOrderId) || openOrders[0] || null;
  const joinedTour = useMemo(
    () => planJoinedTour(openOrders.slice(0, 3), liveCoords),
    [openOrders, liveCoords],
  );

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
          alertOrderAssigned();
          setMsg('Nuevo pedido asignado. Revísalo en Hoy.');
        }
        knownOpenIdsRef.current = ids;
      }
      setOrders(withQueue);
      cacheOpenOrders(driver.id, withQueue);
      setLoading(false);
    });
    return () => unsub();
  }, [driver?.id, driver?.status]);

  useEffect(() => {
    if (!driver?.id || driver.status !== 'approved') return;
    return subscribeDriverTodayPunches(driver.id, setPunches);
  }, [driver?.id, driver?.status]);

  useEffect(() => {
    if (!driver?.id) return;
    setCheckState(readPreRouteChecklist(driver.id, todayDateKey()));
  }, [driver?.id]);

  useEffect(() => {
    if (!driver?.id || driver.status !== 'approved') return;
    chatPrimedRef.current = false;
    lastChatIdRef.current = null;
    const chatId = `chat_${driver.id}`;
    return subscribeCabinChat(
      chatId,
      (msgs) => {
        setChatMsgs(msgs);
        setRadioLive(true);
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
            alertNewMessage();
            if (tabRef.current !== 'radio') bumpRadioUnread();
          }
        }
      },
      setRadioLive,
    );
  }, [driver?.id, driver?.status]);

  useEffect(() => {
    if (tab === 'radio') setRadioUnread(0);
  }, [tab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs, tab]);

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

  useEffect(() => {
    if (!driver?.id) return;
    if (!nativeLocatorAvailable() && !('geolocation' in navigator)) return;
    const driverId = driver.id;
    const driverName = driver.fullName;
    const plateNumber = driver.plateNumber;
    let lastPoint: { lat: number; lng: number } | null = null;
    let cancelled = false;
    let removeNative: (() => void) | undefined;

    function publishPoint(point: {
      lat: number;
      lng: number;
      heading?: number;
      speedMps?: number;
      accuracyM?: number;
    }) {
      const coords = { lat: point.lat, lng: point.lng };
      setLiveCoords(coords);
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
      const speedKnown = point.speedMps != null && point.speedMps >= 0;
      const moving = speedKnown ? (point.speedMps as number) >= 0.8 : moved >= 4;
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
        heading: point.heading,
        speedMps: point.speedMps,
        accuracyM: point.accuracyM,
        moving,
      };
      void publishDriverLiveLocation(fix).then((ok) => {
        pendingGpsRef.current = ok ? null : fix;
      });
    }

    function applyFix(pos: GeolocationPosition) {
      const speed = pos.coords.speed;
      publishPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading || undefined,
        speedMps: speed != null && speed >= 0 ? speed : undefined,
        accuracyM: pos.coords.accuracy,
      });
    }

    if (nativeLocatorAvailable()) {
      void startLiveLocator((fix) => {
        if (cancelled) return;
        publishPoint({
          lat: fix.lat,
          lng: fix.lng,
          heading: fix.heading || undefined,
          speedMps: fix.speed >= 0 ? fix.speed : undefined,
          accuracyM: fix.accuracy,
        });
      }).then((remove) => {
        if (cancelled) {
          remove();
          void stopLiveLocator();
          return;
        }
        removeNative = remove;
      });
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => applyFix(pos),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
      );

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => applyFix(pos),
        (err) => {
          if (err.code === 1 && !nativeLocatorAvailable()) setGpsLiveOk(false);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
      );
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
      navigator.geolocation.getCurrentPosition(
        (pos) => applyFix(pos),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
      );
    }, 8000);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => applyFix(pos),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
      );
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      removeNative?.();
      void stopLiveLocator();
      window.clearInterval(retryId);
      window.clearInterval(beatId);
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

  function locateMe() {
    if (!driver || !('geolocation' in navigator)) {
      setErr('Este teléfono no entregó la ubicación.');
      return;
    }
    setLocating(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLiveCoords(coords);
        setGpsLiveOk(true);
        setFocusSeq((n) => n + 1);
        setLocating(false);
        setMsg('Ubicación precisa marcada en el mapa.');
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
      () => {
        setLocating(false);
        setGpsLiveOk(false);
        setErr('No se pudo leer el GPS. Activa la ubicación precisa del teléfono.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  }

  function navigateOrder(order: DriverOrder) {
    const joined = openOrders.filter((item) => item.pickupCoords && item.deliveryCoords);
    setTab('mapa');
    setFocusSeq((n) => n + 1);
    if (joined.length > 1) {
      setMsg('Ruta unida en el mapa de DomiClick. Google solo abre una parada.');
      return;
    }
    if (!order.pickupCoords || !order.deliveryCoords) {
      setErr('Sin coordenadas de recogida y entrega. Central debe marcarlas en el mapa.');
      return;
    }
    const dest = goingToPickup(order.status)
      ? navStop(order.pickupCoords, order.pickupAddress, order.pickupPlaceId)
      : navStop(order.deliveryCoords, order.deliveryAddress, order.deliveryPlaceId);
    openGoogleMapsNav(buildGoogleMapsNavigateToUrl(dest, liveCoords));
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
          setMsg('Ruta unida en el mapa de DomiClick. Google solo abre una parada.');
        } else {
          const dest =
            next === 'en_route_origin'
              ? navStop(order.pickupCoords, order.pickupAddress, order.pickupPlaceId)
              : navStop(order.deliveryCoords, order.deliveryAddress, order.deliveryPlaceId);
          openGoogleMapsNav(buildGoogleMapsNavigateToUrl(dest, liveCoords));
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
      if (res.queued) {
        setQueueLen(pendingSyncCount());
        setMsg(`PIN guardado. ${scanned.trackingCode} se confirma en la torre cuando vuelva la señal.`);
        setPin('');
        return;
      }
      setMsg(`Entregado · ${scanned.trackingCode} · Central notificada`);
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

  if (!user) {
    return (
      <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
        <header className="mb-6 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            Cabina flota
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-white">Transportistas</h1>
          <p className="mt-2 text-sm text-[var(--domi-muted)]">
            Inicia sesión con el correo o Google aprobado por Central.
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
      </div>
    );
  }

  if (!driver || driver.status !== 'approved') {
    return (
      <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
        <header className="mb-6 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--domi-cyan)]">
            Cabina flota
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-white">Sin acceso aún</h1>
          <p className="mt-2 text-sm text-[var(--domi-muted)]">
            Tu cuenta ({user.email}) no está como transportista aprobado.
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

  const next = activeOrder ? DRIVER_NEXT_STATUS[activeOrder.status] : null;
  const nextLabel = activeOrder ? DRIVER_NEXT_LABEL[activeOrder.status] : null;

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 pt-[max(5.5rem,calc(env(safe-area-inset-top,0px)+3.25rem))] sm:px-6 sm:pt-8">
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
                : 'Marca la entrada al turno para quedar disponible.'}
            </span>
          </span>
        </span>
      </div>
      <button
        type="button"
        disabled={punchBusy}
        onClick={() => void onPunchShift()}
        className={`mb-4 w-full rounded-2xl py-3.5 text-sm font-black text-white disabled:opacity-60 ${
          tab === 'mapa' ? 'hidden' : ''
        } ${onShift ? 'bg-amber-600' : 'bg-emerald-600'}`}
      >
        {punchBusy ? 'Marcando…' : onShift ? 'Salida del turno' : 'Entrada al turno'}
      </button>

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
                  Tip: marca entrada con huella VTA en sede (o PIN tablet de respaldo) para que
                  Central pueda asignarte.
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
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        Pedido activo
                      </p>
                      <p className="font-mono mt-0.5 text-lg font-extrabold text-white">
                        {activeOrder.trackingCode}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--domi-cyan)]">
                        {DRIVER_STATUS_LABEL[activeOrder.status] || activeOrder.status}
                      </p>
                    </div>
                  </div>
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

                {activeOrder.customerName || activeOrder.customerPhone ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-white">
                      {activeOrder.customerName || 'Cliente'}
                    </p>
                    {activeOrder.customerPhone ? (
                      <>
                        <button
                          type="button"
                          onClick={() => callPhone(activeOrder.customerPhone)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--domi-border)] px-2 py-1 text-[10px] font-bold text-[var(--domi-cyan)]"
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
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300"
                        >
                          <MessageCircle className="h-3 w-3" />
                          WhatsApp
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}

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

                {activeOrder.paymentMethod || activeOrder.notes || activeOrder.description ? (
                  <div className="mt-2 space-y-1 text-[11px] text-[var(--domi-muted)]">
                    {activeOrder.paymentMethod ? (
                      <p>
                        Pago:{' '}
                        <span className="font-semibold text-white">{activeOrder.paymentMethod}</span>
                      </p>
                    ) : null}
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
                          ? 'Ver ruta unida en DomiClick'
                          : goingToPickup(activeOrder.status)
                            ? 'Navegar a la recogida'
                            : 'Navegar a la entrega'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
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
                          setTab('mapa');
                        }}
                        className="rounded-xl border border-[var(--domi-border)] py-2.5 text-[11px] font-bold text-[var(--domi-cyan)]"
                      >
                        Ver ruta recogida → entrega / abrir mapa
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
                          <p className="font-mono text-xs font-bold text-white">{o.trackingCode}</p>
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
        <section className="fixed inset-x-0 top-0 bottom-16 z-30">
          <LiveTripMap
            fill
            pickup={activeOrder?.pickupCoords}
            delivery={activeOrder?.deliveryCoords}
            driver={liveCoords}
            status={activeOrder?.status}
            focusSeq={focusSeq}
            tour={joinedTour.length >= 2 ? joinedTour : undefined}
          />
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            className="absolute right-3 top-[max(5.5rem,env(safe-area-inset-top))] z-40 inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white px-3.5 py-2.5 text-xs font-black text-[#16324f] shadow-lg disabled:opacity-60"
          >
            <LocateFixed className={`h-4 w-4 ${locating ? 'animate-pulse' : ''}`} />
            {locating ? 'Buscando…' : 'Ubicarme'}
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-1 z-40 p-3">
            <div className="pointer-events-auto rounded-3xl border border-white/10 bg-[#0c1220]/95 p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
              {!activeOrder ? (
                <>
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--domi-cyan)]">
                    En espera
                  </p>
                  <p className="mt-1 text-base font-extrabold text-white">
                    {driver.isActive ? 'Listo para un pedido' : 'Fuera de servicio'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--domi-muted)]">
                    Central asigna sola al motorizado disponible más cercano. No hay ofertas ni
                    subasta.
                  </p>
                  <p className="mt-2 text-[11px] font-bold text-emerald-300">
                    {gpsLiveOk ? 'Tu posición está en el mapa' : 'Activa el GPS para que Central te ubique'}
                  </p>
                  <button
                    type="button"
                    disabled={punchBusy}
                    onClick={() => void onPunchShift()}
                    className={`mt-3 w-full rounded-2xl py-3.5 text-sm font-black text-white disabled:opacity-60 ${
                      onShift ? 'bg-amber-600' : 'bg-emerald-600'
                    }`}
                  >
                    {punchBusy ? 'Marcando…' : onShift ? 'Salida del turno' : 'Entrada al turno'}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#FF5722]">
                        Pedido de Central
                      </p>
                      <p className="font-mono text-lg font-black text-white">
                        {activeOrder.trackingCode}
                      </p>
                      <p className="text-[11px] font-bold text-[var(--domi-cyan)]">
                        {goingToPickup(activeOrder.status)
                          ? 'Vas a la recogida'
                          : 'Vas a la entrega'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                        gpsLiveOk
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-200'
                      }`}
                    >
                      {gpsLiveOk ? 'En vivo' : 'Sin GPS'}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-[var(--domi-muted)]">
                    <span className="font-bold text-[#7aa2ff]">Recogida </span>
                    {activeOrder.pickupAddress || 'Sin recogida'}
                    <span className="mx-1 text-white/30">→</span>
                    <span className="font-bold text-[#ff8a65]">Entrega </span>
                    {activeOrder.deliveryAddress || 'Sin entrega'}
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {activeOrder.pickupCoords && activeOrder.deliveryCoords ? (
                      <button
                        type="button"
                        onClick={() => navigateOrder(activeOrder)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF5722] py-3.5 text-sm font-black text-white"
                      >
                        <Navigation className="h-4 w-4" />
                        {openOrders.length > 1 ? 'Ver ruta unida' : 'Navegar ahora'}
                      </button>
                    ) : (
                      <p className="text-xs text-amber-300">
                        Sin coordenadas. Central debe marcar recogida y entrega.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAdvance(activeOrder)}
                      className="rounded-2xl border border-white/15 py-3 text-xs font-extrabold text-white"
                    >
                      {next
                        ? nextLabel || `Siguiente: ${DRIVER_STATUS_LABEL[next] || next}`
                        : 'Confirmar entrega con PIN'}
                    </button>
                    <button
                      type="button"
                      disabled={punchBusy}
                      onClick={() => void onPunchShift()}
                      className={`w-full rounded-2xl py-3 text-xs font-black text-white disabled:opacity-60 ${
                        onShift ? 'bg-amber-600' : 'bg-emerald-600'
                      }`}
                    >
                      {punchBusy ? 'Marcando…' : onShift ? 'Salida del turno' : 'Entrada al turno'}
                    </button>
                  </div>
                </>
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
                ? 'Canal directo y en vivo. Lo que escribas llega a Radios en la torre de control.'
                : 'Reconectando el radio con la torre…'}
            </p>
          </div>

          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-2xl border border-[var(--domi-border)] bg-[#070b14] p-3">
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
                        ? 'ml-auto bg-[rgba(43,108,255,0.25)] text-white'
                        : 'mr-auto bg-[rgba(255,87,34,0.15)] text-[var(--domi-text)]'
                    }`}
                  >
                    <p className="text-[10px] font-semibold opacity-70">
                      {mine ? 'Tú' : m.senderName || 'Central'}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.text}</p>
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
              La entrada se marca aquí. La salida es al revés y se hace en la tablet de sede: foto
              del tacómetro, de la placa, tu foto y los kilómetros.
            </p>
            <button
              type="button"
              disabled={punchBusy}
              onClick={() => void onPunchShift()}
              className={`mt-4 w-full rounded-2xl py-3.5 text-sm font-black text-white disabled:opacity-60 ${
                onShift ? 'bg-amber-600' : 'bg-emerald-600'
              }`}
            >
              {punchBusy ? 'Marcando…' : onShift ? 'Salida del turno' : 'Entrada al turno'}
            </button>
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
            <button
              type="button"
              disabled={punchBusy}
              onClick={() => void onPunchShift()}
              className={`w-full rounded-xl py-3.5 text-sm font-black text-white disabled:opacity-60 ${
                onShift ? 'bg-amber-600' : 'bg-emerald-600'
              }`}
            >
              {punchBusy ? 'Marcando…' : onShift ? 'Salida del turno' : 'Entrada al turno'}
            </button>
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

      {tab !== 'radio' ? (
        <button
          type="button"
          onClick={() => setTab('radio')}
          className="fixed bottom-32 left-4 z-[60] inline-flex items-center gap-2 rounded-2xl border-2 border-cyan-200 bg-[#00E5FF] px-3.5 py-3 text-[11px] font-black uppercase tracking-wide text-black shadow-[0_0_24px_rgba(0,229,255,0.45)] sm:bottom-8"
        >
          <Radio className="h-4 w-4" />
          Radio
        </button>
      ) : null}

      {/* Pánico siempre visible en cabina */}
      <button
        type="button"
        disabled={incidentBusy}
        onClick={() => void submitIncident(true)}
        className="fixed bottom-32 right-4 z-[60] inline-flex items-center gap-2 rounded-2xl border-2 border-red-300 bg-red-600 px-3.5 py-3 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_24px_rgba(220,38,38,0.5)] disabled:opacity-60 sm:bottom-8"
        title="Emergencia — avisa a Central"
      >
        <AlertTriangle className="h-4 w-4" />
        Pánico
      </button>
    </div>
  );
}

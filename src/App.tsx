import React, { useState, useEffect, useRef } from 'react';
import { UserRole, MotorizadoDriver, DeliveryOrder, AdminAccount } from './types';
import {
  subscribeDrivers,
  subscribeOrders,
  auth,
  uploadBrandAssetsToStorage,
  clearDemoLocalCache,
  subscribeRealtimeStatus,
  subscribeAdmins,
  requestAdminAccess,
  requestStaffAccess,
  connectFirestore,
  subscribeDispatchSettings,
  subscribeIncidents,
  subscribeChatRooms,
  purgeExpiredStaffRequests,
  RealtimeSyncMeta,
} from './lib/firebase';
import { isPendingDriverStatus } from './lib/driverStatus';
import { dispatchAllPendingOrders, MAX_AUTO_ORDERS } from './lib/autoDispatch';
import { isDriverAssignable } from './lib/workShift';
import {
  alertDeliveryComplete,
  alertNewClientOrder,
  alertOrderAssigned,
  alertOrderCancelled,
  alertPaymentEvent,
  alertPaymentPaid,
  alertPanic,
  pruneUnpaidMutes,
  pushTowerOpsToast,
  startPendingOrderAlarm,
  startRadioAlarm,
  stopPendingOrderAlarm,
  stopUnpaidPaymentAlarm,
  stopRadioAlarm,
  subscribeTowerOpsToasts,
  subscribeUnpaidMute,
  unlockAlertAudio,
  type TowerOpsToast,
} from './lib/alerts';
import { isLiveOrderStatus } from './lib/orderFlow';
import { DEFAULT_DISPATCH_SETTINGS } from './lib/adminMetrics';
import type { DispatchSettings } from './types';
import { HeaderBar } from './components/HeaderBar';
import { OpsNotificationBell } from './components/admin/OpsNotificationBell';
import { Sidebar } from './components/Sidebar';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { DriverDashboard } from './components/driver/DriverDashboard';
import { DriverPreregisterForm } from './components/driver/DriverPreregisterForm';
import { AuthModal } from './components/auth/AuthModal';
import { LoginPage } from './components/auth/LoginPage';
import { BrandIdentityModal } from './components/brand/BrandIdentityModal';
import { MapWallScreen, isMapWallView } from './components/admin/MapWallScreen';
import {
  AttendanceKioskScreen,
  isAttendanceKioskView,
} from './components/driver/AttendanceKioskScreen';
import {
  AttendanceMobilePhotoScreen,
  isAttendanceMobilePhotoView,
} from './components/driver/AttendanceMobilePhotoScreen';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { completeGoogleSignInFromRedirect, readLoginRole, clearLoginRole, saveLoginRole } from './lib/googleAuth';
import {
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  safeLocalStorage,
} from './lib/safeStorage';
import { staffRoleOf, canAccessSection, findStaffAccount } from './lib/staffAccess';

function SessionLoading({ message }: { message: string }) {
  return (
    <div className="min-h-screen min-h-dvh bg-[#05080f] text-[#e8eef9] flex flex-col items-center justify-center gap-4 px-6">
      <div className="h-11 w-11 rounded-full border-2 border-[#2B6CFF] border-t-transparent animate-spin" />
      <p className="text-sm font-semibold text-white text-center">{message}</p>
      <p className="text-xs text-slate-500 text-center max-w-xs">
        Conectando con Firebase en tiempo real…
      </p>
    </div>
  );
}

function PendingAdminPanel({ email }: { email?: string }) {
  return (
    <div className="max-w-lg mx-auto my-16 text-center glass-panel rounded-3xl p-8 border border-amber-500/30">
      <h2 className="text-xl font-black text-white mb-2">Acceso de administrador pendiente</h2>
      <p className="text-sm text-slate-400 mb-3">
        Tu cuenta <span className="text-white font-semibold">{email}</span> ya está autenticada, pero{' '}
        <span className="text-amber-300">otro administrador activo</span> debe activarte en{' '}
        <span className="text-white">Usuarios → Administradores</span>.
      </p>
      <p className="text-xs text-amber-200/90 mb-2">
        Tienes 20 minutos. Si nadie te activa, esta solicitud se elimina por completo y deberás
        pedir acceso de nuevo.
      </p>
      <p className="text-xs text-slate-500">
        El primer administrador del sistema se activa automáticamente. A partir de ahí, solo un admin
        activo puede autorizar a otro.
      </p>
    </div>
  );
}

function PendingSecretaryPanel({ email }: { email?: string }) {
  return (
    <div className="max-w-lg mx-auto my-16 text-center glass-panel rounded-3xl p-8 border border-violet-500/30">
      <h2 className="text-xl font-black text-white mb-2">Acceso de secretaría pendiente</h2>
      <p className="text-sm text-slate-400 mb-3">
        Tu cuenta <span className="text-white font-semibold">{email}</span> ya está autenticada, pero{' '}
        <span className="text-violet-300">un administrador activo</span> debe activarte en{' '}
        <span className="text-white">Usuarios → Administradores</span>.
      </p>
      <p className="text-xs text-amber-200/90 mb-2">
        Tienes 20 minutos. Si nadie te activa, esta solicitud se elimina por completo y deberás
        pedir acceso de nuevo.
      </p>
      <p className="text-xs text-slate-500">
        Cuando estés activa podrás registrar pedidos, atender radios con transportistas y
        monitorear alertas de pánico en la torre.
      </p>
    </div>
  );
}

export default function App() {
  if (isMapWallView()) {
    return <MapWallScreen />;
  }
  if (isAttendanceKioskView()) {
    return <AttendanceKioskScreen />;
  }
  if (isAttendanceMobilePhotoView()) {
    return <AttendanceMobilePhotoScreen />;
  }
  return <MainApp />;
}

function MainApp() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentRole, setCurrentRole] = useState<UserRole>('driver');
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>('dashboard');
  const [drivers, setDrivers] = useState<MotorizadoDriver[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | undefined>(undefined);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [submittedCandidateId, setSubmittedCandidateId] = useState<string | null>(null);
  const [realtimeMeta, setRealtimeMeta] = useState<RealtimeSyncMeta | null>(null);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [requestedRole, setRequestedRole] = useState<UserRole>('driver');
  const [dispatchSettings, setDispatchSettings] = useState<DispatchSettings>(
    DEFAULT_DISPATCH_SETTINGS
  );
  const [opsDataReady, setOpsDataReady] = useState(false);
  const [opsToasts, setOpsToasts] = useState<TowerOpsToast[]>([]);
  const prevOrdersRef = useRef<Map<string, string>>(new Map());
  const prevPaymentRef = useRef<
    Map<
      string,
      {
        review: string;
        gateway: string;
        paid: number;
        status: string;
        channel: string;
        cancelReason: string;
      }
    >
  >(new Map());
  const prevIncidentsRef = useRef<Set<string>>(new Set());
  const adminAccountsRef = useRef<AdminAccount[]>([]);
  const prevPendingDriversRef = useRef<Set<string> | null>(null);
  const pendingDriverApps = drivers.filter((d) => isPendingDriverStatus(d.status));
  const incidentsPrimedRef = useRef(false);
  const alertsReadyRef = useRef(false);
  const paymentAlertsReadyRef = useRef(false);
  const autoDispatchingRef = useRef(false);
  const pendingAlarmOpenedAtRef = useRef(0);

  // Limpia caches locales/SW que podían mostrar demos borrados en Firebase
  useEffect(() => {
    const ls = safeLocalStorage();
    if (!ls) return;
    if (!safeGetItem(ls, 'domiclick_cleared_cache_v4')) {
      clearDemoLocalCache();
      safeSetItem(ls, 'domiclick_cleared_cache_v4', '1');
      safeRemoveItem(ls, 'domiclick_cleared_cache_v3');
      safeRemoveItem(ls, 'domiclick_cleared_demo_v1');
    }
  }, []);

  // Estado de sincronización Firestore en tiempo real
  useEffect(() => {
    return subscribeRealtimeStatus(setRealtimeMeta);
  }, []);

  // Conectar a Firestore y suscribirse en vivo: drivers + orders + admins
  useEffect(() => {
    let cancelled = false;
    let unsubDrivers: (() => void) | undefined;
    let unsubOrders: (() => void) | undefined;
    let unsubAdmins: (() => void) | undefined;
    const readyTimer = window.setTimeout(() => {
      if (!cancelled) setOpsDataReady(true);
    }, 5000);

    const markReady = () => {
      if (!cancelled) setOpsDataReady(true);
    };

    (async () => {
      await connectFirestore();
      if (cancelled) return;
      unsubDrivers = subscribeDrivers((list) => {
        setDrivers(list);
        markReady();
      });
      unsubOrders = subscribeOrders(setOrders);
      unsubAdmins = subscribeAdmins((list) => {
        adminAccountsRef.current = list;
        setAdminAccounts(list);
        markReady();
        // Solicitudes admin/secretaría sin respuesta → borrar a los 20 min
        void purgeExpiredStaffRequests(list).catch((err) =>
          console.warn('[admin] purgeExpiredStaffRequests', err),
        );
      });
    })();

    // Revisa caducidad cada minuto aunque no llegue snapshot
    const purgeTimer = window.setInterval(() => {
      void purgeExpiredStaffRequests(adminAccountsRef.current).catch(() => undefined);
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      window.clearInterval(purgeTimer);
      unsubDrivers?.();
      unsubOrders?.();
      unsubAdmins?.();
    };
  }, []);

  // Completa retorno de Google (compartido con LoginPage; no se pierde el resultado)
  useEffect(() => {
    void completeGoogleSignInFromRedirect().catch((err) => {
      console.warn('[DomiClick] Google redirect complete', err);
    });
  }, []);

  // Config de despacho (radio, auto-asignar, tarifas)
  useEffect(() => subscribeDispatchSettings(setDispatchSettings), []);

  // El radio suena solo si llega un mensaje nuevo y la torre aún no lo vio.
  useEffect(() => {
    if (currentRole !== 'admin' && currentRole !== 'secretary') {
      stopRadioAlarm();
      return;
    }
    const openedAt = Date.now();
    return subscribeChatRooms((rooms) => {
      const unread = rooms.some((room) => {
        const at = Date.parse(room.lastMessageTime || '');
        if (!Number.isFinite(at) || at <= openedAt) return false;
        return Boolean(room.unreadByAdmin || (room.unreadCountAdmin || 0) > 0);
      });
      if (unread) startRadioAlarm();
      else stopRadioAlarm();
    });
  }, [currentRole]);

  const [unpaidMuteTick, setUnpaidMuteTick] = useState(0);
  useEffect(() => subscribeUnpaidMute(setUnpaidMuteTick), []);

  // Pedidos sin asignar: alarma en loop (sin holds de pago).
  // Se apaga sola al asignar (auto o manual). Si nadie libre, sigue hasta que haya cupo.
  // Holds de pago: alarma distinta (sonido 1) hasta que paguen o se silencie.
  useEffect(() => {
    if (currentRole !== 'admin' && currentRole !== 'secretary') {
      stopPendingOrderAlarm();
      stopUnpaidPaymentAlarm();
      pendingAlarmOpenedAtRef.current = 0;
      return () => {
        stopPendingOrderAlarm();
        stopUnpaidPaymentAlarm();
      };
    }
    const unpaidIds = orders
      .filter((o) => o.paymentReviewStatus === 'pending_review')
      .map((o) => o.id);
    pruneUnpaidMutes(unpaidIds);

    // Esperando pago: no loop continuo (el cliente solo oye un ping corto al crear).
    // El loop de torre empieza cuando el pago queda listo y el pedido puede asignarse.
    stopUnpaidPaymentAlarm();

    const ringing = orders.filter((o) => {
      if (o.status !== 'pending' || o.assignedDriverId) return false;
      if (o.paymentReviewStatus === 'pending_review') return false;
      return true;
    });
    // Sigue sonando mientras haya pendientes listos sin asignar (VIP u otros).
    if (ringing.length > 0) startPendingOrderAlarm();
    else stopPendingOrderAlarm();
    return () => {
      stopPendingOrderAlarm();
      stopUnpaidPaymentAlarm();
    };
  }, [orders, currentRole, unpaidMuteTick]);

  // Alerta sonora cuando un transportista activa pánico (torre admin y secretaría)
  useEffect(() => {
    if (currentRole !== 'admin' && currentRole !== 'secretary') return;
    return subscribeIncidents((list) => {
      const openPanic = list.filter((i) => i.status === 'open' && i.isPanic);
      if (!incidentsPrimedRef.current) {
        openPanic.forEach((i) => prevIncidentsRef.current.add(i.id));
        incidentsPrimedRef.current = true;
        return;
      }
      for (const inc of openPanic) {
        if (!prevIncidentsRef.current.has(inc.id)) {
          prevIncidentsRef.current.add(inc.id);
          alertPanic();
        }
      }
    });
  }, [currentRole]);

  // Torre: asigna automáticamente al conductor activo + libre más cercano
  useEffect(() => {
    if (currentRole !== 'admin' && currentRole !== 'secretary') return;
    if (!dispatchSettings.autoAssignEnabled) return;

    const pending = orders.filter(
      (o) => o.status === 'pending' && !o.assignedDriverId && o.paymentReviewStatus !== 'pending_review',
    );
    if (pending.length === 0) return;

    const openCount = new Map<string, number>();
    for (const order of orders) {
      if (isLiveOrderStatus(order.status) && order.assignedDriverId) {
        openCount.set(order.assignedDriverId, (openCount.get(order.assignedDriverId) || 0) + 1);
      }
    }
    const hasRoom = drivers.some(
      (d) =>
        isDriverAssignable(d) &&
        d.location?.lat &&
        d.location?.lng &&
        (openCount.get(d.id) || 0) < MAX_AUTO_ORDERS,
    );
    if (!hasRoom || autoDispatchingRef.current) return;

    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (cancelled || autoDispatchingRef.current) return;
      autoDispatchingRef.current = true;
      try {
        const results = await dispatchAllPendingOrders(orders, drivers, dispatchSettings);
        const assigned = results.filter((r) => r.assigned);
        if (assigned.length > 0) {
          // Silencio inmediato; el efecto de pendientes reabre solo si queda otro sin asignar.
          stopPendingOrderAlarm();
          console.info(
            `[torre] auto-asignados ${assigned.length}:`,
            assigned.map((r) => `${r.orderId}→${r.driverName}`).join(', ')
          );
        }
      } catch (err) {
        console.warn('[torre] auto-dispatch', err);
      } finally {
        autoDispatchingRef.current = false;
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [orders, drivers, dispatchSettings, currentRole]);

  // Banners visibles de cierre de encargos
  useEffect(() => {
    return subscribeTowerOpsToasts((toast) => {
      setOpsToasts((list) => [...list.slice(-4), toast]);
      window.setTimeout(() => {
        setOpsToasts((list) => list.filter((t) => t.id !== toast.id));
      }, 9000);
    });
  }, []);

  // Torre: solicitud nueva de transportista en tiempo real
  useEffect(() => {
    const towerRole = currentRole === 'admin' || currentRole === 'secretary';
    if (!towerRole) return;
    const ids = new Set(
      drivers.filter((d) => isPendingDriverStatus(d.status)).map((d) => d.id),
    );
    const prev = prevPendingDriversRef.current;
    if (prev == null) {
      prevPendingDriversRef.current = ids;
      return;
    }
    let arrived = 0;
    for (const id of ids) {
      if (!prev.has(id)) arrived += 1;
    }
    if (arrived > 0) {
      unlockAlertAudio();
      alertNewClientOrder();
      pushTowerOpsToast({
        kind: 'cancelled',
        title: 'Solicitud de transportista',
        body:
          arrived === 1
            ? 'Llegó 1 prerregistro pendiente de aprobación.'
            : `Llegaron ${arrived} prerregistros pendientes de aprobación.`,
      });
    }
    prevPendingDriversRef.current = ids;
  }, [drivers, currentRole]);

  // Alertas: entrega / cancelación / asignación (salta la primera carga)
  useEffect(() => {
    const prev = prevOrdersRef.current;
    if (!alertsReadyRef.current) {
      orders.forEach((o) => prev.set(o.id, o.status));
      alertsReadyRef.current = true;
      return;
    }

    const towerRole = currentRole === 'admin' || currentRole === 'secretary';
    const myDriverId =
      currentRole === 'driver'
        ? drivers.find(
            (d) =>
              d.status === 'approved' &&
              currentUserEmail &&
              d.email?.toLowerCase() === currentUserEmail.toLowerCase()
          )?.id
        : undefined;

    for (const order of orders) {
      const was = prev.get(order.id);
      const code = order.trackingCode || order.id;
      const driverName = order.assignedDriverName || 'Transportista';
      const cancelReason = String(
        (order as DeliveryOrder & { cancelReason?: string }).cancelReason || '',
      );
      const paymentGatewayCancel =
        cancelReason === 'unpaid_timeout' ||
        (order.transferChannel === 'pasarela' && order.paymentReviewStatus === 'pending_review');
      // Torre: pedido nuevo → sonido corto (se corta). Loop de asignación solo si ya puede despacharse.
      if (was === undefined && order.status === 'pending' && towerRole) {
        alertNewClientOrder();
      }
      if (was !== order.status) {
        // Al asignar (auto o manual): apagar alarma de pendientes; el efecto la reabre si queda otro
        if (
          towerRole &&
          order.assignedDriverId &&
          (order.status === 'assigned' || was === 'pending') &&
          was === 'pending'
        ) {
          // Silencio inmediato al asignar; el efecto de pendientes reabre solo si queda otro sin asignar.
          stopPendingOrderAlarm();
        }
        if (order.status === 'delivered' && was && was !== 'delivered') {
          alertDeliveryComplete();
          if (towerRole) {
            pushTowerOpsToast({
              kind: 'delivered',
              title: 'Entrega exitosa',
              body: `${code} · ${driverName} finalizó el encargo.`,
            });
          }
        }
        if (order.status === 'cancelled' && was && was !== 'cancelled') {
          if (towerRole) {
            // Cancelación por pasarela: suena alertPaymentEvent (efecto aparte), no el tono genérico
            if (!paymentGatewayCancel) {
              alertOrderCancelled();
            }
            pushTowerOpsToast({
              kind: 'cancelled',
              title: paymentGatewayCancel ? 'Pago no confirmado' : 'Encargo sin éxito',
              body: paymentGatewayCancel
                ? `${code} · pasarela canceló o expiró el pago.`
                : `${code} · cancelado${order.assignedDriverName ? ` · ${driverName}` : ''}.`,
            });
          }
        }
        if (
          order.status === 'assigned' &&
          was === 'pending' &&
          currentRole === 'driver' &&
          myDriverId &&
          order.assignedDriverId === myDriverId
        ) {
          alertOrderAssigned();
        }
      }
      prev.set(order.id, order.status);
    }
  }, [orders, currentRole, currentUserEmail, drivers]);

  // Torre: alerta one-shot cuando el pago se confirma o se cancela/rechaza en la pasarela
  useEffect(() => {
    const prev = prevPaymentRef.current;
    const snap = (o: DeliveryOrder) => ({
      review: String(o.paymentReviewStatus || ''),
      gateway: String(o.paymentGatewayStatus || '').toUpperCase(),
      paid: Number(o.amountPaid || 0),
      status: o.status,
      channel: String(o.transferChannel || ''),
      cancelReason: String(
        (o as DeliveryOrder & { cancelReason?: string }).cancelReason || '',
      ),
    });

    if (!paymentAlertsReadyRef.current) {
      orders.forEach((o) => prev.set(o.id, snap(o)));
      paymentAlertsReadyRef.current = true;
      return;
    }

    const towerRole = currentRole === 'admin' || currentRole === 'secretary';
    if (!towerRole) {
      orders.forEach((o) => prev.set(o.id, snap(o)));
      return;
    }

    const gatewayFail = new Set(['DECLINED', 'ERROR', 'VOIDED']);

    for (const order of orders) {
      const before = prev.get(order.id);
      const now = snap(order);
      if (before) {
        const completed =
          (before.review === 'pending_review' && now.review === 'approved') ||
          (before.paid <= 0 && now.paid > 0) ||
          (before.gateway !== 'APPROVED' && now.gateway === 'APPROVED');
        const cancelledOnGateway =
          (!gatewayFail.has(before.gateway) && gatewayFail.has(now.gateway)) ||
          (before.status !== 'cancelled' &&
            now.status === 'cancelled' &&
            (now.cancelReason === 'unpaid_timeout' ||
              before.channel === 'pasarela' ||
              before.review === 'pending_review'));
        if (completed) {
          // Pago OK: aviso + loop hasta asignar (auto-dispatch o manual).
          alertPaymentPaid();
          stopUnpaidPaymentAlarm();
          if (order.status === 'pending' && !order.assignedDriverId) {
            startPendingOrderAlarm();
          }
          pushTowerOpsToast({
            kind: 'delivered',
            title: order.isVip ? 'Pago VIP confirmado' : 'Pago confirmado',
            body: `${order.trackingCode || order.id} · ${
              order.isVip ? 'prioridad 1 · ' : ''
            }auto-asignación.`,
          });
        } else if (cancelledOnGateway) {
          alertPaymentEvent();
        }
      }
      prev.set(order.id, now);
    }
  }, [orders, currentRole]);

  // Auth state listener (incluye retorno de Google en la misma pestaña)
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCurrentUserEmail(user.email);
        setIsAuthenticated(true);
        const saved = readLoginRole() as UserRole | null;
        if (saved === 'admin') {
          setRequestedRole('admin');
          setCurrentRole('pending_admin');
          clearLoginRole();
        } else if (saved === 'secretary') {
          setRequestedRole('secretary');
          setCurrentRole('pending_secretary');
          clearLoginRole();
        } else if (saved === 'driver' || saved === 'pending_driver') {
          setRequestedRole(saved);
          setCurrentRole(saved);
          clearLoginRole();
        }
      } else {
        setCurrentUserEmail(undefined);
        setIsAuthenticated(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Brand: solo intenta una vez; si Storage niega (403), usa /public/brand y no reintenta
  useEffect(() => {
    const ls = safeLocalStorage();
    if (!ls) return;
    if (safeGetItem(ls, 'domiclick_brand_uploaded_v2')) return;
    if (safeGetItem(ls, 'domiclick_brand_upload_skip') === '1') return;
    uploadBrandAssetsToStorage()
      .then((urls) => {
        if (Object.keys(urls).length > 0) {
          safeSetItem(ls, 'domiclick_brand_uploaded_v2', '1');
          safeSetItem(ls, 'domiclick_brand_urls', JSON.stringify(urls));
        }
      })
      .catch(() => {
        safeSetItem(ls, 'domiclick_brand_upload_skip', '1');
      });
  }, []);

  const myAdmin = findStaffAccount(
    adminAccounts,
    currentUserEmail,
    auth.currentUser?.uid
  );
  const isActiveStaff = myAdmin?.status === 'active';
  const staffRole = staffRoleOf(myAdmin);
  const isSecretary = staffRole === 'secretary';
  const wantsTowerRole =
    requestedRole === 'admin' ||
    requestedRole === 'pending_admin' ||
    requestedRole === 'secretary' ||
    requestedRole === 'pending_secretary' ||
    currentRole === 'admin' ||
    currentRole === 'pending_admin' ||
    currentRole === 'secretary' ||
    currentRole === 'pending_secretary';
  // Solo “pendiente” cuando Firestore ya confirmó la ficha. currentRole=pending_admin
  // es el estado inicial y NO debe bloquear a un admin activo.
  const adminPending =
    !isSecretary && wantsTowerRole && myAdmin?.status === 'pending';
  const secretaryPending =
    isSecretary && wantsTowerRole && myAdmin?.status === 'pending';
  const towerBootstrapping =
    isAuthenticated &&
    wantsTowerRole &&
    !isActiveStaff &&
    !adminPending &&
    !secretaryPending &&
    !opsDataReady;

  // Resolver acceso admin
  useEffect(() => {
    if (!isAuthenticated || !currentUserEmail) return;
    if (requestedRole !== 'admin' && requestedRole !== 'pending_admin') return;
    if (isSecretary) return;

    let cancelled = false;
    requestAdminAccess({
      email: currentUserEmail,
      uid: auth.currentUser?.uid || undefined,
      displayName: auth.currentUser?.displayName || currentUserEmail,
    })
      .then((acc) => {
        if (cancelled) return;
        // Evita carrera: el snapshot de admins aún no incluye al usuario recién escrito.
        setAdminAccounts((prev) => {
          const rest = prev.filter((a) => a.id !== acc.id);
          return [acc, ...rest];
        });
        setRequestedRole('admin');
        setCurrentRole(acc.status === 'active' ? 'admin' : 'pending_admin');
      })
      .catch((err) => {
        console.warn('[admin] requestAdminAccess', err);
        // No degradar a pendiente si ya estamos en torre como admin activo
        if (!cancelled && !isActiveStaff) setCurrentRole('pending_admin');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUserEmail, requestedRole, isActiveStaff, isSecretary]);

  // Resolver acceso secretaría (siempre requiere activación manual)
  useEffect(() => {
    if (!isAuthenticated || !currentUserEmail) return;
    if (requestedRole !== 'secretary' && requestedRole !== 'pending_secretary') return;
    if (!isSecretary && myAdmin && staffRoleOf(myAdmin) === 'admin') return;

    let cancelled = false;
    requestStaffAccess({
      email: currentUserEmail,
      uid: auth.currentUser?.uid || undefined,
      displayName: auth.currentUser?.displayName || currentUserEmail,
      role: 'secretary',
    })
      .then((acc) => {
        if (cancelled) return;
        setAdminAccounts((prev) => {
          const rest = prev.filter((a) => a.id !== acc.id);
          return [acc, ...rest];
        });
        setRequestedRole('secretary');
        setCurrentRole(acc.status === 'active' ? 'secretary' : 'pending_secretary');
      })
      .catch((err) => {
        console.warn('[secretary] requestStaffAccess', err);
        if (!cancelled && !isActiveStaff) setCurrentRole('pending_secretary');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUserEmail, requestedRole, isActiveStaff, isSecretary, myAdmin]);

  // Si otro admin activa/revoca en vivo, actualizar vista (sin degradar por lista vacía momentánea)
  useEffect(() => {
    if (!currentUserEmail || !myAdmin) return;
    const resolvedRole = isSecretary ? 'secretary' : 'admin';
    const resolvedPending = isSecretary ? 'pending_secretary' : 'pending_admin';

    if (myAdmin.status === 'active') {
      if (
        requestedRole === 'admin' ||
        requestedRole === 'pending_admin' ||
        requestedRole === 'secretary' ||
        requestedRole === 'pending_secretary' ||
        currentRole === 'pending_admin' ||
        currentRole === 'pending_secretary'
      ) {
        setCurrentRole(resolvedRole);
      }
    }
    if (
      myAdmin.status === 'pending' &&
      (currentRole === 'admin' || currentRole === 'secretary') &&
      (requestedRole === 'admin' ||
        requestedRole === 'pending_admin' ||
        requestedRole === 'secretary' ||
        requestedRole === 'pending_secretary')
    ) {
      setCurrentRole(resolvedPending);
    }
  }, [myAdmin?.status, myAdmin?.role, currentUserEmail, requestedRole, currentRole, isSecretary]);

  /** Perfil de motorizado vinculado al email autenticado (sin fallback a otro). */
  const myDriverMatches = drivers.filter(
    (d) =>
      Boolean(currentUserEmail) &&
      d.email?.toLowerCase() === currentUserEmail!.toLowerCase(),
  );
  const myDriverProfile =
    myDriverMatches.find((d) => d.status === 'approved') ||
    myDriverMatches.find((d) => d.status === 'pending') ||
    myDriverMatches[0] ||
    null;

  const activeApprovedDriver =
    myDriverProfile?.status === 'approved' ? myDriverProfile : null;

  // Auto-detectar rol: torre (admin/secretaría) vs transportista
  useEffect(() => {
    if (!isAuthenticated || !currentUserEmail) return;

    const wantsTower =
      requestedRole === 'admin' ||
      requestedRole === 'pending_admin' ||
      requestedRole === 'secretary' ||
      requestedRole === 'pending_secretary' ||
      currentRole === 'admin' ||
      currentRole === 'pending_admin' ||
      currentRole === 'secretary' ||
      currentRole === 'pending_secretary';

    if (wantsTower) {
      const resolvedRole = isSecretary ? 'secretary' : 'admin';
      const resolvedPending = isSecretary ? 'pending_secretary' : 'pending_admin';

      if (isActiveStaff) {
        if (currentRole !== resolvedRole) {
          setRequestedRole(resolvedRole);
          setCurrentRole(resolvedRole);
        }
        return;
      }
      if (!opsDataReady && adminAccounts.length === 0) return;
      if (adminAccounts.length > 0 && !myAdmin) {
        if (currentRole !== resolvedPending && currentRole !== resolvedRole) {
          setCurrentRole(resolvedPending);
        }
        return;
      }
      if (myAdmin?.status === 'pending' && currentRole !== resolvedPending) {
        setCurrentRole(resolvedPending);
      }
      return;
    }

    if (adminAccounts.length === 0 && drivers.length === 0) return;

    if (isActiveStaff) {
      const resolvedRole = isSecretary ? 'secretary' : 'admin';
      if (currentRole !== resolvedRole) {
        setRequestedRole(resolvedRole);
        setCurrentRole(resolvedRole);
      }
      return;
    }

    if (activeApprovedDriver) {
      if (currentRole !== 'driver') {
        setRequestedRole('driver');
        setCurrentRole('driver');
      }
      return;
    }

    if (myDriverProfile?.status === 'pending') {
      if (currentRole !== 'pending_driver') {
        setRequestedRole('pending_driver');
        setCurrentRole('pending_driver');
      }
      return;
    }

    if (
      currentRole !== 'pending_driver' &&
      currentRole !== 'pending_admin' &&
      currentRole !== 'pending_secretary'
    ) {
      setRequestedRole('pending_driver');
      setCurrentRole('pending_driver');
    }
  }, [
    isAuthenticated,
    currentUserEmail,
    isActiveStaff,
    isSecretary,
    activeApprovedDriver?.id,
    myDriverProfile?.status,
    adminAccounts.length,
    drivers.length,
    requestedRole,
    currentRole,
    opsDataReady,
    myAdmin?.status,
  ]);

  useEffect(() => {
    if (staffRole === 'secretary' && !canAccessSection(staffRole, activeSidebarTab)) {
      setActiveSidebarTab('dashboard');
    }
  }, [staffRole, activeSidebarTab]);

  const isDriverCabin =
    currentRole === 'driver' || currentRole === 'pending_driver';

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      // Ignored
    }
    clearLoginRole();
    setCurrentUserEmail(undefined);
    setIsAuthenticated(false);
    setRequestedRole('driver');
    setCurrentRole('driver');
  };

  // If not authenticated, show full Login Screen first
  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={(email, role) => {
          setCurrentUserEmail(email);
          if (role === 'admin') {
            setRequestedRole('admin');
            setCurrentRole('pending_admin');
            saveLoginRole('admin');
          } else if (role === 'secretary') {
            setRequestedRole('secretary');
            setCurrentRole('pending_secretary');
            saveLoginRole('secretary');
          } else {
            setRequestedRole(role);
            setCurrentRole(role);
            saveLoginRole(role);
          }
          setIsAuthenticated(true);
        }}
      />
    );
  }

  if (towerBootstrapping) {
    return <SessionLoading message="Preparando tu acceso a la torre de control…" />;
  }

  const isTowerActive = isActiveStaff;

  return (
    <div className="ops-shell min-h-screen min-h-dvh overflow-x-hidden bg-[#05080f] text-[#e8eef9] flex flex-col font-sans selection:bg-[#FF5722] selection:text-white">
      {opsToasts.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] mx-auto flex max-w-lg flex-col gap-2 sm:inset-x-auto sm:left-auto sm:right-4">
          {opsToasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
                t.kind === 'delivered'
                  ? 'border-emerald-400/50 bg-emerald-950/95 text-emerald-50'
                  : 'border-amber-400/50 bg-amber-950/95 text-amber-50'
              }`}
              role="status"
            >
              <p className="text-[11px] font-black uppercase tracking-wide opacity-90">{t.title}</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug">{t.body}</p>
            </div>
          ))}
        </div>
      ) : null}
      {isTowerActive && pendingDriverApps.length > 0 ? (
        <button
          type="button"
          onClick={() => setActiveSidebarTab('solicitudes')}
          className="w-full border-b border-amber-400/50 bg-amber-500 px-4 py-2.5 text-left text-sm font-black text-black"
        >
          Transportistas por aprobar · {pendingDriverApps.length} · pulsa para gestionar en
          Solicitudes
        </button>
      ) : null}
      <HeaderBar
        currentUserEmail={currentUserEmail}
        photoUrl={auth.currentUser?.photoURL}
        onOpenBrandModal={
          currentRole === 'admin' && isActiveStaff && !isSecretary
            ? () => setIsBrandModalOpen(true)
            : undefined
        }
        onLogout={handleLogout}
        onSelectRole={undefined}
        canAccessAdmin={isActiveStaff && !isSecretary}
        roleLabel={
          isActiveStaff && !isSecretary
            ? 'Admin Operador'
            : isActiveStaff && isSecretary
              ? 'Secretaría'
              : currentRole === 'admin'
                ? 'Admin Operador'
                : currentRole === 'secretary'
                  ? 'Secretaría'
                  : currentRole === 'pending_admin'
                    ? 'Admin pendiente'
                    : currentRole === 'pending_secretary'
                      ? 'Secretaría pendiente'
                      : currentRole === 'driver'
                        ? activeApprovedDriver?.fullName || 'Transportista'
                        : 'Preregistro'
        }
        compact={isDriverCabin}
        hideRoleMenu
        notificationSlot={
          isTowerActive ? (
            <OpsNotificationBell
              role={staffRole}
              orders={orders}
              drivers={drivers}
              onOpen={(section) => setActiveSidebarTab(section)}
            />
          ) : null
        }
        realtimeLive={realtimeMeta?.live}
        realtimeLabel={
          isDriverCabin
            ? realtimeMeta?.live
              ? 'EN LÍNEA'
              : 'CONECTANDO…'
            : realtimeMeta?.error
              ? 'SIN CONEXIÓN'
              : realtimeMeta?.live
                ? 'EN VIVO'
                : realtimeMeta?.fromCache
                  ? 'Sincronizando…'
                  : 'Conectando…'
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {isTowerActive && (
          <Sidebar
            activeTab={activeSidebarTab}
            onSelectTab={(tab) => setActiveSidebarTab(tab)}
            onLogout={handleLogout}
            staffRole={staffRole}
          />
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-transparent">
          {isTowerActive && (
            <AdminDashboard
              drivers={drivers}
              orders={orders}
              section={activeSidebarTab}
              onNavigate={(section) => setActiveSidebarTab(section)}
              adminAccounts={adminAccounts}
              currentAdminEmail={currentUserEmail || ''}
              staffRole={staffRole}
            />
          )}

          {adminPending && <PendingAdminPanel email={currentUserEmail} />}

          {secretaryPending && <PendingSecretaryPanel email={currentUserEmail} />}

          {isAuthenticated &&
            wantsTowerRole &&
            !isTowerActive &&
            !adminPending &&
            !secretaryPending && (
            <SessionLoading message="Verificando permisos de torre…" />
          )}

          {currentRole === 'driver' && activeApprovedDriver && (
            <DriverDashboard
              driver={activeApprovedDriver}
              allDrivers={drivers}
              orders={orders}
            />
          )}

          {currentRole === 'driver' && !activeApprovedDriver && (
            <div className="max-w-lg mx-auto my-16 text-center glass-panel rounded-3xl p-8">
              <h2 className="text-xl font-black text-white mb-2">Sin perfil de transportista</h2>
              <p className="text-sm text-slate-400 mb-4">
                No hay un motorizado aprobado vinculado. Completa el prerregistro o espera autorización del administrador.
              </p>
              <button
                type="button"
                onClick={() => setCurrentRole('pending_driver')}
                className="px-4 py-2 rounded-xl bg-[#FF5722] text-white text-sm font-bold"
              >
                Ir a prerregistro
              </button>
            </div>
          )}

          {currentRole === 'pending_driver' && (
            <DriverPreregisterForm
              onSubmittedSuccess={(id) => setSubmittedCandidateId(id)}
              existingCandidateDriver={
                drivers.find((d) => d.id === submittedCandidateId) || null
              }
            />
          )}

          <footer className="mt-12 pt-6 border-t border-[#1a2744] text-xs font-tech text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white italic font-display">Domi<span className="text-[#FF5722]">Click</span></span>
              <span className="text-slate-400">· Excelencia a un click de ti.</span>
            </div>
            <div className="text-center text-[11px] text-slate-300">
              Calle 23 37k 28 · Barrio Teusaca
              <br />
              Villavicencio, Meta
            </div>
            <div className="text-[11px] text-slate-500 text-center sm:text-right">
              © 2026 DomiClick. Todos los derechos reservados.
            </div>
          </footer>
        </main>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthenticated={(email, role) => {
          setCurrentUserEmail(email);
          setCurrentRole(role);
          setIsAuthenticated(true);
        }}
      />

      {/* Brand Identity & Strategy Modal */}
      <BrandIdentityModal
        isOpen={isBrandModalOpen}
        onClose={() => setIsBrandModalOpen(false)}
      />
    </div>
  );
}

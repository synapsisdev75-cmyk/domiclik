import React, { useState, useEffect, useRef } from 'react';
import { UserRole, MotorizadoDriver, DeliveryOrder, AdminAccount } from './types';
import {
  subscribeDrivers,
  subscribeOrders,
  toggleDriverActiveState,
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
  RealtimeSyncMeta,
} from './lib/firebase';
import { alertDeliveryComplete, alertOrderAssigned, alertPanic } from './lib/alerts';
import { dispatchAllPendingOrders } from './lib/autoDispatch';
import { isLiveOrderStatus } from './lib/orderFlow';
import { DEFAULT_DISPATCH_SETTINGS } from './lib/adminMetrics';
import type { DispatchSettings } from './types';
import { HeaderBar } from './components/HeaderBar';
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
  const prevOrdersRef = useRef<Map<string, string>>(new Map());
  const prevIncidentsRef = useRef<Set<string>>(new Set());
  const incidentsPrimedRef = useRef(false);
  const alertsReadyRef = useRef(false);
  const autoDispatchingRef = useRef(false);

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
        setAdminAccounts(list);
        markReady();
      });
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      unsubDrivers?.();
      unsubOrders?.();
      unsubAdmins?.();
    };
  }, []);

  // Completa retorno de Google (compartido con LoginPage; no se pierde el resultado)
  useEffect(() => {
    void completeGoogleSignInFromRedirect();
  }, []);

  // Config de despacho (radio, auto-asignar, tarifas)
  useEffect(() => subscribeDispatchSettings(setDispatchSettings), []);

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
    if (currentRole !== 'admin') return;
    if (!dispatchSettings.autoAssignEnabled) return;

    const pending = orders.filter((o) => o.status === 'pending' && !o.assignedDriverId);
    if (pending.length === 0) return;

    const hasFreeActive = drivers.some(
      (d) =>
        d.status === 'approved' &&
        d.isActive &&
        !d.suspended &&
        d.location?.lat &&
        d.location?.lng &&
        !orders.some(
          (o) =>
            isLiveOrderStatus(o.status) &&
            o.assignedDriverId === d.id
        )
    );
    if (!hasFreeActive || autoDispatchingRef.current) return;

    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (cancelled || autoDispatchingRef.current) return;
      autoDispatchingRef.current = true;
      try {
        const results = await dispatchAllPendingOrders(orders, drivers, dispatchSettings);
        const assigned = results.filter((r) => r.assigned);
        if (assigned.length > 0) {
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

  // Alertas: entrega finalizada / asignación (salta la primera carga)
  useEffect(() => {
    const prev = prevOrdersRef.current;
    if (!alertsReadyRef.current) {
      orders.forEach((o) => prev.set(o.id, o.status));
      alertsReadyRef.current = true;
      return;
    }

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
      if (was === undefined && order.status === 'pending' && currentRole === 'admin') {
        alertOrderAssigned();
      }
      if (was !== order.status) {
        if (order.status === 'delivered' && was && was !== 'delivered') {
          alertDeliveryComplete();
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
  const myDriverProfile =
    drivers.find(
      (d) =>
        Boolean(currentUserEmail) &&
        d.email?.toLowerCase() === currentUserEmail!.toLowerCase()
    ) || null;

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

  const handleToggleDriverStatus = (isActive: boolean) => {
    if (activeApprovedDriver) {
      toggleDriverActiveState(activeApprovedDriver.id, isActive, activeApprovedDriver.location);
    }
  };

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
    <div className="min-h-screen bg-[#05080f] text-[#e8eef9] flex flex-col font-sans selection:bg-[#FF5722] selection:text-white">
      <HeaderBar
        currentUserEmail={currentUserEmail}
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

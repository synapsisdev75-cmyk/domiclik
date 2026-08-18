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
  connectFirestore,
  subscribeDispatchSettings,
  RealtimeSyncMeta,
} from './lib/firebase';
import { alertDeliveryComplete, alertOrderAssigned } from './lib/alerts';
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
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function App() {
  if (isMapWallView()) {
    return <MapWallScreen />;
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
  const prevOrdersRef = useRef<Map<string, string>>(new Map());
  const alertsReadyRef = useRef(false);
  const autoDispatchingRef = useRef(false);

  // Limpia caches locales/SW que podían mostrar demos borrados en Firebase
  useEffect(() => {
    if (!localStorage.getItem('domiclick_cleared_cache_v4')) {
      clearDemoLocalCache();
      localStorage.setItem('domiclick_cleared_cache_v4', '1');
      localStorage.removeItem('domiclick_cleared_cache_v3');
      localStorage.removeItem('domiclick_cleared_demo_v1');
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

    (async () => {
      await connectFirestore();
      if (cancelled) return;
      unsubDrivers = subscribeDrivers(setDrivers);
      unsubOrders = subscribeOrders(setOrders);
      unsubAdmins = subscribeAdmins(setAdminAccounts);
    })();

    return () => {
      cancelled = true;
      unsubDrivers?.();
      unsubOrders?.();
      unsubAdmins?.();
    };
  }, []);

  // Config de despacho (radio, auto-asignar, tarifas)
  useEffect(() => subscribeDispatchSettings(setDispatchSettings), []);

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
        const saved = sessionStorage.getItem('domiclick_login_role') as UserRole | null;
        if (saved === 'admin' || saved === 'driver' || saved === 'pending_driver') {
          setRequestedRole(saved);
          if (saved !== 'admin') setCurrentRole(saved);
          sessionStorage.removeItem('domiclick_login_role');
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
    if (localStorage.getItem('domiclick_brand_uploaded_v2')) return;
    if (localStorage.getItem('domiclick_brand_upload_skip') === '1') return;
    uploadBrandAssetsToStorage()
      .then((urls) => {
        if (Object.keys(urls).length > 0) {
          localStorage.setItem('domiclick_brand_uploaded_v2', '1');
          localStorage.setItem('domiclick_brand_urls', JSON.stringify(urls));
        }
      })
      .catch(() => {
        localStorage.setItem('domiclick_brand_upload_skip', '1');
      });
  }, []);

  const myAdmin = adminAccounts.find(
    (a) => currentUserEmail && a.email.toLowerCase() === currentUserEmail.toLowerCase()
  );
  const isActiveAdmin = myAdmin?.status === 'active';

  // Resolver acceso admin: primer admin se auto-activa; los demás esperan aprobación
  useEffect(() => {
    if (!isAuthenticated || !currentUserEmail) return;
    if (requestedRole !== 'admin' && requestedRole !== 'pending_admin') return;

    let cancelled = false;
    requestAdminAccess({
      email: currentUserEmail,
      uid: auth.currentUser?.uid || undefined,
      displayName: auth.currentUser?.displayName || currentUserEmail,
    })
      .then((acc) => {
        if (cancelled) return;
        setCurrentRole(acc.status === 'active' ? 'admin' : 'pending_admin');
      })
      .catch(() => {
        if (!cancelled) setCurrentRole('pending_admin');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUserEmail, requestedRole]);

  // Si otro admin activa/revoca en vivo, actualizar vista
  useEffect(() => {
    if (!currentUserEmail || !myAdmin) return;
    if (myAdmin.status === 'active' && (requestedRole === 'admin' || currentRole === 'pending_admin')) {
      setCurrentRole('admin');
    }
    if (myAdmin.status !== 'active' && currentRole === 'admin') {
      setCurrentRole('pending_admin');
    }
  }, [myAdmin?.status, currentUserEmail]);

  /** Perfil de motorizado vinculado al email autenticado (sin fallback a otro). */
  const myDriverProfile =
    drivers.find(
      (d) =>
        Boolean(currentUserEmail) &&
        d.email?.toLowerCase() === currentUserEmail!.toLowerCase()
    ) || null;

  const activeApprovedDriver =
    myDriverProfile?.status === 'approved' ? myDriverProfile : null;

  // Auto-detectar rol: admin activo → torre; repartidor aprobado → cabina (sin dropdown)
  useEffect(() => {
    if (!isAuthenticated || !currentUserEmail) return;
    // Esperar a que carguen listas (evita flash incorrecto)
    if (adminAccounts.length === 0 && drivers.length === 0) return;

    if (isActiveAdmin) {
      if (currentRole !== 'admin') {
        setRequestedRole('admin');
        setCurrentRole('admin');
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

    // Pidió admin y no es activo → pendiente admin
    if (requestedRole === 'admin' || requestedRole === 'pending_admin') {
      if (currentRole !== 'pending_admin') setCurrentRole('pending_admin');
      return;
    }

    // Sin perfil de flota: prerregistro
    if (currentRole !== 'pending_driver' && currentRole !== 'pending_admin') {
      setRequestedRole('pending_driver');
      setCurrentRole('pending_driver');
    }
  }, [
    isAuthenticated,
    currentUserEmail,
    isActiveAdmin,
    activeApprovedDriver?.id,
    myDriverProfile?.status,
    adminAccounts.length,
    drivers.length,
    requestedRole,
    currentRole,
  ]);

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
          setRequestedRole(role === 'admin' ? 'admin' : role);
          if (role !== 'admin') setCurrentRole(role);
          else setCurrentRole('pending_admin');
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#05080f] text-[#e8eef9] flex flex-col font-sans selection:bg-[#FF5722] selection:text-white">
      <HeaderBar
        currentUserEmail={currentUserEmail}
        onOpenBrandModal={
          currentRole === 'admin' || currentRole === 'pending_admin'
            ? () => setIsBrandModalOpen(true)
            : undefined
        }
        onLogout={handleLogout}
        onSelectRole={undefined}
        canAccessAdmin={isActiveAdmin}
        roleLabel={
          currentRole === 'admin'
            ? 'Admin Operador'
            : currentRole === 'pending_admin'
              ? 'Admin pendiente'
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
              ? 'Firebase error'
              : realtimeMeta?.live
                ? 'EN VIVO · Firebase'
                : realtimeMeta?.fromCache
                  ? 'Sincronizando…'
                  : 'Conectando Firebase…'
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {(currentRole === 'admin' || currentRole === 'pending_admin') && (
          <Sidebar
            activeTab={activeSidebarTab}
            onSelectTab={(tab) => setActiveSidebarTab(tab)}
            onLogout={handleLogout}
          />
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-transparent">
          {currentRole === 'admin' && isActiveAdmin && (
            <AdminDashboard
              drivers={drivers}
              orders={orders}
              section={activeSidebarTab}
              onNavigate={(section) => setActiveSidebarTab(section)}
              adminAccounts={adminAccounts}
              currentAdminEmail={currentUserEmail || ''}
            />
          )}

          {currentRole === 'pending_admin' && (
            <div className="max-w-lg mx-auto my-16 text-center glass-panel rounded-3xl p-8 border border-amber-500/30">
              <h2 className="text-xl font-black text-white mb-2">Acceso de administrador pendiente</h2>
              <p className="text-sm text-slate-400 mb-3">
                Tu cuenta <span className="text-white font-semibold">{currentUserEmail}</span> ya está
                autenticada, pero <span className="text-amber-300">otro administrador activo</span> debe
                activarte en <span className="text-white">Usuarios → Administradores</span>.
              </p>
              <p className="text-xs text-slate-500">
                El primer administrador del sistema se activa automáticamente. A partir de ahí, solo un
                admin activo puede autorizar a otro.
              </p>
            </div>
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
            <div className="text-center sm:text-left text-[11px] text-slate-300">
              SISTEMA LOGÍSTICO INTELIGENTE · Villavicencio, Meta
            </div>
            <div className="text-[11px] text-slate-500">
              DomiClick © 2026
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

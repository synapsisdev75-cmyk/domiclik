import React, { useState, useEffect } from 'react';
import { MotorizadoDriver, DeliveryOrder, AdminAccount } from '../../types';
import { MapComponent, MapStyleType } from '../MapComponent';
import { GoogleMapRadar, getGoogleMapsApiKey } from '../GoogleMapRadar';
import { BrandIcon } from '../brand/BrandAssets';
import { ChatWindow } from '../chat/ChatWindow';
import { CreateOrderModal } from './CreateOrderModal';
import { AdminSection, AdminSectionPanels } from './AdminSectionPanels';
import { BANNER_HERO_VIDEO_URL } from '../../lib/firebase';
import { Plus, MapPin, MessageSquare, ShieldCheck, PictureInPicture2 } from 'lucide-react';
import {
  DomiMotoIcon,
  DomiRadarIcon,
  DomiTowerIcon,
  DomiCargoIcon,
} from '../ui/CustomIcons';
import { ORDER_STATUS_LABEL, isLiveOrderStatus } from '../../lib/orderFlow';
import { openMapWallWindow } from './MapWallScreen';
import { MapWallVideoPanel } from './MapWallVideoPanel';
import { staffCan } from '../../lib/staffAccess';
import { subscribeIncidents } from '../../lib/firebase';
import type { OpsIncident } from '../../types';
import { AlertTriangle } from 'lucide-react';

import type { AdminSection } from './AdminSectionPanels';
import type { StaffRole } from '../../types';

interface AdminDashboardProps {
  drivers: MotorizadoDriver[];
  orders: DeliveryOrder[];
  section?: AdminSection | string;
  onNavigate?: (section: AdminSection) => void;
  adminAccounts?: AdminAccount[];
  currentAdminEmail?: string;
  staffRole?: StaffRole;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  drivers,
  orders,
  section = 'dashboard',
  onNavigate,
  adminAccounts = [],
  currentAdminEmail = '',
  staffRole = 'admin',
}) => {
  const isSecretary = staffRole === 'secretary';
  const canCreateOrders = staffCan(staffRole, 'orders.create');
  const [selectedDriverForChat, setSelectedDriverForChat] = useState<MotorizadoDriver | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [incidents, setIncidents] = useState<OpsIncident[]>([]);
  const [mapStyleToggle, setMapStyleToggle] = useState<'map' | 'satellite'>('map');
  const radarMapStyle: MapStyleType =
    mapStyleToggle === 'satellite' ? 'google_satellite' : 'dark';
  const googleMapsKey = getGoogleMapsApiKey();
  const useGoogleMaps = Boolean(googleMapsKey) && mapStyleToggle === 'map';

  const go = (s: AdminSection) => onNavigate?.(s);

  const approvedDrivers = drivers.filter((d) => d.status === 'approved');
  const activeDrivers = approvedDrivers.filter((d) => d.isActive);
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const transitOrders = orders.filter(
    (o) => isLiveOrderStatus(o.status)
  ).length;
  const todayKey = new Date().toISOString().split('T')[0];
  const deliveredToday = orders.filter(
    (o) =>
      o.status === 'delivered' && (o.updatedAt || o.createdAt || '').startsWith(todayKey)
  ).length;
  const totalOrders = orders.length;
  const successPct =
    totalOrders > 0 ? Math.round((deliveredToday / totalOrders) * 1000) / 10 : 0;
  const activePct =
    approvedDrivers.length > 0
      ? Math.round((activeDrivers.length / approvedDrivers.length) * 100)
      : 0;

  const displayOrders = orders;
  const emptyFleet = approvedDrivers.length === 0;
  const emptyOrders = displayOrders.length === 0;

  const deliveredPct = totalOrders ? Math.round((deliveredToday / totalOrders) * 100) : 0;
  const transitPct = totalOrders ? Math.round((transitOrders / totalOrders) * 100) : 0;
  const pendingPct = Math.max(0, 100 - deliveredPct - transitPct);

  const currentSection = (
    section === 'sectores' ? 'dashboard' : section || 'dashboard'
  ) as AdminSection;

  useEffect(() => subscribeIncidents(setIncidents), []);

  const openPanic = incidents.filter((i) => i.status === 'open' && i.isPanic);
  const chatSender =
    isSecretary
      ? `Secretaría · ${(currentAdminEmail || 'torre').split('@')[0]}`
      : 'Admin DomiClick';
  const chatRole = isSecretary ? ('secretary' as const) : ('admin' as const);

  return (
    <div className="w-full space-y-6 select-none font-sans text-slate-100 domiclick-flow-pattern rounded-3xl p-1">
      {currentSection !== 'dashboard' ? (
        <div className="glass-panel rounded-3xl p-5 sm:p-6 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
          <AdminSectionPanels
            drivers={drivers}
            orders={orders}
            section={currentSection}
            onOpenCreateOrder={() => setIsCreateModalOpen(true)}
            adminAccounts={adminAccounts}
            currentAdminEmail={currentAdminEmail}
            staffRole={staffRole}
          />
        </div>
      ) : (
        <>
          {openPanic.length > 0 && (
            <button
              type="button"
              onClick={() => go('incidentes')}
              className="w-full text-left rounded-2xl border-2 border-red-500/70 bg-red-950/40 p-4 flex items-center gap-3 animate-pulse hover:bg-red-950/55 transition"
            >
              <AlertTriangle className="w-8 h-8 text-red-400 shrink-0" />
              <div>
                <div className="text-sm font-black text-red-200 uppercase tracking-wide">
                  Botón de pánico activo · {openPanic.length} alerta{openPanic.length > 1 ? 's' : ''}
                </div>
                <div className="text-xs text-red-300/90 mt-0.5">
                  {openPanic[0].driverName || openPanic[0].reportedByName} — pulsa para ver en Incidentes
                </div>
              </div>
            </button>
          )}

          {/* Hero + KPIs */}
          <div className="relative overflow-hidden rounded-3xl border border-[#142340] min-h-[320px] p-6 sm:p-8 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
            {/* Video banner en bucle — visible detrás del texto */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl z-0">
              <video
                className="absolute inset-0 w-full h-full object-cover scale-105"
                src={BANNER_HERO_VIDEO_URL}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-hidden
              />
              {/* Overlay ligero: el video se ve, el texto sigue legible */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#05080f]/80 via-[#05080f]/45 to-[#05080f]/25" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
              <div className="lg:col-span-7 space-y-3">
                <span className="text-xs font-semibold text-slate-200 font-tech tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                  Bienvenido a
                </span>
                <h1 className="text-4xl sm:text-5xl font-black italic tracking-tight font-display">
                  <span className="text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">Domi</span>
                  <span className="text-[#FF5722] drop-shadow-[0_0_20px_rgba(255,87,34,0.7)] ml-1">
                    Click
                  </span>
                </h1>
                <h2 className="text-lg sm:text-xl font-bold text-[#00E5FF] tracking-wide font-tech drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  {isSecretary
                    ? 'Cabina de Secretaría · Pedidos y radios'
                    : 'Centro de Operaciones Villavicencio'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-100 max-w-xl leading-relaxed drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
                  Sistema digital de encargos locales. Conectamos clientes con transportistas
                  independientes y supervisamos cada entrega en Villavicencio.
                </p>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
                <button
                  type="button"
                  onClick={() => go(isSecretary ? 'chats' : 'flota')}
                  className="text-left bg-[#0B1222]/95 backdrop-blur-md border border-[#182B4D] rounded-2xl p-4 shadow-xl hover:border-[#FF5722] transition-colors neon-border-orange cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
                        MOTORIZADOS ACTIVOS
                      </span>
                      <div className="text-2xl font-black text-white font-tech mt-1 flex items-baseline gap-1">
                        <span>{activeDrivers.length}</span>
                        <span className="text-xs text-slate-400 font-normal">
                          / {approvedDrivers.length}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-24 rounded-full bg-[#121D36] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#FF5722] to-[#ff8a50]"
                          style={{ width: `${activePct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#00E676] font-tech font-bold block mt-1">
                        {approvedDrivers.length ? `${activePct}% Disponibles` : 'Sin flota aún'}
                      </span>
                    </div>
                    <BrandIcon name="kpiMotorizados" className="w-12 h-12" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => go('solicitudes')}
                  className="text-left bg-[#0B1222]/90 border border-[#182B4D] rounded-2xl p-4 shadow-xl hover:border-[#00E5FF] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
                        SOLICITUDES PENDIENTES
                      </span>
                      <div className="text-2xl font-black text-white font-tech mt-1">
                        {pendingOrders}
                      </div>
                      <span className="text-[10px] text-amber-400 font-tech font-bold block mt-1">
                        {pendingOrders ? 'En espera de asignación' : 'Sin pendientes'}
                      </span>
                    </div>
                    <BrandIcon name="kpiSolicitudes" className="w-12 h-12" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => go('envios')}
                  className="text-left bg-[#0B1222]/90 border border-[#182B4D] rounded-2xl p-4 shadow-xl hover:border-[#00E5FF] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
                        ENVÍOS EN TRÁNSITO
                      </span>
                      <div className="text-2xl font-black text-[#00E5FF] font-tech mt-1">
                        {transitOrders}
                      </div>
                      <span className="text-[10px] text-slate-400 font-tech font-bold block mt-1">
                        En curso ahora
                      </span>
                    </div>
                    <BrandIcon name="kpiTransito" className="w-12 h-12" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => go('historial')}
                  className="text-left bg-[#0B1222]/90 border border-[#182B4D] rounded-2xl p-4 shadow-xl hover:border-[#FF5722] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
                        ENTREGAS HOY
                      </span>
                      <div className="text-2xl font-black text-[#FF5722] font-tech mt-1">
                        {deliveredToday}
                      </div>
                      <span className="text-[10px] text-slate-400 font-tech font-bold block mt-1">
                        Completadas hoy
                      </span>
                    </div>
                    <BrandIcon name="kpiEntregas" className="w-12 h-12" />
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Telemetry bar */}
          <div className="bg-[#080E1C] border border-[#152342] rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg font-tech text-xs">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <BrandIcon name="gps" className="w-6 h-6" />
                <span className="text-slate-400 font-bold">GPS ONLINE:</span>
                <span className="text-[#00E676] font-black">
                  {activeDrivers.length}/{approvedDrivers.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <BrandIcon name="servidor" className="w-6 h-6" />
                <span className="text-slate-400 font-bold">SERVIDOR:</span>
                <span className="text-[#00E676] font-black">ÓPTIMO</span>
              </div>
              <div className="flex items-center gap-2">
                <BrandIcon name="rastreo" className="w-6 h-6" />
                <span className="text-slate-400 font-bold">MAPAS:</span>
                <span className="text-[#00E5FF] font-black">
                  {useGoogleMaps ? 'GOOGLE' : 'LEAFLET'}
                </span>
              </div>
            </div>
            {canCreateOrders && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-gradient-to-r from-[#FF5722] via-[#F4511E] to-[#D84315] hover:scale-105 text-white font-black px-5 py-2.5 rounded-xl transition shadow-[0_0_25px_rgba(255,87,34,0.5)] border border-[#FF7043] flex items-center gap-2 text-xs tracking-wider uppercase shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>NUEVA SOLICITUD</span>
            </button>
            )}
          </div>

          {/* Map — solo administrador */}
          {!isSecretary && (
          <div className="bg-[#070B16] border border-[#142340] rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 font-mono">
              <button
                type="button"
                onClick={() => go('rutas')}
                className="flex items-center gap-2 hover:opacity-90 transition"
              >
                <DomiRadarIcon className="w-5 h-5" color="#00F0FF" />
                <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                  RADAR OPERATIVO EN TIEMPO REAL
                </h3>
              </button>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[#0A1122] p-1 rounded-xl border border-[#1A2D52] text-xs">
                  <button
                    onClick={() => setMapStyleToggle('map')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition ${
                      mapStyleToggle === 'map'
                        ? 'bg-[#FF5722] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Google Maps
                  </button>
                  <button
                    onClick={() => setMapStyleToggle('satellite')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition ${
                      mapStyleToggle === 'satellite'
                        ? 'bg-[#2B6CFF] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Satélite
                  </button>
                </div>
                <button
                  type="button"
                  onClick={openMapWallWindow}
                  title="Abrir solo el mapa en otra pantalla"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#00E5FF]/40 bg-[#0A1122] text-[#00E5FF] text-xs font-black hover:bg-[#00E5FF]/10 transition"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                  <span className="hidden sm:inline uppercase tracking-wide">Otra pantalla</span>
                </button>
              </div>
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-[#182A4D] h-[480px]">
              {useGoogleMaps ? (
                <GoogleMapRadar
                  drivers={approvedDrivers}
                  orders={displayOrders}
                  height="h-full"
                  apiKey={googleMapsKey}
                />
              ) : (
                <MapComponent
                  drivers={approvedDrivers}
                  orders={displayOrders}
                  height="h-full"
                  showFilters={false}
                  mapStyle={radarMapStyle}
                  compactChrome
                />
              )}
            </div>
            <div className="mt-4">
              <MapWallVideoPanel />
            </div>
          </div>
          )}

          {/* Bottom grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-[#070B16] border border-[#142340] rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#142340] pb-3">
                <h3 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
                  <DomiCargoIcon className="w-5 h-5" color="#FF5722" />
                  SOLICITUDES RECIENTES
                </h3>
                <button
                  type="button"
                  onClick={() => go('solicitudes')}
                  className="text-[11px] text-[#00F0FF] hover:underline font-mono font-bold"
                >
                  Ver todas
                </button>
              </div>
              <div className="space-y-2.5">
                {emptyOrders ? (
                  <div className="text-center py-8 px-3 text-xs text-slate-400">
                    <p className="font-bold text-white mb-1">Sin pedidos aún</p>
                    <p>Los pedidos aparecen aquí cuando un cliente solicita una entrega.</p>
                  </div>
                ) : (
                  displayOrders.slice(0, 8).map((ord) => {
                    let badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                    const badgeLabel = ORDER_STATUS_LABEL[ord.status] || ord.status;
                    if (ord.status === 'delivered') {
                      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                    } else if (ord.status === 'cancelled') {
                      badgeColor = 'bg-red-500/20 text-red-300 border-red-500/40';
                    } else if (isLiveOrderStatus(ord.status)) {
                      badgeColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
                    }
                    return (
                      <button
                        type="button"
                        key={ord.id}
                        onClick={() => go(ord.status === 'pending' ? 'solicitudes' : 'envios')}
                        className="w-full text-left bg-[#0A1020] border border-[#162748] rounded-2xl p-3 flex items-center justify-between gap-3 hover:border-[#FF5722]/50 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-[#FF5722]/15 border border-[#FF5722]/40 flex items-center justify-center shrink-0">
                            <DomiCargoIcon className="w-5 h-5" color="#FF5722" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white font-mono">
                              {ord.trackingCode || ord.id}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {ord.customerName} → {ord.deliveryAddress}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border shrink-0 ${badgeColor}`}
                        >
                          {badgeLabel}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="lg:col-span-4 bg-[#070B16] border border-[#142340] rounded-3xl p-5 shadow-2xl flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-[#142340] pb-3">
                <h3 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
                  <DomiMotoIcon className="w-5 h-5" color="#00E676" />
                  FLOTA DE MOTORIZADOS
                </h3>
                <button
                  type="button"
                  onClick={() => go(isSecretary ? 'chats' : 'flota')}
                  className="text-[11px] text-[#00F0FF] hover:underline font-mono font-bold"
                >
                  {isSecretary ? 'Ver radios' : 'Ver flota'}
                </button>
              </div>
              <div className="space-y-2.5 flex-1">
                {emptyFleet ? (
                  <div className="text-center py-8 px-3 text-xs text-slate-400">
                    <p className="font-bold text-white mb-1">Sin transportistas</p>
                    <p>Aparecen al registrarse y ser aprobados.</p>
                  </div>
                ) : (
                  approvedDrivers.slice(0, 5).map((drv, i) => (
                    <div
                      key={drv.id}
                      className="bg-[#0A1020] border border-[#162748] rounded-2xl p-3 flex items-center justify-between gap-3 hover:border-[#00E676]/50 transition cursor-pointer"
                      onClick={() => setSelectedDriverForChat(drv)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-full overflow-hidden shrink-0 border ${
                            drv.isActive ? 'border-[#00E676]/50' : 'border-[#2B6CFF]/50'
                          } bg-[#0B1428] flex items-center justify-center`}
                        >
                          {drv.photoUrl ? (
                            <img
                              src={drv.photoUrl}
                              alt={drv.fullName}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                const el = e.currentTarget;
                                el.style.display = 'none';
                                const fallback = el.nextElementSibling as HTMLElement | null;
                                if (fallback) fallback.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <img
                            src="/brand/icons/flota.png"
                            alt=""
                            className={`w-7 h-7 object-contain ${drv.photoUrl ? 'hidden' : ''}`}
                            aria-hidden
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white font-tech truncate">
                            {drv.fullName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-tech truncate">
                            {drv.plateNumber || drv.motoModel || `DC-00${i + 1}`}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#00E5FF] font-tech font-bold flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" /> Chat
                      </span>
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => go(isSecretary ? 'chats' : 'flota')}
                className="w-full py-2.5 rounded-xl bg-[#0B1428] hover:bg-[#121F3D] border border-[#192E56] text-slate-200 text-xs font-mono font-bold transition flex items-center justify-center gap-2"
              >
                <DomiMotoIcon className="w-4 h-4" color="#00F0FF" />
                {isSecretary ? 'Abrir radios' : 'Gestionar Flota'}
              </button>
            </div>

            <div className="lg:col-span-3 bg-[#070B16] border border-[#142340] rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#142340] pb-3">
                <h3 className="text-xs font-black text-white font-mono uppercase tracking-wider">
                  ESTADÍSTICAS DEL DÍA
                </h3>
                <button
                  type="button"
                  onClick={() => go(isSecretary ? 'incidentes' : 'reportes')}
                  className="text-[11px] text-[#00F0FF] hover:underline font-mono font-bold"
                >
                  {isSecretary ? 'Pánico' : 'Ver'}
                </button>
              </div>
              <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#121D36"
                    strokeWidth="4"
                  />
                  {totalOrders > 0 && (
                    <>
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#00E676"
                        strokeWidth="4"
                        strokeDasharray={`${deliveredPct}, 100`}
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#0052FF"
                        strokeWidth="4"
                        strokeDasharray={`${transitPct}, 100`}
                        strokeDashoffset={-deliveredPct}
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#FF5722"
                        strokeWidth="4"
                        strokeDasharray={`${pendingPct}, 100`}
                        strokeDashoffset={-(deliveredPct + transitPct)}
                      />
                    </>
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center font-mono text-center">
                  <span className="text-3xl font-black text-white">{displayOrders.length}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Total Envíos</span>
                </div>
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Completados</span>
                  <span className="font-bold text-white">{deliveredToday}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>En Tránsito</span>
                  <span className="font-bold text-white">{transitOrders}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Pendientes</span>
                  <span className="font-bold text-white">{pendingOrders}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Brand banner */}
          <div className="bg-gradient-to-r from-[#070E1E] via-[#0B152A] to-[#070E1E] border border-[#142340] rounded-3xl p-6 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#0052FF]/20 border border-[#00F0FF]/50 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-8 h-8 text-[#00F0FF]" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white font-mono">Excelencia en cada entrega</h4>
                <p className="text-xs text-slate-300 max-w-xl mt-1">
                  Tecnología y equipo comprometido para entregas rápidas en Villavicencio.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 font-mono text-center">
              <div>
                <div className="text-xl font-black text-[#00F0FF]">
                  {totalOrders ? `${successPct}%` : '—'}
                </div>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                  Entregas Exitosas
                </div>
              </div>
              <div>
                <div className="text-xl font-black text-[#00F0FF]">{activeDrivers.length}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                  Motos en línea
                </div>
              </div>
              <div>
                <div className="text-xl font-black text-[#00F0FF]">{transitOrders}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">En tránsito</div>
              </div>
              <div>
                <div className="text-xl font-black text-[#00F0FF]">{approvedDrivers.length}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                  Flota aprobada
                </div>
              </div>
            </div>
          </div>

          {/* Chat */}
          <div className="bg-[#070B16] border border-[#142340] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#142340] pb-3">
              <h3 className="text-xs font-black text-white font-tech uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#00E5FF]" />
                Chat operativo Admin ↔ Transportista
              </h3>
              {approvedDrivers.length > 0 && (
                <select
                  className="bg-[#0A1020] border border-[#1a2744] rounded-lg text-xs px-2 py-1.5 text-white"
                  value={selectedDriverForChat?.id || ''}
                  onChange={(e) => {
                    const d = approvedDrivers.find((x) => x.id === e.target.value) || null;
                    setSelectedDriverForChat(d);
                  }}
                >
                  <option value="">Seleccionar motorizado…</option>
                  {approvedDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName} ({d.plateNumber})
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selectedDriverForChat ? (
              <ChatWindow
                chatId={`chat_${selectedDriverForChat.id}`}
                driver={selectedDriverForChat}
                currentRole={chatRole}
                senderName={chatSender}
              />
            ) : (
              <div className="text-center py-10 text-xs text-slate-400">
                {emptyFleet
                  ? 'Registra y aprueba transportistas para habilitar el chat.'
                  : 'Elige un motorizado para abrir el canal seguro.'}
              </div>
            )}
          </div>
        </>
      )}

      {canCreateOrders && (
      <CreateOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        orders={orders}
        drivers={drivers}
      />
      )}
    </div>
  );
};

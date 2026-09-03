import React, { useMemo, useState, useEffect } from 'react';
import {
  MotorizadoDriver,
  DeliveryOrder,
  OrderStatus,
  AdminAccount,
  DispatchSettings,
  OpsIncident,
} from '../../types';
import { MapComponent, MapStyleType } from '../MapComponent';
import { GoogleMapRadar, getGoogleMapsApiKey } from '../GoogleMapRadar';
import { ChatWindow } from '../chat/ChatWindow';
import { DriverRouteHistoryView } from './DriverRouteHistoryView';
import { DriverApprovalModal } from './DriverApprovalModal';
import { DriverFleetProfile } from './DriverFleetProfile';
import {
  updateOrderStatus,
  saveDispatchSettings,
  subscribeDispatchSettings,
  cancelOrder,
  deleteOrder,
  subscribeIncidents,
  resolveIncident,
  deleteIncident,
} from '../../lib/firebase';
import { AdminControlCenter } from './AdminControlCenter';
import { AdminStaffPanel } from './AdminStaffPanel';
import { AttendancePanel } from './AttendancePanel';
import { FleetControlPanel } from './FleetControlPanel';
import { FleetMotoPanel } from './FleetMotoPanel';
import { DEFAULT_DISPATCH_SETTINGS, formatCOP } from '../../lib/adminMetrics';
import {
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Clock,
  Package,
  Users,
  Settings,
  Radio,
  ArrowRight,
  PictureInPicture2,
  Trash2,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Star,
} from 'lucide-react';
import {
  DomiCargoIcon,
  DomiHelmetIcon,
  DomiRadarIcon,
} from '../ui/CustomIcons';
import { openMapWallWindow } from './MapWallScreen';
import { MapWallVideoPanel } from './MapWallVideoPanel';
import { SecretariatPanel } from './SecretariatPanel';
import { SecretaryChatsPanel } from './SecretaryChatsPanel';
import { canAccessSection, staffCan } from '../../lib/staffAccess';
import type { StaffRole } from '../../types';

export type AdminSection =
  | 'dashboard'
  | 'solicitudes'
  | 'flota'
  | 'envios'
  | 'incidentes'
  | 'sectores'
  | 'rutas'
  | 'historial'
  | 'reportes'
  | 'nomina'
  | 'secretaria'
  | 'chats'
  | 'usuarios'
  | 'ajustes';

import { ORDER_STATUS_LABEL, isLiveOrderStatus } from '../../lib/orderFlow';

function statusBadge(status: OrderStatus) {
  if (status === 'assigned' || status === 'accepted') return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
  if (
    status === 'in_transit' ||
    status === 'en_route_origin' ||
    status === 'at_origin' ||
    status === 'picked_up' ||
    status === 'at_destination'
  )
    return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
  if (status === 'delivered') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (status === 'cancelled') return 'bg-red-500/20 text-red-300 border-red-500/40';
  return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#142340] pb-4 mb-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white font-display italic tracking-tight">
          {title}
        </h2>
        <p className="text-xs text-slate-400 font-tech mt-1">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-[#1a2744] bg-[#0A1020]/50">
      <p className="font-bold text-white mb-1">{title}</p>
      <p className="text-xs text-slate-400 max-w-md mx-auto">{text}</p>
    </div>
  );
}

interface PanelsProps {
  drivers: MotorizadoDriver[];
  orders: DeliveryOrder[];
  section: AdminSection;
  onOpenCreateOrder: () => void;
  adminAccounts?: AdminAccount[];
  currentAdminEmail?: string;
  staffRole?: StaffRole;
}

export const AdminSectionPanels: React.FC<PanelsProps> = ({
  drivers,
  orders,
  section,
  onOpenCreateOrder,
  adminAccounts = [],
  currentAdminEmail = '',
  staffRole = 'admin',
}) => {
  const approvedDrivers = drivers.filter((d) => d.status === 'approved');
  const pendingDrivers = drivers.filter((d) => d.status === 'pending');
  const activeDrivers = approvedDrivers.filter((d) => d.isActive);

  const [search, setSearch] = useState('');
  const [selectedDriverForChat, setSelectedDriverForChat] = useState<MotorizadoDriver | null>(null);
  const [profileDriver, setProfileDriver] = useState<MotorizadoDriver | null>(null);
  const [approvalDriver, setApprovalDriver] = useState<MotorizadoDriver | null>(null);
  const [mapStyleToggle, setMapStyleToggle] = useState<'map' | 'satellite'>('map');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [orderBusyId, setOrderBusyId] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<OpsIncident[]>([]);
  const [incidentBusyId, setIncidentBusyId] = useState<string | null>(null);
  const [dispatchDraft, setDispatchDraft] = useState<DispatchSettings>(DEFAULT_DISPATCH_SETTINGS);
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [dispatchSaved, setDispatchSaved] = useState(false);

  useEffect(() => {
    return subscribeDispatchSettings((s) => {
      setDispatchDraft(s);
    });
  }, []);

  useEffect(() => subscribeIncidents(setIncidents), []);

  if (!canAccessSection(staffRole, section)) {
    return (
      <EmptyState
        title="Sección no disponible"
        text="Tu perfil de secretaría no tiene acceso a esta área de la torre."
      />
    );
  }

  const googleMapsKey = getGoogleMapsApiKey();
  const useGoogleMaps = Boolean(googleMapsKey) && mapStyleToggle === 'map';
  const radarMapStyle: MapStyleType =
    mapStyleToggle === 'satellite' ? 'google_satellite' : 'dark';

  const todayKey = new Date().toISOString().split('T')[0];

  const filterText = (o: DeliveryOrder) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.trackingCode?.toLowerCase().includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.deliveryAddress?.toLowerCase().includes(q)
    );
  };

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === 'pending').filter(filterText),
    [orders, search]
  );
  const transitOrders = useMemo(
    () =>
      orders
        .filter((o) => isLiveOrderStatus(o.status))
        .filter(filterText),
    [orders, search]
  );
  const deliveredToday = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === 'delivered' &&
          (o.updatedAt || o.createdAt || '').startsWith(todayKey)
      ),
    [orders, todayKey]
  );
  const allDelivered = useMemo(
    () => orders.filter((o) => o.status === 'delivered').filter(filterText),
    [orders, search]
  );

  const handleAssign = async (orderId: string, driverId: string) => {
    const drv = approvedDrivers.find((d) => d.id === driverId);
    if (!drv) return;
    setAssigningId(orderId);
    try {
      await updateOrderStatus(orderId, 'assigned', drv.id, drv.fullName);
    } finally {
      setAssigningId(null);
    }
  };

  const handleCancelOrder = async (orderId: string, tracking?: string) => {
    if (
      !window.confirm(
        `¿Cancelar el pedido ${tracking || orderId}? Solo administradores pueden hacerlo.`
      )
    ) {
      return;
    }
    setOrderBusyId(orderId);
    try {
      await cancelOrder(orderId);
    } finally {
      setOrderBusyId(null);
    }
  };

  const handleDeleteOrder = async (orderId: string, tracking?: string) => {
    if (
      !window.confirm(
        `¿BORRAR definitivamente el pedido ${tracking || orderId}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setOrderBusyId(orderId);
    try {
      await deleteOrder(orderId);
    } finally {
      setOrderBusyId(null);
    }
  };

  const handleResolveIncident = async (inc: OpsIncident) => {
    const note =
      window.prompt('Nota de resolución (opcional):', 'Incidencia solucionada por torre') || '';
    setIncidentBusyId(inc.id);
    try {
      await resolveIncident(inc.id, currentAdminEmail || 'admin', note);
    } finally {
      setIncidentBusyId(null);
    }
  };

  const handleDeleteIncident = async (inc: OpsIncident) => {
    if (!window.confirm(`¿Borrar la incidencia «${inc.title}»?`)) return;
    setIncidentBusyId(inc.id);
    try {
      await deleteIncident(inc.id);
    } finally {
      setIncidentBusyId(null);
    }
  };

  const openIncidents = useMemo(
    () => incidents.filter((i) => i.status === 'open'),
    [incidents]
  );

  const OrderRow: React.FC<{
    ord: DeliveryOrder;
    showAssign?: boolean;
  }> = ({ ord, showAssign }) => (
    <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#FF5722]/40 transition">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-[#FF5722]/15 border border-[#FF5722]/40 flex items-center justify-center shrink-0">
          <DomiCargoIcon className="w-5 h-5" color="#FF5722" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-white font-tech">{ord.trackingCode || ord.id}</div>
          <div className="text-[11px] text-slate-400 truncate">
            {ord.customerName} → {ord.deliveryAddress}
          </div>
          {ord.assignedDriverName && (
            <div className="text-[10px] text-[#00E5FF] mt-0.5">
              Motorizado: {ord.assignedDriverName}
              {ord.assignedDistanceKm != null
                ? ` · ${ord.assignedDistanceKm.toFixed(1)} km al pickup`
                : ''}
            </div>
          )}
          {(ord.routePrice != null || ord.shippingFee > 0) && (
            <div className="text-[10px] text-emerald-400 font-tech mt-0.5">
              Precio admin: $
              {(ord.routePrice ?? ord.shippingFee).toLocaleString('es-CO')}
              {ord.routeDistanceKm != null ? ` · ${ord.routeDistanceKm.toFixed(1)} km` : ''}
              {ord.routeDurationMin != null ? ` · ~${ord.routeDurationMin} min` : ''}
            </div>
          )}
          {ord.invoiceNumber ? (
            <div className="text-[10px] text-amber-200/90 mt-0.5">
              Factura / orden: {ord.invoiceNumber}
            </div>
          ) : null}
          {ord.sourceSiteId && (
            <div className="text-[10px] text-slate-500 font-tech">Origen: {ord.sourceSiteId}</div>
          )}
          {ord.serviceRating ? (
            <div className="text-[10px] text-amber-300 font-tech mt-0.5 flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
              {ord.serviceRating}★ · {Math.round((Number(ord.serviceRating) / 5) * 100)}% cliente
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <span
          className={`text-[10px] font-tech font-bold px-2.5 py-1 rounded-lg border ${statusBadge(ord.status)}`}
        >
          {ORDER_STATUS_LABEL[ord.status] || ord.status}
        </span>
        {showAssign &&
          staffCan(staffRole, 'orders.assign') &&
          ord.status === 'pending' &&
          approvedDrivers.length > 0 && (
          <select
            className="bg-[#070B16] border border-[#1a2744] rounded-lg text-[10px] px-2 py-1.5 text-white max-w-[160px]"
            defaultValue=""
            disabled={assigningId === ord.id}
            onChange={(e) => {
              if (e.target.value) handleAssign(ord.id, e.target.value);
            }}
          >
            <option value="">Asignar…</option>
            {approvedDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName} {d.isActive ? '●' : '○'}
              </option>
            ))}
          </select>
        )}
        {staffCan(staffRole, 'orders.cancel') &&
          ord.status !== 'cancelled' &&
          ord.status !== 'delivered' && (
          <button
            type="button"
            title="Cancelar pedido (solo admin)"
            disabled={orderBusyId === ord.id}
            onClick={() => handleCancelOrder(ord.id, ord.trackingCode)}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            <Ban className="w-3.5 h-3.5" /> Cancelar
          </button>
        )}
        {staffCan(staffRole, 'orders.delete') && (
        <button
          type="button"
          title="Borrar pedido (solo admin)"
          disabled={orderBusyId === ord.id}
          onClick={() => handleDeleteOrder(ord.id, ord.trackingCode)}
          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10"
        >
          <Trash2 className="w-3.5 h-3.5" /> Borrar
        </button>
        )}
      </div>
    </div>
  );

  if (section === 'solicitudes') {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Solicitudes"
          subtitle="Pedidos pendientes de asignación"
          action={
            staffCan(staffRole, 'orders.create') ? (
            <button
              type="button"
              onClick={onOpenCreateOrder}
              className="bg-gradient-to-r from-[#FF5722] to-[#D84315] text-white text-xs font-black px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(255,87,34,0.35)]"
            >
              <Plus className="w-4 h-4" /> Nueva solicitud
            </button>
            ) : undefined
          }
        />
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, cliente o dirección…"
            className="w-full bg-[#0A1020] border border-[#162748] rounded-xl pl-9 pr-3 py-2 text-xs text-white"
          />
        </div>
        {pendingOrders.length === 0 ? (
          <EmptyState
            title="Sin solicitudes pendientes"
            text="Los pedidos aparecen aquí cuando un cliente solicita una entrega."
          />
        ) : (
          <div className="space-y-2.5">
            {pendingOrders.map((ord) => (
              <OrderRow key={ord.id} ord={ord} showAssign />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (section === 'flota') {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Flota de Motorizados"
          subtitle={`${activeDrivers.length} activos · ${approvedDrivers.length} aprobados · Motos vinculadas fijas por transportista`}
        />
        <FleetMotoPanel drivers={drivers} />
        <div className="border-t border-[#162748] pt-5">
          <SectionHeader
            title="Transportistas"
            subtitle="Clic en el perfil para ver km y asistencia"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#0A1020] border border-[#FF5722]/40 rounded-2xl p-4">
            <div className="text-[10px] text-slate-400 font-tech uppercase">En línea</div>
            <div className="text-2xl font-black text-[#FF5722] font-tech">{activeDrivers.length}</div>
          </div>
          <div className="bg-[#0A1020] border border-[#00E5FF]/30 rounded-2xl p-4">
            <div className="text-[10px] text-slate-400 font-tech uppercase">Aprobados</div>
            <div className="text-2xl font-black text-[#00E5FF] font-tech">{approvedDrivers.length}</div>
          </div>
          <div className="bg-[#0A1020] border border-amber-500/30 rounded-2xl p-4">
            <div className="text-[10px] text-slate-400 font-tech uppercase">Por aprobar</div>
            <div className="text-2xl font-black text-amber-400 font-tech">{pendingDrivers.length}</div>
          </div>
        </div>
        {approvedDrivers.length === 0 ? (
          <EmptyState
            title="Sin flota aprobada"
            text="Los transportistas aparecen aquí cuando se registran y los apruebas en Usuarios."
          />
        ) : (
          <div className="space-y-2.5">
            {approvedDrivers.map((drv) => (
              <div
                key={drv.id}
                className={`bg-[#0A1020] border rounded-2xl p-3.5 flex items-center justify-between gap-3 cursor-pointer transition ${
                  profileDriver?.id === drv.id
                    ? 'border-[#FF5722]/60'
                    : 'border-[#162748] hover:border-[#FF5722]/40'
                }`}
                onClick={() => setProfileDriver(drv)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-full border flex items-center justify-center ${
                      drv.isActive ? 'border-[#00E676]/50' : 'border-[#2B6CFF]/40'
                    }`}
                  >
                    {drv.photoUrl ? (
                      <img
                        src={drv.photoUrl}
                        alt=""
                        className="w-11 h-11 rounded-full object-cover"
                      />
                    ) : (
                      <DomiHelmetIcon
                        className="w-6 h-6"
                        color={drv.isActive ? '#00E676' : '#2B6CFF'}
                      />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{drv.fullName}</div>
                    <div className="text-[10px] text-slate-400 font-tech">
                      {drv.plateNumber ? `${drv.plateNumber} · ` : ''}
                      {drv.phone}
                      {!drv.assignedMotoId && !drv.plateNumber && (
                        <span className="text-amber-400"> · Sin moto</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate max-w-xs">
                      {drv.location?.addressName || 'Sin ubicación'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <span
                    className={`text-[10px] font-tech font-bold px-2 py-1 rounded-lg border ${
                      drv.isActive
                        ? 'border-[#00E676]/40 text-[#00E676]'
                        : 'border-slate-600 text-slate-400'
                    }`}
                  >
                    {drv.isActive ? 'ACTIVO' : 'OFF'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDriver(drv);
                    }}
                    className="text-[10px] text-slate-200 font-tech font-bold flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#1a2744] hover:border-[#FF5722]/50"
                  >
                    Perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDriverForChat(drv)}
                    className="text-[10px] text-[#00E5FF] font-tech font-bold flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#1a2744] hover:border-[#00E5FF]/50"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Chat
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {profileDriver && (
          <DriverFleetProfile
            driver={profileDriver}
            onClose={() => setProfileDriver(null)}
            onOpenChat={() => {
              setSelectedDriverForChat(profileDriver);
            }}
          />
        )}
        {selectedDriverForChat && (
          <div className="bg-[#070B16] border border-[#142340] rounded-3xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-white font-tech uppercase">
                Chat · {selectedDriverForChat.fullName}
              </h3>
              <button
                type="button"
                className="text-[10px] text-slate-400 hover:text-white"
                onClick={() => setSelectedDriverForChat(null)}
              >
                Cerrar
              </button>
            </div>
            <ChatWindow
              chatId={`chat_${selectedDriverForChat.id}`}
              driver={selectedDriverForChat}
              currentRole="admin"
              senderName="Admin DomiClick"
            />
          </div>
        )}
      </div>
    );
  }

  if (section === 'envios') {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Envíos en curso"
          subtitle="Asignados y en tránsito"
          action={
            <div className="relative max-w-xs">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar envío…"
                className="w-full bg-[#0A1020] border border-[#162748] rounded-xl pl-9 pr-3 py-2 text-xs text-white"
              />
            </div>
          }
        />
        {transitOrders.length === 0 ? (
          <EmptyState
            title="Ningún envío en tránsito"
            text="Asigna solicitudes pendientes desde Solicitudes para verlas aquí."
          />
        ) : (
          <div className="space-y-2.5">
            {transitOrders.map((ord) => (
              <OrderRow key={ord.id} ord={ord} />
            ))}
          </div>
        )}
        <div className="pt-2">
          <h3 className="text-xs font-black text-slate-400 font-tech uppercase mb-3">
            Todos los pedidos ({orders.length})
          </h3>
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {orders.filter(filterText).map((ord) => (
              <OrderRow key={ord.id} ord={ord} showAssign={staffCan(staffRole, 'orders.assign')} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (section === 'incidentes') {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Incidentes y pánico"
          subtitle={
            staffRole === 'secretary'
              ? `${openIncidents.length} abiertos · monitoreo de botón de pánico (solo lectura)`
              : `${openIncidents.length} abiertos · solo el administrador puede resolver o borrar`
          }
        />
        {incidents.length === 0 ? (
          <EmptyState
            title="Sin incidencias"
            text="Los transportistas pueden reportar problemas desde su cabina. Aquí los resuelves."
          />
        ) : (
          <div className="space-y-2.5">
            {incidents.map((inc) => (
              <div
                key={inc.id}
                className={`bg-[#0A1020] border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                  inc.isPanic && inc.status === 'open'
                    ? 'border-red-500/60 bg-red-950/20 animate-pulse'
                    : inc.status === 'open'
                      ? 'border-amber-500/40'
                      : 'border-[#162748]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      inc.isPanic
                        ? 'bg-red-600/25 border-red-500/60'
                        : 'bg-amber-500/15 border-amber-500/40'
                    }`}
                  >
                    <AlertTriangle
                      className={`w-5 h-5 ${inc.isPanic ? 'text-red-400' : 'text-amber-400'}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white font-tech flex items-center gap-2">
                      {inc.title}
                      {inc.isPanic && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-red-300 bg-red-600/30 px-2 py-0.5 rounded-full border border-red-500/50">
                          Pánico
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 whitespace-pre-wrap">
                      {inc.description}
                    </p>
                    <div className="text-[10px] text-slate-500 mt-1 font-tech space-x-2">
                      <span>
                        {inc.reportedByRole === 'driver' ? 'Motorizado' : 'Admin'}:{' '}
                        {inc.reportedByName}
                      </span>
                      {inc.trackingCode && <span>· {inc.trackingCode}</span>}
                      {inc.driverName && <span>· {inc.driverName}</span>}
                      {inc.lat != null && inc.lng != null && (
                        <span>
                          · GPS {inc.lat.toFixed(5)}, {inc.lng.toFixed(5)}
                        </span>
                      )}
                      <span>· {new Date(inc.createdAt).toLocaleString('es-CO')}</span>
                    </div>
                    {inc.status === 'resolved' && (
                      <div className="text-[10px] text-emerald-400 mt-1">
                        Resuelto por {inc.resolvedBy}
                        {inc.resolutionNote ? ` · ${inc.resolutionNote}` : ''}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-tech font-bold px-2.5 py-1 rounded-lg border ${
                      inc.status === 'open'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {inc.status === 'open' ? 'ABIERTA' : 'RESUELTA'}
                  </span>
                  {inc.status === 'open' && staffCan(staffRole, 'incidents.resolve') && (
                    <button
                      type="button"
                      disabled={incidentBusyId === inc.id}
                      onClick={() => handleResolveIncident(inc)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                    </button>
                  )}
                  {staffCan(staffRole, 'incidents.delete') && (
                  <button
                    type="button"
                    disabled={incidentBusyId === inc.id}
                    onClick={() => handleDeleteIncident(inc)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Borrar
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (section === 'rutas') {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Rutas · Radar operativo"
          subtitle="Mapa en vivo de flota y envíos"
          action={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#0A1122] p-1 rounded-xl border border-[#1A2D52] text-xs">
                <button
                  type="button"
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
                  type="button"
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
          }
        />
        <div className="relative rounded-2xl overflow-hidden border border-[#182A4D] h-[560px] bg-[#070B16]">
          {useGoogleMaps && googleMapsKey ? (
            <GoogleMapRadar
              drivers={approvedDrivers}
              orders={orders}
              height="h-full"
              apiKey={googleMapsKey}
            />
          ) : (
            <MapComponent
              drivers={approvedDrivers}
              orders={orders}
              height="h-full"
              showFilters={false}
              mapStyle={radarMapStyle}
              compactChrome
            />
          )}
        </div>
        <MapWallVideoPanel />
      </div>
    );
  }

  if (section === 'historial') {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Historial"
          subtitle={`Entregas de hoy: ${deliveredToday.length} · Rutas GPS por motorizado`}
        />
        <div className="space-y-2.5 mb-6">
          <h3 className="text-xs font-black text-slate-400 font-tech uppercase">
            Entregas completadas hoy
          </h3>
          {deliveredToday.length === 0 ? (
            <EmptyState
              title="Sin entregas hoy"
              text="Cuando un motorizado marque entregado, aparecerá aquí en tiempo real."
            />
          ) : (
            deliveredToday.map((ord) => <OrderRow key={ord.id} ord={ord} />)
          )}
        </div>
        <div className="bg-[#070B16] border border-[#142340] rounded-3xl p-4 overflow-hidden">
          <h3 className="text-xs font-black text-white font-tech uppercase mb-3 flex items-center gap-2">
            <DomiRadarIcon className="w-4 h-4" color="#00E5FF" />
            Replay de ruta GPS
          </h3>
          <DriverRouteHistoryView drivers={drivers} />
        </div>
        {allDelivered.length > deliveredToday.length && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-slate-400 font-tech uppercase">
              Historial completo de entregas
            </h3>
            {allDelivered.map((ord) => (
              <OrderRow key={ord.id} ord={ord} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (section === 'chats') {
    return (
      <SecretaryChatsPanel
        drivers={drivers}
        staffRole={staffRole}
        currentEmail={currentAdminEmail}
      />
    );
  }

  if (section === 'reportes' || section === 'nomina') {
    return (
      <AdminControlCenter
        drivers={drivers}
        orders={orders}
        initialTab={section === 'nomina' ? 'nomina' : 'metricas'}
      />
    );
  }

  if (section === 'secretaria') {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Secretaría · Informes"
          subtitle="Gestión documental compartida con secretaría"
        />
        <SecretariatPanel currentEmail={currentAdminEmail} staffRole={staffRole} />
      </div>
    );
  }

  if (section === 'usuarios') {
    return (
      <div className="space-y-8">
        <SectionHeader
          title="Usuarios"
          subtitle="Administradores · preregistros y motorizados"
        />
        <AdminStaffPanel admins={adminAccounts} currentAdminEmail={currentAdminEmail} />
        <div className="space-y-2.5">
          <h3 className="text-xs font-black text-amber-400 font-tech uppercase flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Pendientes de aprobación ({pendingDrivers.length})
          </h3>
          {pendingDrivers.length === 0 ? (
            <EmptyState title="Nadie en espera" text="Los nuevos prerregistros aparecerán aquí." />
          ) : (
            pendingDrivers.map((drv) => (
              <div
                key={drv.id}
                className="bg-[#0A1020] border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <DomiHelmetIcon className="w-8 h-8" color="#F59E0B" />
                  <div>
                    <div className="text-sm font-bold text-white">{drv.fullName}</div>
                    <div className="text-[10px] text-slate-400">
                      {drv.email} · {drv.plateNumber}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setApprovalDriver(drv)}
                  className="text-[10px] font-black bg-amber-500/20 border border-amber-500/40 text-amber-300 px-3 py-2 rounded-xl hover:bg-amber-500/30"
                >
                  Revisar
                </button>
              </div>
            ))
          )}
        </div>
        <div className="space-y-2.5 pt-2">
          <h3 className="text-xs font-black text-slate-400 font-tech uppercase flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> Todos los motorizados ({drivers.length})
          </h3>
          {drivers.length === 0 ? (
            <EmptyState title="Sin usuarios" text="Aún no hay registros en Firestore." />
          ) : (
            drivers.map((drv) => (
              <div
                key={drv.id}
                className="bg-[#0A1020] border border-[#162748] rounded-2xl p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-bold text-white">{drv.fullName}</div>
                  <div className="text-[10px] text-slate-400 font-tech">
                    {drv.status} · {drv.email}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-tech font-bold px-2 py-1 rounded-lg border ${
                    drv.status === 'approved'
                      ? 'border-[#00E676]/40 text-[#00E676]'
                      : drv.status === 'pending'
                        ? 'border-amber-500/40 text-amber-300'
                        : 'border-red-500/40 text-red-300'
                  }`}
                >
                  {drv.status.toUpperCase()}
                </span>
              </div>
            ))
          )}
        </div>
        <DriverApprovalModal
          driver={approvalDriver}
          isOpen={Boolean(approvalDriver)}
          onClose={() => setApprovalDriver(null)}
          adminName="Admin DomiClick"
        />
      </div>
    );
  }

  if (section === 'ajustes') {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Ajustes"
          subtitle="Despacho automático · tarifas admin · asistencia biométrica"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-5 space-y-3 md:col-span-2">
            <div className="flex items-center gap-2 text-[#FF5722]">
              <Radio className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Despacho automático y tarifa</h3>
            </div>
            <p className="text-xs text-slate-400">
              Al llegar un pedido pending se calcula ruta + precio (solo admin) y se asigna al
              motorizado activo más cercano dentro del radio.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-[11px] text-slate-400 space-y-1">
                Radio búsqueda (km)
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={dispatchDraft.searchRadiusKm}
                  onChange={(e) =>
                    setDispatchDraft({
                      ...dispatchDraft,
                      searchRadiusKm: Number(e.target.value),
                    })
                  }
                  className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-2 text-white text-sm"
                />
              </label>
              <label className="text-[11px] text-slate-400 space-y-1">
                Base (COP)
                <input
                  type="number"
                  min={0}
                  value={dispatchDraft.baseFee}
                  onChange={(e) =>
                    setDispatchDraft({ ...dispatchDraft, baseFee: Number(e.target.value) })
                  }
                  className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-2 text-white text-sm"
                />
              </label>
              <label className="text-[11px] text-slate-400 space-y-1">
                Precio / km (COP)
                <input
                  type="number"
                  min={0}
                  value={dispatchDraft.perKmRate}
                  onChange={(e) =>
                    setDispatchDraft({ ...dispatchDraft, perKmRate: Number(e.target.value) })
                  }
                  className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-2 text-white text-sm"
                />
              </label>
              <label className="text-[11px] text-slate-400 space-y-1 flex flex-col">
                Auto-asignar
                <button
                  type="button"
                  onClick={() =>
                    setDispatchDraft({
                      ...dispatchDraft,
                      autoAssignEnabled: !dispatchDraft.autoAssignEnabled,
                    })
                  }
                  className={`mt-1 py-2 rounded-lg text-xs font-black border ${
                    dispatchDraft.autoAssignEnabled
                      ? 'bg-[#00E676]/15 border-[#00E676]/50 text-[#00E676]'
                      : 'bg-[#070B16] border-[#1a2744] text-slate-400'
                  }`}
                >
                  {dispatchDraft.autoAssignEnabled ? 'ACTIVADO' : 'DESACTIVADO'}
                </button>
              </label>
            </div>
            <p className="text-[10px] text-slate-500 font-tech">
              Ejemplo 4 km → {formatCOP(dispatchDraft.baseFee + 4 * dispatchDraft.perKmRate)}
            </p>
            <button
              type="button"
              disabled={dispatchSaving}
              onClick={async () => {
                setDispatchSaving(true);
                try {
                  await saveDispatchSettings({
                    searchRadiusKm: dispatchDraft.searchRadiusKm,
                    baseFee: dispatchDraft.baseFee,
                    perKmRate: dispatchDraft.perKmRate,
                    autoAssignEnabled: dispatchDraft.autoAssignEnabled,
                  });
                  setDispatchSaved(true);
                  setTimeout(() => setDispatchSaved(false), 2000);
                } finally {
                  setDispatchSaving(false);
                }
              }}
              className="inline-flex items-center gap-2 text-xs font-black px-4 py-2.5 rounded-xl bg-[#2B6CFF] text-white"
            >
              {dispatchSaving ? 'Guardando…' : dispatchSaved ? 'Guardado en Firebase' : 'Guardar reglas de despacho'}
            </button>
          </div>

          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-[#00E5FF]">
              <Settings className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Mapas</h3>
            </div>
            <p className="text-xs text-slate-400">
              Google Maps si hay{' '}
              <span className="text-[#00E5FF] font-tech">VITE_GOOGLE_MAPS_PLATFORM_KEY</span>.
            </p>
            <div className="text-xs font-tech">
              Estado:{' '}
              <span className={googleMapsKey ? 'text-[#00E676]' : 'text-amber-400'}>
                {googleMapsKey ? 'Google Maps activo' : 'Leaflet (sin API key)'}
              </span>
            </div>
          </div>

          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-5">
            <AttendancePanel drivers={drivers} />
          </div>

          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-5">
            <FleetControlPanel drivers={drivers} />
          </div>
        </div>
      </div>
    );
  }

  return null;
};

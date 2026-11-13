import React, { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import type { AdminSection } from './AdminSectionPanels';
import type { ChatRoom, DeliveryOrder, MotorizadoDriver, OpsIncident, StaffRole } from '../../types';
import { subscribeChatRooms, subscribeIncidents } from '../../lib/firebase';
import { isPendingDriverStatus } from '../../lib/driverStatus';
import { canAccessSection } from '../../lib/staffAccess';

type Notice = {
  id: string;
  title: string;
  detail: string;
  section: AdminSection;
  tone: 'alert' | 'warn' | 'info';
};

function hiddenKey(role: StaffRole) {
  return `domiclick-ops-notices-hidden:${role}`;
}

function readHidden(role: StaffRole): string[] {
  try {
    const raw = localStorage.getItem(hiddenKey(role));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function OpsNotificationBell({
  role,
  orders,
  drivers,
  onOpen,
}: {
  role: StaffRole;
  orders: DeliveryOrder[];
  drivers: MotorizadoDriver[];
  onOpen: (section: AdminSection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>(() => readHidden(role));
  const [incidents, setIncidents] = useState<OpsIncident[]>([]);
  const [chats, setChats] = useState<ChatRoom[]>([]);

  useEffect(() => {
    setHidden(readHidden(role));
  }, [role]);

  useEffect(() => subscribeIncidents(setIncidents), []);
  useEffect(() => subscribeChatRooms(setChats), []);

  const notices = useMemo(() => {
    const list: Notice[] = [];
    for (const driver of drivers) {
      if (!isPendingDriverStatus(driver.status)) continue;
      list.push({
        id: `driver:${driver.id}`,
        title: 'Transportista por aprobar',
        detail: `${driver.fullName || 'Sin nombre'}${driver.plateNumber ? ` · ${driver.plateNumber}` : ''}`,
        section: 'solicitudes',
        tone: 'warn',
      });
    }
    for (const order of orders) {
      if (order.paymentReviewStatus === 'pending_review') {
        list.push({
          id: `pay:${order.id}`,
          title: 'Pago por revisar',
          detail: `${order.trackingCode || 'Pedido'} · ${order.customerName || 'Cliente'}`,
          section: 'solicitudes',
          tone: 'warn',
        });
      }
      if (order.status === 'pending' && !order.assignedDriverId) {
        list.push({
          id: `order:${order.id}`,
          title: 'Solicitud nueva',
          detail: `${order.trackingCode || 'Pedido'} · ${order.customerName || 'Cliente'} · ${order.deliveryAddress || order.pickupAddress || 'Sin dirección'}`,
          section: 'solicitudes',
          tone: 'alert',
        });
      }
    }
    for (const incident of incidents) {
      if (incident.status !== 'open') continue;
      list.push({
        id: `inc:${incident.id}`,
        title: incident.isPanic ? 'Pánico del transportista' : incident.title || 'Incidente',
        detail: [incident.driverName, incident.trackingCode, incident.description].filter(Boolean).join(' · ') || 'Abre incidentes para ver el caso.',
        section: 'incidentes',
        tone: 'alert',
      });
    }
    for (const room of chats) {
      const count = room.unreadCountAdmin || (room.unreadByAdmin ? 1 : 0);
      if (!count) continue;
      list.push({
        id: `chat:${room.id}`,
        title: 'Radio sin leer',
        detail: `${room.driverName || 'Transportista'} · ${room.lastMessage || 'Mensaje nuevo'}`,
        section: 'chats',
        tone: 'info',
      });
    }
    return list.filter((item) => canAccessSection(role, item.section));
  }, [drivers, orders, incidents, chats, role]);

  const visible = notices.filter((item) => !hidden.includes(item.id));

  const clearAll = () => {
    const next = Array.from(new Set([...hidden, ...notices.map((item) => item.id)]));
    setHidden(next);
    try {
      localStorage.setItem(hiddenKey(role), JSON.stringify(next.slice(-400)));
    } catch {
      /* la campana sigue limpia en esta sesión */
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[#182643] bg-[#090F1E] text-white"
        aria-label={visible.length ? `${visible.length} notificaciones` : 'Notificaciones'}
      >
        <Bell className="h-5 w-5" />
        {visible.length > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[1.15rem] rounded-full bg-[#FF5722] px-1 text-center text-[10px] font-black leading-5 text-white">
            {visible.length > 9 ? '9+' : visible.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[#1A2846] bg-[#0A0F1D] shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-[#1A2846] px-3 py-2">
            <p className="text-[11px] font-black uppercase tracking-wide text-white">
              Notificaciones · {visible.length}
            </p>
            <button
              type="button"
              onClick={clearAll}
              disabled={!visible.length}
              className="text-[10px] font-black uppercase text-[#00E5FF] disabled:text-slate-600"
            >
              Limpiar
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-400">No hay avisos pendientes.</p>
            ) : (
              visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpen(item.section);
                  }}
                  className="block w-full border-b border-[#142033] px-3 py-2.5 text-left hover:bg-[#121a2c]"
                >
                  <p
                    className={`text-[11px] font-black uppercase ${
                      item.tone === 'alert' ? 'text-[#FF5722]' : item.tone === 'warn' ? 'text-amber-300' : 'text-[#00E5FF]'
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-200">{item.detail}</p>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">Ver en {sectionName(item.section)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sectionName(section: AdminSection) {
  if (section === 'solicitudes') return 'Solicitudes';
  if (section === 'incidentes') return 'Incidentes';
  if (section === 'chats') return 'Radios';
  if (section === 'envios') return 'Envíos';
  return 'la sección';
}

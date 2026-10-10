/** Fase 3 cabina: radio Central, checklist pre-ruta, tip y ranking. */

import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  limit,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type CabinChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: 'admin' | 'driver';
  text: string;
  timestamp: string;
};

export type PreRouteCheckItem = {
  id: string;
  label: string;
};

export const PRE_ROUTE_CHECKLIST: PreRouteCheckItem[] = [
  { id: 'helmet', label: 'Casco abrochado' },
  { id: 'fuel', label: 'Combustible suficiente' },
  { id: 'tire', label: 'Llantas / presión OK' },
  { id: 'phone', label: 'Celular cargado + GPS' },
  { id: 'docs', label: 'Documentos / SOAT / placa' },
  { id: 'bag', label: 'Maleta / sunchos listos' },
];

const CHECKLIST_KEY = 'domiclick_preroute_checklist_v1';

export function readPreRouteChecklist(driverId: string, dateKey: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`${CHECKLIST_KEY}_${driverId}_${dateKey}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writePreRouteChecklist(
  driverId: string,
  dateKey: string,
  state: Record<string, boolean>,
): void {
  try {
    localStorage.setItem(`${CHECKLIST_KEY}_${driverId}_${dateKey}`, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function checklistProgress(state: Record<string, boolean>): {
  done: number;
  total: number;
  complete: boolean;
} {
  const total = PRE_ROUTE_CHECKLIST.length;
  const done = PRE_ROUTE_CHECKLIST.filter((i) => state[i.id]).length;
  return { done, total, complete: done === total };
}

const DAILY_TIPS = [
  'Antes de salir: casco, combustible y GPS. Un minuto evita demoras.',
  'Confirma A y B en el mapa. Si falta una coordenada, avisa a Central.',
  'Al llegar al origen, marca el estado: el cliente ve el avance en vivo.',
  'Tráfico en Villavicencio: Av. 40 y centros comerciales en horas pico.',
  'El PIN lo da solo el cliente. Sin PIN no cierres la entrega.',
  'Si no encuentras al cliente, reporta incidencia y llama / WhatsApp.',
  'Publica GPS con el pedido abierto: el cliente confía cuando te ve mover.',
  'Hidratación y pausas cortas en turnos largos. Seguridad primero.',
  'Foto de odómetro y placa van por el QR de la tablet de sede.',
  'Un mensaje claro a Central por radio evita idas y vueltas.',
  'Revisa la dirección y el barrio antes de arrancar a B.',
  'Si llueve, reduce velocidad y reporta demora si aplica.',
];

export function tipOfTheDay(date = new Date()): string {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return DAILY_TIPS[day % DAILY_TIPS.length];
}

export type DriverRankRow = {
  id: string;
  fullName: string;
  completedDeliveries: number;
};

export async function fetchDriverLeaderboard(limitN = 8): Promise<DriverRankRow[]> {
  const snap = await getDocs(query(collection(db, 'drivers'), limit(120)));
  const rows: DriverRankRow[] = [];
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (String(data.status || '') !== 'approved') return;
    rows.push({
      id: d.id,
      fullName: String(data.fullName || data.name || 'Transportista'),
      completedDeliveries: Number(data.completedDeliveries) || 0,
    });
  });
  rows.sort((a, b) => b.completedDeliveries - a.completedDeliveries);
  return rows.slice(0, limitN);
}

export function rankPosition(board: DriverRankRow[], driverId: string): number | null {
  const idx = board.findIndex((r) => r.id === driverId);
  return idx >= 0 ? idx + 1 : null;
}

export function subscribeCabinChat(
  chatId: string,
  callback: (msgs: CabinChatMessage[]) => void,
  onLive?: (live: boolean) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'messages'), where('chatId', '==', chatId)),
    (snap) => {
      const list: CabinChatMessage[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          chatId: String(data.chatId || chatId),
          senderId: String(data.senderId || ''),
          senderName: String(data.senderName || ''),
          senderRole: data.senderRole === 'admin' ? 'admin' : 'driver',
          text: String(data.text || ''),
          timestamp: String(data.timestamp || ''),
        };
      });
      list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      onLive?.(true);
      callback(list);
    },
    () => onLive?.(false),
  );
}

export async function sendCabinChatMessage(params: {
  chatId: string;
  driverId: string;
  driverName: string;
  text: string;
}): Promise<void> {
  const text = params.text.trim();
  if (!text) return;
  const now = new Date().toISOString();
  const id = 'msg_' + Date.now();
  await setDoc(doc(db, 'messages', id), {
    id,
    chatId: params.chatId,
    senderId: params.driverId,
    senderName: params.driverName,
    senderRole: 'driver',
    text,
    timestamp: now,
  });
  await setDoc(
    doc(db, 'chats', params.chatId),
    {
      id: params.chatId,
      driverId: params.driverId,
      driverName: params.driverName,
      lastMessage: text,
      lastMessageTime: now,
      unreadByAdmin: true,
      unreadByDriver: false,
    },
    { merge: true },
  );
}

let radioUnread = 0;
const radioListeners = new Set<(n: number) => void>();

export function setRadioUnread(count: number) {
  radioUnread = Math.max(0, count);
  radioListeners.forEach((fn) => fn(radioUnread));
}

export function bumpRadioUnread() {
  setRadioUnread(radioUnread + 1);
}

export function subscribeRadioUnread(fn: (n: number) => void) {
  radioListeners.add(fn);
  fn(radioUnread);
  return () => {
    radioListeners.delete(fn);
  };
}

export const RADIO_QUICK = [
  'Torre, ¿me copias?',
  'En camino al origen',
  'Llegué a recolección',
  'Pedido recogido, voy a entrega',
  'Demora por tráfico',
  'Necesito apoyo de Central',
] as const;

export type CustomerWhatsAppKind = 'accepted' | 'in_transit' | 'at_destination' | 'incident' | 'generic';

export function customerWhatsAppText(
  kind: CustomerWhatsAppKind,
  order: {
    trackingCode: string;
    customerName?: string;
    deliveryAddress?: string;
    driverName?: string;
  },
): string {
  const name = order.customerName?.trim() || 'cliente';
  const code = order.trackingCode;
  const addr = order.deliveryAddress?.trim() || 'tu dirección';
  const driver = order.driverName?.trim() || 'tu motorizado DomiClick';

  switch (kind) {
    case 'accepted':
      return `Hola ${name}, soy ${driver}. Pedido ${code}, voy por tu envío.`;
    case 'in_transit':
      return `Hola ${name}, tu pedido ${code} va en camino a ${addr}.`;
    case 'at_destination':
      return `Hola ${name}, llegué a la dirección de entrega. Pedido ${code}.`;
    case 'incident':
      return `Hola ${name}, hay un imprevisto con el pedido ${code}; Central te contacta.`;
    default:
      return `Hola ${name}, soy ${driver} de DomiClick con el pedido ${code}.`;
  }
}

/** Plantilla sugerida según el estado al que acaba de avanzar el pedido. */
export function whatsAppKindForStatus(status: string): CustomerWhatsAppKind {
  if (status === 'accepted' || status === 'en_route_origin') return 'accepted';
  if (status === 'picked_up' || status === 'in_transit') return 'in_transit';
  if (status === 'at_destination') return 'at_destination';
  return 'generic';
}

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  limit,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { db } from './firebase';

export type DriverProfile = {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  plateNumber?: string;
  status: string;
  isActive: boolean;
  completedDeliveries?: number;
};

export type LatLng = { lat: number; lng: number };

export type DriverOrder = {
  id: string;
  trackingCode: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  pickupCoords?: LatLng | null;
  deliveryCoords?: LatLng | null;
  description?: string;
  assignedDriverId?: string | null;
  deliveryConfirmCode?: string;
  createdAt?: string;
  updatedAt?: string;
  scheduledFor?: string;
};

function parseLatLng(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat ?? o.latitude);
  const lng = Number(o.lng ?? o.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function mapOrderDoc(id: string, data: Record<string, unknown>): DriverOrder {
  return {
    id,
    trackingCode: String(data.trackingCode || id),
    status: String(data.status || 'pending'),
    customerName: data.customerName ? String(data.customerName) : undefined,
    customerPhone: data.customerPhone ? String(data.customerPhone) : undefined,
    pickupAddress: data.pickupAddress ? String(data.pickupAddress) : undefined,
    deliveryAddress: data.deliveryAddress ? String(data.deliveryAddress) : undefined,
    pickupCoords: parseLatLng(data.pickupCoords),
    deliveryCoords: parseLatLng(data.deliveryCoords),
    description: data.description ? String(data.description) : undefined,
    assignedDriverId: data.assignedDriverId ? String(data.assignedDriverId) : null,
    deliveryConfirmCode: data.deliveryConfirmCode ? String(data.deliveryConfirmCode) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
    scheduledFor: data.scheduledFor ? String(data.scheduledFor) : undefined,
  };
}

export type AttendancePunchType = 'in' | 'out';

function isSameLocalDay(iso?: string): boolean {
  if (!iso) return false;
  const a = new Date(iso);
  const b = new Date();
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export async function findApprovedDriverByEmail(email: string): Promise<DriverProfile | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const snap = await getDocs(query(collection(db, 'drivers'), where('email', '==', normalized), limit(5)));
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown> & { id: string }>;
  if (!rows.length) {
    // Fallback: algunos perfiles guardan email con mayúsculas
    const all = await getDocs(query(collection(db, 'drivers'), limit(200)));
    rows = all.docs
      .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as Record<string, unknown> & { id: string })
      .filter((d) => String(d.email || '').trim().toLowerCase() === normalized);
  }
  const approved = rows.find((d) => String(d.status) === 'approved') || rows[0];
  if (!approved) return null;
  return {
    id: approved.id,
    fullName: String(approved.fullName || approved.name || 'Transportista'),
    email: String(approved.email || normalized),
    phone: approved.phone ? String(approved.phone) : undefined,
    plateNumber: approved.plateNumber ? String(approved.plateNumber) : undefined,
    status: String(approved.status || 'pending'),
    isActive: Boolean(approved.isActive),
    completedDeliveries: Number(approved.completedDeliveries) || 0,
  };
}

export async function setDriverActive(_driverId: string, _isActive: boolean): Promise<void> {
  throw new Error('La cabina solo se activa o desactiva al marcar asistencia.');
}

export async function listDriverOrders(driverId: string): Promise<DriverOrder[]> {
  const snap = await getDocs(
    query(collection(db, 'orders'), where('assignedDriverId', '==', driverId), limit(80)),
  );
  const rows = snap.docs.map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>));
  return rows.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

export function summarizeDriverDay(orders: DriverOrder[]) {
  const today = orders.filter(
    (o) => isSameLocalDay(o.createdAt) || isSameLocalDay(o.updatedAt) || isSameLocalDay(o.scheduledFor),
  );
  const active = today.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const deliveredToday = today.filter((o) => o.status === 'delivered');
  const inProgress = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'pending',
  );
  return {
    assignedToday: today.length,
    activeToday: active.length,
    deliveredToday: deliveredToday.length,
    inProgress: inProgress.length,
    activeOrders: inProgress.length ? inProgress : active,
  };
}

export async function findOrderForScan(raw: string): Promise<DriverOrder | null> {
  const code = raw.trim().toUpperCase();
  if (code.length < 4) return null;

  // Por tracking DMC-XXXX
  const byTrack = await getDocs(
    query(collection(db, 'orders'), where('trackingCode', '==', code), limit(1)),
  );
  if (!byTrack.empty) {
    const d = byTrack.docs[0];
    return mapOrderDoc(d.id, d.data() as Record<string, unknown>);
  }

  // Por id de documento
  const byId = await getDoc(doc(db, 'orders', code));
  if (byId.exists()) {
    return mapOrderDoc(byId.id, byId.data() as Record<string, unknown>);
  }

  return null;
}

export async function advanceDriverOrderStatus(
  orderId: string,
  status: string,
  driverId: string,
  driverName: string,
): Promise<void> {
  if (status === 'delivered') {
    throw new Error('Para entregar usa el PIN del cliente.');
  }
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'orders', orderId), {
    status,
    updatedAt: now,
    timeline: arrayUnion({
      at: now,
      to: status,
      byRole: 'driver',
      note: `Actualizado por ${driverName}`,
    }),
  });
  void driverId;
}

export async function confirmDeliveryWithPin(
  orderId: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return { ok: false, error: 'Pedido no encontrado' };
  const order = snap.data();
  const status = String(order.status || '');
  if (status === 'delivered') return { ok: false, error: 'Ya estaba entregado' };
  if (status === 'cancelled') return { ok: false, error: 'Pedido cancelado' };

  const expected = String(order.deliveryConfirmCode || '').trim();
  const given = String(pin || '').trim();
  if (expected) {
    if (given !== expected) {
      return { ok: false, error: 'PIN incorrecto. Pídeselo al cliente.' };
    }
  } else if (given.length < 4) {
    return { ok: false, error: 'Ingresa al menos 4 dígitos.' };
  }

  const now = new Date().toISOString();
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'delivered',
    deliveryConfirmedAt: now,
    updatedAt: now,
    timeline: arrayUnion({
      at: now,
      from: status,
      to: 'delivered',
      byRole: 'driver',
      note: 'PIN validado en app móvil',
    }),
  });

  const driverId = order.assignedDriverId ? String(order.assignedDriverId) : '';
  if (driverId) {
    await updateDoc(doc(db, 'drivers', driverId), {
      completedDeliveries: increment(1),
      updatedAt: now,
    });
  }
  return { ok: true };
}

export async function recordSimpleAttendance(_params: {
  driverId: string;
  driverName: string;
  type: AttendancePunchType;
  lat?: number;
  lng?: number;
}): Promise<void> {
  throw new Error(
    'La asistencia solo se marca en la tablet de sede con el PIN del día. Escanea el QR de la tablet para subir fotos del odómetro y la placa.',
  );
}

/** Detecta enlaces del QR de asistencia (fotos moto). */
export function parseAttendancePhotoUrl(raw: string): string | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.searchParams.get('view') !== 'kiosk-fotos') return null;
    const punch = url.searchParams.get('punch');
    if (!punch) return null;
    return url.toString();
  } catch {
    // Solo id de punch
    if (/^att_[a-zA-Z0-9_-]+$/.test(text)) {
      return `https://domiclick-ops.web.app/?view=kiosk-fotos&punch=${encodeURIComponent(text)}`;
    }
    return null;
  }
}

export const DRIVER_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignado',
  accepted: 'Aceptado',
  en_route_origin: 'Hacia origen',
  at_origin: 'En origen',
  picked_up: 'Recogido',
  in_transit: 'En camino',
  at_destination: 'En destino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export const DRIVER_NEXT_STATUS: Record<string, string | null> = {
  assigned: 'accepted',
  accepted: 'en_route_origin',
  en_route_origin: 'at_origin',
  at_origin: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'at_destination',
  at_destination: null, // PIN
};

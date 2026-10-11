import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  limit,
  arrayUnion,
  increment,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  enqueueAdvance,
  isBrowserOnline,
  enqueuePin,
  noteNetworkResult,
  readAdvanceQueue,
  readPinQueue,
  removeQueuedAdvance,
  removeQueuedPin,
  withTimeout,
  type QueuedAdvance,
} from './driverOffline';

export type DriverProfile = {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  plateNumber?: string;
  motoModel?: string;
  photoUrl?: string;
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
  customerPhotoURL?: string;
  pickupAddress?: string;
  pickupPlaceId?: string;
  deliveryAddress?: string;
  deliveryPlaceId?: string;
  pickupCoords?: LatLng | null;
  deliveryCoords?: LatLng | null;
  description?: string;
  notes?: string;
  paymentMethod?: string;
  invoiceNumber?: string;
  invoicePhotoUrl?: string;
  assignedDriverId?: string | null;
  deliveryConfirmCode?: string;
  routeDistanceKm?: number | null;
  routeDurationMin?: number | null;
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
    customerPhotoURL: data.customerPhotoURL ? String(data.customerPhotoURL) : undefined,
    pickupAddress: data.pickupAddress ? String(data.pickupAddress) : undefined,
    pickupPlaceId: data.pickupPlaceId ? String(data.pickupPlaceId) : undefined,
    deliveryAddress: data.deliveryAddress ? String(data.deliveryAddress) : undefined,
    deliveryPlaceId: data.deliveryPlaceId ? String(data.deliveryPlaceId) : undefined,
    pickupCoords: parseLatLng(data.pickupCoords),
    deliveryCoords: parseLatLng(data.deliveryCoords),
    description: data.description ? String(data.description) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
    paymentMethod: data.paymentMethod ? String(data.paymentMethod) : undefined,
    invoiceNumber: data.invoiceNumber ? String(data.invoiceNumber) : undefined,
    invoicePhotoUrl: data.invoicePhotoUrl ? String(data.invoicePhotoUrl) : undefined,
    assignedDriverId: data.assignedDriverId ? String(data.assignedDriverId) : null,
    deliveryConfirmCode: data.deliveryConfirmCode ? String(data.deliveryConfirmCode) : undefined,
    routeDistanceKm:
      typeof data.routeDistanceKm === 'number' ? data.routeDistanceKm : null,
    routeDurationMin:
      typeof data.routeDurationMin === 'number' ? data.routeDurationMin : null,
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
    motoModel: approved.motoModel ? String(approved.motoModel) : undefined,
    photoUrl: approved.photoUrl ? String(approved.photoUrl) : undefined,
    status: String(approved.status || 'pending'),
    isActive: Boolean(approved.isActive),
    completedDeliveries: Number(approved.completedDeliveries) || 0,
  };
}

export async function setDriverActive(_driverId: string, _isActive: boolean): Promise<void> {
  throw new Error('La cabina solo se activa o desactiva al marcar asistencia.');
}

/** Entrada o salida desde la app del transportista. Salida apaga la cabina. */
export async function punchCabinShift(params: {
  driverId: string;
  driverName: string;
  type: 'in' | 'out';
  lat?: number;
  lng?: number;
}): Promise<void> {
  const at = new Date().toISOString();
  const id = 'att_' + Date.now();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  await setDoc(doc(db, 'attendance_punches', id), {
    id,
    driverId: params.driverId,
    driverName: params.driverName || '',
    type: params.type,
    at,
    dateKey: bogotaDay(at),
    method: 'cabin',
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lng) ? { lng } : {}),
  });
  await updateDoc(doc(db, 'drivers', params.driverId), {
    lastPunchType: params.type,
    lastPunchAt: at,
    isActive: params.type === 'in',
    updatedAt: at,
  });
}

const OPEN_ORDER_STATUSES = [
  'assigned',
  'accepted',
  'en_route_origin',
  'at_origin',
  'picked_up',
  'in_transit',
  'at_destination',
] as const;

function sortOrdersByRecency(rows: DriverOrder[]): DriverOrder[] {
  return rows.sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
  );
}

export async function listDriverOrders(driverId: string): Promise<DriverOrder[]> {
  // Pedidos vivos primero (evita que el historial entregado tape los abiertos con limit)
  try {
    const liveSnap = await getDocs(
      query(
        collection(db, 'orders'),
        where('assignedDriverId', '==', driverId),
        where('status', 'in', [...OPEN_ORDER_STATUSES]),
        limit(40),
      ),
    );
    const live = liveSnap.docs.map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>));
    // Historial reciente para métricas del día (entregados)
    const histSnap = await getDocs(
      query(collection(db, 'orders'), where('assignedDriverId', '==', driverId), limit(60)),
    );
    const hist = histSnap.docs.map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>));
    const byId = new Map<string, DriverOrder>();
    for (const o of [...live, ...hist]) byId.set(o.id, o);
    return sortOrdersByRecency([...byId.values()]);
  } catch {
    const snap = await getDocs(
      query(collection(db, 'orders'), where('assignedDriverId', '==', driverId), limit(120)),
    );
    return sortOrdersByRecency(
      snap.docs.map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>)),
    );
  }
}

/** Pedidos abiertos del transportista en tiempo real (hasta entregado/cancelado). */
export function subscribeDriverOrders(
  driverId: string,
  callback: (orders: DriverOrder[]) => void,
): Unsubscribe {
  const openQ = query(
    collection(db, 'orders'),
    where('assignedDriverId', '==', driverId),
    where('status', 'in', [...OPEN_ORDER_STATUSES]),
    limit(40),
  );
  const allQ = query(collection(db, 'orders'), where('assignedDriverId', '==', driverId), limit(120));

  let openRows: DriverOrder[] = [];
  let histRows: DriverOrder[] = [];
  let unsubOpen: Unsubscribe | null = null;
  let unsubHist: Unsubscribe | null = null;

  const emit = () => {
    const byId = new Map<string, DriverOrder>();
    for (const o of [...openRows, ...histRows]) byId.set(o.id, o);
    callback(sortOrdersByRecency([...byId.values()]));
  };

  try {
    unsubOpen = onSnapshot(
      openQ,
      (snap) => {
        openRows = snap.docs.map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>));
        emit();
      },
      () => {
        // Sin índice compuesto: cae a consulta simple
        if (unsubOpen) {
          unsubOpen();
          unsubOpen = null;
        }
        unsubHist = onSnapshot(
          allQ,
          (snap) => {
            histRows = snap.docs.map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>));
            openRows = [];
            emit();
          },
          () => callback([]),
        );
      },
    );
    unsubHist = onSnapshot(
      allQ,
      (snap) => {
        histRows = snap.docs.map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>));
        emit();
      },
      () => {
        /* keep open rows */
      },
    );
  } catch {
    unsubHist = onSnapshot(
      allQ,
      (snap) => {
        histRows = snap.docs.map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>));
        openRows = [];
        emit();
      },
      () => callback([]),
    );
  }

  return () => {
    unsubOpen?.();
    unsubHist?.();
  };
}

/** Publica GPS del motorizado para que el cliente vea el desplazamiento. */
const openOrderIdsCache = new Map<string, { ids: string[]; at: number }>();

async function mirrorDriverLiveOntoOrders(
  driverId: string,
  live: { lat: number; lng: number; heading: number; updatedAt: string },
) {
  const now = Date.now();
  let cached = openOrderIdsCache.get(driverId);
  if (!cached || now - cached.at > 8000) {
    const snap = await getDocs(
      query(collection(db, 'orders'), where('assignedDriverId', '==', driverId)),
    );
    const ids: string[] = [];
    snap.forEach((docSnap) => {
      const status = String(docSnap.data().status || '');
      if (status === 'delivered' || status === 'cancelled' || status === 'pending') return;
      ids.push(docSnap.id);
    });
    cached = { ids, at: now };
    openOrderIdsCache.set(driverId, cached);
  }
  await Promise.all(
    cached.ids.map((id) => updateDoc(doc(db, 'orders', id), { driverLive: live })),
  );
}

export async function publishDriverLiveLocation(params: {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speedMps?: number;
  accuracyM?: number;
  moving?: boolean;
  driverName?: string;
  plateNumber?: string;
}): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  const moving = params.moving;
  const state = moving === true ? 'En movimiento' : moving === false ? 'Detenido' : 'GPS en vivo';
  const live = {
    lat: params.lat,
    lng: params.lng,
    heading: params.heading || 0,
    speedMps: params.speedMps,
    moving,
    updatedAt,
  };
  try {
    await withTimeout(
      updateDoc(doc(db, 'drivers', params.driverId), {
        location: {
          lat: params.lat,
          lng: params.lng,
          heading: params.heading || 0,
          speedMps: params.speedMps ?? null,
          accuracyM: params.accuracyM ?? null,
          moving: moving ?? null,
          addressName: state,
          neighborhood: 'Villavicencio',
          updatedAt,
        },
        updatedAt,
      }),
    );
    void mirrorDriverLiveOntoOrders(params.driverId, live).catch(() => {
      openOrderIdsCache.delete(params.driverId);
    });
    const pointId = `loc_${params.driverId}_${updatedAt.replace(/[^\d]/g, '')}`;
    const speed =
      params.speedMps != null && params.speedMps >= 0 ? Math.round(params.speedMps * 3.6) : undefined;
    void setDoc(
      doc(db, 'location_history', pointId),
      {
        id: pointId,
        driverId: params.driverId,
        driverName: params.driverName || '',
        plateNumber: params.plateNumber || '',
        lat: params.lat,
        lng: params.lng,
        heading: params.heading || 0,
        ...(speed != null ? { speed } : {}),
        addressName: state,
        timestamp: updatedAt,
        dateKey: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(updatedAt)),
      },
      { merge: true },
    ).catch(() => undefined);
    noteNetworkResult(true);
    return true;
  } catch {
    noteNetworkResult(false);
    return false;
  }
}

export function summarizeDriverDay(orders: DriverOrder[]) {
  const open = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const today = orders.filter(
    (o) => isSameLocalDay(o.createdAt) || isSameLocalDay(o.updatedAt) || isSameLocalDay(o.scheduledFor),
  );
  const deliveredToday = today.filter((o) => o.status === 'delivered');
  const inProgress = open.filter((o) => o.status !== 'pending');
  return {
    assignedToday: today.filter((o) => o.status !== 'cancelled').length,
    activeToday: open.length,
    deliveredToday: deliveredToday.length,
    inProgress: inProgress.length,
    /** Siempre todos los pedidos abiertos hasta entrega — no se ocultan por día. */
    activeOrders: open,
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
): Promise<{ queued: boolean }> {
  if (status === 'delivered') {
    throw new Error('Para entregar usa el PIN del cliente.');
  }

  const doWrite = async () => {
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
  };

  if (!isBrowserOnline()) {
    enqueueAdvance({ orderId, status, driverId, driverName });
    noteNetworkResult(false);
    return { queued: true };
  }

  try {
    await withTimeout(doWrite());
    noteNetworkResult(true);
    return { queued: false };
  } catch {
    noteNetworkResult(false);
    enqueueAdvance({ orderId, status, driverId, driverName });
    return { queued: true };
  }
}

/** Envía la cola offline cuando vuelve la red. */
export async function flushAdvanceQueue(): Promise<{ sent: number; failed: number }> {
  const queue = readAdvanceQueue();
  if (!queue.length || !isBrowserOnline()) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const q of queue) {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'orders', q.orderId), {
        status: q.status,
        updatedAt: now,
        timeline: arrayUnion({
          at: now,
          to: q.status,
          byRole: 'driver',
          note: `Actualizado por ${q.driverName} (offline sync)`,
        }),
      });
      removeQueuedAdvance(q.id);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}

export type { QueuedAdvance };

async function applyDeliveryPin(
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

export async function confirmDeliveryWithPin(
  orderId: string,
  pin: string,
): Promise<{ ok: true; queued?: boolean } | { ok: false; error: string }> {
  const given = pin.trim();
  if (!isBrowserOnline()) {
    enqueuePin(orderId, given);
    noteNetworkResult(false);
    return { ok: true, queued: true };
  }
  try {
    const result = await withTimeout(applyDeliveryPin(orderId, given));
    noteNetworkResult(true);
    return result;
  } catch {
    noteNetworkResult(false);
    enqueuePin(orderId, given);
    return { ok: true, queued: true };
  }
}

/** Confirma los PIN guardados cuando la señal vuelve. No vuelve a sumar si ya estaba entregado. */
export async function flushPinQueue(): Promise<{ sent: number; failed: number; rejected: string }> {
  const queue = readPinQueue();
  if (!queue.length || !isBrowserOnline()) return { sent: 0, failed: 0, rejected: '' };
  let sent = 0;
  let failed = 0;
  let rejected = '';
  for (const q of queue) {
    try {
      const result = await withTimeout(applyDeliveryPin(q.orderId, q.pin));
      noteNetworkResult(true);
      if (result.ok) {
        removeQueuedPin(q.id);
        sent += 1;
      } else if (
        result.error === 'Ya estaba entregado' ||
        result.error === 'Pedido cancelado' ||
        result.error.includes('incorrecto') ||
        result.error === 'Pedido no encontrado'
      ) {
        removeQueuedPin(q.id);
        if (result.error.includes('incorrecto')) rejected = result.error;
      } else {
        failed += 1;
      }
    } catch {
      noteNetworkResult(false);
      failed += 1;
      break;
    }
  }
  return { sent, failed, rejected };
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
  assigned: 'in_transit',
  accepted: 'in_transit',
  en_route_origin: 'in_transit',
  at_origin: 'in_transit',
  picked_up: 'in_transit',
  in_transit: 'at_destination',
  at_destination: null, // PIN
};

export const DRIVER_NEXT_LABEL: Record<string, string> = {
  assigned: 'Confirmar recogida',
  accepted: 'Confirmar recogida',
  en_route_origin: 'Confirmar recogida',
  at_origin: 'Confirmar recogida',
  picked_up: 'Confirmar recogida',
  in_transit: 'Llegué al destino',
};

export const DRIVER_INCIDENT_REASONS = [
  'Usuario no localizado',
  'Dirección incorrecta',
  'Problema con el pedido',
  'Problema con el vehículo',
  'Accidente / incidente',
  'Imposibilidad de realizar entrega',
  'Problema de acceso',
  'Lluvia / clima',
  'Otro',
] as const;

export type CabinAttendancePunch = {
  id: string;
  driverId: string;
  type: 'in' | 'out';
  at: string;
  dateKey?: string;
  odometerKm?: number;
};

export type CabinShiftSummary = {
  hoursWorked: number;
  open: boolean;
  inAt?: string;
  outAt?: string;
  kmDriven: number;
  kmIn?: number;
  kmOut?: number;
};

export type CabinEarningsSummary = {
  deliveredToday: number;
  openCount: number;
  routeKmToday: number;
  hoursWorked: number;
  odometerKm: number;
  shiftOpen: boolean;
};

function hoursBetween(fromIso?: string, toIso?: string): number {
  if (!fromIso) return 0;
  const end = toIso ? new Date(toIso).getTime() : Date.now();
  const ms = end - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 36e5) * 100) / 100;
}

/** Deja de recibir encargos cuando faltan estos minutos para las 8 h. */
export const SHIFT_CLOSE_BUFFER_MIN = 6;
const SHIFT_LIMIT_MIN = 8 * 60;

export function shiftRemainingMinutes(inAt?: string, now = Date.now()): number | null {
  if (!inAt) return null;
  const start = new Date(inAt).getTime();
  if (!Number.isFinite(start)) return null;
  const elapsed = (now - start) / 60000;
  if (!Number.isFinite(elapsed)) return null;
  return SHIFT_LIMIT_MIN - Math.max(0, elapsed);
}

export function shiftCloseMessage(remainingMin: number, hasOpenOrder: boolean): string {
  const left = Math.max(0, Math.round(remainingMin));
  if (hasOpenOrder) {
    return `Faltan ${left} min para tus 8 horas. Entrega el pedido que tienes. Ya no te llegan encargos nuevos.`;
  }
  return `Faltan ${left} min para tus 8 horas. No tienes pedido: vuelve a la oficina y marca tu salida.`;
}

export function todayDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function bogotaDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
}

export function summarizeCabinShift(
  punches: CabinAttendancePunch[],
  driverId: string,
): CabinShiftSummary {
  const mine = punches
    .filter((p) => p.driverId === driverId)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const last = mine[mine.length - 1];
  const open = last?.type === 'in';
  const lastIn = [...mine].reverse().find((p) => p.type === 'in');
  const lastOut = [...mine].reverse().find((p) => p.type === 'out');
  const kmIn = lastIn?.odometerKm;
  const kmOut = lastOut?.odometerKm;
  const kmDriven =
    typeof kmIn === 'number' && typeof kmOut === 'number' && kmOut >= kmIn
      ? Math.round((kmOut - kmIn) * 10) / 10
      : 0;
  const inAt = lastIn?.at;
  const outAt = open ? undefined : lastOut?.at;
  return {
    hoursWorked: hoursBetween(inAt, open ? undefined : outAt),
    open,
    inAt,
    outAt,
    kmDriven,
    kmIn,
    kmOut,
  };
}

export function summarizeCabinEarnings(
  orders: DriverOrder[],
  shift: CabinShiftSummary,
): CabinEarningsSummary {
  const day = summarizeDriverDay(orders);
  const delivered = orders.filter(
    (o) =>
      o.status === 'delivered' &&
      (isSameLocalDay(o.updatedAt) || isSameLocalDay(o.createdAt)),
  );
  const routeKmToday = delivered.reduce((sum, o) => sum + (Number(o.routeDistanceKm) || 0), 0);
  return {
    deliveredToday: day.deliveredToday,
    openCount: day.activeToday,
    routeKmToday: Math.round(routeKmToday * 10) / 10,
    hoursWorked: shift.hoursWorked,
    odometerKm: shift.kmDriven,
    shiftOpen: shift.open,
  };
}

/** Escucha marcas de asistencia del día para el motorizado. */
export function subscribeDriverTodayPunches(
  driverId: string,
  callback: (punches: CabinAttendancePunch[]) => void,
): Unsubscribe {
  const dayKey = todayDateKey();
  return onSnapshot(
    collection(db, 'attendance_punches'),
    (snap) => {
      const rows: CabinAttendancePunch[] = [];
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        if (String(data.driverId || '') !== driverId) return;
        const at = String(data.at || '');
        const dateKey = data.dateKey ? String(data.dateKey) : '';
        const dayOfPunch = at ? bogotaDay(at) : dateKey;
        if (dayOfPunch !== dayKey && dateKey !== dayKey) return;
        const type = String(data.type || '') === 'out' ? 'out' : 'in';
        rows.push({
          id: d.id,
          driverId,
          type,
          at: String(data.at || ''),
          dateKey: dateKey || undefined,
          odometerKm:
            typeof data.odometerKm === 'number' ? data.odometerKm : Number(data.odometerKm) || undefined,
        });
      });
      rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      callback(rows);
    },
    () => callback([]),
  );
}

export async function createDriverIncident(params: {
  driverId: string;
  driverName: string;
  category: string;
  description: string;
  orderId?: string;
  trackingCode?: string;
  isPanic?: boolean;
  lat?: number;
  lng?: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const id = 'inc_' + Date.now();
  const title = params.isPanic ? '🚨 Botón de pánico' : params.category;
  await setDoc(doc(db, 'incidents', id), {
    id,
    orderId: params.orderId || null,
    trackingCode: params.trackingCode || null,
    driverId: params.driverId,
    driverName: params.driverName,
    reportedByRole: 'driver',
    reportedByName: params.driverName,
    category: params.category,
    title,
    description: params.description.trim() || title,
    status: 'open',
    isPanic: Boolean(params.isPanic),
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export function normalizeCoPhone(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('57') && digits.length >= 12) return digits;
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

export function openWhatsAppTo(phone?: string, text?: string): void {
  const n = normalizeCoPhone(phone);
  if (!n) return;
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  window.location.href = `https://wa.me/${n}${q}`;
}

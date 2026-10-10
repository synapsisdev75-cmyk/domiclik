/** Cola offline de avances de estado + caché de pedidos abiertos. */

import type { DriverOrder } from './driverCabin';

const ORDERS_CACHE_KEY = 'domiclick_cabin_orders_v1';
const QUEUE_KEY = 'domiclick_cabin_advance_queue_v1';

export type QueuedAdvance = {
  id: string;
  orderId: string;
  status: string;
  driverId: string;
  driverName: string;
  queuedAt: string;
};

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function cacheOpenOrders(driverId: string, orders: DriverOrder[]): void {
  try {
    localStorage.setItem(
      ORDERS_CACHE_KEY,
      JSON.stringify({ driverId, at: new Date().toISOString(), orders }),
    );
  } catch {
    /* quota */
  }
}

export function readCachedOpenOrders(driverId: string): DriverOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { driverId?: string; orders?: DriverOrder[] };
    if (parsed.driverId !== driverId || !Array.isArray(parsed.orders)) return [];
    return parsed.orders;
  } catch {
    return [];
  }
}

export function readAdvanceQueue(): QueuedAdvance[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedAdvance[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAdvanceQueue(rows: QueuedAdvance[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
  } catch {
    /* quota */
  }
}

export function enqueueAdvance(entry: Omit<QueuedAdvance, 'id' | 'queuedAt'>): QueuedAdvance {
  const row: QueuedAdvance = {
    ...entry,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    queuedAt: new Date().toISOString(),
  };
  const rest = readAdvanceQueue().filter(
    (q) => !(q.orderId === row.orderId && q.status === row.status),
  );
  writeAdvanceQueue([...rest, row]);
  return row;
}

export function removeQueuedAdvance(id: string): void {
  writeAdvanceQueue(readAdvanceQueue().filter((q) => q.id !== id));
}

const PIN_QUEUE_KEY = 'domiclick_cabin_pin_queue_v1';

export type QueuedPin = {
  id: string;
  orderId: string;
  pin: string;
  queuedAt: string;
};

export function readPinQueue(): QueuedPin[] {
  try {
    const raw = localStorage.getItem(PIN_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedPin[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePinQueue(rows: QueuedPin[]): void {
  try {
    localStorage.setItem(PIN_QUEUE_KEY, JSON.stringify(rows));
  } catch {
    /* quota */
  }
}

export function enqueuePin(orderId: string, pin: string): QueuedPin {
  const row: QueuedPin = {
    id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    orderId,
    pin: pin.trim(),
    queuedAt: new Date().toISOString(),
  };
  const rest = readPinQueue().filter((q) => q.orderId !== orderId);
  writePinQueue([...rest, row]);
  return row;
}

export function removeQueuedPin(id: string): void {
  writePinQueue(readPinQueue().filter((q) => q.id !== id));
}

export function pendingSyncCount(): number {
  return readAdvanceQueue().length + readPinQueue().length;
}

/** Una operación que no responde en este tiempo se trata como señal débil. */
export const WEAK_SIGNAL_MS = 8000;

export function withTimeout<T>(work: Promise<T>, ms = WEAK_SIGNAL_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

let weakSignal = false;
let networkFails = 0;
const signalListeners = new Set<() => void>();

export function isWeakSignal(): boolean {
  return weakSignal;
}

export function subscribeSignal(listener: () => void): () => void {
  signalListeners.add(listener);
  return () => signalListeners.delete(listener);
}

function emitSignal(): void {
  signalListeners.forEach((listener) => listener());
}

/** Dos fallos seguidos marcan señal débil. Un éxito la limpia. */
export function noteNetworkResult(ok: boolean): void {
  if (ok) {
    const wasWeak = weakSignal;
    networkFails = 0;
    weakSignal = false;
    if (wasWeak) emitSignal();
    return;
  }
  networkFails += 1;
  if (networkFails >= 2 && !weakSignal) {
    weakSignal = true;
    emitSignal();
  }
}

/** Aplica avances pendientes en memoria (UI) hasta que se sincronicen. */
export function applyQueuedStatusToOrders(
  orders: DriverOrder[],
  queue: QueuedAdvance[],
): DriverOrder[] {
  if (!queue.length) return orders;
  const byOrder = new Map<string, string>();
  for (const q of queue) byOrder.set(q.orderId, q.status);
  return orders.map((o) => {
    const next = byOrder.get(o.id);
    return next ? { ...o, status: next, updatedAt: new Date().toISOString() } : o;
  });
}

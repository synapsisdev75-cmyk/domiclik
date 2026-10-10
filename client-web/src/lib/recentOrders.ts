/** Pedidos recientes en el dispositivo (respaldo si Firestore no tiene customerUid). */

export type RecentOrderLocal = {
  trackingCode: string;
  orderId?: string;
  deliveryAddress?: string;
  status?: string;
  createdAt: string;
};

const KEY = 'domiclick_recent_orders';
const MAX = 20;

function readAll(): RecentOrderLocal[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentOrderLocal[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: RecentOrderLocal[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
}

export function rememberRecentOrder(entry: RecentOrderLocal): void {
  const code = entry.trackingCode.trim().toUpperCase();
  if (!code) return;
  const rest = readAll().filter((r) => r.trackingCode.toUpperCase() !== code);
  writeAll([{ ...entry, trackingCode: code }, ...rest]);
}

export function listRecentOrdersLocal(): RecentOrderLocal[] {
  return readAll();
}

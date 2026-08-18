import {
  DeliveryOrder,
  DispatchSettings,
  LocationCoords,
  MotorizadoDriver,
} from '../types';
import { DEFAULT_DISPATCH_SETTINGS } from './adminMetrics';
import { isLiveOrderStatus } from './orderFlow';
import { calculateOptimalRoute } from '../utils/routing';
import { updateOrderFields, updateOrderStatus } from './firebase';

/** Distancia geodésica en km (Haversine). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function computeRoutePrice(distanceKm: number, settings: DispatchSettings): number {
  const base = Number(settings.baseFee) || 0;
  const perKm = Number(settings.perKmRate) || 0;
  return Math.round(base + Math.max(0, distanceKm) * perKm);
}

export type NearestDriverResult = {
  driver: MotorizadoDriver;
  distanceKm: number;
};

/** Conductores ocupados: ya tienen pedido assigned o in_transit. */
export function getBusyDriverIds(orders: DeliveryOrder[]): Set<string> {
  const busy = new Set<string>();
  for (const o of orders) {
    if (isLiveOrderStatus(o.status) && o.assignedDriverId) {
      busy.add(o.assignedDriverId);
    }
  }
  return busy;
}

/**
 * Motorizado: aprobado + activo (cabina ON) + no suspendido + con GPS + libre + dentro del radio.
 */
export function findNearestEligibleDriver(
  drivers: MotorizadoDriver[],
  pickup: LocationCoords,
  radiusKm: number,
  busyDriverIds: Set<string> = new Set()
): NearestDriverResult | null {
  let best: NearestDriverResult | null = null;
  for (const driver of drivers) {
    if (driver.status !== 'approved') continue;
    if (!driver.isActive) continue;
    if (driver.suspended) continue;
    if (busyDriverIds.has(driver.id)) continue;
    if (!driver.location?.lat || !driver.location?.lng) continue;
    const distanceKm = haversineKm(driver.location, pickup);
    if (distanceKm > radiusKm) continue;
    if (!best || distanceKm < best.distanceKm) {
      best = { driver, distanceKm };
    }
  }
  return best;
}

export type DispatchResult = {
  orderId: string;
  priced: boolean;
  assigned: boolean;
  routeDistanceKm?: number;
  routeDurationMin?: number;
  routePrice?: number;
  driverId?: string;
  driverName?: string;
  assignedDistanceKm?: number;
  reason?: string;
};

export type DispatchOptions = {
  busyDriverIds?: Set<string>;
  /** Radio ampliado si nadie está en el radio base (km). Default 30. */
  expandRadiusKm?: number;
};

function shouldDeferScheduled(order: DeliveryOrder): boolean {
  if (!order.scheduledFor) return false;
  const ms = new Date(order.scheduledFor).getTime() - Date.now();
  return Number.isFinite(ms) && ms > 2 * 60 * 60 * 1000;
}

/**
 * Calcula ruta/precio y asigna automáticamente al activo libre más cercano.
 */
export async function dispatchPendingOrder(
  order: DeliveryOrder,
  drivers: MotorizadoDriver[],
  settings: DispatchSettings = DEFAULT_DISPATCH_SETTINGS,
  options: DispatchOptions = {}
): Promise<DispatchResult> {
  if (order.status !== 'pending') {
    return { orderId: order.id, priced: false, assigned: false, reason: 'not_pending' };
  }
  if (order.assignedDriverId) {
    return { orderId: order.id, priced: false, assigned: false, reason: 'already_assigned' };
  }
  if (!order.pickupCoords?.lat || !order.deliveryCoords?.lat) {
    return { orderId: order.id, priced: false, assigned: false, reason: 'missing_coords' };
  }
  if (shouldDeferScheduled(order)) {
    return { orderId: order.id, priced: false, assigned: false, reason: 'scheduled_deferred' };
  }

  let routeDistanceKm = order.routeDistanceKm;
  let routeDurationMin = order.routeDurationMin;
  let routePrice = order.routePrice ?? order.shippingFee;

  const keepClientQuote =
    order.clientQuoted === true &&
    typeof order.shippingFee === 'number' &&
    order.shippingFee > 0;

  if (!keepClientQuote) {
    try {
      const route = await calculateOptimalRoute(
        order.pickupCoords.lat,
        order.pickupCoords.lng,
        order.deliveryCoords.lat,
        order.deliveryCoords.lng
      );
      routeDistanceKm = route.distanceKm;
      routeDurationMin = route.durationMinutes;
      routePrice = computeRoutePrice(route.distanceKm, settings);
    } catch (err) {
      console.warn('[dispatch] route calc failed, using fallback price', err);
      const approx = haversineKm(order.pickupCoords, order.deliveryCoords) * 1.35;
      routeDistanceKm = Math.round(approx * 100) / 100;
      routeDurationMin = Math.max(8, Math.ceil(approx * 4));
      routePrice = computeRoutePrice(routeDistanceKm, settings);
    }
  } else {
    routePrice = order.shippingFee;
    routeDistanceKm = order.routeDistanceKm ?? routeDistanceKm;
    routeDurationMin = order.routeDurationMin ?? routeDurationMin;
  }

  await updateOrderFields(order.id, {
    routeDistanceKm,
    routeDurationMin,
    routePrice,
    shippingFee: routePrice,
    dispatchRadiusKm: settings.searchRadiusKm,
    updatedAt: new Date().toISOString(),
  });

  if (!settings.autoAssignEnabled) {
    return {
      orderId: order.id,
      priced: true,
      assigned: false,
      routeDistanceKm,
      routeDurationMin,
      routePrice,
      reason: 'auto_assign_disabled',
    };
  }

  const busy = options.busyDriverIds ?? new Set<string>();
  const baseRadius = Math.max(1, Number(settings.searchRadiusKm) || 15);
  const expandRadius = Math.max(
    baseRadius,
    options.expandRadiusKm ?? Math.max(30, baseRadius * 3)
  );

  let nearest = findNearestEligibleDriver(
    drivers,
    order.pickupCoords,
    baseRadius,
    busy
  );
  let usedRadius = baseRadius;

  // Si nadie en el radio base: buscar en radio ampliado (ciudad)
  if (!nearest) {
    nearest = findNearestEligibleDriver(
      drivers,
      order.pickupCoords,
      expandRadius,
      busy
    );
    usedRadius = expandRadius;
  }

  if (!nearest) {
    return {
      orderId: order.id,
      priced: true,
      assigned: false,
      routeDistanceKm,
      routeDurationMin,
      routePrice,
      reason: 'no_free_active_driver',
    };
  }

  const now = new Date().toISOString();
  await updateOrderStatus(
    order.id,
    'assigned',
    nearest.driver.id,
    nearest.driver.fullName
  );
  await updateOrderFields(order.id, {
    autoAssignedAt: now,
    assignedDistanceKm: Math.round(nearest.distanceKm * 100) / 100,
    assignedDriverPhone: nearest.driver.phone || null,
    dispatchRadiusKm: usedRadius,
    updatedAt: now,
  });

  console.info(
    `[auto-dispatch] ${order.trackingCode || order.id} → ${nearest.driver.fullName} (${nearest.distanceKm.toFixed(2)} km)`
  );

  return {
    orderId: order.id,
    priced: true,
    assigned: true,
    routeDistanceKm,
    routeDurationMin,
    routePrice,
    driverId: nearest.driver.id,
    driverName: nearest.driver.fullName,
    assignedDistanceKm: nearest.distanceKm,
  };
}

/**
 * Despacha todos los pending: el más cercano activo y libre.
 * Asignaciones secuenciales para no dar el mismo conductor a dos pedidos.
 */
export async function dispatchAllPendingOrders(
  orders: DeliveryOrder[],
  drivers: MotorizadoDriver[],
  settings: DispatchSettings
): Promise<DispatchResult[]> {
  const pending = orders
    .filter((o) => o.status === 'pending' && !o.assignedDriverId)
    .sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );

  const busy = getBusyDriverIds(orders);
  const results: DispatchResult[] = [];

  for (const order of pending) {
    const result = await dispatchPendingOrder(order, drivers, settings, {
      busyDriverIds: busy,
    });
    if (result.assigned && result.driverId) {
      busy.add(result.driverId);
    }
    results.push(result);
  }
  return results;
}

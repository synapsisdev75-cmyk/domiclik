import {
  DeliveryOrder,
  DispatchSettings,
  LocationCoords,
  MotorizadoDriver,
} from '../types';
import { DEFAULT_DISPATCH_SETTINGS } from './adminMetrics';
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

/** Motorizado aprobado, activo, no suspendido, con GPS, dentro del radio del pickup. */
export function findNearestEligibleDriver(
  drivers: MotorizadoDriver[],
  pickup: LocationCoords,
  radiusKm: number
): NearestDriverResult | null {
  let best: NearestDriverResult | null = null;
  for (const driver of drivers) {
    if (driver.status !== 'approved') continue;
    if (!driver.isActive) continue;
    if (driver.suspended) continue;
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

/**
 * Calcula ruta + precio (admin) y asigna al activo más cercano dentro del radio.
 */
export async function dispatchPendingOrder(
  order: DeliveryOrder,
  drivers: MotorizadoDriver[],
  settings: DispatchSettings = DEFAULT_DISPATCH_SETTINGS
): Promise<DispatchResult> {
  if (order.status !== 'pending') {
    return { orderId: order.id, priced: false, assigned: false, reason: 'not_pending' };
  }
  if (!order.pickupCoords?.lat || !order.deliveryCoords?.lat) {
    return { orderId: order.id, priced: false, assigned: false, reason: 'missing_coords' };
  }

  let routeDistanceKm = order.routeDistanceKm;
  let routeDurationMin = order.routeDurationMin;
  let routePrice = order.routePrice ?? order.shippingFee;

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

  const nearest = findNearestEligibleDriver(
    drivers,
    order.pickupCoords,
    settings.searchRadiusKm
  );

  if (!nearest) {
    return {
      orderId: order.id,
      priced: true,
      assigned: false,
      routeDistanceKm,
      routeDurationMin,
      routePrice,
      reason: 'no_driver_in_radius',
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
    updatedAt: now,
  });

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

/** Reintenta despacho de todos los pending. */
export async function dispatchAllPendingOrders(
  orders: DeliveryOrder[],
  drivers: MotorizadoDriver[],
  settings: DispatchSettings
): Promise<DispatchResult[]> {
  const pending = orders.filter((o) => o.status === 'pending' && !o.assignedDriverId);
  const results: DispatchResult[] = [];
  for (const order of pending) {
    results.push(await dispatchPendingOrder(order, drivers, settings));
  }
  return results;
}

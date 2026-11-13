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
import { driverCanTakeOrder, isDriverAssignable, minutesFromDistanceKm } from './workShift';

/** Pedidos vivos que la torre puede dejarle al mismo transportista. */
export const MAX_AUTO_ORDERS = 3;
/** El 2.º y el 3.º también entran si el pedido va por una parada que ya lleva. */
export const ALONG_ROUTE_KM = 8;

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

/** Pedidos vivos de cada conductor y quién ya llegó al tope de 3. */
export function driverAutoLoad(orders: DeliveryOrder[]): {
  full: Set<string>;
  liveByDriver: Map<string, DeliveryOrder[]>;
} {
  const liveByDriver = new Map<string, DeliveryOrder[]>();
  const full = new Set<string>();
  for (const order of orders) {
    if (!isLiveOrderStatus(order.status) || !order.assignedDriverId) continue;
    const list = liveByDriver.get(order.assignedDriverId) ?? [];
    list.push(order);
    liveByDriver.set(order.assignedDriverId, list);
    if (list.length >= MAX_AUTO_ORDERS) full.add(order.assignedDriverId);
  }
  return { full, liveByDriver };
}

/** Conductores que ya no pueden recibir otro pedido automático. */
export function getBusyDriverIds(orders: DeliveryOrder[]): Set<string> {
  return driverAutoLoad(orders).full;
}

function gpsAgeMs(driver: MotorizadoDriver): number {
  const at = Date.parse(driver.location?.updatedAt || '');
  return Number.isFinite(at) ? Date.now() - at : Number.POSITIVE_INFINITY;
}

function sharesRoute(
  driverLoc: { lat: number; lng: number } | null | undefined,
  open: DeliveryOrder[],
  pickup: LocationCoords,
  delivery: LocationCoords,
): boolean {
  if (!open.length) return true;
  const anchors: { lat: number; lng: number }[] = [];
  if (driverLoc?.lat && driverLoc?.lng) anchors.push(driverLoc);
  for (const order of open) {
    if (order.pickupCoords?.lat && order.pickupCoords?.lng) anchors.push(order.pickupCoords);
    if (order.deliveryCoords?.lat && order.deliveryCoords?.lng) anchors.push(order.deliveryCoords);
  }
  if (!anchors.length) return false;
  const near = (point: LocationCoords) =>
    anchors.some((anchor) => haversineKm(anchor, point) <= ALONG_ROUTE_KM);
  return near(pickup) || near(delivery);
}

/**
 * Motorizado: aprobado + activo + en turno + GPS.
 * Libre dentro del radio, o con 1–2 pedidos si sigue cerca o va por la misma ruta.
 */
export function findNearestEligibleDriver(
  drivers: MotorizadoDriver[],
  pickup: LocationCoords,
  radiusKm: number,
  busyDriverIds: Set<string> = new Set(),
  job?: { durationMin?: number; delivery?: LocationCoords },
  liveByDriver: Map<string, DeliveryOrder[]> = new Map(),
  /** VIP: solo motos sin pedido abierto (libre total). */
  idleOnly = false,
): NearestDriverResult | null {
  const orderMinutes =
    job?.durationMin && job.durationMin > 0
      ? job.durationMin
      : job?.delivery
        ? minutesFromDistanceKm(haversineKm(pickup, job.delivery))
        : 0;
  let best: NearestDriverResult | null = null;
  for (const driver of drivers) {
    if (!isDriverAssignable(driver)) continue;
    if (busyDriverIds.has(driver.id)) continue;
    const open = liveByDriver.get(driver.id) ?? [];
    if (idleOnly && open.length > 0) continue;
    if (open.length >= MAX_AUTO_ORDERS) continue;
    if (!driver.location?.lat || !driver.location?.lng) continue;
    const distanceKm = haversineKm(driver.location, pickup);
    const closeEnough = distanceKm <= radiusKm;
    const onRoute =
      open.length > 0 &&
      Boolean(job?.delivery && sharesRoute(driver.location, open, pickup, job.delivery));
    // 2.º/3.º: puede ir por la misma ruta, pero nunca gana a alguien más cerca del pickup.
    if (open.length === 0 && !closeEnough) continue;
    if (open.length > 0 && !closeEnough && !onRoute) continue;
    if (
      !driverCanTakeOrder({
        lastPunchAt: driver.lastPunchAt,
        approachKm: distanceKm,
        orderMinutes,
      })
    ) {
      continue;
    }
    const fresher =
      best &&
      Math.abs(distanceKm - best.distanceKm) <= 0.4 &&
      gpsAgeMs(driver) < gpsAgeMs(best.driver);
    if (!best || distanceKm < best.distanceKm - 0.05 || fresher) {
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
  liveByDriver?: Map<string, DeliveryOrder[]>;
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
  if (order.paymentReviewStatus === 'pending_review') {
    return { orderId: order.id, priced: false, assigned: false, reason: 'payment_review' };
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
  const liveByDriver = options.liveByDriver ?? new Map<string, DeliveryOrder[]>();
  const baseRadius = Math.max(1, Number(settings.searchRadiusKm) || 15);
  const expandRadius = Math.max(
    baseRadius,
    options.expandRadiusKm ?? Math.max(30, baseRadius * 3)
  );
  // VIP prioridad 1: radio ciudad + primero libre total; si no hay, cae a cupo 2.º/3.º.
  const vipPriority = Boolean(order.isVip);
  const firstRadius = vipPriority ? expandRadius : baseRadius;

  const job = {
    durationMin: routeDurationMin,
    delivery: order.deliveryCoords,
  };
  let nearest = findNearestEligibleDriver(
    drivers,
    order.pickupCoords,
    firstRadius,
    busy,
    job,
    liveByDriver,
    vipPriority,
  );
  let usedRadius = firstRadius;

  if (!nearest && vipPriority) {
    nearest = findNearestEligibleDriver(
      drivers,
      order.pickupCoords,
      expandRadius,
      busy,
      job,
      liveByDriver,
      false,
    );
  }

  // Si nadie en el radio base: buscar en radio ampliado (ciudad)
  if (!nearest && !vipPriority) {
    nearest = findNearestEligibleDriver(
      drivers,
      order.pickupCoords,
      expandRadius,
      busy,
      job,
      liveByDriver,
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
    dispatchCriterion: vipPriority ? 'vip_priority_nearest_pickup' : 'nearest_pickup',
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
 * Despacha los pending al activo más cercano.
 * Un conductor puede llevar hasta 3 si el pedido nuevo va por su misma ruta.
 */
export async function dispatchAllPendingOrders(
  orders: DeliveryOrder[],
  drivers: MotorizadoDriver[],
  settings: DispatchSettings
): Promise<DispatchResult[]> {
  const pending = orders
    .filter(
      (o) =>
        o.status === 'pending' &&
        !o.assignedDriverId &&
        o.paymentReviewStatus !== 'pending_review',
    )
    .sort((a, b) => {
      if (Boolean(a.isVip) !== Boolean(b.isVip)) return a.isVip ? -1 : 1;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

  const { full: busy, liveByDriver } = driverAutoLoad(orders);
  const results: DispatchResult[] = [];

  for (const order of pending) {
    const result = await dispatchPendingOrder(order, drivers, settings, {
      busyDriverIds: busy,
      liveByDriver,
    });
    if (result.assigned && result.driverId) {
      const list = liveByDriver.get(result.driverId) ?? [];
      list.push({ ...order, assignedDriverId: result.driverId, status: 'assigned' });
      liveByDriver.set(result.driverId, list);
      if (list.length >= MAX_AUTO_ORDERS) busy.add(result.driverId);
    }
    results.push(result);
  }
  return results;
}

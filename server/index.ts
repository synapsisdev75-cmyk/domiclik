/**
 * DomiClick Ingest API — tubo hacia páginas de ventas autorizadas.
 * Circuito cerrado: solo sitios con token + sourceSiteId registrados.
 *
 * npm run server  →  http://localhost:8787
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, limit, updateDoc } from 'firebase/firestore';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = Number(process.env.DOMICLICK_API_PORT || 8787);
const INGEST_TOKEN = process.env.DOMICLICK_INGEST_TOKEN || 'domiclick-dev-ingest-token';
const VTA_TOKEN = process.env.VTA_INGEST_TOKEN || INGEST_TOKEN;
const AUTHORIZED_SITES = new Set(
  (process.env.DOMICLICK_AUTHORIZED_SITES || 'ventas-local,dulce-sorpresa,clientes-landing')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const fallback = JSON.parse(
  readFileSync(join(root, 'firebase-applet-config.json'), 'utf8')
) as Record<string, string>;

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || fallback.apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || fallback.authDomain,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || fallback.projectId,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || fallback.storageBucket,
  messagingSenderId:
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallback.messagingSenderId,
  appId: process.env.VITE_FIREBASE_APP_ID || fallback.appId,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || fallback.measurementId || '',
  firestoreDatabaseId:
    process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || fallback.firestoreDatabaseId,
};

const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(fbApp, firebaseConfig.firestoreDatabaseId)
    : getFirestore(fbApp);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '256kb' }));

function authIngest(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token !== INGEST_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized ingest token' });
  }
  next();
}

function authVta(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || (token !== VTA_TOKEN && token !== INGEST_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized VTA token' });
  }
  next();
}

function toDateKeyLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveNextPunchType(
  todayPunches: Array<{ type: string; at: string }>,
): 'in' | 'out' {
  if (!todayPunches.length) return 'in';
  const sorted = [...todayPunches].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  return sorted[sorted.length - 1].type === 'in' ? 'out' : 'in';
}

app.get('/api/v1/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'domiclick-ingest',
    projectId: firebaseConfig.projectId,
    authorizedSites: [...AUTHORIZED_SITES],
  });
});

/**
 * TUBO: Página de Ventas → DomiClick
 * Recibe cliente + dirección y crea pedido pending en Firestore.
 */
app.post('/api/v1/inbound/orders', authIngest, async (req, res) => {
  try {
    const body = req.body || {};
    const siteHeader = String(req.headers['x-domiclick-site'] || '');
    const sourceSiteId = String(body.sourceSiteId || siteHeader || '').trim();

    if (!sourceSiteId || !AUTHORIZED_SITES.has(sourceSiteId)) {
      return res.status(403).json({
        ok: false,
        error: `Site no autorizado: ${sourceSiteId || '(vacío)'}`,
      });
    }

    const customerName = String(body.customerName || '').trim();
    const customerPhone = String(body.customerPhone || '').trim();
    const deliveryAddress = String(body.deliveryAddress || '').trim();

    if (!customerName || !customerPhone || !deliveryAddress) {
      return res.status(400).json({
        ok: false,
        error: 'Requiere customerName, customerPhone y deliveryAddress',
      });
    }

    const pickupLat = Number(body.pickupLat);
    const pickupLng = Number(body.pickupLng);
    const deliveryLat = Number(body.deliveryLat);
    const deliveryLng = Number(body.deliveryLng);
    const hasPickup = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);
    const hasDelivery = Number.isFinite(deliveryLat) && Number.isFinite(deliveryLng);

    const orderId = 'ord_' + Date.now();
    const trackingCode = 'DMC-' + Math.floor(1000 + Math.random() * 9000);
    const deliveryConfirmCode = String(Math.floor(100000 + Math.random() * 900000));
    const now = new Date().toISOString();

    const clientFee = Number(body.shippingFee);
    const clientKm = Number(body.routeDistanceKm);
    const clientQuoted =
      Number.isFinite(clientFee) && clientFee > 0 && Number.isFinite(clientKm) && clientKm > 0;

    let scheduledFor = '';
    if (body.scheduledFor) {
      const sched = new Date(String(body.scheduledFor));
      if (!Number.isNaN(sched.getTime())) {
        const max = Date.now() + 15 * 24 * 60 * 60 * 1000;
        const min = Date.now() - 5 * 60 * 1000;
        if (sched.getTime() <= max && sched.getTime() >= min) {
          scheduledFor = sched.toISOString();
        }
      }
    }

    const order = {
      id: orderId,
      trackingCode,
      deliveryConfirmCode,
      customerName,
      customerPhone,
      customerEmail: body.customerEmail || '',
      customerUid: body.customerUid || '',
      customerPhotoURL: body.customerPhotoURL || '',
      pickupAddress: body.pickupAddress || 'Origen tienda / Bodega DomiClick',
      pickupCoords: {
        lat: hasPickup ? pickupLat : 4.142,
        lng: hasPickup ? pickupLng : -73.6266,
        addressName: body.pickupAddress || 'Origen',
      },
      deliveryAddress,
      deliveryCoords: {
        lat: hasDelivery ? deliveryLat : 4.15,
        lng: hasDelivery ? deliveryLng : -73.63,
        addressName: deliveryAddress,
      },
      description: body.description || 'Pedido desde página de ventas',
      itemType: 'varios',
      declaredValue: Number(body.declaredValue) || 0,
      shippingFee: clientQuoted ? Math.round(clientFee) : 0,
      routePrice: clientQuoted ? Math.round(clientFee) : 0,
      routeDistanceKm: clientQuoted ? Math.round(clientKm * 100) / 100 : undefined,
      routeDurationMin: Number(body.routeDurationMin) || undefined,
      pricingBand: body.pricingBand === 'peak' ? 'peak' : body.pricingBand === 'normal' ? 'normal' : undefined,
      pricePerKm: Number(body.pricePerKm) || undefined,
      peakMultiplier: Number(body.peakMultiplier) || undefined,
      clientQuoted,
      scheduledFor: scheduledFor || undefined,
      status: 'pending',
      assignedDriverId: null,
      assignedDriverName: null,
      notes: body.notes || '',
      invoiceNumber: body.invoiceNumber || '',
      invoicePhotoUrl: body.invoicePhotoUrl || '',
      paymentMethod: body.paymentMethod || 'efectivo',
      paymentNote: body.paymentNote || '',
      ...(body.paymentMethod === 'transferencia' && body.paymentProofUrl
        ? {
            transferChannel: body.transferChannel === 'qr' ? 'qr' : 'breb',
            paymentProofUrl: body.paymentProofUrl,
            paymentReviewStatus: 'pending_review' as const,
          }
        : {}),
      sourceSiteId,
      externalOrderId: body.externalOrderId || '',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'orders', orderId), order);

    // Pedidos programados a más de 2h: se dejan pending (Central los despacha después)
    const schedMs = scheduledFor ? new Date(scheduledFor).getTime() - Date.now() : 0;
    const paymentHold = order.paymentReviewStatus === 'pending_review';
    const deferAssign = paymentHold || Boolean(scheduledFor && schedMs > 2 * 60 * 60 * 1000);

    try {
      if (!deferAssign) {
        const { dispatchPendingOrder, getBusyDriverIds } = await import('../src/lib/autoDispatch');
        const { LIVE_ORDER_STATUSES } = await import('../src/lib/orderFlow');
        const { DEFAULT_DISPATCH_SETTINGS } = await import('../src/lib/adminMetrics');
        const driversSnap = await getDocs(collection(db, 'drivers'));
        const drivers: any[] = [];
        driversSnap.forEach((d) => drivers.push({ id: d.id, ...d.data() }));
        // Todos los estados vivos (no solo assigned/in_transit): si no, al Aceptar
        // el motorizado queda "libre" y un segundo pedido le tapa el primero.
        const activeOrdersSnap = await getDocs(
          query(collection(db, 'orders'), where('status', 'in', [...LIVE_ORDER_STATUSES]))
        );
        const activeOrders: any[] = [];
        activeOrdersSnap.forEach((d) => activeOrders.push({ id: d.id, ...d.data() }));
        const busyDriverIds = getBusyDriverIds(activeOrders);
        const settingsSnap = await getDoc(doc(db, 'settings', 'dispatch'));
        const settings = settingsSnap.exists()
          ? { ...DEFAULT_DISPATCH_SETTINGS, ...settingsSnap.data(), id: 'dispatch' as const }
          : DEFAULT_DISPATCH_SETTINGS;
        const result = await dispatchPendingOrder(order as any, drivers, settings, {
          busyDriverIds,
        });
        return res.status(201).json({
          ok: true,
          orderId,
          trackingCode,
          deliveryConfirmCode,
          status: result.assigned ? 'assigned' : 'pending',
          assignedDriverId: result.driverId || null,
          shippingFee: result.routePrice ?? order.shippingFee,
          routeDistanceKm: result.routeDistanceKm ?? order.routeDistanceKm ?? null,
          routePrice: result.routePrice || null,
          scheduledFor: scheduledFor || null,
          pricingBand: order.pricingBand || null,
          paymentReviewStatus: order.paymentReviewStatus,
        });
      }
    } catch (dispatchErr) {
      console.warn('[ingest] auto-dispatch skipped', dispatchErr);
    }

    return res.status(201).json({
      ok: true,
      orderId,
      trackingCode,
      deliveryConfirmCode,
      status: 'pending',
      shippingFee: order.shippingFee || null,
      routeDistanceKm: order.routeDistanceKm || null,
      scheduledFor: scheduledFor || null,
      pricingBand: order.pricingBand || null,
      paymentReviewStatus: order.paymentReviewStatus,
    });
  } catch (err) {
    console.error('[ingest]', err);
    return res.status(500).json({ ok: false, error: 'Ingest failed' });
  }
});

function etaForStatus(status: string): string {
  switch (status) {
    case 'pending':
      return 'Central está asignando un repartidor';
    case 'assigned':
      return 'Repartidor asignado · en preparación';
    case 'in_transit':
      return 'En camino · llegada estimada en minutos';
    case 'delivered':
      return 'Entrega completada';
    case 'cancelled':
      return 'Pedido cancelado';
    default:
      return 'Actualizando estado…';
  }
}

/**
 * Tracking público por código — sin datos sensibles del repartidor (teléfono).
 */
app.get('/api/v1/tracking/:trackingCode', async (req, res) => {
  try {
    const trackingCode = String(req.params.trackingCode || '')
      .trim()
      .toUpperCase();
    if (!trackingCode) {
      return res.status(400).json({ ok: false, error: 'Código requerido' });
    }

    const snap = await getDocs(
      query(collection(db, 'orders'), where('trackingCode', '==', trackingCode), limit(1))
    );
    if (snap.empty) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data();
    const status = String(data.status || 'pending');

    return res.json({
      ok: true,
      orderId: docSnap.id,
      trackingCode: data.trackingCode || trackingCode,
      deliveryConfirmCode:
        status === 'delivered' || status === 'cancelled'
          ? null
          : data.deliveryConfirmCode || null,
      status,
      assignedDriverId: data.assignedDriverId || null,
      assignedDriverName: data.assignedDriverName || null,
      serviceRating: data.serviceRating || null,
      ratingComment: data.ratingComment || '',
      etaText: etaForStatus(status),
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
    });
  } catch (err) {
    console.error('[tracking]', err);
    return res.status(500).json({ ok: false, error: 'Tracking failed' });
  }
});

/**
 * Marca de asistencia desde biométrico VTA (sede).
 * Body: { vtaUserId, at?, type?: 'in'|'out' }
 * Sin type: alterna in/out según marcas del día.
 */
app.post('/api/v1/attendance/vta-punch', authVta, async (req, res) => {
  try {
    const body = req.body || {};
    const vtaUserId = String(body.vtaUserId || body.userId || '').trim();
    if (!vtaUserId) {
      return res.status(400).json({ ok: false, error: 'Requiere vtaUserId' });
    }

    let typeRaw = String(body.type || '').trim().toLowerCase();
    let type: 'in' | 'out' | undefined =
      typeRaw === 'in' || typeRaw === 'out' ? typeRaw : undefined;

    const atIso =
      body.at && Number.isFinite(new Date(body.at).getTime())
        ? new Date(body.at).toISOString()
        : new Date().toISOString();
    const dateKey = toDateKeyLocal(atIso);

    const byVta = await getDocs(
      query(collection(db, 'drivers'), where('vtaUserId', '==', vtaUserId), limit(5)),
    );
    let driverDoc = byVta.docs[0];
    if (!driverDoc) {
      const all = await getDocs(query(collection(db, 'drivers'), limit(300)));
      driverDoc = all.docs.find((d) => String(d.data().vtaUserId || '').trim() === vtaUserId);
    }
    if (!driverDoc) {
      return res.status(404).json({
        ok: false,
        error: `No hay motorizado con ID VTA «${vtaUserId}». Configúralo en Flota.`,
      });
    }

    const driver = { id: driverDoc.id, ...driverDoc.data() } as {
      id: string;
      fullName?: string;
      status?: string;
    };
    if (driver.status !== 'approved') {
      return res.status(403).json({
        ok: false,
        error: `Motorizado ${driver.fullName || driver.id} no aprobado`,
      });
    }

    if (!type) {
      const daySnap = await getDocs(
        query(
          collection(db, 'attendance_punches'),
          where('driverId', '==', driver.id),
          where('dateKey', '==', dateKey),
          limit(40),
        ),
      );
      const today = daySnap.docs.map((d) => {
        const data = d.data();
        return { type: String(data.type || ''), at: String(data.at || '') };
      });
      type = resolveNextPunchType(today);
    }

    const punchId = 'att_' + Date.now();
    const punch = {
      id: punchId,
      driverId: driver.id,
      driverName: driver.fullName || '',
      type,
      at: atIso,
      dateKey,
      method: 'biometric_vta',
      credentialId: `vta:${vtaUserId}`,
      mobilePhotosPending: false,
      odometerPhotoUrl: '',
      platePhotoUrl: '',
      facePhotoUrl: '',
      pinDayKey: '',
    };

    await setDoc(doc(db, 'attendance_punches', punchId), punch);
    await updateDoc(doc(db, 'drivers', driver.id), {
      lastPunchType: type,
      lastPunchAt: atIso,
      isActive: type === 'in',
      updatedAt: atIso,
    });

    return res.json({
      ok: true,
      punchId,
      driverId: driver.id,
      driverName: driver.fullName || '',
      type,
      at: atIso,
      isActive: type === 'in',
    });
  } catch (err) {
    console.error('[vta-punch]', err);
    return res.status(500).json({ ok: false, error: 'VTA punch failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[DomiClick API] Tubo activo → http://localhost:${PORT}`);
  console.log(`[DomiClick API] POST /api/v1/inbound/orders`);
  console.log(`[DomiClick API] POST /api/v1/attendance/vta-punch`);
  console.log(`[DomiClick API] GET  /api/v1/tracking/:trackingCode`);
  console.log(`[DomiClick API] Sitios: ${[...AUTHORIZED_SITES].join(', ')}`);
});

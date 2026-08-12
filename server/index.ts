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
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = Number(process.env.DOMICLICK_API_PORT || 8787);
const INGEST_TOKEN = process.env.DOMICLICK_INGEST_TOKEN || 'domiclick-dev-ingest-token';
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
        lat: Number(body.pickupLat) || 4.142,
        lng: Number(body.pickupLng) || -73.6266,
        addressName: body.pickupAddress || 'Origen',
      },
      deliveryAddress,
      deliveryCoords: {
        lat: Number(body.deliveryLat) || 4.15,
        lng: Number(body.deliveryLng) || -73.63,
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
      sourceSiteId,
      externalOrderId: body.externalOrderId || '',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'orders', orderId), order);

    // Auto-despacho inmediato solo si no está programado a más de 2h
    const schedMs = scheduledFor ? new Date(scheduledFor).getTime() - Date.now() : 0;
    const deferAssign = Boolean(scheduledFor && schedMs > 2 * 60 * 60 * 1000);

    try {
      if (!deferAssign) {
        const { dispatchPendingOrder } = await import('../src/lib/autoDispatch');
        const { DEFAULT_DISPATCH_SETTINGS } = await import('../src/lib/adminMetrics');
        const driversSnap = await getDocs(collection(db, 'drivers'));
        const drivers: any[] = [];
        driversSnap.forEach((d) => drivers.push({ id: d.id, ...d.data() }));
        const settingsSnap = await getDoc(doc(db, 'settings', 'dispatch'));
        const settings = settingsSnap.exists()
          ? { ...DEFAULT_DISPATCH_SETTINGS, ...settingsSnap.data(), id: 'dispatch' as const }
          : DEFAULT_DISPATCH_SETTINGS;
        const result = await dispatchPendingOrder(order as any, drivers, settings);
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

app.listen(PORT, () => {
  console.log(`[DomiClick API] Tubo activo → http://localhost:${PORT}`);
  console.log(`[DomiClick API] POST /api/v1/inbound/orders`);
  console.log(`[DomiClick API] GET  /api/v1/tracking/:trackingCode`);
  console.log(`[DomiClick API] Sitios: ${[...AUTHORIZED_SITES].join(', ')}`);
});

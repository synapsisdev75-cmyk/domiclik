/**
 * Prueba corta: 3 solicitudes de prueba asignadas al único transportista disponible.
 * Uso: node scripts/test-join-3-orders.mjs
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'));

const app = initializeApp({
  apiKey: cfg.apiKey,
  authDomain: cfg.authDomain,
  projectId: cfg.projectId,
  storageBucket: cfg.storageBucket,
  messagingSenderId: cfg.messagingSenderId,
  appId: cfg.appId,
});

const dbId =
  cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)'
    ? cfg.firestoreDatabaseId
    : undefined;
const db = dbId ? getFirestore(app, dbId) : getFirestore(app);

function sameDay(iso) {
  if (!iso) return false;
  const a = new Date(iso);
  const b = new Date();
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const driversSnap = await getDocs(collection(db, 'drivers'));
const drivers = driversSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

const available = drivers.filter(
  (d) =>
    d.status === 'approved' &&
    !d.suspended &&
    d.isActive === true &&
    d.lastPunchType === 'in' &&
    sameDay(d.lastPunchAt) &&
    Number.isFinite(d.location?.lat) &&
    Number.isFinite(d.location?.lng),
);

console.log(`Transportistas en turno con GPS: ${available.length}`);
for (const d of available) {
  console.log(` - ${d.id} | ${d.fullName || d.email} | ${d.location.lat},${d.location.lng}`);
}

if (available.length === 0) {
  console.error('No hay transportista disponible en turno. Marca entrada y vuelve a correr.');
  process.exit(1);
}

const driver = available[0];
if (available.length > 1) {
  console.log(`Hay más de uno; usando el primero: ${driver.fullName || driver.id}`);
} else {
  console.log(`Único disponible: ${driver.fullName || driver.id}`);
}

const baseLat = Number(driver.location.lat);
const baseLng = Number(driver.location.lng);

/** 3 pares R/E cerca, para forzar tour unido (cruces posibles). */
const scenarios = [
  {
    tag: 'A',
    customerName: 'Prueba Tour A',
    pickup: { lat: baseLat + 0.004, lng: baseLng + 0.002 },
    delivery: { lat: baseLat + 0.012, lng: baseLng + 0.008 },
  },
  {
    tag: 'B',
    customerName: 'Prueba Tour B',
    pickup: { lat: baseLat + 0.006, lng: baseLng - 0.003 },
    delivery: { lat: baseLat + 0.009, lng: baseLng + 0.011 },
  },
  {
    tag: 'C',
    customerName: 'Prueba Tour C',
    pickup: { lat: baseLat + 0.002, lng: baseLng + 0.006 },
    delivery: { lat: baseLat + 0.015, lng: baseLng - 0.002 },
  },
];

const now = new Date().toISOString();
const created = [];

for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i];
  const id = `ord_test_join_${Date.now()}_${s.tag}`;
  // Pequeña pausa para ids distintos
  await new Promise((r) => setTimeout(r, 30));
  const trackingCode = `DMC-T${s.tag}${Math.floor(10 + Math.random() * 89)}`;
  const pin = String(100000 + Math.floor(Math.random() * 900000));
  const order = {
    id,
    trackingCode,
    deliveryConfirmCode: pin,
    customerName: s.customerName,
    customerPhone: '300000000' + (i + 1),
    pickupAddress: `Recogida prueba ${s.tag} (auto)`,
    deliveryAddress: `Entrega prueba ${s.tag} (auto)`,
    description: `PRUEBA tour unido ${s.tag} — borrar después`,
    itemType: 'paquete_pequeno',
    declaredValue: 20000,
    shippingFee: 5000,
    status: 'assigned',
    assignedDriverId: driver.id,
    assignedDriverName: driver.fullName || driver.email || driver.id,
    pickupCoords: {
      lat: s.pickup.lat,
      lng: s.pickup.lng,
      addressName: `R prueba ${s.tag}`,
    },
    deliveryCoords: {
      lat: s.delivery.lat,
      lng: s.delivery.lng,
      addressName: `E prueba ${s.tag}`,
    },
    sourceSiteId: 'ops-admin',
    timeline: [
      { at: now, to: 'pending', byRole: 'admin', note: 'Prueba tour unido' },
      {
        at: now,
        to: 'assigned',
        byRole: 'admin',
        byName: 'script-test-join',
        note: `Asignado a ${driver.fullName || driver.id}`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'orders', id), order);
  created.push({ id, trackingCode, pin, tag: s.tag });
  console.log(`Creada ${id} (${trackingCode}) PIN=${pin} → ${driver.fullName || driver.id}`);
}

// Refleja driverLive en pedidos para el radar
const live = {
  lat: baseLat,
  lng: baseLng,
  heading: driver.location.heading || 0,
  updatedAt: now,
};
for (const c of created) {
  await updateDoc(doc(db, 'orders', c.id), { driverLive: live, updatedAt: new Date().toISOString() });
}

console.log('\nOK — 3 solicitudes de prueba asignadas.');
console.log(JSON.stringify({ driverId: driver.id, driverName: driver.fullName, orders: created }, null, 2));

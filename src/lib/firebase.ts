import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  query,
  where,
  increment,
  getDoc,
  limit,
  memoryLocalCache,
  enableNetwork,
  writeBatch,
  arrayUnion,
  deleteField,
} from 'firebase/firestore';
import {
  initializeAuth,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getFirebaseConfig } from './firebaseConfig';
import {
  MotorizadoDriver,
  DeliveryOrder,
  ChatMessage,
  ChatRoom,
  DriverStatus,
  DriverLocationHistoryPoint,
  DriverReview,
  PayrollSettings,
  PayrollRun,
  AdminAccount,
  DispatchSettings,
  AttendancePunch,
  AttendancePunchType,
  AttendanceDailyPin,
  OpsIncident,
  FleetSettings,
  FleetVehicleSpec,
  FleetMoto,
  FleetMotoStatus,
  MotoMaintenanceLog,
  MotoMaintenanceType,
  MapWallSettings,
  StaffRole,
  SecretariatFile,
} from '../types';
import { DEFAULT_PAYROLL_SETTINGS, DEFAULT_DISPATCH_SETTINGS, toDateKey } from './adminMetrics';
import { DEFAULT_MAP_WALL_SETTINGS, mergeMapWallSettings } from './mapWall';
import {
  dailyPinDocId,
  generateAttendancePin,
  getAttendancePinDayKey,
  getAttendancePinExpiresAt,
} from './attendance';
import { calcShiftFuel, DEFAULT_FLEET_SETTINGS } from './motoFuel';
import { findStaffAccount } from './staffAccount';

const firebaseConfig = getFirebaseConfig();

// Initialize Firebase DomiClik (Auth + Firestore + Storage) — tiempo real
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const namedDbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

function createFirestore() {
  // Solo memoria: lo que borres en la consola se refleja al instante (sin docs fantasma offline)
  try {
    return namedDbId
      ? initializeFirestore(
          app,
          { localCache: memoryLocalCache(), ignoreUndefinedProperties: true },
          namedDbId
        )
      : initializeFirestore(app, {
          localCache: memoryLocalCache(),
          ignoreUndefinedProperties: true,
        });
  } catch {
    return namedDbId ? getFirestore(app, namedDbId) : getFirestore(app);
  }
}

export const db = createFirestore();

function createAuth() {
  try {
    // localStorage primero: Safari/iOS en modo privado falla con IndexedDB
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, indexedDBLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuth();
export const storage = getStorage(app);

/** Fuerza red + lectura real a Firestore (DB nombrada del proyecto). */
export async function connectFirestore(): Promise<boolean> {
  try {
    await enableNetwork(db);
    await Promise.all([
      getDocs(query(collection(db, 'drivers'), limit(1))),
      getDocs(query(collection(db, 'orders'), limit(1))),
    ]);
    emitSync({
      collection: 'drivers',
      fromCache: false,
      hasPendingWrites: false,
      live: true,
      error: undefined,
    });
    console.info(
      `[Firebase] Conectado a Firestore · project=${firebaseConfig.projectId}` +
        (namedDbId ? ` · db=${namedDbId}` : ' · db=(default)')
    );
    return true;
  } catch (err) {
    console.error('[Firebase] No se pudo conectar a Firestore', err);
    emitSync({
      collection: 'drivers',
      fromCache: true,
      hasPendingWrites: false,
      live: false,
      error: String(err),
    });
    return false;
  }
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('email');
googleProvider.addScope('profile');

/** Video hero banner (Firebase Storage) */
export const BANNER_HERO_VIDEO_URL =
  'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0954482957.firebasestorage.app/o/videos%2FAhora_quiero_que_me_hagas_una.mp4?alt=media&token=8f57c23c-28ec-44d1-ba8d-8a693ae0cc04';

export const LOGIN_ROLE_KEY = 'domiclick_login_role';

export const firebaseProjectId = firebaseConfig.projectId;
export const firebaseStorageBucket = firebaseConfig.storageBucket;

// ----------------- STORAGE API ----------------- //

export async function uploadDriverPhoto(file: File, driverId?: string): Promise<string> {
  const id = driverId || `tmp_${Date.now()}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `drivers/${id}/photo_${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

export async function uploadDriverDocument(
  file: File,
  driverId: string,
  docType: 'license' | 'id' | 'soat' | 'other' = 'other'
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `drivers/${driverId}/docs/${docType}_${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
  });
  return getDownloadURL(storageRef);
}

export async function uploadOrderPhoto(file: File, orderId: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `orders/${orderId}/proof_${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

/** Foto del odómetro al entrar / salir (uso empresa). */
export async function uploadOdometerPhoto(
  file: File,
  driverId: string,
  punchType: 'in' | 'out'
): Promise<string> {
  const safeName = (file.name || 'odometro.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `drivers/${driverId}/odometer/${punchType}_${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

/** Selfie de llegada a sede (desbloquea el PIN del día en la tablet). */
export async function uploadAttendanceFacePhoto(
  file: File,
  driverId: string
): Promise<string> {
  const safeName = (file.name || 'rostro.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `drivers/${driverId}/attendance-face/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

/** Placa de la moto (celular vía QR del kiosco). */
export async function uploadPlatePhoto(
  file: File,
  driverId: string,
  punchType: 'in' | 'out'
): Promise<string> {
  const safeName = (file.name || 'placa.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `drivers/${driverId}/plate/${punchType}_${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

export async function uploadBrandLogoFromUrl(localPath: string, storagePath: string): Promise<string> {
  const response = await fetch(localPath);
  const blob = await response.blob();
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/png' });
  return getDownloadURL(storageRef);
}

export async function uploadBrandAssetsToStorage(): Promise<Record<string, string>> {
  // Los iconos ya viven en /public/brand. Subir a Storage es opcional y suele fallar
  // (403) si las reglas de Storage en Firebase Console no están igual a storage.rules.
  if (typeof localStorage !== 'undefined') {
    if (localStorage.getItem('domiclick_brand_upload_skip') === '1') {
      return {};
    }
  }

  const files: { local: string; remote: string }[] = [
    { local: '/brand/logo-mark.png', remote: 'brand/logo-mark.png' },
    { local: '/brand/logo-wordmark.png', remote: 'brand/logo-wordmark.png' },
    { local: '/brand/logo-neon.png', remote: 'brand/logo-neon.png' },
    { local: '/brand/logo-192.png', remote: 'brand/logo-192.png' },
    { local: '/brand/favicon.png', remote: 'brand/favicon.png' },
  ];

  const urls: Record<string, string> = {};
  let unauthorized = false;
  for (const file of files) {
    try {
      urls[file.remote] = await uploadBrandLogoFromUrl(file.local, file.remote);
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code.includes('unauthorized') || code.includes('permission')) {
        unauthorized = true;
        break;
      }
    }
  }

  if (unauthorized && typeof localStorage !== 'undefined') {
    localStorage.setItem('domiclick_brand_upload_skip', '1');
    console.info(
      '[DomiClick] Brand Storage no autorizado (403). Se usan iconos locales /public/brand. Despliega storage.rules o ignora este aviso.'
    );
  }
  return urls;
}

export async function deleteStorageFile(fileUrl: string): Promise<void> {
  try {
    const storageRef = ref(storage, fileUrl);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn('Could not delete storage file', err);
  }
}

/** Limpia caches locales / SW / IndexedDB que pueden mostrar datos borrados en Firebase.
 *  Nunca toca Auth (firebaseLocalStorage*) — eso cerraría la sesión del admin. */
export function clearDemoLocalCache() {
  try {
    const keysToRemove = Object.keys(localStorage).filter(
      (k) =>
        k.startsWith('domiclick_') &&
        !k.startsWith('domiclick_brand_') &&
        k !== 'domiclick_gmaps_key' &&
        k !== 'domiclick_cleared_cache_v3' &&
        k !== 'domiclick_cleared_cache_v4' &&
        k !== 'domiclick_login_role' &&
        k !== 'domiclick_google_redirecting'
    );
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* Safari privado / políticas corporativas */
  }

  // Solo caché offline de Firestore — NO Auth ni Persistence de sesión
  if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
    indexedDB.databases().then((dbs) => {
      dbs.forEach((info) => {
        const name = info.name || '';
        const isFirestore =
          /firestore/i.test(name) && !/firebaseLocalStorage|firebase-heartbeat|firebase-installations/i.test(name);
        if (isFirestore) {
          try {
            indexedDB.deleteDatabase(name);
          } catch {
            /* ignore */
          }
        }
      });
    });
  }

  // Invalidar Service Worker caches (pueden servir JS viejo con demos)
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => {
      keys
        .filter((k) => k.startsWith('domiclick'))
        .forEach((k) => caches.delete(k));
    });
  }
}

// ----------------- REALTIME SYNC STATUS ----------------- //

export type RealtimeSyncMeta = {
  fromCache: boolean;
  hasPendingWrites: boolean;
  live: boolean;
  lastSyncAt: string;
  collection: string;
  error?: string;
};

type SyncListener = (meta: RealtimeSyncMeta) => void;
const syncListeners = new Set<SyncListener>();
let lastSync: RealtimeSyncMeta = {
  fromCache: false,
  hasPendingWrites: false,
  live: false,
  lastSyncAt: '',
  collection: '',
};

function emitSync(partial: Partial<RealtimeSyncMeta> & { collection: string }) {
  lastSync = {
    ...lastSync,
    ...partial,
    live: partial.error ? false : partial.live ?? !partial.fromCache,
    lastSyncAt: new Date().toISOString(),
  };
  syncListeners.forEach((fn) => fn(lastSync));
}

export function subscribeRealtimeStatus(callback: SyncListener) {
  syncListeners.add(callback);
  callback(lastSync);
  return () => {
    syncListeners.delete(callback);
  };
}

export function getRealtimeStatus() {
  return lastSync;
}

// ----------------- DRIVERS (Firestore onSnapshot) ----------------- //

export async function fetchAllDrivers(): Promise<MotorizadoDriver[]> {
  const querySnapshot = await getDocs(collection(db, 'drivers'));
  const list: MotorizadoDriver[] = [];
  querySnapshot.forEach((docSnap) => {
    list.push({ id: docSnap.id, ...docSnap.data() } as MotorizadoDriver);
  });
  return list;
}

function subscribeCollection<T>(
  collectionName: string,
  mapDoc: (id: string, data: Record<string, unknown>) => T,
  sortFn: ((a: T, b: T) => number) | null,
  callback: (items: T[]) => void
) {
  let unsub: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let lastItems: T[] = [];

  const attach = () => {
    unsub?.();
    unsub = onSnapshot(
      collection(db, collectionName),
      { includeMetadataChanges: true },
      (snapshot) => {
        const items: T[] = [];
        snapshot.forEach((docSnap) => {
          items.push(mapDoc(docSnap.id, docSnap.data() as Record<string, unknown>));
        });
        if (sortFn) items.sort(sortFn);
        lastItems = items;
        emitSync({
          collection: collectionName,
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          live: !snapshot.metadata.fromCache,
          error: undefined,
        });
        callback(items);
      },
      (err) => {
        console.error(`[Firebase] ${collectionName} realtime error`, err);
        emitSync({
          collection: collectionName,
          fromCache: true,
          hasPendingWrites: false,
          live: false,
          error: String(err),
        });
        callback(lastItems);
        retryTimer = setTimeout(attach, 4000);
      }
    );
  };

  attach();
  return () => {
    unsub?.();
    if (retryTimer) clearTimeout(retryTimer);
  };
}

export function subscribeDrivers(callback: (drivers: MotorizadoDriver[]) => void) {
  return subscribeCollection<MotorizadoDriver>(
    'drivers',
    (id, data) => ({ id, ...data }) as MotorizadoDriver,
    null,
    callback
  );
}

export async function createDriverPreregistration(
  driverData: Omit<
    MotorizadoDriver,
    'id' | 'status' | 'isActive' | 'rating' | 'completedDeliveries' | 'createdAt'
  >,
  preferredId?: string
): Promise<string> {
  const newId = preferredId || 'drv_' + Date.now();
  const fullDriver: MotorizadoDriver = {
    ...driverData,
    id: newId,
    status: 'pending',
    isActive: false,
    rating: 5.0,
    completedDeliveries: 0,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'drivers', newId), fullDriver);
  return newId;
}

export async function updateDriverApprovalStatus(
  driverId: string,
  status: DriverStatus,
  adminName: string,
  reason?: string
) {
  await updateDoc(doc(db, 'drivers', driverId), {
    status,
    approvedBy: adminName,
    rejectionReason: reason || '',
    updatedAt: new Date().toISOString(),
  });
}

export async function toggleDriverActiveState(
  driverId: string,
  isActive: boolean,
  location?: MotorizadoDriver['location']
) {
  const updateData: Partial<MotorizadoDriver> = {
    isActive,
    updatedAt: new Date().toISOString(),
  };
  if (location) updateData.location = location;
  await updateDoc(doc(db, 'drivers', driverId), updateData);
}

export async function updateDriverLocation(
  driverId: string,
  location: MotorizadoDriver['location'],
  driverMeta?: { fullName?: string; plateNumber?: string }
) {
  const timestamp = new Date().toISOString();
  const dateKey = timestamp.split('T')[0];
  await updateDoc(doc(db, 'drivers', driverId), {
    location,
    updatedAt: timestamp,
  });
  await recordDriverLocationHistoryPoint({
    driverId,
    driverName: driverMeta?.fullName || 'Motorizado DomiClick',
    plateNumber: driverMeta?.plateNumber || '',
    lat: location.lat,
    lng: location.lng,
    heading: location.heading || 0,
    addressName: location.addressName || 'Villavicencio',
    timestamp,
    dateKey,
  });
}

// ----------------- LOCATION HISTORY ----------------- //

export async function recordDriverLocationHistoryPoint(
  point: Omit<DriverLocationHistoryPoint, 'id'>
) {
  const pointId = 'loc_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const fullPoint: DriverLocationHistoryPoint = { ...point, id: pointId };
  await setDoc(doc(db, 'location_history', pointId), fullPoint);
  return fullPoint;
}

export async function fetchDriverLocationHistory(
  driverId: string,
  dateKey?: string
): Promise<DriverLocationHistoryPoint[]> {
  const targetDate = dateKey || new Date().toISOString().split('T')[0];
  const q = query(collection(db, 'location_history'), where('driverId', '==', driverId));
  const querySnapshot = await getDocs(q);
  const points: DriverLocationHistoryPoint[] = [];
  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data() as DriverLocationHistoryPoint;
    if (!data.dateKey || data.dateKey === targetDate) {
      points.push({ id: docSnap.id, ...data });
    }
  });
  points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return points;
}

export function subscribeDriverLocationHistory(
  driverId: string,
  dateKey: string,
  callback: (points: DriverLocationHistoryPoint[]) => void
) {
  const q = query(collection(db, 'location_history'), where('driverId', '==', driverId));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const points: DriverLocationHistoryPoint[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DriverLocationHistoryPoint;
        if (!data.dateKey || data.dateKey === dateKey) {
          points.push({ id: docSnap.id, ...data });
        }
      });
      points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      emitSync({
        collection: 'location_history',
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        live: !snapshot.metadata.fromCache,
      });
      callback(points);
    },
    (err) => {
      console.error('[Firebase] location_history realtime error', err);
      callback([]);
    }
  );
}

// ----------------- ORDERS (Firestore onSnapshot) ----------------- //

export function subscribeOrders(callback: (orders: DeliveryOrder[]) => void) {
  return subscribeCollection<DeliveryOrder>(
    'orders',
    (id, data) => ({ id, ...data }) as DeliveryOrder,
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    callback
  );
}

export async function createOrder(
  orderData: Omit<DeliveryOrder, 'id' | 'trackingCode' | 'createdAt' | 'updatedAt'>
) {
  const newId = 'ord_' + Date.now();
  const trackingCode = 'DMC-' + Math.floor(1000 + Math.random() * 9000);
  const deliveryConfirmCode =
    orderData.deliveryConfirmCode ||
    String(Math.floor(100000 + Math.random() * 900000));
  const now = new Date().toISOString();
  const fullOrder: DeliveryOrder = {
    ...orderData,
    id: newId,
    trackingCode,
    deliveryConfirmCode,
    sourceSiteId: orderData.sourceSiteId || 'ops-admin',
    timeline: orderData.timeline?.length
      ? orderData.timeline
      : [{ at: now, to: 'pending', byRole: 'admin', note: 'Solicitud creada en torre' }],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'orders', newId), fullOrder);
  return fullOrder;
}

/**
 * Marca entrega exitosa solo si el PIN del cliente coincide.
 */
export async function confirmDeliveryWithCode(
  orderId: string,
  codeInput: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return { ok: false, error: 'Pedido no encontrado' };
  const order = { id: snap.id, ...snap.data() } as DeliveryOrder;
  if (order.status === 'delivered') return { ok: false, error: 'Ya estaba entregado' };
  if (order.status === 'cancelled') return { ok: false, error: 'Pedido cancelado' };

  const expected = String(order.deliveryConfirmCode || '').trim();
  const given = String(codeInput || '').trim();
  // Pedidos nuevos siempre tienen PIN. Antiguos sin PIN: se permite cerrar con cualquier 4+ dígitos.
  if (expected) {
    if (given !== expected) {
      return { ok: false, error: 'Código incorrecto. Pide al cliente el PIN de entrega.' };
    }
  } else if (given.length < 4) {
    return { ok: false, error: 'Ingresa el PIN del cliente (o al menos 4 dígitos en pedidos antiguos).' };
  }

  const now = new Date().toISOString();
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'delivered',
    deliveryConfirmedAt: now,
    updatedAt: now,
    timeline: arrayUnion({
      at: now,
      from: order.status,
      to: 'delivered',
      byRole: 'driver',
      note: 'PIN validado',
    }),
  });

  if (order.assignedDriverId) {
    await updateDoc(doc(db, 'drivers', order.assignedDriverId), {
      completedDeliveries: increment(1),
      updatedAt: now,
    });
  }
  return { ok: true };
}

export async function updateOrderStatus(
  orderId: string,
  status: DeliveryOrder['status'],
  driverId?: string,
  driverName?: string
) {
  if (status === 'delivered') {
    throw new Error(
      'Usa confirmDeliveryWithCode: la entrega requiere el PIN del cliente.'
    );
  }
  if (status === 'cancelled') {
    throw new Error('Usa cancelOrder: solo el administrador puede cancelar pedidos.');
  }
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: now,
    timeline: arrayUnion({
      at: now,
      to: status,
      byName: driverName || '',
    }),
  };
  if (driverId !== undefined) updateData.assignedDriverId = driverId;
  if (driverName !== undefined) updateData.assignedDriverName = driverName;
  await updateDoc(doc(db, 'orders', orderId), updateData);
}

export async function updateOrderFields(
  orderId: string,
  fields: Partial<DeliveryOrder>
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: fields.updatedAt || new Date().toISOString(),
  };
  (Object.keys(fields) as (keyof DeliveryOrder)[]).forEach((key) => {
    const val = fields[key];
    if (val !== undefined) payload[key] = val;
  });
  await updateDoc(doc(db, 'orders', orderId), payload);
}

/** Solo admin (UI): cancela el pedido sin borrarlo. */
export async function cancelOrder(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
  });
}

/** Solo admin (UI): elimina el pedido de Firestore. */
export async function deleteOrder(orderId: string): Promise<void> {
  await deleteDoc(doc(db, 'orders', orderId));
}

// ----------------- CHAT (Firestore onSnapshot) ----------------- //

export function subscribeMessages(chatId: string, callback: (msgs: ChatMessage[]) => void) {
  const q = query(collection(db, 'messages'), where('chatId', '==', chatId));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const list: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as ChatMessage);
      });
      list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      emitSync({
        collection: 'messages',
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        live: !snapshot.metadata.fromCache,
      });
      callback(list);
    },
    (err) => {
      console.error('[Firebase] messages realtime error', err);
      callback([]);
    }
  );
}

export function subscribeChatRooms(callback: (rooms: ChatRoom[]) => void) {
  return onSnapshot(
    collection(db, 'chats'),
    { includeMetadataChanges: true },
    (snapshot) => {
      const rooms: ChatRoom[] = [];
      snapshot.forEach((docSnap) => {
        rooms.push({ id: docSnap.id, ...docSnap.data() } as ChatRoom);
      });
      rooms.sort(
        (a, b) =>
          new Date(b.lastMessageTime || 0).getTime() - new Date(a.lastMessageTime || 0).getTime()
      );
      emitSync({
        collection: 'chats',
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        live: !snapshot.metadata.fromCache,
      });
      callback(rooms);
    },
    (err) => {
      console.error('[Firebase] chats realtime error', err);
      callback([]);
    }
  );
}

export async function sendChatMessage(msgData: Omit<ChatMessage, 'id' | 'timestamp'>) {
  const newMsg: ChatMessage = {
    ...msgData,
    id: 'msg_' + Date.now(),
    timestamp: new Date().toISOString(),
  };
  await setDoc(doc(db, 'messages', newMsg.id), newMsg);
  const driverId =
    msgData.senderRole === 'driver'
      ? msgData.senderId
      : msgData.chatId.replace(/^chat_/, '');
  await setDoc(
    doc(db, 'chats', msgData.chatId),
    {
      id: msgData.chatId,
      driverId,
      driverName: msgData.senderRole === 'driver' ? msgData.senderName : undefined,
      lastMessage: msgData.text,
      lastMessageTime: newMsg.timestamp,
      unreadByAdmin: msgData.senderRole === 'driver',
      unreadByDriver: msgData.senderRole === 'admin',
    },
    { merge: true }
  );
  return newMsg;
}

/** Solo admin (UI): borra un mensaje de chat. */
export async function deleteChatMessage(messageId: string): Promise<void> {
  await deleteDoc(doc(db, 'messages', messageId));
}

/** Solo admin (UI): limpia todos los mensajes de un canal. */
export async function clearChatMessages(chatId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, 'messages'), where('chatId', '==', chatId)));
  const docs = snap.docs;
  const CHUNK = 400;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await setDoc(
    doc(db, 'chats', chatId),
    {
      lastMessage: '',
      lastMessageTime: new Date().toISOString(),
      unreadByAdmin: false,
      unreadByDriver: false,
    },
    { merge: true }
  );
}

// ----------------- INCIDENCIAS (solo admin resuelve / borra) ----------------- //

export function subscribeIncidents(callback: (list: OpsIncident[]) => void) {
  return onSnapshot(
    collection(db, 'incidents'),
    { includeMetadataChanges: true },
    (snapshot) => {
      const list: OpsIncident[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as OpsIncident);
      });
      list.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      emitSync({
        collection: 'incidents',
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        live: !snapshot.metadata.fromCache,
      });
      callback(list);
    },
    (err) => {
      console.error('[Firebase] incidents realtime error', err);
      callback([]);
    }
  );
}

export async function createIncident(
  data: Omit<OpsIncident, 'id' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<OpsIncident> {
  const now = new Date().toISOString();
  const full: OpsIncident = {
    ...data,
    id: 'inc_' + Date.now(),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'incidents', full.id), full);
  return full;
}

/** Solo admin (UI): marca incidencia como resuelta. */
export async function resolveIncident(
  incidentId: string,
  resolvedBy: string,
  resolutionNote?: string
): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'incidents', incidentId), {
    status: 'resolved',
    resolvedAt: now,
    resolvedBy,
    resolutionNote: resolutionNote || '',
    updatedAt: now,
  });
}

/** Solo admin (UI): elimina incidencia. */
export async function deleteIncident(incidentId: string): Promise<void> {
  await deleteDoc(doc(db, 'incidents', incidentId));
}

// ----------------- ADMIN CONTROL: RATINGS + PAYROLL ----------------- //

export function subscribeDriverReviews(callback: (reviews: DriverReview[]) => void) {
  return onSnapshot(
    collection(db, 'driver_reviews'),
    { includeMetadataChanges: true },
    (snapshot) => {
      const list: DriverReview[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DriverReview);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      emitSync({
        collection: 'driver_reviews',
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        live: !snapshot.metadata.fromCache,
      });
      callback(list);
    },
    (err) => {
      console.error('[Firebase] driver_reviews realtime error', err);
      callback([]);
    }
  );
}

export async function submitDriverReview(
  review: Omit<DriverReview, 'id' | 'createdAt'>
) {
  const id = 'rev_' + Date.now();
  const full: DriverReview = {
    ...review,
    id,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'driver_reviews', id), omitUndefined({ ...full } as Record<string, unknown>));

  if (review.orderId) {
    await updateDoc(doc(db, 'orders', review.orderId), {
      serviceRating: review.stars,
      ratingComment: review.comment || '',
      ratedAt: full.createdAt,
      updatedAt: full.createdAt,
      ...(review.survey ? { ratingSurvey: review.survey } : {}),
    });
  }

  const q = query(collection(db, 'driver_reviews'), where('driverId', '==', review.driverId));
  const snap = await getDocs(q);
  let sum = 0;
  let n = 0;
  snap.forEach((d) => {
    const stars = Number((d.data() as DriverReview).stars) || 0;
    sum += stars;
    n += 1;
  });
  const avg = n ? Math.round((sum / n) * 10) / 10 : review.stars;
  await updateDoc(doc(db, 'drivers', review.driverId), {
    rating: avg,
    ratingCount: n,
    updatedAt: full.createdAt,
  });
  return full;
}

export async function setDriverSuspended(driverId: string, suspended: boolean) {
  const payload: Record<string, unknown> = {
    suspended,
    updatedAt: new Date().toISOString(),
  };
  if (suspended) payload.isActive = false;
  await updateDoc(doc(db, 'drivers', driverId), payload);
}

export function subscribePayrollSettings(callback: (settings: PayrollSettings) => void) {
  return onSnapshot(
    doc(db, 'settings', 'payroll'),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT_PAYROLL_SETTINGS);
        return;
      }
      callback({ ...DEFAULT_PAYROLL_SETTINGS, ...(snap.data() as PayrollSettings), id: 'payroll' });
    },
    () => callback(DEFAULT_PAYROLL_SETTINGS)
  );
}

export async function savePayrollSettings(settings: Omit<PayrollSettings, 'id' | 'updatedAt'>) {
  const full: PayrollSettings = {
    ...settings,
    id: 'payroll',
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'settings', 'payroll'), full, { merge: true });
  return full;
}

// ----------------- DISPATCH SETTINGS ----------------- //

export function subscribeDispatchSettings(callback: (settings: DispatchSettings) => void) {
  return onSnapshot(
    doc(db, 'settings', 'dispatch'),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT_DISPATCH_SETTINGS);
        return;
      }
      callback({
        ...DEFAULT_DISPATCH_SETTINGS,
        ...(snap.data() as DispatchSettings),
        id: 'dispatch',
      });
    },
    () => callback(DEFAULT_DISPATCH_SETTINGS)
  );
}

export async function fetchDispatchSettings(): Promise<DispatchSettings> {
  const snap = await getDoc(doc(db, 'settings', 'dispatch'));
  if (!snap.exists()) return DEFAULT_DISPATCH_SETTINGS;
  return {
    ...DEFAULT_DISPATCH_SETTINGS,
    ...(snap.data() as DispatchSettings),
    id: 'dispatch',
  };
}

export async function saveDispatchSettings(
  settings: Omit<DispatchSettings, 'id' | 'updatedAt'>
) {
  const full: DispatchSettings = {
    ...settings,
    id: 'dispatch',
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'settings', 'dispatch'), full, { merge: true });
  return full;
}

// ----------------- FLEET (combustible + mantenimiento) ----------------- //

export function subscribeFleetSettings(callback: (settings: FleetSettings) => void) {
  return onSnapshot(
    doc(db, 'settings', 'fleet'),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT_FLEET_SETTINGS);
        return;
      }
      callback({
        ...DEFAULT_FLEET_SETTINGS,
        ...(snap.data() as FleetSettings),
        id: 'fleet',
      });
    },
    () => callback(DEFAULT_FLEET_SETTINGS)
  );
}

export async function fetchFleetSettings(): Promise<FleetSettings> {
  const snap = await getDoc(doc(db, 'settings', 'fleet'));
  if (!snap.exists()) return DEFAULT_FLEET_SETTINGS;
  return { ...DEFAULT_FLEET_SETTINGS, ...(snap.data() as FleetSettings), id: 'fleet' };
}

export async function saveFleetSettings(
  settings: Omit<FleetSettings, 'id' | 'updatedAt'>
): Promise<FleetSettings> {
  const existing = await fetchFleetSettings();
  const full: FleetSettings = {
    ...existing,
    ...settings,
    id: 'fleet',
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'settings', 'fleet'), full, { merge: true });
  return full;
}

export async function upsertFleetVehicle(
  vehicle: Omit<FleetVehicleSpec, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<FleetVehicleSpec> {
  const fleet = await fetchFleetSettings();
  const now = new Date().toISOString();
  const id = vehicle.id || `fv_${Date.now()}`;
  const prev = fleet.customVehicles?.find((v) => v.id === id);
  const entry: FleetVehicleSpec = {
    ...vehicle,
    id,
    active: vehicle.active !== false,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };
  const list = [...(fleet.customVehicles || [])];
  const idx = list.findIndex((v) => v.id === id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  await saveFleetSettings({ ...fleet, customVehicles: list });
  return entry;
}

export async function removeFleetVehicle(vehicleId: string): Promise<void> {
  const fleet = await fetchFleetSettings();
  const list = (fleet.customVehicles || []).filter((v) => v.id !== vehicleId);
  await saveFleetSettings({ ...fleet, customVehicles: list });
}

// ----------------- MAP WALL (pantalla secundaria) ----------------- //

export function subscribeMapWallSettings(callback: (settings: MapWallSettings) => void) {
  return onSnapshot(
    doc(db, 'settings', 'map_wall'),
    (snap) => {
      callback(
        mergeMapWallSettings(
          snap.exists() ? ({ id: 'map_wall', ...snap.data() } as MapWallSettings) : null
        )
      );
    },
    () => callback(mergeMapWallSettings(null))
  );
}

export async function saveMapWallSettings(
  patch: Partial<Omit<MapWallSettings, 'id' | 'updatedAt'>>
): Promise<MapWallSettings> {
  const full: MapWallSettings = mergeMapWallSettings({
    ...DEFAULT_MAP_WALL_SETTINGS,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(doc(db, 'settings', 'map_wall'), full, { merge: true });
  return full;
}

export async function uploadMapWallVideo(file: File, slot: 'a' | 'b'): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `videos/map-wall/video-${slot}_${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'video/mp4' });
  const url = await getDownloadURL(storageRef);
  const key = slot === 'a' ? 'videoAUrl' : 'videoBUrl';
  const labelKey = slot === 'a' ? 'videoALabel' : 'videoBLabel';
  await saveMapWallSettings({
    [key]: url,
    [labelKey]: file.name.replace(/\.[^.]+$/, ''),
  });
  return url;
}

export async function assignDriverFleetVehicle(
  driverId: string,
  fleetVehicleId: string | null,
  motoModel?: string
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (fleetVehicleId) patch.fleetVehicleId = fleetVehicleId;
  else patch.fleetVehicleId = deleteField();
  if (motoModel !== undefined) patch.motoModel = motoModel;
  await updateDoc(doc(db, 'drivers', driverId), patch);
}

// ----------------- FLEET MOTOS (inventario físico) ----------------- //

export function subscribeFleetMotos(callback: (motos: FleetMoto[]) => void) {
  return onSnapshot(
    collection(db, 'fleet_motos'),
    (snapshot) => {
      const list: FleetMoto[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as FleetMoto);
      });
      list.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));
      callback(list);
    },
    () => callback([])
  );
}

export async function upsertFleetMoto(
  moto: Omit<FleetMoto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<FleetMoto> {
  const now = new Date().toISOString();
  const id = moto.id || `moto_${Date.now()}`;
  const prevSnap = moto.id ? await getDoc(doc(db, 'fleet_motos', id)) : null;
  const entry: FleetMoto = {
    ...moto,
    id,
    active: moto.active !== false,
    createdAt: prevSnap?.exists() ? (prevSnap.data() as FleetMoto).createdAt : now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'fleet_motos', id), entry);
  return entry;
}

export async function updateFleetMotoStatus(
  motoId: string,
  status: FleetMotoStatus,
  extra?: Partial<FleetMoto>
): Promise<void> {
  await updateDoc(doc(db, 'fleet_motos', motoId), {
    status,
    ...extra,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteFleetMoto(motoId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'fleet_motos', motoId));
  if (snap.exists()) {
    const moto = snap.data() as FleetMoto;
    if (moto.currentDriverId) {
      await updateDoc(doc(db, 'drivers', moto.currentDriverId), {
        assignedMotoId: deleteField(),
        updatedAt: new Date().toISOString(),
      });
    }
  }
  await deleteDoc(doc(db, 'fleet_motos', motoId));
}

export async function assignMotoToDriver(motoId: string, driverId: string | null): Promise<void> {
  const motoSnap = await getDoc(doc(db, 'fleet_motos', motoId));
  if (!motoSnap.exists()) return;
  const moto = motoSnap.data() as FleetMoto;
  const now = new Date().toISOString();

  if (moto.currentDriverId && moto.currentDriverId !== driverId) {
    await updateDoc(doc(db, 'drivers', moto.currentDriverId), {
      assignedMotoId: deleteField(),
      updatedAt: now,
    });
  }

  if (!driverId) {
    await updateDoc(doc(db, 'fleet_motos', motoId), {
      currentDriverId: deleteField(),
      status: 'available',
      updatedAt: now,
    });
    return;
  }

  const driverSnap = await getDoc(doc(db, 'drivers', driverId));
  if (driverSnap.exists()) {
    const d = driverSnap.data() as MotorizadoDriver;
    if (d.assignedMotoId && d.assignedMotoId !== motoId) {
      await updateDoc(doc(db, 'fleet_motos', d.assignedMotoId), {
        currentDriverId: deleteField(),
        status: 'available',
        updatedAt: now,
      });
    }
  }

  await updateDoc(doc(db, 'fleet_motos', motoId), {
    currentDriverId: driverId,
    status: 'assigned',
    updatedAt: now,
  });
  await updateDoc(doc(db, 'drivers', driverId), {
    assignedMotoId: motoId,
    plateNumber: moto.plateNumber,
    motoModel: moto.motoModel,
    fleetVehicleId: moto.fleetVehicleId || deleteField(),
    updatedAt: now,
  });
}

/** Desvincula la moto del transportista actual (queda disponible). */
export async function unlinkFleetMoto(motoId: string): Promise<void> {
  await assignMotoToDriver(motoId, null);
}

/**
 * Registra moto de flota y la vincula fija al transportista (solo administrador).
 * Placa, modelo y km inicial los ingresa el admin al asignar.
 */
export async function assignMotoToDriverWithSetup(params: {
  driverId: string;
  plateNumber: string;
  motoModel: string;
  initialOdometerKm: number;
  fuelType?: 'gasolina' | 'diesel';
  fleetVehicleId?: string;
  notes?: string;
}): Promise<FleetMoto> {
  const plate = params.plateNumber.trim().toUpperCase();
  const km = Math.round(params.initialOdometerKm);
  if (!plate || km <= 0) {
    throw new Error('Placa y kilometraje inicial son obligatorios.');
  }

  const motoId = `moto_${plate.replace(/\W/g, '').toLowerCase()}`;
  const now = new Date().toISOString();
  const fuelType = params.fuelType || 'gasolina';

  const entry: FleetMoto = {
    id: motoId,
    plateNumber: plate,
    label: `${params.motoModel.trim() || 'Moto'} · ${plate}`,
    motoModel: params.motoModel.trim(),
    fleetVehicleId: params.fleetVehicleId,
    fuelType,
    status: 'assigned',
    currentDriverId: params.driverId,
    lastOdometerKm: km,
    assignedAtOdometerKm: km,
    assignedAt: now,
    lastFuelFillOdometerKm: km,
    notes: params.notes?.trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  const existingSnap = await getDoc(doc(db, 'fleet_motos', motoId));
  if (existingSnap.exists()) {
    const prev = existingSnap.data() as FleetMoto;
    entry.createdAt = prev.createdAt;
    if (prev.currentDriverId && prev.currentDriverId !== params.driverId) {
      await updateDoc(doc(db, 'drivers', prev.currentDriverId), {
        assignedMotoId: deleteField(),
        updatedAt: now,
      });
    }
  }

  await setDoc(doc(db, 'fleet_motos', motoId), entry);

  const driverSnap = await getDoc(doc(db, 'drivers', params.driverId));
  if (driverSnap.exists()) {
    const d = driverSnap.data() as MotorizadoDriver;
    if (d.assignedMotoId && d.assignedMotoId !== motoId) {
      await updateDoc(doc(db, 'fleet_motos', d.assignedMotoId), {
        currentDriverId: deleteField(),
        status: 'available',
        updatedAt: now,
      });
    }
  }

  await updateDoc(doc(db, 'drivers', params.driverId), {
    assignedMotoId: motoId,
    plateNumber: plate,
    motoModel: params.motoModel.trim(),
    fleetVehicleId: params.fleetVehicleId || deleteField(),
    lastOdometerKm: km,
    updatedAt: now,
  });

  return entry;
}

export async function importFleetMotosFromDrivers(drivers: MotorizadoDriver[]): Promise<number> {
  let count = 0;
  const approved = drivers.filter((d) => d.status === 'approved' && d.plateNumber?.trim());
  for (const d of approved) {
    const id = `moto_${d.plateNumber.replace(/\W/g, '').toLowerCase()}`;
    const snap = await getDoc(doc(db, 'fleet_motos', id));
    if (snap.exists()) continue;
    await setDoc(doc(db, 'fleet_motos', id), {
      id,
      plateNumber: d.plateNumber,
      label: `${d.motoModel || 'Moto'} · ${d.plateNumber}`,
      motoModel: d.motoModel || '',
      fleetVehicleId: d.fleetVehicleId || '',
      fuelType: 'gasolina',
      status: 'assigned',
      currentDriverId: d.id,
      lastOdometerKm: d.lastOdometerKm,
      lastOilChangeKm: d.lastOilChangeKm,
      lastOilChangeAt: d.lastOilChangeAt,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'drivers', d.id), {
      assignedMotoId: id,
      updatedAt: new Date().toISOString(),
    });
    count++;
  }
  return count;
}

export async function updateDriverMotoFields(
  driverId: string,
  patch: Pick<
    MotorizadoDriver,
    'motoKmPerGallon' | 'lastOilChangeKm' | 'lastOilChangeAt' | 'fleetVehicleId' | 'motoModel'
  >
): Promise<void> {
  await updateDoc(doc(db, 'drivers', driverId), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeMotoMaintenanceLogs(
  driverId: string,
  callback: (logs: MotoMaintenanceLog[]) => void
) {
  return onSnapshot(
    collection(db, 'moto_maintenance_logs'),
    (snapshot) => {
      const list: MotoMaintenanceLog[] = [];
      snapshot.forEach((docSnap) => {
        const row = { id: docSnap.id, ...docSnap.data() } as MotoMaintenanceLog;
        if (row.driverId === driverId) list.push(row);
      });
      list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      callback(list);
    },
    () => callback([])
  );
}

export async function addMotoMaintenanceLog(params: {
  driverId: string;
  fleetMotoId?: string;
  driverName?: string;
  plateNumber?: string;
  motoModel?: string;
  type: MotoMaintenanceType;
  description: string;
  odometerKm: number;
  costCop?: number;
  createdBy?: string;
  updateOilChange?: boolean;
}): Promise<MotoMaintenanceLog> {
  const at = new Date().toISOString();
  const id = 'mnt_' + Date.now();
  const log = omitUndefined({
    id,
    driverId: params.driverId,
    fleetMotoId: params.fleetMotoId,
    driverName: params.driverName || '',
    plateNumber: params.plateNumber || '',
    motoModel: params.motoModel || '',
    type: params.type,
    description: params.description,
    odometerKm: params.odometerKm,
    costCop: params.costCop,
    at,
    createdBy: params.createdBy || '',
  }) as MotoMaintenanceLog;
  await setDoc(doc(db, 'moto_maintenance_logs', id), log);
  if (params.updateOilChange || params.type === 'aceite') {
    await updateDriverMotoFields(params.driverId, {
      lastOilChangeKm: params.odometerKm,
      lastOilChangeAt: at,
    });
    if (params.fleetMotoId) {
      await updateDoc(doc(db, 'fleet_motos', params.fleetMotoId), {
        lastOilChangeKm: params.odometerKm,
        lastOilChangeAt: at,
        updatedAt: at,
      });
    }
  }
  return log;
}

// ----------------- ATTENDANCE (biometría móvil) ----------------- //

export async function saveDriverWebAuthnCredential(
  driverId: string,
  credentialId: string
): Promise<void> {
  await updateDoc(doc(db, 'drivers', driverId), {
    webauthnCredentialId: credentialId,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveDriverKioskWebAuthnCredential(
  driverId: string,
  credentialId: string
): Promise<void> {
  await updateDoc(doc(db, 'drivers', driverId), {
    webauthnKioskCredentialId: credentialId,
    updatedAt: new Date().toISOString(),
  });
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) out[key] = field;
  }
  return out as T;
}

export async function recordAttendancePunch(params: {
  driverId: string;
  driverName?: string;
  type: AttendancePunchType;
  credentialId?: string;
  method?: AttendancePunch['method'];
  lat?: number;
  lng?: number;
  odometerKm?: number;
  odometerPhotoUrl?: string;
  platePhotoUrl?: string;
  facePhotoUrl?: string;
  pinDayKey?: string;
  mobilePhotosPending?: boolean;
  entryOdometerKm?: number;
  motoModel?: string;
  motoKmPerGallon?: number;
}): Promise<AttendancePunch> {
  const at = new Date().toISOString();
  const id = 'att_' + Date.now();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const method = params.method || ('webauthn' as const);
  const mobilePhotosPending =
    params.mobilePhotosPending ??
    (method === 'pin_kiosk' && !params.odometerPhotoUrl);

  let shiftFuelFields: Record<string, number | string | undefined> = {};
  if (params.type === 'out' && params.odometerKm && params.entryOdometerKm) {
    const fleetSnap = await getDoc(doc(db, 'settings', 'fleet'));
    const fleet: FleetSettings = fleetSnap.exists()
      ? ({ ...DEFAULT_FLEET_SETTINGS, ...fleetSnap.data(), id: 'fleet' as const } as FleetSettings)
      : DEFAULT_FLEET_SETTINGS;
    let motoModel = params.motoModel;
    let motoKmPerGallon = params.motoKmPerGallon;
    let fleetVehicleId: string | undefined;
    if (!motoModel) {
      const driverSnap = await getDoc(doc(db, 'drivers', params.driverId));
      if (driverSnap.exists()) {
        const d = driverSnap.data() as MotorizadoDriver;
        motoModel = d.motoModel;
        motoKmPerGallon = d.motoKmPerGallon;
        fleetVehicleId = d.fleetVehicleId;
      }
    }
    const fuel = calcShiftFuel({
      kmIn: params.entryOdometerKm,
      kmOut: params.odometerKm,
      motoModel,
      motoKmPerGallon,
      fleetVehicleId,
      fleet,
    });
    if (fuel) {
      shiftFuelFields = {
        shiftKmDriven: fuel.kmDriven,
        shiftGallons: fuel.gallonsUsed,
        shiftLiters: fuel.litersUsed,
        shiftFuelCostCop: fuel.fuelCostCop,
        kmPerGallonUsed: fuel.kmPerGallon,
        kmPerLiterUsed: fuel.kmPerLiter,
        litersPerKmUsed: fuel.litersPerKm,
        copPerKmUsed: fuel.copPerKm,
        fuelPricePerGallonUsed: fuel.fuelPricePerGallonCop,
        motoCatalogId: fuel.motoCatalogId,
      };
    }
  }

  const punch = omitUndefined({
    id,
    driverId: params.driverId,
    driverName: params.driverName || '',
    type: params.type,
    at,
    dateKey: toDateKey(at),
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    method,
    credentialId: params.credentialId || '',
    odometerKm: params.odometerKm,
    odometerPhotoUrl: params.odometerPhotoUrl || '',
    platePhotoUrl: params.platePhotoUrl || '',
    facePhotoUrl: params.facePhotoUrl || '',
    pinDayKey: params.pinDayKey || '',
    mobilePhotosPending,
    ...shiftFuelFields,
  }) as AttendancePunch;
  await setDoc(doc(db, 'attendance_punches', id), punch);
  const driverPatch = omitUndefined({
    lastPunchType: params.type,
    lastPunchAt: at,
    lastOdometerKm: params.odometerKm,
    updatedAt: at,
  });
  await updateDoc(doc(db, 'drivers', params.driverId), driverPatch);

  if (params.odometerKm) {
    const driverSnap = await getDoc(doc(db, 'drivers', params.driverId));
    if (driverSnap.exists()) {
      const d = driverSnap.data() as MotorizadoDriver;
      if (d.assignedMotoId) {
        const motoPatch: Record<string, unknown> = {
          lastOdometerKm: params.odometerKm,
          updatedAt: at,
        };
        if (params.type === 'out' && shiftFuelFields.kmPerLiterUsed) {
          const motoSnap = await getDoc(doc(db, 'fleet_motos', d.assignedMotoId));
          const prev = motoSnap.exists() ? (motoSnap.data() as FleetMoto).avgKmPerLiter : undefined;
          const used = Number(shiftFuelFields.kmPerLiterUsed);
          motoPatch.avgKmPerLiter = prev
            ? Math.round(((prev + used) / 2) * 10) / 10
            : used;
        }
        await updateDoc(doc(db, 'fleet_motos', d.assignedMotoId), motoPatch);
      }
    }
  }

  return punch;
}

/**
 * Obtiene o crea el PIN del día operativo (rota a la 01:00).
 * El PIN NO se revela aquí: hace falta foto de rostro vía revealDailyAttendancePin.
 */
export async function ensureDailyAttendancePin(
  driverId: string,
  driverName?: string,
  now: Date = new Date()
): Promise<AttendanceDailyPin> {
  const pinDayKey = getAttendancePinDayKey(now);
  const id = dailyPinDocId(driverId, pinDayKey);
  const refDoc = doc(db, 'attendance_daily_pins', id);
  const snap = await getDoc(refDoc);
  if (snap.exists()) {
    return { id, ...snap.data() } as AttendanceDailyPin;
  }
  const createdAt = now.toISOString();
  const record: AttendanceDailyPin = {
    id,
    driverId,
    driverName: driverName || '',
    pinDayKey,
    pin: generateAttendancePin(6),
    createdAt,
    expiresAt: getAttendancePinExpiresAt(pinDayKey),
  };
  await setDoc(refDoc, record);
  return record;
}

/**
 * Tras subir foto de rostro en sede: guarda evidencia y devuelve el PIN del día.
 * Sin foto no se debe llamar; el UI no muestra el PIN hasta este paso.
 */
export async function revealDailyAttendancePin(params: {
  driverId: string;
  driverName?: string;
  facePhotoUrl: string;
  now?: Date;
}): Promise<AttendanceDailyPin> {
  if (!params.facePhotoUrl?.trim()) {
    throw new Error('Sin foto de rostro no se revela el PIN.');
  }
  const now = params.now || new Date();
  const pinDoc = await ensureDailyAttendancePin(params.driverId, params.driverName, now);
  const revealedAt = now.toISOString();
  const patch = omitUndefined({
    revealFacePhotoUrl: params.facePhotoUrl,
    revealedAt,
    driverName: params.driverName || pinDoc.driverName || '',
  });
  await updateDoc(doc(db, 'attendance_daily_pins', pinDoc.id), patch);
  return { ...pinDoc, ...patch };
}

/** Valida el PIN digitado contra el del día operativo actual. */
export async function verifyDailyAttendancePin(
  driverId: string,
  typedPin: string,
  now: Date = new Date()
): Promise<AttendanceDailyPin> {
  const pinDayKey = getAttendancePinDayKey(now);
  const id = dailyPinDocId(driverId, pinDayKey);
  const snap = await getDoc(doc(db, 'attendance_daily_pins', id));
  if (!snap.exists()) {
    throw new Error('Aún no hay PIN de hoy. Toma primero la foto de rostro en sede.');
  }
  const data = { id, ...snap.data() } as AttendanceDailyPin;
  if (!data.revealFacePhotoUrl) {
    throw new Error('Debes tomar la foto de rostro antes de usar el PIN.');
  }
  const clean = String(typedPin || '').replace(/\D/g, '');
  if (clean !== data.pin) {
    throw new Error('PIN incorrecto. Revisa el número que se te reveló tras la foto.');
  }
  return data;
}

export async function getAttendancePunch(punchId: string): Promise<AttendancePunch | null> {
  const snap = await getDoc(doc(db, 'attendance_punches', punchId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as AttendancePunch;
}

export function subscribeAttendancePunch(
  punchId: string,
  callback: (punch: AttendancePunch | null) => void
) {
  return onSnapshot(
    doc(db, 'attendance_punches', punchId),
    (snap) => {
      callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as AttendancePunch) : null);
    },
    () => callback(null)
  );
}

/** Sube fotos de odómetro y placa desde el celular (QR del kiosco). */
export async function updateAttendancePunchMobilePhotos(params: {
  punchId: string;
  odometerPhotoUrl: string;
  platePhotoUrl?: string;
}): Promise<AttendancePunch> {
  const snap = await getDoc(doc(db, 'attendance_punches', params.punchId));
  if (!snap.exists()) throw new Error('Marca de asistencia no encontrada.');
  const existing = { id: snap.id, ...snap.data() } as AttendancePunch;
  const patch = omitUndefined({
    odometerPhotoUrl: params.odometerPhotoUrl,
    platePhotoUrl: params.platePhotoUrl || existing.platePhotoUrl || '',
    mobilePhotosPending: false,
    updatedAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, 'attendance_punches', params.punchId), patch);
  return { ...existing, ...patch };
}

export function subscribeAttendancePunches(
  callback: (punches: AttendancePunch[]) => void,
  dateKey?: string
) {
  const target = dateKey || new Date().toISOString().split('T')[0];
  return onSnapshot(
    collection(db, 'attendance_punches'),
    (snapshot) => {
      const list: AttendancePunch[] = [];
      snapshot.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() } as AttendancePunch;
        if (!data.dateKey || data.dateKey === target) list.push(data);
      });
      list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      callback(list);
    },
    () => callback([])
  );
}

export function subscribeDriverAttendancePunches(
  driverId: string,
  callback: (punches: AttendancePunch[]) => void
) {
  return onSnapshot(
    collection(db, 'attendance_punches'),
    (snapshot) => {
      const list: AttendancePunch[] = [];
      snapshot.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() } as AttendancePunch;
        if (data.driverId === driverId) list.push(data);
      });
      list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      callback(list);
    },
    () => callback([])
  );
}

export function subscribePayrollRuns(callback: (runs: PayrollRun[]) => void) {
  return onSnapshot(
    collection(db, 'payroll_runs'),
    (snapshot) => {
      const list: PayrollRun[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as PayrollRun);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    },
    () => callback([])
  );
}

export async function savePayrollRun(run: Omit<PayrollRun, 'id' | 'createdAt'>) {
  const id = 'pay_' + Date.now();
  const full: PayrollRun = {
    ...run,
    id,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'payroll_runs', id), full);
  return full;
}

// ----------------- ADMIN STAFF (solo un admin activo activa a otro) ----------------- //

export function adminDocId(email: string) {
  return email.trim().toLowerCase();
}

export function subscribeAdmins(callback: (admins: AdminAccount[]) => void) {
  return onSnapshot(
    collection(db, 'admins'),
    { includeMetadataChanges: true },
    (snapshot) => {
      // La caché en memoria arranca vacía: no publicar [] ni marcar “listo”
      // o el login admin se queda en “pendiente” un instante (o para siempre).
      if (snapshot.metadata.fromCache && snapshot.empty) {
        emitSync({
          collection: 'admins',
          fromCache: true,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          live: false,
        });
        return;
      }
      const list: AdminAccount[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as AdminAccount);
      });
      list.sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      emitSync({
        collection: 'admins',
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        live: !snapshot.metadata.fromCache,
      });
      callback(list);
    },
    (err) => {
      console.error('[Firebase] admins realtime error', err);
      // No vaciar la lista: un [] momentáneo echaba al admin de la torre
    }
  );
}

async function listAdminsOnce(): Promise<AdminAccount[]> {
  const snap = await getDocs(collection(db, 'admins'));
  const list: AdminAccount[] = [];
  snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AdminAccount));
  return list;
}

/** Login/registro como admin: primer admin se auto-activa; los demás quedan pendientes. */
export async function requestAdminAccess(params: {
  email: string;
  uid?: string;
  displayName?: string;
}): Promise<AdminAccount> {
  return requestStaffAccess({ ...params, role: 'admin' });
}

async function patchStaffDoc(
  id: string,
  acc: AdminAccount,
  params: { email: string; uid?: string; displayName?: string }
): Promise<AdminAccount> {
  const refDoc = doc(db, 'admins', id);
  const patch: Partial<AdminAccount> = {
    email: params.email,
    displayName: params.displayName || acc.displayName || params.email,
  };
  if (params.uid) patch.uid = params.uid;
  try {
    await updateDoc(refDoc, patch);
  } catch (err) {
    console.warn('[admin] no se pudo actualizar ficha de torre; se usa la existente', err);
  }
  return { ...acc, ...patch, id };
}

/** Login/registro de personal de torre (admin o secretaría). */
export async function requestStaffAccess(params: {
  email: string;
  uid?: string;
  displayName?: string;
  role: StaffRole;
}): Promise<AdminAccount> {
  const email = params.email.trim().toLowerCase();
  const id = adminDocId(email);
  const refDoc = doc(db, 'admins', id);

  let all: AdminAccount[] = [];
  try {
    all = await listAdminsOnce();
  } catch (err) {
    console.warn('[admin] listAdminsOnce', err);
  }

  const known = findStaffAccount(all, email, params.uid);
  if (known) {
    return patchStaffDoc(known.id, known, {
      email,
      uid: params.uid,
      displayName: params.displayName,
    });
  }

  const existing = await getDoc(refDoc);
  if (existing.exists()) {
    return patchStaffDoc(id, { id, ...existing.data() } as AdminAccount, {
      email,
      uid: params.uid,
      displayName: params.displayName,
    });
  }

  const hasActiveAdmin = all.some(
    (a) => a.status === 'active' && (a.role === 'admin' || !a.role)
  );
  const now = new Date().toISOString();

  if (params.role === 'secretary') {
    const acc: AdminAccount = {
      id,
      email,
      displayName: params.displayName || email,
      status: 'pending',
      role: 'secretary',
      requestedAt: now,
      ...(params.uid ? { uid: params.uid } : {}),
    };
    await setDoc(refDoc, acc);
    return acc;
  }

  const isFounder = !hasActiveAdmin;
  const acc: AdminAccount = {
    id,
    email,
    displayName: params.displayName || email,
    status: isFounder ? 'active' : 'pending',
    role: 'admin',
    isFounder,
    requestedAt: now,
    ...(params.uid ? { uid: params.uid } : {}),
    ...(isFounder ? { activatedAt: now, activatedBy: 'sistema' } : {}),
  };
  await setDoc(refDoc, acc);
  return acc;
}

export async function inviteAdmin(email: string, invitedBy: string): Promise<AdminAccount> {
  return inviteStaff(email, invitedBy, 'admin');
}

export async function inviteStaff(
  email: string,
  invitedBy: string,
  staffRole: StaffRole = 'admin'
): Promise<AdminAccount> {
  const inviter = invitedBy.trim().toLowerCase();
  const inviterSnap = await getDoc(doc(db, 'admins', adminDocId(inviter)));
  if (!inviterSnap.exists() || inviterSnap.data().status !== 'active') {
    throw new Error('Solo un administrador activo puede invitar a otro.');
  }

  const target = email.trim().toLowerCase();
  const id = adminDocId(target);
  const refDoc = doc(db, 'admins', id);
  const existing = await getDoc(refDoc);
  const now = new Date().toISOString();
  if (existing.exists()) {
    return { id, ...existing.data() } as AdminAccount;
  }
  const acc: AdminAccount = {
    id,
    email: target,
    displayName: target,
    status: 'pending',
    role: staffRole,
    requestedAt: now,
    activatedBy: inviter,
  };
  await setDoc(refDoc, acc);
  return acc;
}

export async function activateAdmin(targetEmail: string, activatedByEmail: string): Promise<AdminAccount> {
  const actor = activatedByEmail.trim().toLowerCase();
  const actorSnap = await getDoc(doc(db, 'admins', adminDocId(actor)));
  if (!actorSnap.exists() || actorSnap.data().status !== 'active') {
    throw new Error('Solo un administrador activo puede activar a otro administrador.');
  }

  const target = targetEmail.trim().toLowerCase();
  if (target === actor) {
    throw new Error('No puedes auto-activarte. Pide a otro admin activo.');
  }

  const id = adminDocId(target);
  const refDoc = doc(db, 'admins', id);
  const snap = await getDoc(refDoc);
  if (!snap.exists()) {
    throw new Error('No existe una solicitud de administrador con ese correo.');
  }

  const now = new Date().toISOString();
  await updateDoc(refDoc, {
    status: 'active',
    activatedAt: now,
    activatedBy: actor,
  });
  return { id, ...snap.data(), status: 'active', activatedAt: now, activatedBy: actor } as AdminAccount;
}

export async function revokeAdmin(targetEmail: string, revokedByEmail: string): Promise<void> {
  const actor = revokedByEmail.trim().toLowerCase();
  const actorSnap = await getDoc(doc(db, 'admins', adminDocId(actor)));
  if (!actorSnap.exists() || actorSnap.data().status !== 'active') {
    throw new Error('Solo un administrador activo puede revocar a otro.');
  }

  const target = targetEmail.trim().toLowerCase();
  if (target === actor) {
    throw new Error('No puedes revocarte a ti mismo.');
  }

  const all = await listAdminsOnce();
  const activeCount = all.filter((a) => a.status === 'active').length;
  const targetAcc = all.find((a) => a.email.toLowerCase() === target);
  if (targetAcc?.status === 'active' && activeCount <= 1) {
    throw new Error('No se puede revocar al único administrador activo.');
  }

  await updateDoc(doc(db, 'admins', adminDocId(target)), {
    status: 'revoked',
    revokedAt: new Date().toISOString(),
    revokedBy: actor,
  });
}

const SECRETARIAT_COLLECTION = 'secretariat_files';

export function subscribeSecretariatFiles(callback: (files: SecretariatFile[]) => void) {
  return onSnapshot(
    collection(db, SECRETARIAT_COLLECTION),
    (snapshot) => {
      const list: SecretariatFile[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as SecretariatFile);
      });
      list.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      callback(list);
    },
    (err) => console.error('[Firebase] secretariat_files error', err)
  );
}

export async function uploadSecretariatFile(params: {
  title: string;
  category: string;
  file: File;
  uploadedBy: string;
  uploadedByRole: StaffRole;
}): Promise<SecretariatFile> {
  const title = params.title.trim();
  if (!title) throw new Error('Indica un título para el informe.');
  if (!params.file.size) throw new Error('Selecciona un archivo válido.');

  const id = `sec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const safeName = params.file.name.replace(/[^\w.\-() ]+/g, '_').slice(0, 120);
  const storagePath = `secretariat/${id}/${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, params.file, { contentType: params.file.type || undefined });
  const downloadUrl = await getDownloadURL(storageRef);
  const now = new Date().toISOString();
  const record: SecretariatFile = {
    id,
    title,
    category: params.category.trim() || 'General',
    fileName: safeName,
    storagePath,
    downloadUrl,
    sizeBytes: params.file.size,
    uploadedBy: params.uploadedBy.trim().toLowerCase(),
    uploadedByRole: params.uploadedByRole,
    createdAt: now,
  };
  await setDoc(doc(db, SECRETARIAT_COLLECTION, id), record);
  return record;
}

export async function deleteSecretariatFile(id: string, storagePath: string): Promise<void> {
  await deleteDoc(doc(db, SECRETARIAT_COLLECTION, id));
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // El doc ya se eliminó; el blob huérfano se puede limpiar después
  }
}

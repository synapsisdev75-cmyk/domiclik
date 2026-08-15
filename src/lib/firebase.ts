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
  OpsIncident,
} from '../types';
import { DEFAULT_PAYROLL_SETTINGS, DEFAULT_DISPATCH_SETTINGS, toDateKey } from './adminMetrics';

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
      ? initializeFirestore(app, { localCache: memoryLocalCache() }, namedDbId)
      : initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    return namedDbId ? getFirestore(app, namedDbId) : getFirestore(app);
  }
}

export const db = createFirestore();

function createAuth() {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
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
    await getDocs(query(collection(db, 'drivers'), limit(1)));
    emitSync({
      collection: 'drivers',
      fromCache: false,
      hasPendingWrites: false,
      live: true,
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

/** Limpia caches locales / SW / IndexedDB que pueden mostrar datos borrados en Firebase */
export function clearDemoLocalCache() {
  const keysToRemove = Object.keys(localStorage).filter(
    (k) =>
      k.startsWith('domiclick_') &&
      !k.startsWith('domiclick_brand_') &&
      k !== 'domiclick_gmaps_key' &&
      k !== 'domiclick_cleared_cache_v3'
  );
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // Borrar bases IndexedDB de Firestore / Auth residuales
  if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
    indexedDB.databases().then((dbs) => {
      dbs.forEach((info) => {
        const name = info.name || '';
        if (
          name.includes('firestore') ||
          name.includes('firebase') ||
          name.includes('firebaseLocalStorage')
        ) {
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

export function subscribeDrivers(callback: (drivers: MotorizadoDriver[]) => void) {
  return onSnapshot(
    collection(db, 'drivers'),
    { includeMetadataChanges: true },
    (snapshot) => {
      const driversList: MotorizadoDriver[] = [];
      snapshot.forEach((docSnap) => {
        driversList.push({ id: docSnap.id, ...docSnap.data() } as MotorizadoDriver);
      });
      emitSync({
        collection: 'drivers',
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        live: !snapshot.metadata.fromCache,
      });
      callback(driversList);
    },
    (err) => {
      console.error('[Firebase] drivers realtime error', err);
      emitSync({
        collection: 'drivers',
        fromCache: true,
        hasPendingWrites: false,
        live: false,
        error: String(err),
      });
      callback([]);
    }
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
  return onSnapshot(
    collection(db, 'orders'),
    { includeMetadataChanges: true },
    (snapshot) => {
      const ordersList: DeliveryOrder[] = [];
      snapshot.forEach((docSnap) => {
        ordersList.push({ id: docSnap.id, ...docSnap.data() } as DeliveryOrder);
      });
      ordersList.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      emitSync({
        collection: 'orders',
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        live: !snapshot.metadata.fromCache,
      });
      callback(ordersList);
    },
    (err) => {
      console.error('[Firebase] orders realtime error', err);
      emitSync({
        collection: 'orders',
        fromCache: true,
        hasPendingWrites: false,
        live: false,
        error: String(err),
      });
      callback([]);
    }
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
  const fullOrder: DeliveryOrder = {
    ...orderData,
    id: newId,
    trackingCode,
    deliveryConfirmCode,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
  const updateData: Partial<DeliveryOrder> = {
    status,
    updatedAt: new Date().toISOString(),
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
  await setDoc(doc(db, 'driver_reviews', id), full);

  if (review.orderId) {
    await updateDoc(doc(db, 'orders', review.orderId), {
      serviceRating: review.stars,
      ratingComment: review.comment,
      ratedAt: full.createdAt,
      updatedAt: full.createdAt,
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

export async function recordAttendancePunch(params: {
  driverId: string;
  driverName?: string;
  type: AttendancePunchType;
  credentialId: string;
  lat?: number;
  lng?: number;
  odometerKm?: number;
  odometerPhotoUrl?: string;
}): Promise<AttendancePunch> {
  const at = new Date().toISOString();
  const id = 'att_' + Date.now();
  const punch: AttendancePunch = {
    id,
    driverId: params.driverId,
    driverName: params.driverName,
    type: params.type,
    at,
    dateKey: toDateKey(at),
    lat: params.lat,
    lng: params.lng,
    method: 'webauthn',
    credentialId: params.credentialId,
    odometerKm: params.odometerKm,
    odometerPhotoUrl: params.odometerPhotoUrl,
  };
  await setDoc(doc(db, 'attendance_punches', id), punch);
  await updateDoc(doc(db, 'drivers', params.driverId), {
    lastPunchType: params.type,
    lastPunchAt: at,
    updatedAt: at,
  });
  return punch;
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
      callback([]);
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
  const email = params.email.trim().toLowerCase();
  const id = adminDocId(email);
  const refDoc = doc(db, 'admins', id);
  const existing = await getDoc(refDoc);
  const all = await listAdminsOnce();
  const hasActive = all.some((a) => a.status === 'active');
  const now = new Date().toISOString();

  if (existing.exists()) {
    const acc = { id, ...existing.data() } as AdminAccount;
    const patch: Partial<AdminAccount> = {
      email,
      uid: params.uid || acc.uid,
      displayName: params.displayName || acc.displayName || email,
    };
    await updateDoc(refDoc, patch);
    return { ...acc, ...patch };
  }

  const isFounder = !hasActive;
  const acc: AdminAccount = {
    id,
    email,
    uid: params.uid,
    displayName: params.displayName || email,
    status: isFounder ? 'active' : 'pending',
    isFounder,
    requestedAt: now,
    activatedAt: isFounder ? now : undefined,
    activatedBy: isFounder ? 'sistema' : undefined,
  };
  await setDoc(refDoc, acc);
  return acc;
}

export async function inviteAdmin(email: string, invitedBy: string): Promise<AdminAccount> {
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

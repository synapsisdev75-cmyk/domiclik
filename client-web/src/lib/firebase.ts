import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import fallback from '../firebase-applet-config.json' with { type: 'json' };

function env(key: string): string {
  try {
    const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key];
    if (v) return String(v);
  } catch {
    /* ignore */
  }
  return '';
}

const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY') || fallback.apiKey,
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN') || fallback.authDomain,
  projectId: env('VITE_FIREBASE_PROJECT_ID') || fallback.projectId,
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET') || fallback.storageBucket,
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID') || fallback.messagingSenderId,
  appId: env('VITE_FIREBASE_APP_ID') || fallback.appId,
  measurementId: env('VITE_FIREBASE_MEASUREMENT_ID') || fallback.measurementId || '',
  firestoreDatabaseId:
    env('VITE_FIREBASE_FIRESTORE_DATABASE_ID') || fallback.firestoreDatabaseId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const namedDbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

export const db = namedDbId ? getFirestore(app, namedDbId) : getFirestore(app);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('email');
googleProvider.addScope('profile');

function oauthClientId() {
  return env('VITE_FIREBASE_OAUTH_CLIENT_ID') || fallback.oAuthClientId || '';
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (res: { access_token?: string; error?: string }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

let completingRedirect = false;

export async function completeGoogleRedirect(): Promise<User | null> {
  if (completingRedirect || typeof window === 'undefined') return null;
  const hash = window.location.hash?.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const oauthError = params.get('error');
  const idToken = params.get('id_token');
  if (!oauthError && !idToken) return null;

  completingRedirect = true;
  window.history.replaceState({}, document.title, window.location.pathname);
  try {
    if (oauthError) {
      throw new Error(params.get('error_description') || oauthError);
    }
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    return result.user;
  } finally {
    completingRedirect = false;
  }
}

export type CustomerProfile = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  phone: string;
};

const CUSTOMER_PHONE_KEY = 'domiclick_customer_phone';

export function readSavedPhone(uid?: string): string {
  try {
    if (uid) {
      const keyed = localStorage.getItem(`${CUSTOMER_PHONE_KEY}_${uid}`);
      if (keyed) return keyed;
    }
    return localStorage.getItem(CUSTOMER_PHONE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveCustomerPhone(phone: string, uid?: string) {
  try {
    localStorage.setItem(CUSTOMER_PHONE_KEY, phone);
    if (uid) localStorage.setItem(`${CUSTOMER_PHONE_KEY}_${uid}`, phone);
  } catch {
    /* ignore */
  }
}

export function userToProfile(user: User): CustomerProfile {
  return {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    phone: readSavedPhone(user.uid),
  };
}

export async function signInWithGoogle(): Promise<User> {
  const clientId = oauthClientId();
  if (!clientId) {
    throw new Error('Falta el OAuth Client ID de Google.');
  }
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error(
      'Google aún se está cargando. Espera un segundo y vuelve a iniciar sesión.'
    );
  }
  const accessToken = await new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: (res) => {
        if (res.error || !res.access_token) {
          reject(new Error(res.error || 'Google no devolvió token'));
          return;
        }
        resolve(res.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err?.message || err?.type || 'Login Google cancelado'));
      },
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
  const credential = GoogleAuthProvider.credential(null, accessToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function signOutCustomer() {
  await firebaseSignOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function upsertCustomerProfile(profile: CustomerProfile) {
  await setDoc(
    doc(db, 'customers', profile.uid),
    {
      uid: profile.uid,
      displayName: profile.displayName,
      email: profile.email,
      photoURL: profile.photoURL,
      phone: profile.phone || '',
      updatedAt: new Date().toISOString(),
      source: 'clientes-landing',
    },
    { merge: true },
  );
}

export type PublicOrderTracking = {
  orderId: string;
  trackingCode: string;
  /** PIN de entrega: el cliente lo da al repartidor (oculto si ya entregó) */
  deliveryConfirmCode?: string | null;
  status: string;
  customerName?: string;
  deliveryAddress?: string;
  description?: string;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  serviceRating?: number;
  ratingComment?: string;
  ratedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  etaText?: string;
  assignedDriverPhone?: string | null;
  timeline?: Array<{ at?: string; to?: string; note?: string }>;
};

function etaForStatus(status: string): string {
  switch (status) {
    case 'pending':
      return 'Central está asignando un Domiclick';
    case 'assigned':
    case 'accepted':
      return 'Tu Domiclick ya va al establecimiento';
    case 'en_route_origin':
      return 'En camino al punto de recogida';
    case 'at_origin':
      return 'Validando tu número de compra en el sitio';
    case 'picked_up':
    case 'in_transit':
      return 'Pedido en camino · llegada en minutos';
    case 'at_destination':
      return 'Está a pocos minutos de tu dirección';
    case 'delivered':
      return 'Entrega completada';
    case 'cancelled':
      return 'Pedido cancelado';
    default:
      return 'Actualizando estado…';
  }
}

export async function findOrderByTrackingCode(code: string): Promise<PublicOrderTracking | null> {
  const trackingCode = code.trim().toUpperCase();
  if (!trackingCode) return null;

  const snap = await getDocs(
    query(collection(db, 'orders'), where('trackingCode', '==', trackingCode), limit(1)),
  );
  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  const data = docSnap.data();
  const status = String(data.status || 'pending');

  return {
    orderId: docSnap.id,
    trackingCode: String(data.trackingCode || trackingCode),
    deliveryConfirmCode:
      status === 'delivered' || status === 'cancelled'
        ? null
        : data.deliveryConfirmCode
          ? String(data.deliveryConfirmCode)
          : null,
    status,
    customerName: data.customerName,
    deliveryAddress: data.deliveryAddress,
    description: data.description,
    assignedDriverId: data.assignedDriverId || null,
    assignedDriverName: data.assignedDriverName || null,
    assignedDriverPhone: data.assignedDriverPhone || null,
    timeline: Array.isArray(data.timeline) ? data.timeline : [],
    serviceRating: data.serviceRating,
    ratingComment: data.ratingComment,
    ratedAt: data.ratedAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    etaText: etaForStatus(status),
  };
}

export type CustomerRatingInput = {
  orderId: string;
  trackingCode: string;
  driverId: string;
  driverName: string;
  stars: number;
  comment: string;
  authorName: string;
  authorUid: string;
  authorEmail?: string;
};

export async function submitCustomerRating(input: CustomerRatingInput) {
  const stars = Math.min(5, Math.max(1, Math.round(input.stars)));
  const id = `rev_${Date.now()}`;
  const now = new Date().toISOString();

  const review = {
    id,
    driverId: input.driverId,
    driverName: input.driverName,
    orderId: input.orderId,
    trackingCode: input.trackingCode,
    stars,
    comment: input.comment.trim(),
    authorRole: 'customer' as const,
    authorName: input.authorName,
    authorUid: input.authorUid,
    authorEmail: input.authorEmail || '',
    createdAt: now,
  };

  await setDoc(doc(db, 'driver_reviews', id), review);
  await updateDoc(doc(db, 'orders', input.orderId), {
    serviceRating: stars,
    ratingComment: review.comment,
    ratedAt: now,
    ratedByUid: input.authorUid,
    updatedAt: now,
  });

  const q = query(collection(db, 'driver_reviews'), where('driverId', '==', input.driverId));
  const snap = await getDocs(q);
  let sum = 0;
  let n = 0;
  snap.forEach((d) => {
    sum += Number(d.data().stars) || 0;
    n += 1;
  });
  const avg = n ? Math.round((sum / n) * 10) / 10 : stars;
  await updateDoc(doc(db, 'drivers', input.driverId), {
    rating: avg,
    ratingCount: n,
    updatedAt: now,
  });

  return review;
}

export type ClientOrderInput = {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerUid?: string;
  customerPhotoURL?: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  description?: string;
  notes?: string;
  declaredValue?: number;
  shippingFee?: number;
  routeDistanceKm?: number;
  routeDurationMin?: number;
  pricingBand?: 'peak' | 'normal';
  pricePerKm?: number;
  peakMultiplier?: number;
  scheduledFor?: string;
  sourceSiteId: string;
  invoiceNumber?: string;
  invoicePhotoUrl?: string;
};

/**
 * Escribe el pedido directo a Firestore (misma DB que la torre de control).
 * Usado como canal principal/respaldo para que Central vea la solicitud en vivo.
 */
export async function createClientOrder(input: ClientOrderInput) {
  const orderId = 'ord_' + Date.now();
  const trackingCode = 'DMC-' + Math.floor(1000 + Math.random() * 9000);
  const deliveryConfirmCode = String(Math.floor(100000 + Math.random() * 900000));
  const now = new Date().toISOString();
  const fee = Math.round(Number(input.shippingFee) || 0);
  const km = Number(input.routeDistanceKm) || 0;

  const order = {
    id: orderId,
    trackingCode,
    deliveryConfirmCode,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    customerEmail: input.customerEmail || '',
    customerUid: input.customerUid || '',
    customerPhotoURL: input.customerPhotoURL || '',
    pickupAddress: input.pickupAddress.trim() || 'Punto de recolección',
    pickupCoords: {
      lat: input.pickupLat,
      lng: input.pickupLng,
      addressName: input.pickupAddress.trim() || 'Recolección',
    },
    deliveryAddress: input.deliveryAddress.trim(),
    deliveryCoords: {
      lat: input.deliveryLat,
      lng: input.deliveryLng,
      addressName: input.deliveryAddress.trim(),
    },
    description: input.description || 'Pedido desde landing clientes',
    itemType: 'varios' as const,
    declaredValue: Number(input.declaredValue) || 0,
    shippingFee: fee,
    routePrice: fee,
    routeDistanceKm: km > 0 ? Math.round(km * 100) / 100 : undefined,
    routeDurationMin: Number(input.routeDurationMin) || undefined,
    pricingBand: input.pricingBand,
    pricePerKm: input.pricePerKm,
    peakMultiplier: input.peakMultiplier,
    clientQuoted: fee > 0,
    scheduledFor: input.scheduledFor || undefined,
    status: 'pending' as const,
    assignedDriverId: null,
    assignedDriverName: null,
    notes: input.notes || '',
    invoiceNumber: input.invoiceNumber || '',
    invoicePhotoUrl: input.invoicePhotoUrl || '',
    timeline: [{ at: now, to: 'pending', byRole: 'customer', note: 'Solicitud creada' }],
    sourceSiteId: input.sourceSiteId,
    externalOrderId: '',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'orders', orderId), order);

  return {
    ok: true as const,
    orderId,
    trackingCode,
    deliveryConfirmCode,
    status: 'pending' as const,
    shippingFee: fee || null,
    routeDistanceKm: order.routeDistanceKm || null,
    scheduledFor: order.scheduledFor || null,
    pricingBand: order.pricingBand || null,
  };
}


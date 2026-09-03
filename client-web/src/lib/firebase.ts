import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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

function createClientFirestore() {
  try {
    return namedDbId
      ? initializeFirestore(app, { ignoreUndefinedProperties: true }, namedDbId)
      : initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return namedDbId ? getFirestore(app, namedDbId) : getFirestore(app);
  }
}

export const db = createClientFirestore();
export const auth = getAuth(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('email');
googleProvider.addScope('profile');

function oauthClientId() {
  return env('VITE_FIREBASE_OAUTH_CLIENT_ID') || fallback.oAuthClientId || '';
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function describeGoogleAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (/origin_mismatch|unauthorized|invalid_client/i.test(message)) {
    return (
      `Google bloqueó el login desde ${origin || 'este dominio'}. ` +
      'En Google Cloud Console → Credenciales → Client ID OAuth web, agrega ese origen en ' +
      '"Orígenes de JavaScript autorizados" y en Firebase Auth → Dominios autorizados.'
    );
  }
  if (/popup|blocked|closed|canceled|cancelled/i.test(message)) {
    return 'Ventana de Google cerrada o bloqueada. Intenta de nuevo.';
  }
  return message || 'No se pudo iniciar sesión con Google';
}

let completingRedirect = false;

/** Completa el retorno de signInWithRedirect (Firebase Auth). */
export async function completeGoogleRedirect(): Promise<User | null> {
  if (completingRedirect || typeof window === 'undefined') return null;
  completingRedirect = true;
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (err) {
    console.warn('[DomiClick] Google redirect', err);
    throw new Error(describeGoogleAuthError(err));
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
  if (!oauthClientId()) {
    throw new Error('Falta el OAuth Client ID de Google (VITE_FIREBASE_OAUTH_CLIENT_ID).');
  }

  try {
    const pending = await getRedirectResult(auth);
    if (pending?.user) return pending.user;
  } catch (err) {
    throw new Error(describeGoogleAuthError(err));
  }

  if (isMobileBrowser()) {
    await signInWithRedirect(auth, googleProvider);
    return new Promise(() => {
      /* La página redirige a Google y vuelve sola */
    });
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/popup|blocked|closed|canceled|cancelled/i.test(message)) {
      await signInWithRedirect(auth, googleProvider);
      return new Promise(() => {
        /* fallback redirect */
      });
    }
    throw new Error(describeGoogleAuthError(err));
  }
}

export async function signOutCustomer() {
  await firebaseSignOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function isActiveOpsAdmin(email: string | null | undefined): Promise<boolean> {
  const id = (email || '').trim().toLowerCase();
  if (!id) return false;
  try {
    const snap = await getDoc(doc(db, 'admins', id));
    return snap.exists() && snap.data()?.status === 'active';
  } catch (err) {
    console.warn('[auth] no se pudo leer admins', err);
    return false;
  }
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
  ratingSurvey?: {
    punctuality: number;
    care: number;
    attention: number;
  };
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
    ratingSurvey: data.ratingSurvey,
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
  survey?: {
    punctuality: number;
    care: number;
    attention: number;
  };
  authorName: string;
  authorUid: string;
  authorEmail?: string;
};

export async function submitCustomerRating(input: CustomerRatingInput) {
  const stars = Math.min(5, Math.max(1, Math.round(input.stars)));
  const id = `rev_${Date.now()}`;
  const now = new Date().toISOString();

  const review: Record<string, unknown> = {
    id,
    driverId: input.driverId,
    driverName: input.driverName,
    orderId: input.orderId,
    trackingCode: input.trackingCode,
    stars,
    comment: input.comment.trim(),
    authorRole: 'customer',
    authorName: input.authorName,
    authorUid: input.authorUid,
    authorEmail: input.authorEmail || '',
    createdAt: now,
  };
  if (input.survey) review.survey = input.survey;

  await setDoc(doc(db, 'driver_reviews', id), review);

  const orderPatch: Record<string, unknown> = {
    serviceRating: stars,
    ratingComment: review.comment,
    ratedAt: now,
    ratedByUid: input.authorUid,
    updatedAt: now,
  };
  if (input.survey) orderPatch.ratingSurvey = input.survey;
  await updateDoc(doc(db, 'orders', input.orderId), orderPatch);

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
  paymentMethod?: 'efectivo' | 'transferencia' | 'ya_pagado' | 'otro';
  paymentNote?: string;
  couponCode?: string;
};

export async function uploadInvoicePhoto(file: File, orderIdHint?: string): Promise<string> {
  const id = orderIdHint || `tmp_${Date.now()}`;
  const safeName = (file.name || 'factura.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `orders/${id}/invoice_${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

/** Cupón simple en colección `coupons` (code, active, discountPct | discountFixed). */
export async function resolveCouponDiscount(
  code: string,
  baseFee: number
): Promise<{ code: string; discount: number; finalFee: number } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || baseFee <= 0) return null;
  const snap = await getDoc(doc(db, 'coupons', normalized));
  if (!snap.exists()) return null;
  const data = snap.data() as {
    active?: boolean;
    discountPct?: number;
    discountFixed?: number;
  };
  if (data.active === false) return null;
  let discount = 0;
  if (Number(data.discountFixed) > 0) discount = Number(data.discountFixed);
  else if (Number(data.discountPct) > 0) {
    discount = Math.round(baseFee * (Number(data.discountPct) / 100));
  }
  if (discount <= 0) return null;
  const finalFee = Math.max(0, baseFee - discount);
  return { code: normalized, discount, finalFee };
}

/**
 * Escribe el pedido directo a Firestore (misma DB que la torre de control).
 * Usado como canal principal/respaldo para que Central vea la solicitud en vivo.
 */
export async function createClientOrder(input: ClientOrderInput) {

  const orderId = 'ord_' + Date.now();
  const trackingCode = 'DMC-' + Math.floor(1000 + Math.random() * 9000);
  const deliveryConfirmCode = String(Math.floor(100000 + Math.random() * 900000));
  const now = new Date().toISOString();
  let fee = Math.round(Number(input.shippingFee) || 0);
  let couponApplied: { code: string; discount: number } | null = null;
  if (input.couponCode?.trim()) {
    const resolved = await resolveCouponDiscount(input.couponCode, fee);
    if (resolved) {
      fee = resolved.finalFee;
      couponApplied = { code: resolved.code, discount: resolved.discount };
    }
  }
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
    paymentMethod: input.paymentMethod || 'efectivo',
    paymentNote: input.paymentNote || '',
    couponCode: couponApplied?.code || input.couponCode?.trim().toUpperCase() || '',
    couponDiscount: couponApplied?.discount || 0,
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


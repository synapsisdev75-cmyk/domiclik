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
  try {
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request'
    ) {
      await signInWithRedirect(auth, googleProvider);
      throw new Error('Redirigiendo a Google…');
    }
    if (code === 'auth/operation-not-allowed') {
      throw new Error('Activa el proveedor Google en Firebase Authentication.');
    }
    throw err instanceof Error ? err : new Error('No se pudo iniciar con Google');
  }
}

export async function completeGoogleRedirect(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
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
};

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

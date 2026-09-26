import { Capacitor } from '@capacitor/core';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
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

/** Mismo host que la app → evita "falta del estado inicial" en redirect Google. */
function resolveAuthDomain(fallbackDomain: string): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'domiclick.com' || host === 'www.domiclick.com') return 'domiclick.com';
    if (host === 'ops.domiclick.com') return 'ops.domiclick.com';
    if (host === 'domiclick-ops.web.app') return 'domiclick-ops.web.app';
    if (host === 'domiclick-ops.firebaseapp.com') return 'domiclick-ops.firebaseapp.com';
    if (host === 'gen-lang-client-0954482957.web.app') {
      return 'gen-lang-client-0954482957.web.app';
    }
    if (host === 'gen-lang-client-0954482957.firebaseapp.com') {
      return 'gen-lang-client-0954482957.firebaseapp.com';
    }
  }
  // Solo si el host no es conocido (SSR / localhost)
  const fromEnv = env('VITE_FIREBASE_AUTH_DOMAIN');
  if (fromEnv) return fromEnv;
  return fallbackDomain || 'domiclick.com';
}

const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY') || fallback.apiKey,
  authDomain: resolveAuthDomain(fallback.authDomain || 'domiclick.com'),
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

function createClientAuth() {
  try {
    // Safari/iPhone: localStorage + resolver de redirect (evita “falta del estado inicial”)
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, indexedDBLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createClientAuth();
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

function isIOSBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isMissingRedirectStateError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || '';
  const raw = err instanceof Error ? err.message : String(err ?? '');
  return (
    code === 'auth/no-auth-event' ||
    /falta del estado inicial|missing initial state|sessionStorage|partitioned storage|storage unavailable/i.test(
      raw,
    )
  );
}

function authErrBlob(err: unknown): string {
  const e = err as { code?: string; message?: string; errorMessage?: string };
  return `${e?.code || ''} ${e?.message || ''} ${e?.errorMessage || ''} ${err instanceof Error ? err.message : String(err ?? '')}`;
}

function isGoogleUserCancelled(err: unknown): boolean {
  return /USER_CANCELLED|GetCredentialCancellation|canceled by the user|cancelled by user|Authorization canceled/i.test(
    authErrBlob(err),
  );
}

function describeGoogleAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const blob = authErrBlob(err);

  if (isMissingRedirectStateError(err)) {
    return (
      'Google no pudo completar el redirect. Cierra pestañas de Google, abre de nuevo ' +
      'https://domiclick.com o la app e intenta iniciar sesión otra vez.'
    );
  }
  if (/28444|Developer console is not set up|not set up correctly/i.test(blob)) {
    const shaMatch = blob.match(/signingSha1=([0-9A-Fa-f:]+)/i);
    const shaHint = shaMatch
      ? ` SHA-1 de ESTA instalación: ${shaMatch[1]}.`
      : '';
    return (
      'Google no reconoce la firma de esta app.' +
      shaHint +
      ' Debe coincidir con un cliente Android OAuth (paquete com.domiclick.app). ' +
      'Si instalaste desde Play: usa el SHA-1 de “Firma de la app” (EF:83:6F:…). ' +
      'Si instalaste APK suelto: usa el de subida (4F:39:E7:…). ' +
      'Espera 10 min tras agregarlo, desinstala y reinstala la misma app.'
    );
  }
  if (/10:|DEVELOPER_ERROR|ApiException:\s*10/i.test(blob)) {
    return (
      'Google rechazó la firma (SHA-1). Confirma el SHA-1 de Play en Firebase y reinstala la app.'
    );
  }
  if (/origin_mismatch|unauthorized|invalid_client|WILL_BE_OVERRIDDEN/i.test(blob)) {
    return (
      `Google bloqueó el login desde ${origin || 'este dominio'}. ` +
      'Revisa OAuth Web Client ID / SHA-1 en Firebase (Android).'
    );
  }
  if (isGoogleUserCancelled(err)) {
    const shaMatch = blob.match(/signingSha1=([0-9A-Fa-f:]+)/i);
    const sha = shaMatch?.[1]?.toUpperCase() || '';
    const shaCompact = sha.replace(/:/g, '');
    const known = {
      play: 'EF836FF1683A10DF00AE4C868EAD06A8BC8FF749',
      playNew: '21442E250C2DCCA0A13B85596D811F2971693A8F',
      playDer: 'F9326EB091222B16083F9AEFB97F219CD15A3CF0',
      upload: '4F39E77EDB4370D02E0CC820B7CB42958DE545FC',
      debug: '5478DDF54ED9A955253CFD017C4A042A4160B8D8',
    };
    if (
      sha &&
      (shaCompact === known.play ||
        shaCompact === known.playNew ||
        shaCompact === known.playDer)
    ) {
      return (
        `Google cerró el login (firma Play: ${sha}). ` +
        'Desinstala DomiClick, espera 10 min y reinstala SOLO desde Play. ' +
        'Abre la app y pulsa Entrar con Google una sola vez.'
      );
    }
    if (
      sha &&
      shaCompact !== known.play &&
      shaCompact !== known.playNew &&
      shaCompact !== known.playDer &&
      shaCompact !== known.upload &&
      shaCompact !== known.debug &&
      shaCompact !== 'UNKNOWN'
    ) {
      return (
        `Google cerró el login. SHA-1 de ESTA instalación: ${sha}. ` +
        'Ese valor debe estar en Firebase → App Android com.domiclick.app. ' +
        'Copia el SHA-1 de Play Console → Integridad de la app → Firma de la app, ' +
        'agréalo en Firebase, espera 10 min y reinstala desde Play.'
      );
    }
    if (sha && shaCompact !== 'UNKNOWN') {
      return (
        `Google cerró el login. Firma: ${sha}. ` +
        'Cierra DomiClick por completo, ábrela y pulsa Google una sola vez.'
      );
    }
    // Cancel sin SHA (build viejo / UI cerrada): guía Play explícita
    if (isCapacitorNative() && Capacitor.getPlatform() === 'android') {
      return (
        'Google cerró el acceso antes de terminarlo. ' +
        '1) En Play Console confirma SHA-1 de “Firma de la app” = 21:44:2E:25:… ' +
        '2) Ese SHA debe estar en Firebase. ' +
        '3) Desinstala DomiClick e instala de nuevo SOLO desde Play (versión ≥ 1.0.27). ' +
        '4) Pulsa Entrar con Google una sola vez.'
      );
    }
    return isIOSBrowser()
      ? 'En iPhone prueba “Entrar con Apple”, o vuelve a intentar con Google.'
      : 'Intenta de nuevo. Si el navegador bloqueó Google, permite pop-ups para este sitio.';
  }
  if (/NoCredentialsException|NoCredential/i.test(blob)) {
    return 'No hay cuentas Google disponibles en este teléfono. Agrega una cuenta Google en Ajustes e intenta de nuevo.';
  }
  if (/popup|blocked|closed|cancelled/i.test(message) && !isCapacitorNative()) {
    return 'Ventana de Google cerrada o bloqueada. Intenta de nuevo.';
  }
  const short = message.replace(/\s+/g, ' ').trim();
  return short.slice(0, 180) || 'No se pudo iniciar sesión con Google';
}

let completingRedirect = false;
/** Evita dos getCredentialAsync a la vez (Android cancela el primero como USER_CANCELLED). */
let googleNativeLoginInFlight: Promise<User> | null = null;
let googleSocialInitialized = false;

async function ensureGoogleSocialLogin(webClientId: string) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (!googleSocialInitialized) {
    await SocialLogin.initialize({
      google: {
        webClientId,
        mode: 'online',
      },
    });
    googleSocialInitialized = true;
  }
  return SocialLogin;
}

/** Completa el retorno de signInWithRedirect (Firebase Auth). */
export async function completeGoogleRedirect(): Promise<User | null> {
  if (completingRedirect || typeof window === 'undefined') return null;
  completingRedirect = true;
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (err) {
    if (isMissingRedirectStateError(err)) {
      console.warn('[DomiClick] Google redirect state lost', err);
      return null;
    }
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
  // App nativa Android/iOS: Google Credential Manager → Firebase credential
  if (isCapacitorNative()) {
    if (googleNativeLoginInFlight) return googleNativeLoginInFlight;

    googleNativeLoginInFlight = (async () => {
      try {
        const webClientId = oauthClientId();
        if (!webClientId) {
          throw new Error('Falta el OAuth Web Client ID para Google en la app.');
        }

        const SocialLogin = await ensureGoogleSocialLogin(webClientId);

        // Primero sin forcePrompt (menos cancelaciones). Si no hay credencial, reintenta con prompt.
        const loginOptsBase = {
          style: 'standard' as const,
          scopes: ['email', 'profile'],
          filterByAuthorizedAccounts: false,
          autoSelectEnabled: false,
        };

        let response;
        try {
          response = await SocialLogin.login({
            provider: 'google',
            options: { ...loginOptsBase, forcePrompt: false },
          });
        } catch (firstErr) {
          const firstBlob = authErrBlob(firstErr);
          if (/NoCredential|NoCredentialsException/i.test(firstBlob)) {
            response = await SocialLogin.login({
              provider: 'google',
              options: { ...loginOptsBase, forcePrompt: true },
            });
          } else {
            throw firstErr;
          }
        }

        if (response.provider !== 'google') {
          throw new Error('Respuesta inesperada del login Google.');
        }

        const googleResult = response.result;
        const idToken =
          googleResult && 'idToken' in googleResult ? googleResult.idToken : null;
        if (!idToken) {
          throw new Error(
            'Google no devolvió idToken. Verifica en Firebase el SHA-1 de Play ' +
              '(Firma de la app: 21:44:2E:25:…) para com.domiclick.app, espera 10 min y reinstala desde Play.',
          );
        }

        const credential = GoogleAuthProvider.credential(idToken);
        const signed = await signInWithCredential(auth, credential);
        return signed.user;
      } catch (err) {
        console.warn('[auth] Google native', err);
        throw new Error(describeGoogleAuthError(err));
      } finally {
        googleNativeLoginInFlight = null;
      }
    })();

    return googleNativeLoginInFlight;
  }

  if (!oauthClientId()) {
    throw new Error('Falta el OAuth Client ID de Google (VITE_FIREBASE_OAUTH_CLIENT_ID).');
  }

  try {
    const pending = await getRedirectResult(auth);
    if (pending?.user) return pending.user;
  } catch (err) {
    if (!isMissingRedirectStateError(err)) {
      throw new Error(describeGoogleAuthError(err));
    }
  }

  // Móvil (Android e iPhone): redirect — popup en iOS Safari falla o se corta.
  const useRedirect = isMobileBrowser();
  if (useRedirect) {
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

function describeAppleAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code || '';
  const blob = `${code} ${message}`;
  if (/cancel|canceled|cancelled/i.test(blob)) {
    return 'Inicio con Apple cancelado. Intenta de nuevo.';
  }
  if (/auth\/operation-not-allowed|not enabled/i.test(blob)) {
    return 'Apple no está habilitado en Firebase Authentication. Actívalo en la consola.';
  }
  if (/not.available|unsupported|configuration/i.test(blob)) {
    return (
      'Apple Sign-In no disponible aquí. En iPhone nativo hace falta la app iOS ' +
      'y Sign in with Apple en Apple Developer.'
    );
  }
  return message.replace(/\s+/g, ' ').trim().slice(0, 180) || 'No se pudo iniciar sesión con Apple';
}

/** Sign in with Apple (iOS Capgo; web/Safari con Firebase OAuth). */
export async function signInWithApple(): Promise<User> {
  if (isCapacitorNative() && Capacitor.getPlatform() === 'ios') {
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({
        apple: {},
      });
      const response = await SocialLogin.login({
        provider: 'apple',
        options: {
          scopes: ['email', 'name'],
        },
      });
      if (response.provider !== 'apple') {
        throw new Error('Respuesta inesperada del login Apple.');
      }
      const appleResult = response.result as {
        idToken?: string | null;
        accessToken?: { token?: string } | string | null;
      };
      const idToken = appleResult?.idToken;
      if (!idToken) {
        throw new Error('Apple no devolvió idToken. Revisa Sign in with Apple en Apple Developer.');
      }
      const provider = new OAuthProvider('apple.com');
      const access =
        typeof appleResult.accessToken === 'string'
          ? appleResult.accessToken
          : appleResult.accessToken?.token;
      const credential = provider.credential({
        idToken,
        accessToken: access || undefined,
      });
      const signed = await signInWithCredential(auth, credential);
      return signed.user;
    } catch (err) {
      console.warn('[auth] Apple native', err);
      throw new Error(describeAppleAuthError(err));
    }
  }

  try {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    if (isMobileBrowser() && !isIOSBrowser()) {
      await signInWithRedirect(auth, provider);
      return new Promise(() => {});
    }
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    throw new Error(describeAppleAuthError(err));
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

export type CustomerOrderSummary = {
  orderId: string;
  trackingCode: string;
  status: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  description?: string;
  createdAt?: string;
  scheduledFor?: string;
};

export async function listCustomerOrders(uid: string): Promise<CustomerOrderSummary[]> {
  const customerUid = uid.trim();
  if (!customerUid) return [];

  const snap = await getDocs(
    query(collection(db, 'orders'), where('customerUid', '==', customerUid), limit(40)),
  );

  const rows: CustomerOrderSummary[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      orderId: d.id,
      trackingCode: String(data.trackingCode || ''),
      status: String(data.status || 'pending'),
      pickupAddress: data.pickupAddress ? String(data.pickupAddress) : undefined,
      deliveryAddress: data.deliveryAddress ? String(data.deliveryAddress) : undefined,
      description: data.description ? String(data.description) : undefined,
      createdAt: data.createdAt ? String(data.createdAt) : undefined,
      scheduledFor: data.scheduledFor ? String(data.scheduledFor) : undefined,
    };
  });

  rows.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  return rows.filter((r) => r.trackingCode);
}


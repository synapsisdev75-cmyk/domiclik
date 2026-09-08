import { getRedirectResult, signInWithPopup, signInWithRedirect, type User } from 'firebase/auth';
import { auth, googleProvider, LOGIN_ROLE_KEY } from './firebase';
import {
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  safeLocalStorage,
  safeSessionStorage,
} from './safeStorage';

const REDIRECT_PENDING_KEY = 'domiclick_google_redirecting';

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isIOSBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/i.test(ua);
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
}

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/**
 * iPhone/iPad: NUNCA redirect (Safari pierde el estado y vuelve al login sin entrar).
 * Usar popup (Firebase Option 2). Capacitor Android: popup.
 * Android Chrome móvil: redirect OK si authDomain coincide con el host.
 */
function preferRedirectFlow(): boolean {
  if (isCapacitorNative()) return false;
  if (isIOSBrowser()) return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  return isMobileBrowser();
}

function isMissingRedirectStateError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || '';
  const raw = err instanceof Error ? err.message : String(err ?? '');
  return (
    code === 'auth/no-auth-event' ||
    code === 'auth/argument-error' ||
    /falta del estado inicial|missing initial state|sessionStorage|partitioned storage|storage unavailable/i.test(
      raw,
    )
  );
}

function clearOAuthUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.search && !url.hash.includes('code') && !url.hash.includes('error')) return;
  window.history.replaceState({}, document.title, url.pathname);
}

/** Restos del flujo PKCE viejo (`?code=`). No es el redirect de Firebase Auth. */
export function isLegacyGoogleOAuthReturn() {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  return Boolean(query.get('code') || query.get('error'));
}

export function isGoogleOAuthReturn() {
  if (typeof window === 'undefined') return false;
  if (isLegacyGoogleOAuthReturn()) return true;
  const ss = safeSessionStorage();
  const ls = safeLocalStorage();
  if (ss && safeGetItem(ss, REDIRECT_PENDING_KEY) === '1') return true;
  if (ls && safeGetItem(ls, REDIRECT_PENDING_KEY) === '1') return true;
  return false;
}

export function saveLoginRole(role: string) {
  const ss = safeSessionStorage();
  const ls = safeLocalStorage();
  if (ss) safeSetItem(ss, LOGIN_ROLE_KEY, role);
  if (ls) safeSetItem(ls, LOGIN_ROLE_KEY, role);
}

export function readLoginRole(): string | null {
  const ss = safeSessionStorage();
  const ls = safeLocalStorage();
  return (
    (ss ? safeGetItem(ss, LOGIN_ROLE_KEY) : null) ||
    (ls ? safeGetItem(ls, LOGIN_ROLE_KEY) : null)
  );
}

export function clearLoginRole() {
  const ss = safeSessionStorage();
  const ls = safeLocalStorage();
  if (ss) safeRemoveItem(ss, LOGIN_ROLE_KEY);
  if (ls) safeRemoveItem(ls, LOGIN_ROLE_KEY);
}

function markRedirectPending() {
  const ss = safeSessionStorage();
  const ls = safeLocalStorage();
  if (ss) safeSetItem(ss, REDIRECT_PENDING_KEY, '1');
  if (ls) safeSetItem(ls, REDIRECT_PENDING_KEY, '1');
}

function clearRedirectPending() {
  const ss = safeSessionStorage();
  const ls = safeLocalStorage();
  if (ss) safeRemoveItem(ss, REDIRECT_PENDING_KEY);
  if (ls) safeRemoveItem(ls, REDIRECT_PENDING_KEY);
}

export function googleRedirectUri() {
  return window.location.origin;
}

export function describeAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (code === 'auth/unauthorized-domain') {
    return (
      `Este dominio (${host}) no está autorizado. En Firebase Console → Authentication → Settings → ` +
      `Authorized domains, agrega: domiclick-ops.web.app, ops.domiclick.com, localhost.`
    );
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Activa el proveedor Google en Firebase → Authentication → Sign-in method.';
  }
  if (code === 'auth/network-request-failed') {
    return (
      'No se pudo conectar con Google. Revisa la red, recarga e intenta de nuevo. ' +
      'En iPhone también puedes entrar con correo y contraseña.'
    );
  }
  if (
    code === 'auth/popup-blocked' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  ) {
    return (
      'Safari bloqueó o cerró la ventana de Google. Vuelve a pulsar «Continuar con Google» ' +
      'y no cierres la pestaña hasta terminar. Si sigue fallando, entra con correo y contraseña.'
    );
  }
  if (/origin_mismatch|redirect_uri|invalid_client|unauthorized_client/i.test(raw)) {
    return (
      `Google bloqueó el login desde ${origin}. En Google Cloud Console → Credenciales → Client ID OAuth web, agrega ` +
      `${origin} en Orígenes de JavaScript autorizados y ${origin}/__/auth/handler en URIs de redirección.`
    );
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Correo o contraseña incorrectos. Si es tu primera vez, pulsa «Crea tu cuenta».';
  }
  if (code === 'auth/user-not-found') {
    return 'Ese correo no existe. Usa «Crea tu cuenta» o Google.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Demasiados intentos. Espera un minuto o entra con Google.';
  }
  if (isMissingRedirectStateError(err)) {
    return (
      'Google no completó el acceso en Safari. Pulsa otra vez «Continuar con Google» ' +
      '(deja abierta la pestaña) o entra con correo y contraseña.'
    );
  }
  if (code) return `No se pudo entrar (${code}). Prueba correo/contraseña o recarga e intenta Google otra vez.`;
  return raw || 'No se pudo iniciar sesión.';
}

export async function startGoogleSignInRedirect() {
  // iPhone: solo popup. Redirect en Safari regresa al login sin sesión.
  if (preferRedirectFlow()) {
    markRedirectPending();
    await signInWithRedirect(auth, googleProvider);
    return new Promise<User>(() => undefined);
  }

  try {
    markRedirectPending();
    const result = await signInWithPopup(auth, googleProvider);
    clearRedirectPending();
    return result.user;
  } catch (err) {
    clearRedirectPending();
    // En iOS no caemos a redirect: falla en silencio y confunde.
    if (isIOSBrowser()) {
      throw err;
    }
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/network-request-failed' ||
      code === 'auth/internal-error' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      markRedirectPending();
      await signInWithRedirect(auth, googleProvider);
      return new Promise<User>(() => undefined);
    }
    throw err;
  }
}

export async function signInWithGoogleAccount(): Promise<User> {
  return startGoogleSignInRedirect();
}

let completing: Promise<User | null> | null = null;

/** Una sola llamada compartida: App y LoginPage no se pisan el resultado del redirect. */
export function completeGoogleSignInFromRedirect(): Promise<User | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!completing) {
    completing = (async () => {
      const wasPending = isGoogleOAuthReturn();
      try {
        if (isLegacyGoogleOAuthReturn()) {
          clearOAuthUrl();
          throw new Error(
            'El login anterior falló al canjear el token. Pulsa otra vez Continuar con Google.'
          );
        }
        try {
          await auth.authStateReady();
          const result = await getRedirectResult(auth);
          if (result?.user) {
            clearRedirectPending();
            return result.user;
          }
          // A veces el redirect deja la sesión en currentUser sin UserCredential
          if (auth.currentUser) {
            clearRedirectPending();
            return auth.currentUser;
          }
          if (wasPending) {
            clearRedirectPending();
            throw new Error(
              'Google abrió y volvió, pero Safari no guardó la sesión. ' +
                'Pulsa otra vez «Continuar con Google» o entra con correo y contraseña.'
            );
          }
          clearRedirectPending();
          return null;
        } catch (err) {
          clearRedirectPending();
          if (auth.currentUser) return auth.currentUser;
          if (isMissingRedirectStateError(err)) {
            console.warn('[DomiClick] Google redirect state lost', err);
            throw new Error(describeAuthError(err));
          }
          throw err;
        }
      } finally {
        window.setTimeout(() => {
          completing = null;
        }, 0);
      }
    })();
  }
  return completing;
}

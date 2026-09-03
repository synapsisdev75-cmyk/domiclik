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

/** Móvil: redirect. Escritorio: popup (más fiable en ops.domiclick.com). */
function preferRedirectFlow(): boolean {
  return isMobileBrowser();
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
      'No se pudo conectar con Google (red o popup bloqueado). Recarga la página, permite ventanas ' +
      'emergentes y vuelve a intentar. Si persiste, agrega este dominio en Firebase Auth → Authorized domains.'
    );
  }
  if (
    code === 'auth/popup-blocked' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  ) {
    return 'Ventana de Google cerrada o bloqueada. Permite ventanas emergentes e inténtalo de nuevo.';
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
  if (code) return `No se pudo entrar (${code}). Prueba correo/contraseña o recarga e intenta Google otra vez.`;
  return raw || 'No se pudo iniciar sesión.';
}

export async function startGoogleSignInRedirect() {
  if (preferRedirectFlow()) {
    markRedirectPending();
    await signInWithRedirect(auth, googleProvider);
    return new Promise<User>(() => undefined);
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    clearRedirectPending();
    return result.user;
  } catch (err) {
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
      try {
        if (isLegacyGoogleOAuthReturn()) {
          clearOAuthUrl();
          throw new Error(
            'El login anterior falló al canjear el token. Pulsa otra vez Continuar con Google.'
          );
        }
        const result = await getRedirectResult(auth);
        clearRedirectPending();
        return result?.user ?? null;
      } finally {
        // Liberar tras un tick para callers concurrentes en el mismo montaje
        window.setTimeout(() => {
          completing = null;
        }, 0);
      }
    })();
  }
  return completing;
}

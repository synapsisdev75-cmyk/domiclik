import { getRedirectResult, signInWithPopup, signInWithRedirect, type User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

const REDIRECT_PENDING_KEY = 'domiclick_google_redirecting';

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
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
  try {
    return sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1';
  } catch {
    return false;
  }
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
    return `Este dominio (${host}) no está autorizado en Firebase Auth → Authorized domains.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Activa el proveedor Google en Firebase → Authentication → Sign-in method.';
  }
  if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Ventana de Google cerrada o bloqueada. Permite ventanas emergentes e inténtalo de nuevo.';
  }
  if (/origin_mismatch|redirect_uri|invalid_client|unauthorized_client/i.test(raw)) {
    return (
      `Google bloqueó el login desde ${origin}. En Google Cloud Console → Client ID OAuth web, agrega ` +
      `${origin} en Orígenes de JavaScript autorizados.`
    );
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Correo o contraseña incorrectos. Si es tu primera vez, pulsa «Solicita tu registro».';
  }
  if (code === 'auth/user-not-found') {
    return 'Ese correo no existe. Usa «Solicita tu registro» o Google.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Demasiados intentos. Espera un minuto o entra con Google.';
  }
  if (code) return `No se pudo entrar (${code}). Prueba correo/contraseña.`;
  return raw || 'No se pudo iniciar sesión.';
}

export async function startGoogleSignInRedirect() {
  if (isMobileBrowser()) {
    sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
    await signInWithRedirect(auth, googleProvider);
    return new Promise<User>(() => undefined);
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request'
    ) {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
      await signInWithRedirect(auth, googleProvider);
      return new Promise<User>(() => undefined);
    }
    throw err;
  }
}

export async function signInWithGoogleAccount(): Promise<User> {
  return startGoogleSignInRedirect();
}

let completing = false;

export async function completeGoogleSignInFromRedirect(): Promise<User | null> {
  if (completing || typeof window === 'undefined') return null;
  completing = true;
  try {
    if (isLegacyGoogleOAuthReturn()) {
      clearOAuthUrl();
      throw new Error(
        'El login anterior falló al canjear el token. Pulsa otra vez Continuar con Google.'
      );
    }
    const result = await getRedirectResult(auth);
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
    return result?.user ?? null;
  } finally {
    completing = false;
  }
}

import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from './firebase';
import { getFirebaseConfig } from './firebaseConfig';

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

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('google-gis-client');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('No se pudo cargar Google'))
      );
      return;
    }
    const s = document.createElement('script');
    s.id = 'google-gis-client';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar Google Identity'));
    document.head.appendChild(s);
  });
}

function isPopupFailure(code: string) {
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/operation-not-supported-in-this-environment'
  );
}

export function describeAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (code === 'auth/unauthorized-domain') {
    return `Este dominio (${host}) no está autorizado. En Firebase → Authentication → Settings → Authorized domains agrega "${host}".`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Activa el proveedor Google en Firebase → Authentication → Sign-in method.';
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
  if (isPopupFailure(code) || /popup_closed|popup_failed/i.test(raw)) {
    return 'El popup de Google se cerró. Permite ventanas emergentes para este sitio y reintenta.';
  }
  if (/origin_mismatch|idpiframe_initialization_failed/i.test(raw)) {
    return `Google no autoriza este origen (${origin}). En Google Cloud → APIs y servicios → Credenciales → tu Client ID de OAuth, agrega ${origin} en «Orígenes de JavaScript autorizados».`;
  }
  if (code) return `No se pudo entrar (${code}). Prueba correo/contraseña o permite popups.`;
  return raw || 'No se pudo iniciar sesión.';
}

async function signInWithGoogleAccessToken(clientId: string) {
  await loadGisScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity no está disponible en este navegador.');
  }
  const accessToken = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts!.oauth2!.initTokenClient({
      client_id: clientId,
      scope: 'email profile openid',
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

/**
 * Login con Google Identity Services + Firebase credential.
 * No usa /__/auth/handler de firebaseapp.com (en este proyecto da 404 / ventana en blanco).
 */
export async function signInWithGoogleAccount() {
  const clientId = getFirebaseConfig().oAuthClientId;
  if (!clientId) {
    throw new Error(
      'Falta el OAuth Client ID de Google. Revisa firebase-applet-config.json (oAuthClientId).'
    );
  }
  return signInWithGoogleAccessToken(clientId);
}

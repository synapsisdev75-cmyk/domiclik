import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';
import { getFirebaseConfig } from './firebaseConfig';

const STATE_KEY = 'domiclick_google_oauth_state';
const PKCE_KEY = 'domiclick_google_pkce';
const URI_KEY = 'domiclick_google_redirect_uri';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

function oauthClientId() {
  return getFirebaseConfig().oAuthClientId;
}

/** Coincide con Google Cloud: localhost lleva barra final; Vercel no. */
export function googleRedirectUri() {
  const origin = window.location.origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return `${origin}/`;
  }
  return origin;
}

export function isGoogleOAuthReturn() {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return Boolean(
    query.get('code') ||
      query.get('error') ||
      hash.get('id_token') ||
      hash.get('error')
  );
}

export function describeAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/unauthorized-domain') {
    return `Este dominio (${host}) no está autorizado en Firebase Auth.`;
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
  if (/redirect_uri|invalid_client|unauthorized_client/i.test(raw)) {
    return `Google rechazó el retorno (${googleRedirectUri()}). En el Client ID OAuth agrega esa URI exacta y, si pide secreto, GOOGLE_OAUTH_CLIENT_SECRET en .env.`;
  }
  if (code) return `No se pudo entrar (${code}). Prueba correo/contraseña.`;
  return raw || 'No se pudo iniciar sesión.';
}

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function firebaseUserFromGoogleTokens(idToken?: string, accessToken?: string) {
  if (idToken) {
    return signInWithCredential(auth, GoogleAuthProvider.credential(idToken)).then((r) => r.user);
  }
  if (accessToken) {
    return signInWithCredential(auth, GoogleAuthProvider.credential(null, accessToken)).then(
      (r) => r.user
    );
  }
  throw new Error('Google no devolvió token.');
}

function clearOAuthUrl() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

async function exchangeAuthorizationCode(code: string) {
  const codeVerifier = sessionStorage.getItem(PKCE_KEY) || '';
  const redirectUri = sessionStorage.getItem(URI_KEY) || googleRedirectUri();
  const clientId = oauthClientId();
  const res = await fetch('/api/google-oauth-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, code, codeVerifier, redirectUri }),
  });
  const data = (await res.json()) as {
    id_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'No se pudo canjear el código de Google');
  }
  sessionStorage.removeItem(PKCE_KEY);
  sessionStorage.removeItem(URI_KEY);
  return firebaseUserFromGoogleTokens(data.id_token, data.access_token);
}

/** Misma pestaña → Google. Sin popup (el popup se quedaba en about:blank). */
export async function startGoogleSignInRedirect() {
  const clientId = oauthClientId();
  if (!clientId) {
    throw new Error(
      'Falta el OAuth Client ID de Google. Revisa firebase-applet-config.json (oAuthClientId).'
    );
  }
  const redirectUri = googleRedirectUri();
  const state = crypto.randomUUID();
  const verifier = randomVerifier();
  const challenge = await pkceChallenge(verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(PKCE_KEY, verifier);
  sessionStorage.setItem(URI_KEY, redirectUri);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
    access_type: 'online',
  });
  window.location.assign(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}

export async function signInWithGoogleAccount(): Promise<User> {
  await startGoogleSignInRedirect();
  return new Promise(() => undefined);
}

let completing = false;

export async function completeGoogleSignInFromRedirect(): Promise<User | null> {
  if (completing || typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const oauthError = query.get('error') || hash.get('error');
  const code = query.get('code');
  const idToken = hash.get('id_token');
  const state = query.get('state') || hash.get('state');
  if (!oauthError && !code && !idToken) return null;

  completing = true;
  try {
    if (oauthError) {
      clearOAuthUrl();
      throw new Error(query.get('error_description') || hash.get('error_description') || oauthError);
    }
    const expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    if (expected && state && expected !== state) {
      clearOAuthUrl();
      throw new Error('La sesión de Google no coincide. Vuelve a pulsar Continuar con Google.');
    }
    if (idToken) {
      clearOAuthUrl();
      return firebaseUserFromGoogleTokens(idToken);
    }
    const user = await exchangeAuthorizationCode(code!);
    clearOAuthUrl();
    return user;
  } finally {
    completing = false;
  }
}

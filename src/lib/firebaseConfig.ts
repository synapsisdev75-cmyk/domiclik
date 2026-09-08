import fallback from '../../firebase-applet-config.json';

export type DomiFirebaseConfig = {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId: string;
  oAuthClientId: string;
  recaptchaSiteKey: string;
};

function readEnv(key: string): string {
  try {
    const viteVal = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key];
    if (viteVal) return String(viteVal);
  } catch {
    /* no vite */
  }
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return String(process.env[key]);
  }
  return '';
}

/**
 * authDomain debe coincidir con el host actual. Si apunta a firebaseapp.com
 * y la app está en domiclick.com / WebView, el redirect de Google pierde el
 * estado de sesión ("falta del estado inicial" / partitioned storage).
 */
export function resolveAuthDomain(fallbackDomain: string): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    // Debe coincidir EXACTO con el host (Safari bloquea storage entre web.app ↔ firebaseapp.com)
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
    if (host === 'localhost' || host === '127.0.0.1') {
      return fallbackDomain || 'domiclick.com';
    }
  }
  const fromEnv = readEnv('VITE_FIREBASE_AUTH_DOMAIN');
  if (fromEnv) return fromEnv;
  return fallbackDomain || 'domiclick.com';
}

/** Config Firebase DomiClik: prioriza .env / VITE_* y cae al JSON del proyecto. */
export function getFirebaseConfig(): DomiFirebaseConfig {
  return {
    apiKey: readEnv('VITE_FIREBASE_API_KEY') || fallback.apiKey,
    authDomain: resolveAuthDomain(fallback.authDomain || 'domiclick.com'),
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || fallback.projectId,
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || fallback.storageBucket,
    messagingSenderId:
      readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || fallback.messagingSenderId,
    appId: readEnv('VITE_FIREBASE_APP_ID') || fallback.appId,
    measurementId: readEnv('VITE_FIREBASE_MEASUREMENT_ID') || fallback.measurementId || '',
    firestoreDatabaseId:
      readEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID') || fallback.firestoreDatabaseId,
    oAuthClientId: readEnv('VITE_FIREBASE_OAUTH_CLIENT_ID') || fallback.oAuthClientId || '',
    recaptchaSiteKey:
      readEnv('VITE_FIREBASE_RECAPTCHA_SITE_KEY') || fallback.recaptchaSiteKey || '',
  };
}

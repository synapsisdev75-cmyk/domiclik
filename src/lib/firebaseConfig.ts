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

/** Config Firebase DomiClik: prioriza .env / VITE_* y cae al JSON del proyecto. */
export function getFirebaseConfig(): DomiFirebaseConfig {
  return {
    apiKey: readEnv('VITE_FIREBASE_API_KEY') || fallback.apiKey,
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || fallback.authDomain,
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

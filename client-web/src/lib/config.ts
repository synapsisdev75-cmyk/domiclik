import { Capacitor } from '@capacitor/core';

export const API_URL = (import.meta.env.VITE_DOMICLICK_API_URL || 'http://localhost:8787').replace(
  /\/$/,
  '',
);

export const INGEST_TOKEN =
  import.meta.env.VITE_DOMICLICK_INGEST_TOKEN || 'domiclick-dev-ingest-token';

export const SITE_ID = import.meta.env.VITE_DOMICLICK_SITE_ID || 'clientes-landing';

export const WHATSAPP = import.meta.env.VITE_DOMICLICK_WHATSAPP || '573001234567';

export const PHONE = import.meta.env.VITE_DOMICLICK_PHONE || '+573001234567';

export const WHATSAPP_URL = `https://wa.me/${WHATSAPP.replace(/\D/g, '')}`;

/** Vacío = badge “Próximamente”. Cuando tengas el link, pégalo aquí o en VITE_PLAY_STORE_URL. */
export const PLAY_STORE_URL = String(import.meta.env.VITE_PLAY_STORE_URL || '').trim();

/** Vacío = badge “Próximamente”. Cuando tengas el link, pégalo aquí o en VITE_APP_STORE_URL. */
export const APP_STORE_URL = String(import.meta.env.VITE_APP_STORE_URL || '').trim();

export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  '';

export const GOOGLE_MAPS_MAP_ID =
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '7959bb6afa37dd5e9db669a8';

const OPS_PRODUCTION = 'https://domiclick-ops.web.app';

function isLocalHostName(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function isLocalOpsUrl(url: string): boolean {
  try {
    return isLocalHostName(new URL(url).hostname);
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/**
 * Torre de control (ops).
 * En Capacitor el WebView usa hostname "localhost" — NUNCA redirigir a ops local
 * desde la app instalada (Play/APK); eso abre localhost:3000 en el teléfono y falla.
 */
export function opsTowerUrl() {
  const fromEnv = String(import.meta.env.VITE_OPS_URL || '').replace(/\/$/, '');

  let native = false;
  try {
    native = Capacitor.isNativePlatform();
  } catch {
    native = false;
  }

  if (native) {
    if (fromEnv && !isLocalOpsUrl(fromEnv)) return fromEnv;
    return OPS_PRODUCTION;
  }

  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined' && isLocalHostName(window.location.hostname)) {
    return 'http://localhost:3000';
  }

  return OPS_PRODUCTION;
}

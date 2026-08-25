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

export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  '';

export const GOOGLE_MAPS_MAP_ID =
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '7959bb6afa37dd5e9db669a8';

/** Torre de control (ops). ops.domiclick.com puede estar aún en el sitio de landing. */
export function opsTowerUrl() {
  const fromEnv = String(import.meta.env.VITE_OPS_URL || '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';
  }
  return 'https://domiclick-ops.web.app';
}

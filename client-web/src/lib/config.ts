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

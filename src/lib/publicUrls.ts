/**
 * URLs públicas que SÍ funcionan en iPhone/Safari y WhatsApp.
 * NO compartir domiclick.com hasta arreglar DNS en Hostinger (ver docs/DNS-DOMICLICK-IPHONE.md).
 */
export const OPS_PUBLIC_ORIGIN = 'https://domiclick-ops.web.app';
export const LANDING_PUBLIC_ORIGIN = 'https://gen-lang-client-0954482957.web.app';

export function opsPublicUrl(path = '/', params?: Record<string, string>): string {
  const url = new URL(path, OPS_PUBLIC_ORIGIN);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return url.toString();
}

export function mapWallPublicUrl(): string {
  return opsPublicUrl('/', { view: 'map-wall' });
}

export function landingPublicUrl(path = '/'): string {
  return new URL(path, LANDING_PUBLIC_ORIGIN).toString();
}

/** true si el dominio actual puede fallar en iPhone (solo IPv6 o DNS roto). */
export function isUnreliableCustomDomain(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'domiclick.com' || host === 'ops.domiclick.com';
}

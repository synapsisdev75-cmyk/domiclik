/**
 * Landing en dominio propio (Firebase Hosting).
 * La torre usa domiclick-ops.web.app hasta que ops.domiclick.com esté estable.
 */
export const OPS_PUBLIC_ORIGIN = 'https://domiclick-ops.web.app';
export const LANDING_PUBLIC_ORIGIN = 'https://domiclick.com';

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
  return host === 'ops.domiclick.com';
}

/** URL estable para admins en iPhone (evita ops.domiclick.com si el DNS falla). */
export function opsAdminLoginUrl(): string {
  return 'https://domiclick-ops.web.app/?role=admin';
}

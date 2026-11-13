import { Capacitor } from '@capacitor/core';

const LANDING = 'https://gen-lang-client-0954482957.web.app';
const FUNCTIONS = 'https://us-central1-gen-lang-client-0954482957.cloudfunctions.net';

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Siempre Cloud Functions: el rewrite /api a veces no entrega la llave pública. */
export function wompiCheckoutEndpoint() {
  return `${FUNCTIONS}/createWompiCheckout`;
}

export function paymentReturnOrigin() {
  if (isNative()) return LANDING;
  if (typeof window === 'undefined') return LANDING;
  if (/localhost|127\.0\.0\.1/i.test(window.location.hostname)) return LANDING;
  return window.location.origin.replace(/\/$/, '');
}

function isUsableCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'checkout.wompi.co') return false;
    if (parsed.pathname.startsWith('/l/') && parsed.pathname.length > 3) return true;
    const key = parsed.searchParams.get('public-key') || '';
    if (!key || key === 'undefined' || key === 'null') return false;
    return /^pub_(test|prod)_/i.test(key);
  } catch {
    return false;
  }
}

export async function openWompiCheckout(orderId: string): Promise<void> {
  const res = await fetch(wompiCheckoutEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, returnOrigin: paymentReturnOrigin() }),
  });
  let data: { checkoutUrl?: string; error?: string } = {};
  try {
    data = (await res.json()) as { checkoutUrl?: string; error?: string };
  } catch {
    throw new Error('La pasarela no respondió. Inténtalo de nuevo en unos segundos.');
  }
  if (!res.ok || !data.checkoutUrl || !isUsableCheckoutUrl(data.checkoutUrl)) {
    if (data.error === 'wompi_not_configured') {
      throw new Error(
        'La pasarela aún no tiene las credenciales de producción. Sube el comprobante o espera a Central.',
      );
    }
    if (data.error === 'already_paid') {
      throw new Error('Este pedido ya tiene el pago confirmado.');
    }
    if (data.error === 'invalid_amount') {
      throw new Error('El valor del domicilio no es válido para la pasarela.');
    }
    throw new Error('No se pudo abrir Wompi. Revisa que el pedido exista y vuelve a intentar.');
  }
  window.location.assign(data.checkoutUrl);
}

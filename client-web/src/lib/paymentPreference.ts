/** Preferencia de pago del cliente en este dispositivo (hasta borrar caché / datos del sitio). */

export type SavedPaymentMethod = 'efectivo' | 'transferencia';

const KEY = 'domiclick_payment_preference_v1';

export function readPaymentPreference(): SavedPaymentMethod | '' {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'efectivo' || raw === 'transferencia') return raw;
  } catch {
    /* ignore */
  }
  return '';
}

export function writePaymentPreference(method: SavedPaymentMethod): void {
  try {
    localStorage.setItem(KEY, method);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearPaymentPreference(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function paymentPreferenceLabel(method: SavedPaymentMethod | ''): string {
  if (method === 'efectivo') return 'Pago contraentrega (efectivo)';
  if (method === 'transferencia') return 'Pago en línea (Wompi)';
  return 'Sin preferencia guardada';
}

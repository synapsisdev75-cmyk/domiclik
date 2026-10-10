/** Abrir WhatsApp (Colombia) desde ops / torre. */

export function normalizeCoPhone(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('57') && digits.length >= 12) return digits;
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

export function openWhatsAppTo(phone?: string, text?: string): void {
  const n = normalizeCoPhone(phone);
  if (!n) return;
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  window.open(`https://wa.me/${n}${q}`, '_blank', 'noopener,noreferrer');
}

export function customerOrderWhatsAppText(order: {
  trackingCode?: string;
  customerName?: string;
}): string {
  const name = order.customerName?.trim() || 'cliente';
  const code = order.trackingCode || '';
  return `Hola ${name}, te escribimos de DomiClick${code ? ` por el pedido ${code}` : ''}.`;
}

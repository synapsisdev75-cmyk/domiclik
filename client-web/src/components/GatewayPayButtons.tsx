import { useState } from 'react';
import { CreditCard, Loader2, QrCode } from 'lucide-react';
import { openWompiCheckout } from '../lib/wompiCheckout';

export function GatewayPayButtons({
  orderId,
  amountCop,
}: {
  orderId: string;
  amountCop?: number | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setErr(null);
    try {
      await openWompiCheckout(orderId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo abrir la pasarela');
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 rounded-xl border border-[rgba(0,229,255,0.28)] bg-[rgba(0,229,255,0.07)] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-cyan)]">
        Paga ahora
      </p>
      <p className="text-sm text-[var(--domi-muted)]">
        Abrimos Wompi con el valor del domicilio, tu correo y teléfono. Ahí eliges QR, PSE o
        tarjeta. Al terminar vuelves a este seguimiento.
        {amountCop ? ` Valor: ${amountCop.toLocaleString('es-CO')} COP.` : ''}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="cta-primary !py-2.5 text-sm" disabled={busy} onClick={() => void pay()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          Pagar con QR
        </button>
        <button type="button" className="cta-ghost !py-2.5 text-sm" disabled={busy} onClick={() => void pay()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          PSE o tarjeta
        </button>
      </div>
      {err ? <p className="text-xs text-amber-700">{err}</p> : null}
    </div>
  );
}

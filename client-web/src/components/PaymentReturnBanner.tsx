import { GatewayPayButtons } from './GatewayPayButtons';
import type { PublicOrderTracking } from '../lib/firebase';

function isRejected(status?: string) {
  return status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED' || status === 'AMOUNT_MISMATCH';
}

export function PaymentReturnBanner({
  data,
  returning,
}: {
  data: PublicOrderTracking;
  returning?: boolean;
}) {
  if (data.transferChannel !== 'pasarela') return null;

  const approved =
    data.paymentReviewStatus === 'approved' || data.paymentGatewayStatus === 'APPROVED';
  const rejected = isRejected(data.paymentGatewayStatus);

  if (approved) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
        <p className="font-bold text-white">Pago exitoso</p>
        <p className="mt-1">
          Tu transferencia quedó aprobada
          {data.amountPaid ? ` · $${data.amountPaid.toLocaleString('es-CO')}` : ''}. El pedido ya
          puede asignarse.
        </p>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="mt-4 space-y-2">
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          <p className="font-bold text-white">Pago rechazado</p>
          <p className="mt-1">No se pudo completar la transferencia. Intenta de nuevo.</p>
        </div>
        <GatewayPayButtons orderId={data.orderId} amountCop={data.shippingFee} />
      </div>
    );
  }

  if (data.paymentReviewStatus !== 'pending_review') return null;

  return (
    <div className="mt-4 space-y-2">
      <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
        {returning
          ? 'Estamos confirmando tu pago. En unos segundos verás si quedó exitoso o rechazado.'
          : 'Paga en la pasarela. Al terminar, Wompi te devuelve aquí con el resultado.'}
      </div>
      <GatewayPayButtons orderId={data.orderId} amountCop={data.shippingFee} />
    </div>
  );
}

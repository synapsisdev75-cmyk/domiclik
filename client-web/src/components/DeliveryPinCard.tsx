import { KeyRound } from 'lucide-react';

export function DeliveryPinCard({
  code,
  status,
  sticky = false,
}: {
  code?: string | null;
  status?: string;
  sticky?: boolean;
}) {
  if (!code || status === 'delivered' || status === 'cancelled') return null;
  return (
    <div
      className={`${
        sticky ? 'sticky top-0 z-20 ' : ''
      }rounded-2xl border border-[rgba(255,87,34,0.45)] bg-[rgba(255,87,34,0.12)] px-4 py-4 text-center shadow-[0_8px_24px_rgba(0,0,0,0.35)]`}
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--domi-orange)]">
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
        PIN de entrega
      </p>
      <p className="font-mono mt-2 text-3xl font-bold tracking-[0.35em] text-white">{code}</p>
      <p className="mt-2 text-xs text-[var(--domi-muted)]">
        Permanece visible hasta entregar o cancelar. Dáselo solo al repartidor.
      </p>
    </div>
  );
}

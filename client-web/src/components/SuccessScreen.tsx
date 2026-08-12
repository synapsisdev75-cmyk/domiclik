import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, KeyRound, Radar } from 'lucide-react';
import { useState } from 'react';
import type { IngestOrderResponse } from '../contracts/salesIngest';

interface SuccessScreenProps {
  result: IngestOrderResponse;
  onNewRequest: () => void;
}

export function SuccessScreen({ result, onNewRequest }: SuccessScreenProps) {
  const [copiedTrack, setCopiedTrack] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  async function copyText(value: string, kind: 'track' | 'pin') {
    try {
      await navigator.clipboard.writeText(value);
      if (kind === 'track') {
        setCopiedTrack(true);
        window.setTimeout(() => setCopiedTrack(false), 1800);
      } else {
        setCopiedPin(true);
        window.setTimeout(() => setCopiedPin(false), 1800);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="glass-panel animate-fade-up rounded-2xl p-6 sm:p-8">
      <div className="mb-5 flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-[var(--domi-green)]" aria-hidden />
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Solicitud recibida</h2>
          <p className="mt-1 text-sm text-[var(--domi-muted)]">
            Guarda el seguimiento y el PIN. El repartidor te pedirá el PIN al entregar.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.06)] px-4 py-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--domi-cyan)]">
          Código de seguimiento
        </p>
        <p className="font-mono mt-2 text-3xl font-bold tracking-wider text-white sm:text-4xl">
          {result.trackingCode}
        </p>
        <button
          type="button"
          onClick={() => void copyText(result.trackingCode, 'track')}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-white"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copiedTrack ? 'Copiado' : 'Copiar código'}
        </button>
      </div>

      {result.deliveryConfirmCode ? (
        <div className="mt-4 rounded-xl border border-[rgba(255,87,34,0.35)] bg-[rgba(255,87,34,0.08)] px-4 py-5 text-center">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--domi-orange)]">
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            PIN de entrega
          </p>
          <p className="font-mono mt-2 text-3xl font-bold tracking-[0.35em] text-white sm:text-4xl">
            {result.deliveryConfirmCode}
          </p>
          <p className="mt-2 text-xs text-[var(--domi-muted)]">
            Dáselo solo al repartidor cuando llegue. Sin este PIN no se marca entrega exitosa.
          </p>
          <button
            type="button"
            onClick={() => void copyText(result.deliveryConfirmCode, 'pin')}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-white"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {copiedPin ? 'Copiado' : 'Copiar PIN'}
          </button>
        </div>
      ) : null}

      {(result.shippingFee || result.scheduledFor) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {result.shippingFee ? (
            <div className="rounded-xl border border-[rgba(0,230,118,0.25)] bg-[rgba(0,230,118,0.06)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-green)]">
                Tarifa estimada
              </p>
              <p className="mt-1 text-xl font-bold text-white">
                {new Intl.NumberFormat('es-CO', {
                  style: 'currency',
                  currency: 'COP',
                  maximumFractionDigits: 0,
                }).format(result.shippingFee)}
              </p>
              {result.routeDistanceKm ? (
                <p className="mt-1 text-xs text-[var(--domi-muted)]">
                  {result.routeDistanceKm} km
                  {result.pricingBand === 'peak' ? ' · hora pico' : ' · hora normal'}
                </p>
              ) : null}
            </div>
          ) : null}
          {result.scheduledFor ? (
            <div className="rounded-xl border border-[var(--domi-border)] bg-[rgba(5,8,15,0.45)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
                Entrega programada
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {new Date(result.scheduledFor).toLocaleString('es-CO', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={`/seguimiento/${result.trackingCode}`} className="cta-primary">
          <Radar className="h-4 w-4" aria-hidden />
          Ver seguimiento
        </Link>
        <button type="button" className="cta-ghost" onClick={onNewRequest}>
          Nueva solicitud
        </button>
      </div>
    </div>
  );
}

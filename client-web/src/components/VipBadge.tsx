/** Etiqueta VIP verde — cabina del transportista. */
export function VipBadge({
  className = '',
  size = 'sm',
  withSurcharge,
}: {
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  withSurcharge?: number;
}) {
  const pad =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[9px]'
      : size === 'md'
        ? 'px-2.5 py-1 text-[11px]'
        : 'px-2 py-0.5 text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md border border-emerald-400/55 bg-emerald-500/20 font-black uppercase tracking-wide text-emerald-300 ${pad} ${className}`}
      title="Pedido VIP · prioridad 1"
    >
      VIP
      {typeof withSurcharge === 'number' && withSurcharge > 0
        ? ` +$${withSurcharge.toLocaleString('es-CO')}`
        : ''}
    </span>
  );
}

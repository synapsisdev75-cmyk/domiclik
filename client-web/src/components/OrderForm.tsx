import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, Loader2, MapPinned, Navigation, Package } from 'lucide-react';
import { submitOrder } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  estimateRoute,
  geocodeAddress,
  reverseGeocode,
  type LatLng,
} from '../lib/geo';
import {
  computeShippingQuote,
  formatCOP,
  MIN_SHIPPING_FEE_COP,
  parseDatetimeLocal,
  scheduleWindow,
  toDatetimeLocalValue,
  validateScheduledFor,
  type ShippingQuote,
} from '../lib/pricing';
import type { IngestOrderResponse } from '../contracts/salesIngest';
import { RouteMapPicker, type MapPickMode } from './RouteMapPicker';

export type OrderFormValues = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  pickupAddress: string;
  deliveryAddress: string;
  description: string;
  declaredValue: string;
  notes: string;
  scheduledFor: string;
};

const INITIAL: OrderFormValues = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  pickupAddress: '',
  deliveryAddress: '',
  description: '',
  declaredValue: '',
  notes: '',
  scheduledFor: '',
};

interface OrderFormProps {
  onSuccess: (result: IngestOrderResponse) => void;
}

export function OrderForm({ onSuccess }: OrderFormProps) {
  const { profile, signIn, setPhone, loading: authLoading } = useAuth();
  const [values, setValues] = useState<OrderFormValues>(() => {
    const { min } = scheduleWindow();
    return { ...INITIAL, scheduledFor: toDatetimeLocalValue(min) };
  });
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [delivery, setDelivery] = useState<LatLng | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [routeKm, setRouteKm] = useState(0);
  const [routeMin, setRouteMin] = useState(0);
  const [pickMode, setPickMode] = useState<MapPickMode>('pickup');
  const [geoBusy, setGeoBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whenForPrice = useMemo(() => {
    return parseDatetimeLocal(values.scheduledFor) || new Date();
  }, [values.scheduledFor]);

  const quote: ShippingQuote | null = useMemo(() => {
    if (!pickup || !delivery || routeKm <= 0) return null;
    return computeShippingQuote(routeKm, whenForPrice);
  }, [pickup, delivery, routeKm, whenForPrice]);

  const scheduleBounds = useMemo(() => scheduleWindow(), []);

  useEffect(() => {
    if (!profile) return;
    setValues((prev) => ({
      ...prev,
      customerName: prev.customerName || profile.displayName || '',
      customerEmail: prev.customerEmail || profile.email || '',
      customerPhone: prev.customerPhone || profile.phone || '',
    }));
  }, [profile]);

  const refreshRoute = useCallback(async (from: LatLng, to: LatLng) => {
    setGeoBusy(true);
    try {
      const est = await estimateRoute(from, to);
      setPath(est.path);
      setRouteKm(est.distanceKm);
      setRouteMin(est.durationMin);
    } finally {
      setGeoBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!pickup || !delivery) {
      setPath([]);
      setRouteKm(0);
      setRouteMin(0);
      return;
    }
    void refreshRoute(pickup, delivery);
  }, [pickup, delivery, refreshRoute]);

  function update<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const onMapPick = useCallback(
    async (point: LatLng) => {
      if (!pickMode) return;
      setGeoBusy(true);
      try {
        const label = await reverseGeocode(point.lat, point.lng);
        if (pickMode === 'pickup') {
          setPickup(point);
          update('pickupAddress', label);
          setPickMode('delivery');
        } else {
          setDelivery(point);
          update('deliveryAddress', label);
          setPickMode(null);
        }
      } finally {
        setGeoBusy(false);
      }
    },
    [pickMode],
  );

  async function geocodeField(kind: 'pickup' | 'delivery') {
    const text = kind === 'pickup' ? values.pickupAddress : values.deliveryAddress;
    setError(null);
    setGeoBusy(true);
    try {
      const hit = await geocodeAddress(text);
      if (!hit) {
        setError(`No encontramos esa dirección. Márcala en el mapa (${kind === 'pickup' ? 'partida' : 'entrega'}).`);
        return;
      }
      if (kind === 'pickup') {
        setPickup({ lat: hit.lat, lng: hit.lng });
        update('pickupAddress', hit.label);
      } else {
        setDelivery({ lat: hit.lat, lng: hit.lng });
        update('deliveryAddress', hit.label);
      }
    } finally {
      setGeoBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!pickup || !delivery) {
      setError('Marca en el mapa la partida (A) y la entrega (B), o busca las direcciones.');
      return;
    }
    if (!quote) {
      setError('Espera a que se calcule la tarifa de la ruta.');
      return;
    }

    const scheduleErr = validateScheduledFor(values.scheduledFor);
    if (scheduleErr) {
      setError(scheduleErr);
      return;
    }

    setSubmitting(true);
    try {
      const declared = values.declaredValue.trim()
        ? Number(values.declaredValue.replace(/[^\d.]/g, ''))
        : undefined;

      if (declared !== undefined && (Number.isNaN(declared) || declared < 0)) {
        throw new Error('El valor declarado debe ser un número válido');
      }

      const phone = values.customerPhone.trim();
      await setPhone(phone);

      const scheduled = parseDatetimeLocal(values.scheduledFor)!;

      const result = await submitOrder({
        customerName: values.customerName.trim(),
        customerPhone: phone,
        customerEmail: values.customerEmail.trim() || undefined,
        pickupAddress: values.pickupAddress.trim(),
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        deliveryAddress: values.deliveryAddress.trim(),
        deliveryLat: delivery.lat,
        deliveryLng: delivery.lng,
        description: values.description.trim() || undefined,
        notes: values.notes.trim() || undefined,
        declaredValue: declared,
        customerUid: profile?.uid,
        customerPhotoURL: profile?.photoURL || undefined,
        shippingFee: quote.shippingFee,
        routeDistanceKm: quote.distanceKm,
        routeDurationMin: routeMin,
        pricingBand: quote.band,
        pricePerKm: quote.pricePerKm,
        peakMultiplier: quote.multiplier,
        scheduledFor: scheduled.toISOString(),
      });

      const { min } = scheduleWindow();
      setValues({
        ...INITIAL,
        customerName: profile?.displayName || '',
        customerEmail: profile?.email || '',
        customerPhone: phone,
        scheduledFor: toDatetimeLocalValue(min),
      });
      setPickup(null);
      setDelivery(null);
      setPath([]);
      setPickMode('pickup');
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel rounded-2xl p-6 sm:p-8" noValidate>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(255,87,34,0.12)] text-[var(--domi-orange)]">
            <Package className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Solicitar entrega</h2>
            <p className="mt-1 text-sm text-[var(--domi-muted)]">
              Marca partida y entrega en el mapa. Tarifa: $2.300 COP/km (hora pico +35%).
            </p>
          </div>
        </div>

        {!profile && !authLoading ? (
          <button
            type="button"
            onClick={() => void signIn()}
            className="cta-ghost shrink-0 self-start text-sm"
          >
            Usar mi Google
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-1">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Nombre completo *
          </span>
          <input
            className="field-input"
            required
            value={values.customerName}
            onChange={(e) => update('customerName', e.target.value)}
            placeholder="Ana Pérez"
          />
        </label>

        <label className="block sm:col-span-1">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Teléfono *
          </span>
          <input
            className="field-input"
            type="tel"
            required
            value={values.customerPhone}
            onChange={(e) => update('customerPhone', e.target.value)}
            placeholder="300 123 4567"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Email
          </span>
          <input
            className="field-input"
            type="email"
            value={values.customerEmail}
            onChange={(e) => update('customerEmail', e.target.value)}
            placeholder="ana@correo.com"
            readOnly={Boolean(profile?.email)}
          />
        </label>

        <div className="sm:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <MapPinned className="h-4 w-4 text-[var(--domi-cyan)]" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              Ruta en el mapa
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  pickMode === 'pickup'
                    ? 'bg-[var(--domi-blue)] text-white'
                    : 'bg-white/5 text-[var(--domi-muted)]'
                }`}
                onClick={() => setPickMode('pickup')}
              >
                Marcar partida (A)
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  pickMode === 'delivery'
                    ? 'bg-[var(--domi-orange)] text-white'
                    : 'bg-white/5 text-[var(--domi-muted)]'
                }`}
                onClick={() => setPickMode('delivery')}
              >
                Marcar entrega (B)
              </button>
            </div>
          </div>

          <RouteMapPicker
            pickup={pickup}
            delivery={delivery}
            path={path}
            pickMode={pickMode}
            onPick={(p) => void onMapPick(p)}
          />

          {pickup && delivery ? (
            <p className="rounded-xl border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.06)] px-3 py-2 text-sm text-white">
              <span className="font-semibold text-[var(--domi-cyan)]">De:</span>{' '}
              {values.pickupAddress || 'Partida'}
              <br />
              <span className="font-semibold text-[var(--domi-orange)]">A:</span>{' '}
              {values.deliveryAddress || 'Entrega'}
            </p>
          ) : (
            <p className="text-xs text-[var(--domi-muted)]">
              Toca el mapa para ubicar A (partida) y luego B (entrega). También puedes escribir la
              dirección y pulsar “Ubicar”.
            </p>
          )}
        </div>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Dirección de partida *
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="field-input"
              required
              value={values.pickupAddress}
              onChange={(e) => update('pickupAddress', e.target.value)}
              placeholder="Ej. C.C. Viva, Av. 40"
            />
            <button
              type="button"
              className="cta-ghost shrink-0"
              disabled={geoBusy || values.pickupAddress.trim().length < 4}
              onClick={() => void geocodeField('pickup')}
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Ubicar
            </button>
          </div>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Dirección de entrega *
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="field-input"
              required
              value={values.deliveryAddress}
              onChange={(e) => update('deliveryAddress', e.target.value)}
              placeholder="Calle 38 # 29-10, Barzal"
            />
            <button
              type="button"
              className="cta-ghost shrink-0"
              disabled={geoBusy || values.deliveryAddress.trim().length < 4}
              onClick={() => void geocodeField('delivery')}
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Ubicar
            </button>
          </div>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Programar entrega (hasta 15 días) *
          </span>
          <input
            className="field-input"
            type="datetime-local"
            required
            value={values.scheduledFor}
            min={toDatetimeLocalValue(scheduleBounds.min)}
            max={toDatetimeLocalValue(scheduleBounds.max)}
            onChange={(e) => update('scheduledFor', e.target.value)}
          />
          <span className="mt-1 block text-[11px] text-[var(--domi-muted)]">
            La tarifa usa hora pico/normal según esta fecha (zona Bogotá).
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Qué enviamos *
          </span>
          <textarea
            className="field-input min-h-[96px] resize-y"
            required
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Documentos, paquete pequeño, compra de farmacia…"
          />
        </label>

        <label className="block sm:col-span-1">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Valor declarado (COP)
          </span>
          <input
            className="field-input"
            inputMode="numeric"
            value={values.declaredValue}
            onChange={(e) => update('declaredValue', e.target.value)}
            placeholder="45000"
          />
        </label>

        <label className="block sm:col-span-1">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Notas
          </span>
          <input
            className="field-input"
            value={values.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Portería, referencia…"
          />
        </label>
      </div>

      {quote ? (
        <div className="mt-5 rounded-xl border border-[rgba(0,230,118,0.3)] bg-[rgba(0,230,118,0.08)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-green)]">
            Cotización de envío
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold text-white">
            {formatCOP(quote.shippingFee)}
          </p>
          <p className="mt-1 text-sm text-[var(--domi-muted)]">
            {quote.formula}
            {geoBusy ? ' · recalculando…' : ` · ~${routeMin} min`}
          </p>
          <p className="mt-1 text-xs text-[var(--domi-muted)]">
            Bandera: <span className="text-white">{quote.label}</span> · Mínimo{' '}
            {formatCOP(MIN_SHIPPING_FEE_COP)}
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button type="submit" className="cta-primary mt-6 w-full sm:w-auto" disabled={submitting || geoBusy}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Enviando…
          </>
        ) : (
          'Confirmar solicitud'
        )}
      </button>
    </form>
  );
}

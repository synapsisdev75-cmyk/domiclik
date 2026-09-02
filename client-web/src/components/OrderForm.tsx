import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Loader2, Package } from 'lucide-react';
import { submitOrder } from '../lib/api';
import { useAuth } from '../lib/auth';
import { uploadInvoicePhoto } from '../lib/firebase';
import {
  estimateRoute,
  estimateRouteWithGoogle,
  reverseGeocode,
  coordsTooClose,
  type LatLng,
} from '../lib/geo';
import {
  findBlockedZoneAt,
  isServiceBlockedAt,
  SERVICE_BLOCKED_MESSAGE,
} from '../lib/riskZones';
import {
  computeShippingQuote,
  estimateTravelMinutes,
  formatCOP,
  MIN_SCHEDULE_LEAD_MIN,
  parseDatetimeLocal,
  resolveScheduledFor,
  scheduleWindow,
  toDatetimeLocalValue,
  validateScheduledFor,
  type ShippingQuote,
} from '../lib/pricing';
import type { IngestOrderResponse } from '../contracts/salesIngest';
import { MapRouteSection } from './MapRouteSection';
import type { MapPickMode } from './RouteMapPicker';

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
  invoiceNumber: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'ya_pagado' | 'otro';
  paymentNote: string;
  couponCode: string;
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
  invoiceNumber: '',
  paymentMethod: 'efectivo',
  paymentNote: '',
  couponCode: '',
};

interface OrderFormProps {
  onSuccess: (result: IngestOrderResponse) => void;
}

function coordsKey(p: LatLng) {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
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
  const [, setRouteMin] = useState(0);
  const [pickMode, setPickMode] = useState<MapPickMode>('pickup');
  const [geoBusy, setGeoBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [coverageNotice, setCoverageNotice] = useState<string | null>(null);

  const routeGenRef = useRef(0);
  const googleRetryRef = useRef<number | null>(null);
  const pickupRef = useRef<LatLng | null>(null);
  const deliveryRef = useRef<LatLng | null>(null);
  const draggingRef = useRef(false);

  const whenForPrice = useMemo(() => {
    return parseDatetimeLocal(values.scheduledFor) || new Date();
  }, [values.scheduledFor]);

  const quote: ShippingQuote | null = useMemo(() => {
    if (!pickup || !delivery || routeKm <= 0) return null;
    return computeShippingQuote(routeKm, whenForPrice);
  }, [pickup, delivery, routeKm, whenForPrice]);

  /** Minutos mínimos para programar = viaje (km÷60|75) + buffer. */
  const scheduleLeadMin = useMemo(() => {
    if (routeKm <= 0) return estimateTravelMinutes(0).totalMin || 5;
    return estimateTravelMinutes(routeKm, new Date()).totalMin;
  }, [routeKm]);

  const scheduleBounds = useMemo(
    () => scheduleWindow(new Date(), scheduleLeadMin),
    [scheduleLeadMin],
  );

  // Mantener la hora programada al menos en el lead (ETA) calculado
  useEffect(() => {
    const { min } = scheduleBounds;
    const current = parseDatetimeLocal(values.scheduledFor);
    if (!current || current.getTime() < min.getTime()) {
      setValues((prev) => ({ ...prev, scheduledFor: toDatetimeLocalValue(min) }));
    }
  }, [scheduleBounds.min.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mostrar ETA operativo (no el de Google/OSRM)
  useEffect(() => {
    if (quote?.durationMin) setRouteMin(quote.durationMin);
  }, [quote?.durationMin]);

  useEffect(() => {
    pickupRef.current = pickup;
    deliveryRef.current = delivery;
  }, [pickup, delivery]);

  useEffect(() => {
    const blockedPickup = pickup ? findBlockedZoneAt(pickup.lat, pickup.lng) : null;
    const blockedDelivery = delivery ? findBlockedZoneAt(delivery.lat, delivery.lng) : null;
    setCoverageNotice(blockedPickup || blockedDelivery ? SERVICE_BLOCKED_MESSAGE : null);
  }, [pickup, delivery]);

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
    const gen = ++routeGenRef.current;
    if (googleRetryRef.current != null) {
      window.clearTimeout(googleRetryRef.current);
      googleRetryRef.current = null;
    }

    setGeoBusy(true);
    setPath([]);
    setRouteKm(0);
    setRouteMin(0);

    try {
      const est = await estimateRoute(from, to);
      if (gen !== routeGenRef.current) return;
      if (
        !pickupRef.current ||
        !deliveryRef.current ||
        coordsKey(pickupRef.current) !== coordsKey(from) ||
        coordsKey(deliveryRef.current) !== coordsKey(to)
      ) {
        return;
      }

      setPath(est.path);
      setRouteKm(est.distanceKm);
      setRouteMin(est.durationMin);

      if (est.provider !== 'google') {
        googleRetryRef.current = window.setTimeout(() => {
          void estimateRouteWithGoogle(from, to).then((g) => {
            if (!g || g.path.length < 3) return;
            if (gen !== routeGenRef.current) return;
            if (
              !pickupRef.current ||
              !deliveryRef.current ||
              coordsKey(pickupRef.current) !== coordsKey(from) ||
              coordsKey(deliveryRef.current) !== coordsKey(to)
            ) {
              return;
            }
            setPath(g.path);
            setRouteKm(g.distanceKm);
            setRouteMin(g.durationMin);
          });
        }, 1200);
      }
    } finally {
      if (gen === routeGenRef.current) setGeoBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!pickup || !delivery) {
      setPath([]);
      setRouteKm(0);
      setRouteMin(0);
      return;
    }
    // Mientras se arrastra, solo mueve el pin; la ruta se calcula al soltar
    if (draggingRef.current) return;
    void refreshRoute(pickup, delivery);
    return () => {
      routeGenRef.current += 1;
      if (googleRetryRef.current != null) {
        window.clearTimeout(googleRetryRef.current);
        googleRetryRef.current = null;
      }
    };
  }, [pickup, delivery, refreshRoute]);

  function update<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const onMapPick = useCallback(
    (point: LatLng) => {
      if (!pickMode) return;
      draggingRef.current = false;
      setPath([]);
      if (pickMode === 'pickup') {
        setPickup(point);
        void reverseGeocode(point.lat, point.lng).then((label) => {
          setValues((prev) => ({ ...prev, pickupAddress: label }));
        });
      } else if (pickMode === 'delivery') {
        setDelivery(point);
        void reverseGeocode(point.lat, point.lng).then((label) => {
          setValues((prev) => ({ ...prev, deliveryAddress: label }));
        });
      }
    },
    [pickMode],
  );

  const onLiveDragPickup = useCallback((point: LatLng) => {
    draggingRef.current = true;
    setPath([]);
    setPickup(point);
  }, []);

  const onDragPickup = useCallback((point: LatLng) => {
    draggingRef.current = false;
    setPath([]);
    setPickup(point);
    void reverseGeocode(point.lat, point.lng).then((label) => {
      setValues((prev) => ({ ...prev, pickupAddress: label }));
    });
  }, []);

  const onLiveDragDelivery = useCallback((point: LatLng) => {
    draggingRef.current = true;
    setPath([]);
    setDelivery(point);
  }, []);

  const onDragDelivery = useCallback((point: LatLng) => {
    draggingRef.current = false;
    setPath([]);
    setDelivery(point);
    void reverseGeocode(point.lat, point.lng).then((label) => {
      setValues((prev) => ({ ...prev, deliveryAddress: label }));
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!profile) {
      setError('Debes iniciar sesión con Google para confirmar la solicitud.');
      return;
    }

    if (!pickup || !delivery) {
      setError('Marca en el mapa la recolección (A) y la entrega (B).');
      return;
    }
    if (isServiceBlockedAt(pickup.lat, pickup.lng) || isServiceBlockedAt(delivery.lat, delivery.lng)) {
      setError(SERVICE_BLOCKED_MESSAGE);
      return;
    }
    if (
      values.pickupAddress.trim().toLowerCase() === values.deliveryAddress.trim().toLowerCase()
    ) {
      setError('La recolección (A) y la entrega (B) deben ser direcciones diferentes.');
      return;
    }
    if (coordsTooClose(pickup, delivery)) {
      setError(
        'Los puntos A y B están muy cerca. Marca recolección y entrega en lugares distintos en el mapa.'
      );
      return;
    }
    if (!quote) {
      setError('Espera a que se calcule la tarifa de la ruta.');
      return;
    }

    const scheduleErr = validateScheduledFor(values.scheduledFor, new Date(), scheduleLeadMin);
    if (scheduleErr) {
      setError(scheduleErr);
      return;
    }

    const scheduled = resolveScheduledFor(values.scheduledFor, new Date(), scheduleLeadMin);
    if (!scheduled) {
      setError('Elige una fecha/hora de entrega válida (hasta 15 días).');
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
      if (!phone) {
        throw new Error('El teléfono es obligatorio');
      }
      await setPhone(phone);

      let invoicePhotoUrl: string | undefined;
      if (invoiceFile) {
        if (invoiceFile.size > 5 * 1024 * 1024) {
          throw new Error('La foto de factura no puede superar 5 MB');
        }
        invoicePhotoUrl = await uploadInvoicePhoto(invoiceFile);
      }

      const result = await submitOrder({
        customerName: values.customerName.trim(),
        customerPhone: phone,
        customerEmail: values.customerEmail.trim() || profile.email || undefined,
        pickupAddress: values.pickupAddress.trim(),
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        deliveryAddress: values.deliveryAddress.trim(),
        deliveryLat: delivery.lat,
        deliveryLng: delivery.lng,
        description: values.description.trim() || undefined,
        notes: values.notes.trim() || undefined,
        declaredValue: declared,
        customerUid: profile.uid,
        customerPhotoURL: profile.photoURL || undefined,
        shippingFee: quote.shippingFee,
        routeDistanceKm: quote.distanceKm,
        routeDurationMin: quote.durationMin,
        pricingBand: quote.band,
        pricePerKm: quote.pricePerKm,
        peakMultiplier: quote.multiplier,
        scheduledFor: scheduled.toISOString(),
        invoiceNumber: values.invoiceNumber.trim() || undefined,
        invoicePhotoUrl,
        paymentMethod: values.paymentMethod,
        paymentNote: values.paymentNote.trim() || undefined,
        couponCode: values.couponCode.trim() || undefined,
      });

      if (!result.trackingCode) {
        throw new Error('El pedido se creó pero no devolvió código de seguimiento');
      }

      const { min } = scheduleWindow(new Date(), MIN_SCHEDULE_LEAD_MIN);
      setValues({
        ...INITIAL,
        customerName: profile.displayName || '',
        customerEmail: profile.email || '',
        customerPhone: phone,
        scheduledFor: toDatetimeLocalValue(min),
        invoiceNumber: '',
        paymentMethod: 'efectivo',
        paymentNote: '',
        couponCode: '',
      });
      setInvoiceFile(null);
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
          </div>
        </div>

        {!profile && !authLoading ? (
          <button
            type="button"
            onClick={() => void signIn()}
            className="cta-primary shrink-0 self-start text-sm"
          >
            Iniciar sesión con Google
          </button>
        ) : null}
      </div>

      {!profile && !authLoading ? (
        <div
          className="mb-4 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100"
          role="status"
        >
          Debes iniciar sesión con Google para confirmar y recibir tu código de seguimiento (DMC-XXXX) y
          el PIN de entrega.
          <button
            type="button"
            className="ml-2 font-bold text-[var(--domi-cyan)] underline"
            onClick={() => void signIn()}
          >
            Entrar ahora
          </button>
        </div>
      ) : null}

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
            placeholder="Nombre completo"
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
            placeholder="Número de celular"
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
            placeholder="Correo electrónico"
            readOnly={Boolean(profile?.email)}
          />
        </label>

        <div className="sm:col-span-2">
          <MapRouteSection
            pickMode={pickMode}
            onPickModeChange={setPickMode}
            pickupAddress={values.pickupAddress}
            deliveryAddress={values.deliveryAddress}
            onPickupAddressChange={(v) => update('pickupAddress', v)}
            onDeliveryAddressChange={(v) => update('deliveryAddress', v)}
            onPickupPicked={(hit) => {
              draggingRef.current = false;
              setPath([]);
              setPickup({ lat: hit.lat, lng: hit.lng });
              update('pickupAddress', hit.label);
              setError(null);
            }}
            onDeliveryPicked={(hit) => {
              draggingRef.current = false;
              setPath([]);
              setDelivery({ lat: hit.lat, lng: hit.lng });
              update('deliveryAddress', hit.label);
              setError(null);
            }}
            pickup={pickup}
            delivery={delivery}
            path={path}
            geoBusy={geoBusy}
            onMapPick={onMapPick}
            onDragPickup={onDragPickup}
            onDragDelivery={onDragDelivery}
            onLiveDragPickup={onLiveDragPickup}
            onLiveDragDelivery={onLiveDragDelivery}
          />
          {coverageNotice ? (
            <p
              className="mt-3 rounded-xl border border-slate-600/40 bg-slate-800/30 px-3.5 py-2.5 text-sm text-slate-300 leading-relaxed"
              role="status"
            >
              {coverageNotice}
            </p>
          ) : null}
        </div>

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
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Número de factura o orden de compra *
          </span>
          <input
            className="field-input"
            required
            value={values.invoiceNumber}
            onChange={(e) => update('invoiceNumber', e.target.value)}
            placeholder="Ej. FAC-1024 / número de pedido del restaurante"
          />
          <span className="mt-1 block text-[11px] text-[var(--domi-muted)]">
            El repartidor lo valida en el establecimiento.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Foto de factura (opcional)
          </span>
          <input
            className="field-input file:mr-3 file:rounded-md file:border-0 file:bg-[rgba(0,229,255,0.15)] file:px-3 file:py-1 file:text-xs file:text-white"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
          />
          {invoiceFile ? (
            <span className="mt-1 block text-[11px] text-[var(--domi-green)]">
              Archivo: {invoiceFile.name}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Forma de pago *
          </span>
          <select
            className="field-input"
            required
            value={values.paymentMethod}
            onChange={(e) =>
              update(
                'paymentMethod',
                e.target.value as OrderFormValues['paymentMethod']
              )
            }
          >
            <option value="efectivo">Efectivo al recibir</option>
            <option value="transferencia">Transferencia</option>
            <option value="ya_pagado">Ya pagado en el negocio</option>
            <option value="otro">Otro</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Cupón (opcional)
          </span>
          <input
            className="field-input uppercase"
            value={values.couponCode}
            onChange={(e) => update('couponCode', e.target.value.toUpperCase())}
            placeholder="Código promocional"
            autoComplete="off"
          />
        </label>

        {values.paymentMethod === 'transferencia' || values.paymentMethod === 'otro' ? (
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              Detalle de pago
            </span>
            <input
              className="field-input"
              value={values.paymentNote}
              onChange={(e) => update('paymentNote', e.target.value)}
              placeholder="Banco, referencia o aclaración"
            />
          </label>
        ) : null}

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

        <label className="block sm:col-span-2">
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

      <button
        type="submit"
        className="cta-primary mt-6 w-full sm:w-auto"
        disabled={submitting || geoBusy || authLoading || Boolean(coverageNotice)}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Enviando…
          </>
        ) : !profile ? (
          'Inicia sesión para confirmar'
        ) : (
          'Confirmar solicitud'
        )}
      </button>
    </form>
  );
}

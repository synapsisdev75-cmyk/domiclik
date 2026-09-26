import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Loader2, Package } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
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
import {
  EMPTY_ADDRESS_PARTS,
  addressHasRoad,
  composeFullAddress,
  partsFromFullAddress,
  type AddressParts,
} from '../lib/addressParts';
import { MapRouteSection } from './MapRouteSection';
import type { MapPickMode } from './RouteMapPicker';

const TIPO_DESC: Record<string, string> = {
  comida: 'Comida / domicilio de restaurante',
  paquetes: 'Paquete / encomienda',
  compras: 'Compras / mandado',
  otros: 'Otro envío',
};

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
  /** Flujo app: mapa primero → detalles → enviar */
  wizard?: boolean;
}

function coordsKey(p: LatLng) {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

export function OrderForm({ onSuccess, wizard = false }: OrderFormProps) {
  const { profile, signIn, setPhone, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<'map' | 'details'>('map');
  const [values, setValues] = useState<OrderFormValues>(() => {
    const { min } = scheduleWindow();
    const tipo = searchParams.get('tipo') || '';
    return {
      ...INITIAL,
      scheduledFor: toDatetimeLocalValue(min),
      description: TIPO_DESC[tipo] || '',
    };
  });
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [delivery, setDelivery] = useState<LatLng | null>(null);
  const [pickupParts, setPickupParts] = useState<AddressParts>({ ...EMPTY_ADDRESS_PARTS });
  const [deliveryParts, setDeliveryParts] = useState<AddressParts>({ ...EMPTY_ADDRESS_PARTS });
  const [pickupMapAnchored, setPickupMapAnchored] = useState(false);
  const [deliveryMapAnchored, setDeliveryMapAnchored] = useState(false);
  const [path, setPath] = useState<LatLng[]>([]);
  const [routeKm, setRouteKm] = useState(0);
  const [, setRouteMin] = useState(0);
  const [pickMode, setPickMode] = useState<MapPickMode>('pickup');
  const [geoBusy, setGeoBusy] = useState(false);
  const [pinDragging, setPinDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedMarketing, setAcceptedMarketing] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  /** now = entrega inmediata (ETA por ruta). later = fecha/hora elegida por el usuario. */
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');

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

  /** Minutos ETA (viaje + buffer) según distancia actual. */
  const scheduleLeadMin = useMemo(() => {
    if (routeKm <= 0) return estimateTravelMinutes(0).totalMin || MIN_SCHEDULE_LEAD_MIN;
    return estimateTravelMinutes(routeKm, new Date()).totalMin;
  }, [routeKm]);

  /** Para ya: mínimo = ahora + ETA. Programar: mínimo = ahora + 5 min, máximo 15 días. */
  const scheduleBounds = useMemo(() => {
    const lead =
      scheduleMode === 'now' ? scheduleLeadMin : MIN_SCHEDULE_LEAD_MIN;
    return scheduleWindow(new Date(), lead);
  }, [scheduleLeadMin, scheduleMode]);

  useEffect(() => {
    // Solo en «Para ya»: la hora se recalcula con la ruta (ETA).
    if (scheduleMode !== 'now') return;
    const { min } = scheduleBounds;
    setValues((prev) => {
      const current = parseDatetimeLocal(prev.scheduledFor);
      if (current && Math.abs(current.getTime() - min.getTime()) < 45_000) {
        return prev;
      }
      return { ...prev, scheduledFor: toDatetimeLocalValue(min) };
    });
  }, [scheduleMode, scheduleBounds.min.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mostrar ETA operativo (no el de Google/OSRM)
  useEffect(() => {
    if (quote?.durationMin) setRouteMin(quote.durationMin);
  }, [quote?.durationMin]);

  useEffect(() => {
    pickupRef.current = pickup;
    deliveryRef.current = delivery;
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
    // Mientras calcula, muestra al menos A→B para que no se vea el mapa “sin ruta”
    setPath([from, to]);
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
    if (draggingRef.current || pinDragging) return;
    void refreshRoute(pickup, delivery);
    return () => {
      routeGenRef.current += 1;
      if (googleRetryRef.current != null) {
        window.clearTimeout(googleRetryRef.current);
        googleRetryRef.current = null;
      }
    };
  }, [pickup, delivery, refreshRoute, pinDragging]);

  function update<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function applyPickupParts(parts: AddressParts) {
    setPickupParts(parts);
    update('pickupAddress', composeFullAddress(parts));
  }

  function applyDeliveryParts(parts: AddressParts) {
    setDeliveryParts(parts);
    update('deliveryAddress', composeFullAddress(parts));
  }

  const onMapPick = useCallback(
    (point: LatLng) => {
      if (!pickMode) return;
      draggingRef.current = false;
      setPinDragging(false);
      if (pickMode === 'pickup') {
        setPickup(point);
        setPickupMapAnchored(true);
        void reverseGeocode(point.lat, point.lng).then((label) => {
          setPickupParts((prev) => {
            const next = partsFromFullAddress(label, prev.general);
            setValues((v) => ({ ...v, pickupAddress: composeFullAddress(next) || label }));
            return next;
          });
        });
      } else if (pickMode === 'delivery') {
        setDelivery(point);
        setDeliveryMapAnchored(true);
        void reverseGeocode(point.lat, point.lng).then((label) => {
          setDeliveryParts((prev) => {
            const next = partsFromFullAddress(label, prev.general);
            setValues((v) => ({ ...v, deliveryAddress: composeFullAddress(next) || label }));
            return next;
          });
        });
      }
    },
    [pickMode],
  );

  const onDragStart = useCallback((which: 'pickup' | 'delivery') => {
    draggingRef.current = true;
    setPinDragging(true);
    setPickMode(which);
  }, []);

  const onDragPickup = useCallback((point: LatLng) => {
    draggingRef.current = false;
    setPinDragging(false);
    setPickMode('pickup');
    setPickup(point);
    setPickupMapAnchored(true);
    void reverseGeocode(point.lat, point.lng).then((label) => {
      setPickupParts((prev) => {
        const next = partsFromFullAddress(label, prev.general);
        setValues((v) => ({ ...v, pickupAddress: composeFullAddress(next) || label }));
        return next;
      });
    });
  }, []);

  const onDragDelivery = useCallback((point: LatLng) => {
    draggingRef.current = false;
    setPinDragging(false);
    setPickMode('delivery');
    setDelivery(point);
    setDeliveryMapAnchored(true);
    void reverseGeocode(point.lat, point.lng).then((label) => {
      setDeliveryParts((prev) => {
        const next = partsFromFullAddress(label, prev.general);
        setValues((v) => ({ ...v, deliveryAddress: composeFullAddress(next) || label }));
        return next;
      });
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!profile) {
      setError('Debes iniciar sesión con Google para confirmar la solicitud.');
      return;
    }
    if (!acceptedTerms) {
      setError(
        'Debes aceptar los Términos y autorizar el tratamiento de datos personales para confirmar el pedido.',
      );
      return;
    }

    if (!pickup || !delivery) {
      setError('Marca en el mapa la recolección (A) y la entrega (B).');
      return;
    }
    if (!addressHasRoad(pickupParts) || !addressHasRoad(deliveryParts)) {
      setError('Escribe o busca la dirección de recolección (A) y de entrega (B).');
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

    const leadForSubmit =
      scheduleMode === 'now' ? scheduleLeadMin : MIN_SCHEDULE_LEAD_MIN;
    const scheduleErr = validateScheduledFor(
      scheduleMode === 'now'
        ? toDatetimeLocalValue(scheduleWindow(new Date(), leadForSubmit).min)
        : values.scheduledFor,
      new Date(),
      leadForSubmit,
    );
    if (scheduleErr) {
      setError(scheduleErr);
      return;
    }

    const scheduled =
      scheduleMode === 'now'
        ? scheduleWindow(new Date(), leadForSubmit).min
        : resolveScheduledFor(values.scheduledFor, new Date(), leadForSubmit);
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
        if (invoiceFile.size > 25 * 1024 * 1024) {
          throw new Error('La foto de factura no puede superar 25 MB');
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
      setPickupParts({ ...EMPTY_ADDRESS_PARTS });
      setDeliveryParts({ ...EMPTY_ADDRESS_PARTS });
      setPickupMapAnchored(false);
      setDeliveryMapAnchored(false);
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
    <form
      onSubmit={handleSubmit}
      className={wizard ? 'space-y-4' : 'glass-panel rounded-2xl p-6 sm:p-8'}
      noValidate
    >
      {!wizard ? (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(255,87,34,0.12)] text-[var(--domi-orange)]">
              <Package className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-[var(--domi-text)]">Solicitar entrega</h2>
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
      ) : null}

      {wizard ? (
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
          <span className={step === 'map' ? 'text-[var(--domi-orange)]' : ''}>1 · Mapa</span>
          <span aria-hidden>→</span>
          <span className={step === 'details' ? 'text-[var(--domi-orange)]' : ''}>2 · Detalles</span>
        </div>
      ) : null}

      {!profile && !authLoading ? (
        <div
          className="mb-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-[var(--domi-text)]"
          role="status"
        >
          Inicia sesión con Google para confirmar y recibir tu código y PIN.
          <button
            type="button"
            className="ml-2 font-bold text-[var(--domi-cyan)] underline"
            onClick={() => void signIn()}
          >
            Entrar ahora
          </button>
        </div>
      ) : null}

      {(!wizard || step === 'details') && (
        <div className={`grid gap-4 ${wizard ? '' : 'sm:grid-cols-2'}`}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              Nombre *
            </span>
            <input
              className="field-input"
              required={step === 'details' || !wizard}
              value={values.customerName}
              onChange={(e) => update('customerName', e.target.value)}
              placeholder="Tu nombre"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              Teléfono *
            </span>
            <input
              className="field-input"
              type="tel"
              required={step === 'details' || !wizard}
              value={values.customerPhone}
              onChange={(e) => update('customerPhone', e.target.value)}
              placeholder="Celular"
            />
          </label>

          {!wizard ? (
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
          ) : null}
        </div>
      )}

      {(!wizard || step === 'map') && (
        <div className={wizard ? '' : 'mt-4'}>
          <MapRouteSection
            mapFirst={wizard}
            structured
            pickMode={pickMode}
            onPickModeChange={setPickMode}
            pickupParts={pickupParts}
            deliveryParts={deliveryParts}
            onPickupPartsChange={applyPickupParts}
            onDeliveryPartsChange={applyDeliveryParts}
            pickupAddress={values.pickupAddress}
            deliveryAddress={values.deliveryAddress}
            onPickupAddressChange={(v) => update('pickupAddress', v)}
            onDeliveryAddressChange={(v) => update('deliveryAddress', v)}
            onPickupPicked={(hit) => {
              draggingRef.current = false;
              setPinDragging(false);
              setPickMode('pickup');
              setPickup({ lat: hit.lat, lng: hit.lng });
              setError(null);
            }}
            onDeliveryPicked={(hit) => {
              draggingRef.current = false;
              setPinDragging(false);
              setPickMode('delivery');
              setDelivery({ lat: hit.lat, lng: hit.lng });
              setError(null);
            }}
            pickup={pickup}
            delivery={delivery}
            path={path}
            geoBusy={geoBusy}
            pinDragging={pinDragging}
            onMapPick={onMapPick}
            onDragPickup={onDragPickup}
            onDragDelivery={onDragDelivery}
            onDragStart={onDragStart}
            pickupMapAnchored={pickupMapAnchored}
            deliveryMapAnchored={deliveryMapAnchored}
            onUnlockPickupMapPin={() => setPickupMapAnchored(false)}
            onUnlockDeliveryMapPin={() => setDeliveryMapAnchored(false)}
          />
        </div>
      )}

      {wizard && step === 'map' ? (
        <button
          type="button"
          className="cta-primary w-full"
          disabled={!pickup || !delivery || geoBusy}
          onClick={() => {
            if (!pickup || !delivery) {
              setError('Marca recolección (A) y entrega (B) en el mapa.');
              return;
            }
            setError(null);
            setStep('details');
          }}
        >
          Continuar →
        </button>
      ) : null}

      {(!wizard || step === 'details') && (
        <div className={`grid gap-4 ${wizard ? 'mt-1' : 'mt-4 sm:grid-cols-2'}`}>
          {wizard && pickup && delivery ? (
            <div className="rounded-xl border border-[var(--domi-border)] bg-[var(--domi-panel)] px-3 py-3 text-sm">
              <p className="text-[var(--domi-cyan)]">
                <span className="font-semibold">A</span>{' '}
                {composeFullAddress(pickupParts) || 'Recolección'}
              </p>
              <p className="mt-1 text-[var(--domi-orange)]">
                <span className="font-semibold">B</span>{' '}
                {composeFullAddress(deliveryParts) || 'Entrega'}
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-bold text-[var(--domi-muted)] underline"
                onClick={() => setStep('map')}
              >
                Editar en el mapa
              </button>
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              Cuándo entregamos *
            </span>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setScheduleMode('now');
                  const { min } = scheduleWindow(new Date(), scheduleLeadMin);
                  setValues((prev) => ({ ...prev, scheduledFor: toDatetimeLocalValue(min) }));
                }}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${
                  scheduleMode === 'now'
                    ? 'border-[rgba(255,87,34,0.5)] bg-[rgba(255,87,34,0.14)] text-[var(--domi-orange)]'
                    : 'border-[var(--domi-border)] bg-[var(--domi-panel)] text-[var(--domi-muted)]'
                }`}
              >
                Para ya
                <span className="mt-0.5 block text-[10px] font-semibold opacity-80">
                  Hora actual + tiempo de ruta
                </span>
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode('later')}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${
                  scheduleMode === 'later'
                    ? 'border-[rgba(255,87,34,0.5)] bg-[rgba(255,87,34,0.14)] text-[var(--domi-orange)]'
                    : 'border-[var(--domi-border)] bg-[var(--domi-panel)] text-[var(--domi-muted)]'
                }`}
              >
                Programar
                <span className="mt-0.5 block text-[10px] font-semibold opacity-80">
                  Hasta 15 días adelante
                </span>
              </button>
            </div>

            {scheduleMode === 'now' ? (
              <div className="rounded-xl border border-[var(--domi-border)] bg-[var(--domi-panel)] px-3 py-3">
                <p className="text-sm font-bold text-[var(--domi-text)]">
                  {parseDatetimeLocal(values.scheduledFor)?.toLocaleString('es-CO', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }) || 'Calculando…'}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--domi-muted)]">
                  {routeKm > 0
                    ? `Estimado según la ruta (~${scheduleLeadMin} min: viaje + margen). Se actualiza si cambias origen o destino.`
                    : 'Marca recolección y entrega en el mapa para estimar la hora.'}
                </p>
              </div>
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold text-[var(--domi-muted)]">
                  Fecha y hora programada
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
                <span className="mt-1 block text-[10px] text-[var(--domi-muted)]">
                  Elige el día y la hora exactos (máximo 15 días).
                </span>
              </label>
            )}
          </div>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              Factura / orden *
            </span>
            <input
              className="field-input"
              required
              value={values.invoiceNumber}
              onChange={(e) => update('invoiceNumber', e.target.value)}
              placeholder="Número de factura o pedido"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              Foto (opcional)
            </span>
            <input
              className="field-input file:mr-3 file:rounded-md file:border-0 file:bg-[rgba(0,229,255,0.15)] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[var(--domi-text)]"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              Forma de pago *
            </span>
            <select
              className="field-input"
              required
              value={values.paymentMethod}
              onChange={(e) =>
                update('paymentMethod', e.target.value as OrderFormValues['paymentMethod'])
              }
            >
              <option value="efectivo">Efectivo al recibir</option>
              <option value="transferencia">Transferencia</option>
              <option value="ya_pagado">Ya pagado en el negocio</option>
              <option value="otro">Otro</option>
            </select>
          </label>

          {!wizard ? (
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
          ) : null}

          {values.paymentMethod === 'transferencia' || values.paymentMethod === 'otro' ? (
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
                Detalle de pago
              </span>
              <input
                className="field-input"
                value={values.paymentNote}
                onChange={(e) => update('paymentNote', e.target.value)}
                placeholder="Banco, referencia…"
              />
            </label>
          ) : null}

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
              Qué enviamos *
            </span>
            <textarea
              className="field-input min-h-[72px] resize-y"
              required
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Comida, paquete, compras…"
            />
          </label>

          {!wizard ? (
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
          ) : null}
        </div>
      )}

      {(!wizard || step === 'details') && quote ? (
        <div className="rounded-xl border border-[rgba(0,230,118,0.3)] bg-[rgba(0,230,118,0.08)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-green)]">
            Cotización
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[var(--domi-text)]">
            {formatCOP(quote.shippingFee)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--domi-muted)]">
            {quote.distanceKm.toFixed(1)} km
            {scheduleMode === 'now'
              ? ` · llegada estimada ~${quote.durationMin} min`
              : ' · entrega programada'}
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          className="form-alert-error rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {(!wizard || step === 'details') && (
        <div className="mt-6 space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-[var(--domi-border)] bg-[var(--domi-panel)] px-3 py-3 text-sm text-[var(--domi-text)]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--domi-orange)]"
              checked={acceptedTerms}
              onChange={(e) => {
                setAcceptedTerms(e.target.checked);
                if (e.target.checked) setError(null);
              }}
            />
            <span>
              He leído el{' '}
              <a
                href="/privacy.html#aviso"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--domi-cyan)] underline-offset-2 hover:underline"
              >
                Aviso de Privacidad
              </a>{' '}
              y autorizo a DOMICLICK S.A.S. a tratar mis datos personales conforme a la{' '}
              <a
                href="/privacy.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--domi-cyan)] underline-offset-2 hover:underline"
              >
                Política de Tratamiento de Datos
              </a>
              , y acepto los{' '}
              <a
                href="/terms.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--domi-cyan)] underline-offset-2 hover:underline"
              >
                Términos y Condiciones
              </a>
              , para gestionar mi solicitud, recogida, entrega, seguimiento y atención al cliente.
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-[var(--domi-border)] bg-[var(--domi-panel)] px-3 py-3 text-sm text-[var(--domi-muted)]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--domi-orange)]"
              checked={acceptedMarketing}
              onChange={(e) => setAcceptedMarketing(e.target.checked)}
            />
            <span>
              Autorizo de manera voluntaria a DOMICLICK S.A.S. para enviarme promociones,
              novedades e información comercial (opcional; no condiciona el servicio).
            </span>
          </label>
        </div>
      )}

      {(!wizard || step === 'details') && (
        <button
          type="submit"
          className="cta-primary mt-4 w-full"
          disabled={submitting || geoBusy || authLoading || !acceptedTerms}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Enviando…
            </>
          ) : !profile ? (
            'Inicia sesión para confirmar'
          ) : wizard ? (
            'Finalizar pedido'
          ) : (
            'Confirmar solicitud'
          )}
        </button>
      )}
    </form>
  );
}

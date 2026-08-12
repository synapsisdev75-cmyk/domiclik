import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Package } from 'lucide-react';
import { submitOrder } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { IngestOrderResponse } from '../contracts/salesIngest';

export type OrderFormValues = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  description: string;
  declaredValue: string;
  notes: string;
};

const INITIAL: OrderFormValues = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  deliveryAddress: '',
  description: '',
  declaredValue: '',
  notes: '',
};

interface OrderFormProps {
  onSuccess: (result: IngestOrderResponse) => void;
}

export function OrderForm({ onSuccess }: OrderFormProps) {
  const { profile, signIn, setPhone, loading: authLoading } = useAuth();
  const [values, setValues] = useState<OrderFormValues>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setValues((prev) => ({
      ...prev,
      customerName: prev.customerName || profile.displayName || '',
      customerEmail: prev.customerEmail || profile.email || '',
      customerPhone: prev.customerPhone || profile.phone || '',
    }));
  }, [profile]);

  function update<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
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

      const result = await submitOrder({
        customerName: values.customerName.trim(),
        customerPhone: phone,
        customerEmail: values.customerEmail.trim() || undefined,
        deliveryAddress: values.deliveryAddress.trim(),
        description: values.description.trim() || undefined,
        notes: values.notes.trim() || undefined,
        declaredValue: declared,
        customerUid: profile?.uid,
        customerPhotoURL: profile?.photoURL || undefined,
      });

      setValues({
        ...INITIAL,
        customerName: profile?.displayName || '',
        customerEmail: profile?.email || '',
        customerPhone: phone,
      });
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
              {profile
                ? `Datos de tu cuenta Google · ${profile.email || profile.displayName}`
                : 'Completa tus datos. Central recibe el pedido al instante.'}
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
            name="customerName"
            autoComplete="name"
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
            name="customerPhone"
            type="tel"
            autoComplete="tel"
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
            name="customerEmail"
            type="email"
            autoComplete="email"
            value={values.customerEmail}
            onChange={(e) => update('customerEmail', e.target.value)}
            placeholder="ana@correo.com"
            readOnly={Boolean(profile?.email)}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Dirección de entrega *
          </span>
          <input
            className="field-input"
            name="deliveryAddress"
            autoComplete="street-address"
            required
            value={values.deliveryAddress}
            onChange={(e) => update('deliveryAddress', e.target.value)}
            placeholder="Calle 38 # 29-10, Barzal, Villavicencio"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
            Qué enviamos *
          </span>
          <textarea
            className="field-input min-h-[96px] resize-y"
            name="description"
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
            name="declaredValue"
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
            name="notes"
            value={values.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Portería, horario, referencia…"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="cta-primary mt-6 w-full sm:w-auto" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Enviando…
          </>
        ) : (
          'Enviar solicitud'
        )}
      </button>
    </form>
  );
}

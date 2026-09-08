import { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { WHATSAPP_URL } from '../lib/config';
import { OFFICE_CITY } from '../lib/companyInfo';

const FAQS = [
  {
    id: 'pedido',
    title: 'Cómo hago un pedido',
    body: 'Ve a Solicitar, indica origen y destino en el mapa, completa tus datos y confirma. Recibirás un código de seguimiento y un PIN de entrega.',
  },
  {
    id: 'donde',
    title: 'Dónde está mi pedido',
    body: 'En Seguimiento escribe tu código (ej. DMC-1234) o entra desde Mis pedidos. El estado se actualiza en tiempo real mientras el Domiclick está en ruta.',
  },
  {
    id: 'pago',
    title: 'Problemas con el pago',
    body: 'Puedes pagar en efectivo, transferencia o indicar que ya pagaste. Si hubo un cobro incorrecto, escríbenos por WhatsApp con tu código de seguimiento.',
  },
  {
    id: 'direccion',
    title: 'Problemas con la dirección',
    body: 'Ajusta el pin en el mapa o escribe la dirección completa con barrio y puntos de referencia. Si el repartidor no encuentra el sitio, contacta soporte con tu código.',
  },
] as const;

export function HelpPage() {
  const [openId, setOpenId] = useState<string | null>('pedido');

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
      <Link to="/perfil" className="text-xs font-semibold text-[var(--domi-cyan)]">
        ← Volver
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-white">
        ¿En qué podemos ayudarte?
      </h1>
      <p className="mt-1 text-sm text-[var(--domi-muted)]">
        Respuestas rápidas para domicilios en {OFFICE_CITY}.
      </p>

      <div className="mt-6 space-y-3">
        {FAQS.map((faq) => {
          const open = openId === faq.id;
          return (
            <div key={faq.id} className="glass-panel overflow-hidden rounded-2xl">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                onClick={() => setOpenId(open ? null : faq.id)}
                aria-expanded={open}
              >
                <span className="text-sm font-bold text-white">{faq.title}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[var(--domi-muted)] transition ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {open ? (
                <p className="border-t border-[var(--domi-border)] px-4 py-3 text-sm leading-relaxed text-[var(--domi-muted)]">
                  {faq.body}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="cta-primary mt-8 flex w-full items-center justify-center gap-2"
      >
        <MessageCircle className="h-5 w-5" />
        Contactar soporte
      </a>
    </div>
  );
}

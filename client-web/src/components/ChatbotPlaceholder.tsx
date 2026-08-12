import { useEffect, useId, useState } from 'react';
import { MessageCircle, Phone, X } from 'lucide-react';
import { PHONE, WHATSAPP_URL } from '../lib/config';

const FAQ = [
  {
    q: '¿Cómo solicito una entrega?',
    a: 'Completa el formulario con tu nombre, teléfono, dirección y descripción. Recibirás un código de seguimiento al instante.',
  },
  {
    q: '¿Cómo sigo mi pedido?',
    a: 'Usa el código DMC-XXXX en la página de seguimiento o escribe a Central por WhatsApp.',
  },
  {
    q: '¿En qué zonas llegan?',
    a: 'Operamos en Villavicencio y zonas aledañas. Si dudas de cobertura, escríbenos antes de solicitar.',
  },
  {
    q: '¿Hay pago en línea?',
    a: 'En esta versión el cobro se coordina con Central. Pronto habrá pasarela de pago.',
  },
] as const;

export function ChatbotPlaceholder() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Ayuda DomiClick"
          className="glass-panel animate-fade-up w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.65)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--domi-border)] bg-[rgba(255,87,34,0.1)] px-4 py-3">
            <div>
              <p className="font-display text-sm font-bold text-white">Asistente DomiClick</p>
              <p className="text-xs text-[var(--domi-muted)]">FAQ · Central humana</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 text-[var(--domi-muted)] hover:bg-white/5 hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="rounded-xl border border-[var(--domi-border)] bg-[rgba(5,8,15,0.45)] px-3 py-2"
              >
                <summary className="cursor-pointer text-sm font-semibold text-white">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-[var(--domi-muted)]">{item.a}</p>
              </details>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-[var(--domi-border)] p-3">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366]/15 px-3 py-2.5 text-xs font-bold text-[#25D366] transition hover:bg-[#25D366]/25"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              WhatsApp
            </a>
            <a
              href={`tel:${PHONE}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[rgba(0,229,255,0.1)] px-3 py-2.5 text-xs font-bold text-[var(--domi-cyan)] transition hover:bg-[rgba(0,229,255,0.18)]"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Llamar
            </a>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="cta-primary h-14 w-14 !rounded-full !p-0"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar ayuda' : 'Abrir ayuda'}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}

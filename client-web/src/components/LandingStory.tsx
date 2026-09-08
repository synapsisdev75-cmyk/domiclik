import { useEffect, useRef, type ReactNode } from 'react';
import {
  Clock3,
  MapPinned,
  Package,
  Phone,
  ShieldCheck,
  Sparkles,
  Store,
  type LucideIcon,
} from 'lucide-react';
import {
  BRAND_TAGLINE,
  OFFICE_ADDRESS_LINE1,
  OFFICE_ADDRESS_LINE2,
  OFFICE_CITY,
} from '../lib/companyInfo';

function Reveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add('is-visible');
          obs.disconnect();
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}

type ServiceItem = {
  title: string;
  text: string;
  accent: string;
  icon?: LucideIcon;
  imageSrc?: string;
  imageAlt?: string;
};

const SERVICES: ServiceItem[] = [
  {
    icon: Store,
    title: 'Compras prepagadas',
    text: 'Tú pagas en el local. Nosotros pasamos, recogemos y te lo llevamos a casa sin sobrecostos de convenio.',
    accent: 'var(--domi-orange)',
  },
  {
    icon: Package,
    title: 'Encargos locales',
    text: 'Documentos, paquetes y mandados del día a día en Villavicencio. Claro, rastreable y al punto.',
    accent: 'var(--domi-cyan)',
  },
  {
    imageSrc: '/brand/scooter-domiclick.png',
    imageAlt: 'Scooter DomiClick',
    title: 'Reparto con seguimiento',
    text: 'Desde la asignación hasta la entrega: ves el avance y sabes cuándo llega tu DomiClick.',
    accent: 'var(--domi-blue)',
  },
  {
    icon: Clock3,
    title: 'Rápido y ordenado',
    text: 'Rutas pensadas para Meta: menos vueltas, más puntualidad y un flujo simple de punta a punta.',
    accent: 'var(--domi-green)',
  },
];

const COVERAGE = [
  'Villavicencio (casco urbano)',
  'Barrios y zonas aledañas',
  'Restrepo · Acacías · Cumaral',
  'Corredor hacia Puerto López',
] as const;

export function LandingStory({ onCtaClick }: { onCtaClick: () => void }) {
  return (
    <div className="landing-story mt-20 space-y-24 sm:mt-28 sm:space-y-32">
      {/* Quiénes somos */}
      <section id="quienes-somos" className="scroll-mt-24">
        <Reveal>
          <p className="landing-kicker">Quiénes somos</p>
          <h2 className="landing-title">
            Somos el click entre tu pedido
            <span className="landing-title-accent"> y tu puerta.</span>
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <Reveal delayMs={80}>
            <p className="landing-lead">
              DomiClick es la plataforma digital de Villavicencio para mandados y encargos
              locales. No vendemos comida ni firmamos convenios: tú dejas el pedido pago, y
              nosotros lo traemos con claridad, ritmo y seguimiento.
            </p>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--domi-muted)] sm:text-lg">
              Nacimos para que pedir un domicilio se sienta simple: sin fricción, sin letra
              chica y con una experiencia hecha para Meta. {BRAND_TAGLINE}
            </p>
          </Reveal>
          <Reveal delayMs={140} className="landing-quote">
            <Sparkles className="mb-3 h-5 w-5 text-[var(--domi-cyan)]" aria-hidden />
            <p className="font-display text-xl font-semibold leading-snug text-white sm:text-2xl">
              “Excelencia a un click de ti.”
            </p>
            <p className="mt-3 text-sm text-[var(--domi-muted)]">
              Software + operación local. Intermediación transparente para que el encargo
              llegue donde tiene que llegar.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="scroll-mt-24">
        <Reveal>
          <p className="landing-kicker">Servicios</p>
          <h2 className="landing-title">
            Domicilios y encargos
            <span className="landing-title-accent"> sin misterio.</span>
          </h2>
          <p className="landing-lead mt-4 max-w-2xl">
            Cuatro piezas del mismo viaje: pagar en el sitio, confiar el recojo, seguir la
            ruta y recibir en casa.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {SERVICES.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delayMs={60 + i * 70} className="landing-service">
                <span
                  className={`landing-service-icon ${item.imageSrc ? 'landing-service-icon--brand' : ''}`}
                  style={
                    item.imageSrc
                      ? undefined
                      : { color: item.accent, background: `${item.accent}18` }
                  }
                >
                  {item.imageSrc ? (
                    <img
                      src={item.imageSrc}
                      alt={item.imageAlt || item.title}
                      className="h-8 w-8 object-contain"
                    />
                  ) : Icon ? (
                    <Icon className="h-5 w-5" aria-hidden />
                  ) : null}
                </span>
                <h3 className="font-display text-lg font-bold text-white sm:text-xl">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--domi-muted)] sm:text-[0.95rem]">
                  {item.text}
                </p>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Dónde operamos */}
      <section id="cobertura" className="scroll-mt-24">
        <div className="landing-coverage">
          <Reveal>
            <p className="landing-kicker">Dónde operamos</p>
            <h2 className="landing-title">
              Meta en el mapa.
              <span className="landing-title-accent"> Tú en el centro.</span>
            </h2>
            <p className="landing-lead mt-4 max-w-xl">
              Operamos desde Villavicencio hacia las zonas donde la ciudad vive y se mueve.
              Si tu pin está en el área de servicio, vamos.
            </p>
          </Reveal>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {COVERAGE.map((place, i) => (
              <Reveal key={place} delayMs={50 + i * 55} className="landing-coverage-item">
                <MapPinned className="h-4 w-4 shrink-0 text-[var(--domi-orange)]" aria-hidden />
                <span>{place}</span>
              </Reveal>
            ))}
          </ul>
          <Reveal delayMs={120} className="mt-8 flex flex-wrap items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-[var(--domi-green)]" aria-hidden />
            <p className="text-sm text-[var(--domi-muted)]">
              El mapa del pedido valida la zona al instante. Fuera de cobertura, te lo
              avisamos antes de confirmar.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="scroll-mt-24">
        <Reveal>
          <p className="landing-kicker">Contacto</p>
          <h2 className="landing-title">
            Hablemos claro.
            <span className="landing-title-accent"> Estamos cerca.</span>
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <Reveal delayMs={70}>
            <div className="space-y-4 text-base text-[var(--domi-muted)] sm:text-lg">
              <p className="flex gap-3">
                <MapPinned className="mt-1 h-5 w-5 shrink-0 text-[var(--domi-cyan)]" aria-hidden />
                <span>
                  <strong className="text-white">Oficina</strong>
                  <br />
                  {OFFICE_ADDRESS_LINE1}
                  <br />
                  {OFFICE_ADDRESS_LINE2}
                  <br />
                  {OFFICE_CITY}
                </span>
              </p>
              <p className="flex gap-3">
                <Phone className="mt-1 h-5 w-5 shrink-0 text-[var(--domi-orange)]" aria-hidden />
                <span>
                  <strong className="text-white">Soporte</strong>
                  <br />
                  <a
                    className="text-[var(--domi-cyan)] underline-offset-4 hover:underline"
                    href="mailto:soporte@domiclick.com"
                  >
                    soporte@domiclick.com
                  </a>
                </span>
              </p>
            </div>
          </Reveal>
          <Reveal delayMs={120}>
            <button type="button" className="cta-primary" onClick={onCtaClick}>
              Solicitar una entrega
            </button>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

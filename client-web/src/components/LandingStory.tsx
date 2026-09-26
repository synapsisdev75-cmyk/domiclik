import { useEffect, useRef, type ReactNode } from 'react';
import { MapPinned, Phone, ShieldCheck } from 'lucide-react';
import {
  BRAND_TAGLINE,
  OFFICE_ADDRESS_LINE1,
  OFFICE_ADDRESS_LINE2,
  OFFICE_CITY,
} from '../lib/companyInfo';
import { OfficeMap } from './OfficeMap';

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
  step: string;
  title: string;
  text: string;
  imageSrc: string;
  imageAlt: string;
};

/** Viaje 1→4: tienda → moto → seguimiento → entrega en puerta */
const SERVICES: ServiceItem[] = [
  {
    step: '01',
    title: 'Compras prepagadas',
    text: 'Tú pagas en el local. Nosotros pasamos, recogemos y te lo llevamos a casa sin sobrecostos de convenio.',
    imageSrc: '/brand/services/01-compras.jpg',
    imageAlt: 'Motorizado DomiClick recogiendo el pedido en el comercio',
  },
  {
    step: '02',
    title: 'Encargos locales',
    text: 'Documentos, paquetes y mandados del día a día en Villavicencio. Claro, rastreable y al punto.',
    imageSrc: '/brand/services/02-encargos.jpg',
    imageAlt: 'Motorizado DomiClick listo para salir con el encargo',
  },
  {
    step: '03',
    title: 'Reparto con seguimiento',
    text: 'Desde la asignación hasta la entrega: ves el avance y sabes cuándo llega tu DomiClick.',
    imageSrc: '/brand/services/03-seguimiento.jpg',
    imageAlt: 'Motorizado DomiClick siguiendo la ruta en la app',
  },
  {
    step: '04',
    title: 'Entrega en tu puerta',
    text: 'Rutas pensadas para Meta: menos vueltas, más puntualidad y el paquete en tus manos.',
    imageSrc: '/brand/services/04-entrega.jpg',
    imageAlt: 'Entrega DomiClick en la puerta del cliente',
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
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch lg:gap-12">
          <Reveal className="flex flex-col justify-center">
            <p className="landing-kicker">Quiénes somos</p>
            <h2 className="landing-title">
              Somos el click entre tu pedido
              <span className="landing-title-accent"> y tu puerta.</span>
            </h2>
            <p className="landing-lead mt-6">
              DomiClick es la plataforma digital de Villavicencio para mandados y encargos
              locales. No vendemos comida ni firmamos convenios: tú dejas el pedido pago, y
              nosotros lo traemos con claridad, ritmo y seguimiento.
            </p>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--domi-muted)] sm:text-lg">
              Nacimos para que pedir un domicilio se sienta simple: sin fricción, sin letra
              chica y con una experiencia hecha para Meta. {BRAND_TAGLINE}
            </p>
          </Reveal>
          <Reveal delayMs={120} className="landing-media h-full min-h-0">
            <div className="landing-media-frame landing-media-frame--tall">
              <video
                className="landing-media-video"
                src="/brand/quienes-somos.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="Entrega DomiClick: llevando el paquete a tu puerta"
              />
            </div>
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
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3">
          {SERVICES.map((item, i) => (
            <Reveal key={item.step} delayMs={60 + i * 70} className="landing-service-card">
              <div className="landing-service-photo">
                <img src={item.imageSrc} alt={item.imageAlt} loading="lazy" decoding="async" />
                <span className="landing-service-step" aria-hidden>
                  {item.step}
                </span>
              </div>
              <div className="landing-service-body">
                <h3 className="font-display text-[0.95rem] font-bold leading-snug text-[var(--domi-text)] sm:text-base">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--domi-muted)] sm:text-[0.8rem]">
                  {item.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Dónde operamos */}
      <section id="cobertura" className="scroll-mt-24">
        <div className="landing-coverage">
          <div className="landing-coverage-grid">
            <div className="landing-coverage-copy">
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
            <Reveal delayMs={140} className="landing-coverage-visual">
              <img
                src="/brand/cobertura-villavicencio.png"
                alt="Plaza de Villavicencio, Meta"
                className="landing-coverage-img"
                loading="lazy"
                decoding="async"
              />
            </Reveal>
          </div>
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
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:items-stretch">
          <Reveal delayMs={70} className="flex flex-col justify-between gap-8">
            <div className="space-y-5 text-base text-[var(--domi-muted)] sm:text-lg">
              <div className="landing-office-card">
                <p className="flex gap-3">
                  <MapPinned className="mt-1 h-5 w-5 shrink-0 text-[var(--domi-cyan)]" aria-hidden />
                  <span>
                    <strong className="text-[var(--domi-text)]">Oficina</strong>
                    <br />
                    <span className="landing-office-addr">{OFFICE_ADDRESS_LINE1}</span>
                    <br />
                    <span className="landing-office-addr">{OFFICE_ADDRESS_LINE2}</span>
                    <br />
                    <span className="landing-office-addr">{OFFICE_CITY}</span>
                  </span>
                </p>
              </div>
              <p className="flex gap-3">
                <Phone className="mt-1 h-5 w-5 shrink-0 text-[var(--domi-orange)]" aria-hidden />
                <span>
                  <strong className="text-[var(--domi-text)]">Soporte</strong>
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
            <button type="button" className="cta-primary self-start" onClick={onCtaClick}>
              Solicitar una entrega
            </button>
          </Reveal>
          <Reveal delayMs={120} className="min-h-[280px] lg:min-h-full">
            <OfficeMap />
          </Reveal>
        </div>
      </section>
    </div>
  );
}

import { ArrowRight, MapPin } from 'lucide-react';
import { BRAND } from './BrandLogo';

function HeroRouteOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="heroRouteOrange" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF5722" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FF5722" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="heroRouteCyan" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <path
        className="hero-route"
        d="M80 680 C220 520 340 480 480 360 S760 180 980 120"
        fill="none"
        stroke="url(#heroRouteOrange)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        className="hero-route"
        d="M100 180 C280 260 420 340 560 420 S820 580 1040 680"
        fill="none"
        stroke="url(#heroRouteCyan)"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ animationDuration: '30s', animationDirection: 'reverse' }}
      />
    </svg>
  );
}

interface HeroProps {
  onCtaClick: () => void;
}

export function Hero({ onCtaClick }: HeroProps) {
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={BRAND.heroVideo}
        autoPlay
        muted
        loop
        playsInline
        poster="/brand/logo-optimized-transparent.png"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#05080f]/55 via-[#05080f]/72 to-[#05080f]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(5,8,15,0.75)_75%)]" />
      <HeroRouteOverlay />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-5 pb-16 pt-28 sm:px-8 sm:pb-24">
        <div className="max-w-2xl">
          <p className="animate-fade-up mb-3 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-[var(--domi-cyan)]">
            <MapPin className="h-4 w-4" aria-hidden />
            Villavicencio, Meta
          </p>
          <h1 className="animate-fade-up-delay font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
            Tu entrega, a un click
          </h1>
          <p className="animate-fade-up-delay-2 mt-4 max-w-xl text-base leading-relaxed text-[var(--domi-muted)] sm:text-lg">
            Solicita mensajería y paquetería en moto. Seguimiento simple con tu código DomiClick.
          </p>
          <div className="animate-fade-up-delay-2 mt-8 flex flex-wrap gap-3">
            <button type="button" className="cta-primary" onClick={onCtaClick}>
              Solicitar entrega
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <a href="#seguimiento-rapido" className="cta-ghost">
              Ya tengo código
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

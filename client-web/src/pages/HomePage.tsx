import { useRef, useState } from 'react';
import type { IngestOrderResponse } from '../contracts/salesIngest';
import { Hero } from '../components/Hero';
import { LandingStory } from '../components/LandingStory';
import { OrderForm } from '../components/OrderForm';
import { QuickTrackingForm } from '../components/QuickTrackingForm';
import { SiteHeader } from '../components/SiteHeader';
import { SuccessScreen } from '../components/SuccessScreen';
import {
  BRAND_TAGLINE as COMPANY_TAGLINE,
  COPYRIGHT_LINE,
  OFFICE_ADDRESS_LINE1,
  OFFICE_ADDRESS_LINE2,
  OFFICE_CITY,
} from '../lib/companyInfo';

export function HomePage() {
  const formRef = useRef<HTMLElement | null>(null);
  const [result, setResult] = useState<IngestOrderResponse | null>(null);

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Hero onCtaClick={scrollToForm} />

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <section ref={formRef} id="solicitar" className="scroll-mt-8 -mt-6 sm:-mt-10">
          {result ? (
            <SuccessScreen result={result} onNewRequest={() => setResult(null)} />
          ) : (
            <OrderForm onSuccess={setResult} />
          )}
        </section>

        <section className="mt-8">
          <QuickTrackingForm />
        </section>

        <LandingStory onCtaClick={scrollToForm} />
      </main>

      <footer className="site-footer-banner relative isolate mt-16 overflow-hidden border-t border-[var(--domi-border)]">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/brand/footer-banner.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#05080f]/75 via-[#05080f]/72 to-[#05080f]/88" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(5,8,15,0.55)_85%)]" />
        <div className="on-dark relative z-10 mx-auto max-w-6xl px-5 py-14 text-center text-sm text-white/80 sm:px-8 sm:py-16">
          <p className="font-display text-base font-semibold text-white sm:text-lg">DomiClick</p>
          <p className="mt-1">
            {COMPANY_TAGLINE} · {OFFICE_CITY}
          </p>
          <p className="mt-3 text-xs text-white/80">
            {OFFICE_ADDRESS_LINE1}
            <br />
            {OFFICE_ADDRESS_LINE2}
          </p>
          <nav className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
            <a href="#quienes-somos" className="hover:text-[var(--domi-cyan)]">
              Quiénes somos
            </a>
            <a href="#servicios" className="hover:text-[var(--domi-cyan)]">
              Servicios
            </a>
            <a href="#cobertura" className="hover:text-[var(--domi-cyan)]">
              Cobertura
            </a>
            <a href="#contacto" className="hover:text-[var(--domi-cyan)]">
              Contacto
            </a>
            <a href="/privacy.html" className="hover:text-[var(--domi-cyan)]">
              Privacidad
            </a>
            <a href="/cookies.html" className="hover:text-[var(--domi-cyan)]">
              Cookies
            </a>
            <a href="/terms.html" className="hover:text-[var(--domi-cyan)]">
              Términos
            </a>
          </nav>
          <p className="mt-3 text-xs text-slate-400">{COPYRIGHT_LINE}</p>
        </div>
      </footer>
    </div>
  );
}

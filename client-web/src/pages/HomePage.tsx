import { useRef, useState } from 'react';
import type { IngestOrderResponse } from '../contracts/salesIngest';
import { Hero } from '../components/Hero';
import { OrderForm } from '../components/OrderForm';
import { QuickTrackingForm } from '../components/QuickTrackingForm';
import { SiteHeader } from '../components/SiteHeader';
import { SuccessScreen } from '../components/SuccessScreen';
import {
  BRAND_TAGLINE,
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

        <footer className="mt-16 border-t border-[var(--domi-border)] pt-8 text-center text-sm text-[var(--domi-muted)]">
          <p className="font-display text-base font-semibold text-white">DomiClick</p>
          <p className="mt-1">
            {BRAND_TAGLINE} · {OFFICE_CITY}
          </p>
          <p className="mt-3 text-xs">
            {OFFICE_ADDRESS_LINE1}
            <br />
            {OFFICE_ADDRESS_LINE2}
          </p>
          <p className="mt-2 text-xs text-slate-500">{COPYRIGHT_LINE}</p>
        </footer>
      </main>
    </div>
  );
}

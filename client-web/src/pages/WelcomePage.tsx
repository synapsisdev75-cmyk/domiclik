import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { markWelcomeSeen } from '../lib/appNav';
import { BRAND_TAGLINE, OFFICE_CITY } from '../lib/companyInfo';

export function WelcomePage() {
  const navigate = useNavigate();

  function handleStart() {
    markWelcomeSeen();
    navigate('/', { replace: true });
  }

  return (
    <div className="safe-top relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 pb-12">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 20%, rgba(255,87,34,0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(0,229,255,0.1), transparent 50%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div className="welcome-logo-float mb-10">
          <BrandLogo variant="optimized" className="welcome-logo-pulse h-28 w-auto sm:h-32" />
        </div>

        <h1 className="font-display text-[1.65rem] font-bold leading-tight tracking-tight text-white sm:text-3xl">
          Pide lo que necesites.
          <br />
          <span className="text-[var(--domi-orange)]">Nosotros lo llevamos.</span>
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-[var(--domi-muted)]">
          {BRAND_TAGLINE} Entregas en {OFFICE_CITY}.
        </p>

        <button type="button" onClick={handleStart} className="cta-primary mt-10 w-full max-w-xs text-base">
          Comenzar →
        </button>
      </div>
    </div>
  );
}

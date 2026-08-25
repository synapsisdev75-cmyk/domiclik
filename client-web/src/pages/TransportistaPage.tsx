import { Link } from 'react-router-dom';
import { Bike, UserPlus, ArrowRight, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { SiteHeader } from '../components/SiteHeader';
import { opsTowerUrl } from '../lib/config';
import {
  BRAND_TAGLINE,
  COPYRIGHT_LINE,
  OFFICE_ADDRESS_LINE1,
  OFFICE_ADDRESS_LINE2,
  OFFICE_CITY,
} from '../lib/companyInfo';

type DriverEntryRole = 'driver' | 'pending_driver';

function goToOpsCabin(role: DriverEntryRole, withGoogle = false) {
  const url = new URL(opsTowerUrl());
  url.searchParams.set('role', role);
  if (withGoogle) url.searchParams.set('google', '1');
  window.location.assign(url.toString());
}

export function TransportistaPage() {
  return (
    <div className="min-h-screen bg-[#05080f] text-[#e8eef9]">
      <SiteHeader />

      <main className="relative z-10 mx-auto max-w-lg px-5 pb-24 pt-28 sm:px-8">
        <div className="rounded-2xl border border-[var(--domi-border)] bg-[rgba(15,23,40,0.85)] px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="mb-6 flex items-center gap-3">
            <BrandLogo variant="optimized" height={40} />
            <div>
              <h1 className="font-display text-xl font-extrabold text-white">Acceso transportistas</h1>
              <p className="text-sm text-[var(--domi-muted)]">Cabina DomiClick · Villavicencio</p>
            </div>
          </div>

          <p className="mb-6 text-sm text-[var(--domi-muted)] leading-relaxed">
            El inicio de sesión de la flota está aquí. Serás llevado a la cabina operativa para
            entrar con Google o correo.
          </p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => goToOpsCabin('driver', true)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#1a2744] bg-[#0a101c] px-4 py-3.5 text-left transition hover:border-[#2B6CFF]/50"
            >
              <span className="flex items-center gap-3">
                <Bike className="h-5 w-5 text-[#FF5722]" />
                <span>
                  <span className="block text-sm font-bold text-white">Ya soy transportista</span>
                  <span className="block text-xs text-[var(--domi-muted)]">Continuar con Google</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-[#2B6CFF]" />
            </button>

            <button
              type="button"
              onClick={() => goToOpsCabin('driver')}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#1a2744] bg-[#0a101c] px-4 py-3.5 text-left transition hover:border-[#2B6CFF]/50"
            >
              <span className="flex items-center gap-3">
                <Bike className="h-5 w-5 text-[#00E5FF]" />
                <span>
                  <span className="block text-sm font-bold text-white">Entrar con correo</span>
                  <span className="block text-xs text-[var(--domi-muted)]">Transportista aprobado</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-[#2B6CFF]" />
            </button>

            <button
              type="button"
              onClick={() => goToOpsCabin('pending_driver')}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#1a2744] bg-[#0a101c] px-4 py-3.5 text-left transition hover:border-[#FF5722]/40"
            >
              <span className="flex items-center gap-3">
                <UserPlus className="h-5 w-5 text-amber-400" />
                <span>
                  <span className="block text-sm font-bold text-white">Pre-registro</span>
                  <span className="block text-xs text-[var(--domi-muted)]">Quiero unirme a la flota</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-[#FF5722]" />
            </button>
          </div>

          <p className="mt-6 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Administradores de la torre de control ingresan en el sitio ops, no desde esta página.
          </p>

          <p className="mt-4 text-center text-sm text-[var(--domi-muted)]">
            <Link to="/" className="font-semibold text-[#2B6CFF] hover:text-[#7aa2ff]">
              Volver al inicio
            </Link>
          </p>
        </div>

        <footer className="mt-12 border-t border-[var(--domi-border)] pt-8 text-center text-sm text-[var(--domi-muted)]">
          <p className="font-display text-base font-semibold text-white">DomiClick</p>
          <p className="mt-1">{BRAND_TAGLINE}</p>
          <p className="mt-3 text-xs">
            {OFFICE_ADDRESS_LINE1}
            <br />
            {OFFICE_ADDRESS_LINE2} · {OFFICE_CITY}
          </p>
          <p className="mt-2 text-xs text-slate-500">{COPYRIGHT_LINE}</p>
        </footer>
      </main>
    </div>
  );
}

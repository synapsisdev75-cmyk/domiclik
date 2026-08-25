import { Link } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { AuthButton } from './AuthButton';

export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Link to="/" aria-label="DomiClick inicio" className="inline-flex items-center gap-2.5">
          <BrandLogo variant="optimized" height={44} className="sm:h-12" />
          <span className="font-display text-lg font-extrabold tracking-tight sm:text-xl">
            <span className="text-[#2B6CFF]">Domi</span>
            <span className="text-[#FF5722]">Click</span>
          </span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            to="/seguimiento"
            className="hidden text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-[var(--domi-cyan)] sm:inline"
          >
            Seguir pedido
          </Link>
          <Link
            to="/transportista"
            className="text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-[var(--domi-orange)]"
          >
            Transportistas
          </Link>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { AuthButton } from './AuthButton';
import { ThemeToggle } from './ThemeToggle';

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`site-header fixed inset-x-0 top-0 z-[200] isolate pt-[env(safe-area-inset-top,0px)] transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300 ${
        scrolled ? 'site-header--scrolled' : 'site-header--top'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
        <Link
          to="/"
          aria-label="DomiClick inicio"
          className="inline-flex shrink-0 items-center gap-2 sm:gap-2.5"
        >
          <BrandLogo variant="optimized" height={40} className="shrink-0 sm:h-11" />
          <span className="font-display whitespace-nowrap text-base font-extrabold tracking-tight sm:text-xl">
            <span className="text-[#2B6CFF]">Domi</span>
            <span className="text-[#FF5722]">Click</span>
          </span>
        </Link>
        <div className="flex min-w-0 shrink items-center justify-end gap-2 sm:gap-3 xl:gap-5">
          <nav className="hidden items-center gap-4 xl:flex">
            <a
              href="#quienes-somos"
              className="text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-[var(--domi-cyan)]"
            >
              Quiénes somos
            </a>
            <a
              href="#servicios"
              className="text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-[var(--domi-cyan)]"
            >
              Servicios
            </a>
            <a
              href="#cobertura"
              className="text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-[var(--domi-cyan)]"
            >
              Cobertura
            </a>
            <a
              href="#contacto"
              className="text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-[var(--domi-cyan)]"
            >
              Contacto
            </a>
          </nav>
          <Link
            to="/seguimiento"
            className="hidden text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-[var(--domi-cyan)] sm:inline"
          >
            Seguir pedido
          </Link>
          <Link
            to="/transportista"
            className="hidden text-sm font-semibold text-[var(--domi-muted)] transition-colors hover:text-[var(--domi-orange)] md:inline"
          >
            Transportistas
          </Link>
          <ThemeToggle />
          <div className="hidden sm:block">
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  );
}

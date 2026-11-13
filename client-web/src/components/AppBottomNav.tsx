import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Home,
  MapPin,
  PackagePlus,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { DriverMenuBar } from './DriverMenuBar';

const CLIENT_NAV = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/solicitar', label: 'Solicitar', icon: PackagePlus },
  { path: '/seguimiento', label: 'Seguimiento', icon: MapPin },
  { path: '/transportista', label: 'Transporte', icon: Truck },
  { path: '/perfil', label: 'Perfil', icon: User },
] as const;

export const MAP_NAV_EVENT = 'domiclick-map-nav';

export function AppBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { error, clearError, isApprovedDriver } = useAuth();
  const showErrorBanner = Boolean(error) && !location.pathname.startsWith('/perfil');
  const tab = new URLSearchParams(location.search).get('tab') || 'hoy';
  const onDriverMap =
    isApprovedDriver &&
    location.pathname.startsWith('/transportista') &&
    tab === 'mapa';
  const [mapNavHidden, setMapNavHidden] = useState(false);

  useEffect(() => {
    if (!onDriverMap) setMapNavHidden(false);
  }, [onDriverMap]);

  useEffect(() => {
    const hidden = onDriverMap && mapNavHidden;
    window.dispatchEvent(
      new CustomEvent(MAP_NAV_EVENT, { detail: { hidden } }),
    );
    document.documentElement.classList.toggle('map-nav-hidden', hidden);
    return () => {
      document.documentElement.classList.remove('map-nav-hidden');
    };
  }, [onDriverMap, mapNavHidden]);

  function isClientActive(path: string) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  if (onDriverMap && mapNavHidden) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pointer-events-none">
        <button
          type="button"
          onClick={() => setMapNavHidden(false)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-[#0c1220]/92 px-3.5 py-2 text-[11px] font-black text-white shadow-lg backdrop-blur-md"
          aria-label="Mostrar menú"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Menú
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50">
      {showErrorBanner ? (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-xl border border-red-500/40 bg-[#1a0b0b]/95 px-3 py-2 text-[11px] leading-snug text-red-200 shadow-lg backdrop-blur-md">
          <p className="min-w-0 flex-1">{error}</p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => clearError()}
            className="shrink-0 rounded-md p-0.5 text-red-300/80 hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <nav className="border-t border-[var(--domi-border)] bg-[var(--domi-surface)]/98 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl safe-bottom">
        {onDriverMap ? (
          <div className="flex justify-center px-2 pt-1">
            <button
              type="button"
              onClick={() => setMapNavHidden(true)}
              className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[10px] font-bold text-[var(--domi-muted)]"
              aria-label="Ocultar menú para ver el mapa"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Ocultar menú
            </button>
          </div>
        ) : null}
        {isApprovedDriver ? (
          <DriverMenuBar />
        ) : (
          <div className="app-bottom-nav__row">
            {CLIENT_NAV.map(({ path, label, icon: Icon }) => {
              const active = isClientActive(path);
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  className={`app-bottom-nav__item font-semibold transition-colors ${
                    active ? 'text-[var(--domi-orange)]' : 'text-[var(--domi-muted)]'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 1.8} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </nav>
    </div>
  );
}

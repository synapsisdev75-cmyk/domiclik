import { useLocation, useNavigate } from 'react-router-dom';
import {
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

export function AppBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { error, clearError, isApprovedDriver } = useAuth();
  const showErrorBanner = Boolean(error) && !location.pathname.startsWith('/perfil');

  function isClientActive(path: string) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
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
        {isApprovedDriver ? (
          <DriverMenuBar />
        ) : (
        <div className="flex items-stretch justify-around pt-1.5 pb-2">
          {CLIENT_NAV.map(({ path, label, icon: Icon }) => {
                const active = isClientActive(path);
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => navigate(path)}
                    className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-end gap-1 px-0.5 text-[10px] font-semibold transition-colors ${
                      active ? 'text-[var(--domi-orange)]' : 'text-[var(--domi-muted)]'
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.8} />
                    <span className="leading-none">{label}</span>
                  </button>
                );
              })}
        </div>
        )}
      </nav>
    </div>
  );
}

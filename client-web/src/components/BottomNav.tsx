import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  MapPin,
  Package,
  PackagePlus,
  Truck,
  User,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { DriverMenuBar } from './DriverMenuBar';

const CLIENT_NAV = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/#solicitar', label: 'Solicitar', icon: PackagePlus },
  { path: '/seguimiento', label: 'Seguimiento', icon: MapPin },
  { path: '/pedidos', label: 'Pedidos', icon: Package },
  { path: '/transportista', label: 'Transporte', icon: Truck },
] as const;

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signIn, signOut, isApprovedDriver } = useAuth();

  function handleClientNav(path: string) {
    if (path === '/#solicitar') {
      if (location.pathname !== '/') {
        navigate('/');
        setTimeout(() => {
          document.getElementById('solicitar')?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      } else {
        document.getElementById('solicitar')?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    navigate(path);
  }

  function isClientActive(path: string) {
    if (path === '/#solicitar') return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  if (isApprovedDriver) {
    return (
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-[var(--domi-border)] bg-[var(--domi-surface)]/98 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:hidden">
        <DriverMenuBar />
      </nav>
    );
  }

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-[var(--domi-border)] bg-[var(--domi-surface)]/95 backdrop-blur-xl sm:hidden">
      <div className="flex items-stretch justify-around">
        {CLIENT_NAV.map(({ path, label, icon: Icon }) => {
          const active = isClientActive(path);
          return (
            <button
              key={path}
              type="button"
              onClick={() => handleClientNav(path)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                active ? 'text-[var(--domi-orange)]' : 'text-[var(--domi-muted)]'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => (user ? void signOut() : void signIn())}
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold text-[var(--domi-muted)] transition-colors"
        >
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="h-5 w-5 rounded-full border border-[#FF5722]/50 object-cover"
            />
          ) : (
            <User className="h-5 w-5" strokeWidth={1.8} />
          )}
          {user ? 'Salir' : 'Entrar'}
        </button>
      </div>
    </nav>
  );
}

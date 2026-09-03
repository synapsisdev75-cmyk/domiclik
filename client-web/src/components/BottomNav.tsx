import { useLocation, useNavigate } from 'react-router-dom';
import { Home, PackagePlus, MapPin, Truck, User } from 'lucide-react';
import { useAuth } from '../lib/auth';

const NAV_ITEMS = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/#solicitar', label: 'Solicitar', icon: PackagePlus },
  { path: '/seguimiento', label: 'Seguimiento', icon: MapPin },
  { path: '/transportista', label: 'Transporte', icon: Truck },
] as const;

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signIn, signOut } = useAuth();

  function handleNav(path: string) {
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

  function isActive(path: string) {
    if (path === '/#solicitar') return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-[#1a2744] bg-[#080d18]/95 backdrop-blur-xl safe-bottom sm:hidden">
      <div className="flex items-stretch justify-around">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => handleNav(path)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                active
                  ? 'text-[#FF5722]'
                  : 'text-slate-500 active:text-slate-300'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </button>
          );
        })}

        {/* Cuenta */}
        <button
          onClick={() => (user ? signOut() : signIn())}
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold text-slate-500 active:text-slate-300 transition-colors"
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

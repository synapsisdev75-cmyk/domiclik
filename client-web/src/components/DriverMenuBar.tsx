import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Map, MessageCircle, UserRound } from 'lucide-react';

/** Menú de cabina estilo inDriver: 4 destinos, icono grande y nombre corto. */
const ITEMS = [
  { path: '/transportista?tab=hoy', tab: 'hoy', label: 'Pedidos', icon: ClipboardList },
  { path: '/transportista?tab=mapa', tab: 'mapa', label: 'Mapa', icon: Map },
  { path: '/transportista?tab=radio', tab: 'radio', label: 'Chat', icon: MessageCircle },
  { path: '/transportista?tab=perfil', tab: 'perfil', label: 'Perfil', icon: UserRound },
] as const;

export function DriverMenuBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = new URLSearchParams(location.search).get('tab') || 'hoy';

  return (
    <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
      {ITEMS.map(({ path, tab, label, icon: Icon }) => {
        const active =
          location.pathname.startsWith('/transportista') && currentTab === tab;
        return (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className={`flex min-h-[3.6rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 ${
              active ? 'text-[#FF5722]' : 'text-[var(--domi-muted)]'
            }`}
          >
            <span
              className={`flex h-9 w-[3.25rem] items-center justify-center rounded-2xl ${
                active ? 'bg-[rgba(255,87,34,0.16)]' : ''
              }`}
            >
              <Icon className="h-6 w-6" strokeWidth={active ? 2.6 : 1.8} />
            </span>
            <span className="text-[11px] font-extrabold leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

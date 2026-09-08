import React from 'react';
import { LogOut } from 'lucide-react';
import { BrandIcon, BrandIconKey } from './brand/BrandAssets';
import type { AdminSection } from './admin/AdminSectionPanels';
import { sidebarSectionsFor } from '../lib/staffAccess';
import type { StaffRole } from '../types';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout?: () => void;
  staffRole?: StaffRole;
}

const ALL_ITEMS: { id: AdminSection; label: string; icon: BrandIconKey }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'solicitudes', label: 'Solicitudes', icon: 'solicitudes' },
  { id: 'flota', label: 'Flota', icon: 'flota' },
  { id: 'envios', label: 'Envíos', icon: 'envios' },
  { id: 'incidentes', label: 'Incidentes', icon: 'incidentes' },
  { id: 'rutas', label: 'Rutas', icon: 'rutas' },
  { id: 'historial', label: 'Historial', icon: 'historial' },
  { id: 'reportes', label: 'Control', icon: 'control' },
  { id: 'nomina', label: 'Nómina', icon: 'nomina' },
  { id: 'secretaria', label: 'Informes', icon: 'historial' },
  { id: 'chats', label: 'Radios', icon: 'operadores' },
  { id: 'usuarios', label: 'Usuarios', icon: 'usuarios' },
  { id: 'ajustes', label: 'Ajustes', icon: 'ajuste' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onLogout,
  staffRole = 'admin',
}) => {
  const allowed = new Set(sidebarSectionsFor(staffRole));
  const menuItems = ALL_ITEMS.filter((item) => allowed.has(item.id));

  return (
    <aside className="w-20 sm:w-24 bg-[#05080f]/95 border-r border-[#1a2744] flex flex-col items-center py-4 justify-between shrink-0 select-none min-h-screen backdrop-blur-md">
      <div className="w-full flex flex-col items-center gap-2 px-1.5">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={item.label}
              className={`group w-full py-2.5 px-0.5 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative ${
                isActive
                  ? 'bg-[#121018]/80 text-white border border-[#FF5722]/70 shadow-[0_0_22px_rgba(255,87,34,0.35)]'
                  : 'text-slate-500 hover:text-white hover:bg-[#0D1527]/40 border border-transparent'
              }`}
            >
              {isActive && (
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-[#FF5722] shadow-[0_0_12px_#FF5722]" />
              )}

              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-transparent">
                <BrandIcon name={item.icon} className="w-7 h-7" active={isActive} />
              </div>

              <span
                className={`text-[9px] font-bold tracking-tight text-center leading-tight ${
                  isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {onLogout && (
        <div className="w-full px-1.5 pt-3 border-t border-[#1a2744]/80">
          <button
            onClick={onLogout}
            className="w-full py-2.5 rounded-2xl bg-red-950/25 hover:bg-red-900/35 border border-red-500/35 text-red-400 flex flex-col items-center justify-center gap-1 transition"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
            <span className="text-[9px] font-extrabold text-center leading-tight">Salir</span>
          </button>
        </div>
      )}
    </aside>
  );
};

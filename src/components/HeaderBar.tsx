import React, { useState, useEffect } from 'react';
import { User, ChevronDown, Sparkles } from 'lucide-react';
import { BrandLogo } from './brand/BrandAssets';
import { InstallAppButton } from './InstallAppButton';

interface HeaderBarProps {
  currentUserEmail?: string;
  onOpenBrandModal?: () => void;
  onLogout?: () => void;
  onSelectRole?: (role: any) => void;
  realtimeLive?: boolean;
  realtimeLabel?: string;
  canAccessAdmin?: boolean;
  roleLabel?: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentUserEmail,
  onOpenBrandModal,
  onLogout,
  onSelectRole,
  realtimeLive,
  realtimeLabel,
  canAccessAdmin = false,
  roleLabel,
}) => {
  const [timeString, setTimeString] = useState<string>('');
  const [dateString, setDateString] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString('en-GB', { hour12: false }));
      setDateString(
        now
          .toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
          .toUpperCase()
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-[#05080f]/95 border-b border-[#1a2744] px-4 sm:px-6 py-3 flex items-center justify-between gap-4 select-none relative z-30 backdrop-blur-md">
      <div className="flex items-center gap-3 cursor-pointer group" onClick={onOpenBrandModal}>
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-transparent flex items-center justify-center overflow-visible p-0.5">
            <BrandLogo variant="mark" className="w-11 h-11" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00E676]" />
          </span>
        </div>
        <div>
          <h1 className="font-black text-2xl sm:text-3xl tracking-tight text-white italic font-display flex items-center gap-0.5 leading-none">
            <span className="text-[#0052FF] drop-shadow-[0_0_10px_rgba(0,82,255,0.5)]">Domi</span>
            <span className="text-[#FF5722] drop-shadow-[0_0_12px_rgba(255,87,34,0.6)]">Click</span>
          </h1>
          <p className="text-[11px] font-medium text-slate-400 tracking-tight mt-0.5">
            Excelencia a un click de ti.
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-4 bg-[#0a101c]/90 border border-[#1a2744] px-4 py-2 rounded-2xl shadow-inner">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${realtimeLive ? 'bg-[#00E676]' : 'bg-amber-400'}`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${realtimeLive ? 'bg-[#00E676]' : 'bg-amber-400'}`} />
          </span>
          <span className={`text-xs font-black tracking-wider uppercase font-tech ${realtimeLive ? 'text-[#00E676]' : 'text-amber-400'}`}>
            {realtimeLabel || (realtimeLive ? 'EN VIVO · Firebase' : 'SISTEMA ACTIVO')}
          </span>
        </div>
        <div className="h-4 w-px bg-[#1a2744]" />
        <div className="text-center font-tech">
          <div className="text-xs font-bold text-white tracking-widest">{timeString}</div>
          <div className="text-[10px] text-slate-400 font-medium">{dateString}</div>
        </div>
        <div className="h-4 w-px bg-[#1a2744] hidden lg:block" />
        <div className="hidden lg:block">
          <InstallAppButton />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="lg:hidden">
          <InstallAppButton compact />
        </div>
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-3 bg-[#090F1E] hover:bg-[#0E172C] border border-[#182643] px-3.5 py-2 rounded-2xl transition shadow-lg"
          >
            <div className="w-8 h-8 rounded-full bg-[#111C33] border border-[#00E5FF]/40 flex items-center justify-center">
              <User className="w-4 h-4 text-[#00E5FF]" />
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold text-white leading-tight">
                {roleLabel || (canAccessAdmin ? 'Admin Operador' : 'Usuario')}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {canAccessAdmin ? 'Modo Administrador' : 'Acceso restringido'}
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-[#0A0F1D] border border-[#1A2846] rounded-2xl shadow-2xl p-2 z-50 space-y-1 font-mono text-xs">
              <div className="px-3 py-2 border-b border-[#1A2846] text-slate-300">
                <p className="text-[10px] text-slate-400">Usuario Conectado:</p>
                <p className="font-bold text-white truncate">
                  {currentUserEmail || 'admin@domiclick.com'}
                </p>
              </div>
              {onSelectRole && (
                <>
                  {canAccessAdmin && (
                    <button
                      onClick={() => {
                        onSelectRole('admin');
                        setIsDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#14223E] text-slate-200 font-semibold"
                    >
                      Vista Admin Operador
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onSelectRole('driver');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#14223E] text-[#FF5722] font-semibold"
                  >
                    Vista Cabina Motorizado
                  </button>
                </>
              )}
              {onOpenBrandModal && (
                <button
                  onClick={() => {
                    onOpenBrandModal();
                    setIsDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#14223E] text-[#00E5FF] font-semibold flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Manual de Marca
                </button>
              )}
              {onLogout && (
                <button
                  onClick={() => {
                    onLogout();
                    setIsDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl bg-red-950/40 text-red-300 font-bold mt-2"
                >
                  Cerrar Sesión
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

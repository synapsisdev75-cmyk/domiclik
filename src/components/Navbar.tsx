import React from 'react';
import { UserRole, MotorizadoDriver } from '../types';
import { UserPlus, LogOut, CheckCircle2, XCircle, UserCheck, Sparkles, Activity } from 'lucide-react';
import { DomiClickBrandHeader } from './DomiClickBrandHeader';
import { DomiTowerIcon, DomiMotoIcon, DomiRadarIcon } from './ui/CustomIcons';

interface NavbarProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  currentUserEmail?: string;
  activeDriverProfile?: MotorizadoDriver | null;
  onToggleDriverStatus?: (isActive: boolean) => void;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  pendingApprovalsCount: number;
  onOpenBrandModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onSelectRole,
  currentUserEmail,
  activeDriverProfile,
  onToggleDriverStatus,
  onOpenAuthModal,
  onLogout,
  pendingApprovalsCount,
  onOpenBrandModal,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#070A12]/95 backdrop-blur-2xl border-b border-[#00F0FF]/25 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
      {/* Top Cybernetic Beam Line */}
      <div className="h-1 w-full bg-gradient-to-r from-[#00F0FF] via-[#FF5722] to-[#00E676] animate-pulse" />

      {/* Live Telemetry Banner Bar */}
      <div className="bg-[#0D1322] px-4 py-1.5 border-b border-[#1E293B] text-xs flex flex-wrap items-center justify-between gap-2 text-slate-300 font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-[#00F0FF] bg-[#00F0FF]/10 px-2 py-0.5 rounded border border-[#00F0FF]/30 font-black tracking-widest">
            <Activity className="w-3 h-3 text-[#00F0FF] animate-spin" />
            <span>ESTACIÓN DESPACHO // VILLAVICENCIO</span>
          </div>

          <span className="text-slate-400 font-bold hidden lg:inline text-[11px]">
            "DomiClick: Excelencia a un click de ti." • GPS HZ: 50Hz
          </span>

          {onOpenBrandModal && (
            <button
              onClick={onOpenBrandModal}
              className="bg-[#FF5722]/20 hover:bg-[#FF5722]/35 text-[#FF5722] border border-[#FF5722]/50 text-[10px] font-black px-2.5 py-0.5 rounded-md transition shadow-[0_0_10px_rgba(255,87,34,0.3)] flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-[#FF5722]" />
              <span>Manual de Marca</span>
            </button>
          )}
        </div>

        {/* Quick Role Switcher Buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-bold mr-1 text-[11px] hidden sm:inline">Modo:</span>
          <button
            onClick={() => onSelectRole('admin')}
            className={`px-3 py-1 rounded-lg font-black text-[11px] transition flex items-center gap-1.5 border ${
              currentRole === 'admin'
                ? 'bg-[#0052FF] text-white border-[#00F0FF] shadow-[0_0_15px_rgba(0,82,255,0.6)]'
                : 'bg-[#0B101D] text-slate-300 border-[#1E293B] hover:border-[#00F0FF]/40'
            }`}
          >
            <DomiTowerIcon className="w-3.5 h-3.5" color={currentRole === 'admin' ? '#00F0FF' : '#94A3B8'} />
            <span>ADMIN</span>
            {pendingApprovalsCount > 0 && (
              <span className="bg-[#FF5722] text-white font-black text-[9px] px-1.5 py-0.2 rounded-full animate-pulse shadow-md">
                {pendingApprovalsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectRole('driver')}
            className={`px-3 py-1 rounded-lg font-black text-[11px] transition flex items-center gap-1.5 border ${
              currentRole === 'driver'
                ? 'bg-[#FF5722] text-white border-[#FF5722] shadow-[0_0_15px_rgba(255,87,34,0.6)]'
                : 'bg-[#0B101D] text-slate-300 border-[#1E293B] hover:border-[#FF5722]/40'
            }`}
          >
            <DomiMotoIcon className="w-3.5 h-3.5" color={currentRole === 'driver' ? '#FFFFFF' : '#FF5722'} />
            <span>MOTORIZADO</span>
          </button>

          <button
            onClick={() => onSelectRole('pending_driver')}
            className={`px-3 py-1 rounded-lg font-black text-[11px] transition flex items-center gap-1.5 border ${
              currentRole === 'pending_driver'
                ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.6)]'
                : 'bg-[#0B101D] text-slate-300 border-[#1E293B] hover:border-indigo-500/40'
            }`}
          >
            <UserPlus className="w-3 h-3 text-indigo-400" />
            <span>REGISTRO</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Slogan Header */}
        <div className="cursor-pointer" onClick={onOpenBrandModal || (() => onSelectRole('admin'))}>
          <DomiClickBrandHeader compact showSlogan={true} />
        </div>

        {/* Center Mode Selector */}
        <nav className="hidden md:flex items-center gap-2 bg-[#0B101D] p-1.5 rounded-2xl border border-[#1E293B]">
          <button
            onClick={() => onSelectRole('admin')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 border ${
              currentRole === 'admin'
                ? 'bg-[#0052FF] text-white border-[#00F0FF] shadow-[0_0_20px_rgba(0,82,255,0.5)]'
                : 'text-slate-300 border-transparent hover:text-white hover:bg-[#1E293B]'
            }`}
          >
            <DomiTowerIcon className="w-4 h-4" color={currentRole === 'admin' ? '#00F0FF' : '#94A3B8'} />
            <span>Torre de Control (Admin)</span>
          </button>

          <button
            onClick={() => onSelectRole('driver')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 border ${
              currentRole === 'driver'
                ? 'bg-[#FF5722] text-white border-[#FF3D00] shadow-[0_0_20px_rgba(255,87,34,0.5)]'
                : 'text-slate-300 border-transparent hover:text-white hover:bg-[#1E293B]'
            }`}
          >
            <DomiMotoIcon className="w-4 h-4" color={currentRole === 'driver' ? '#FFFFFF' : '#FF5722'} />
            <span>Cabina Motorizado</span>
          </button>
        </nav>

        {/* Right Section: Motorizado Availability Toggle OR Auth Controls */}
        <div className="flex items-center gap-3">
          {/* Driver Active/Inactive Button if in Driver Role */}
          {currentRole === 'driver' && activeDriverProfile && onToggleDriverStatus && (
            <div className="flex items-center gap-2 bg-[#0B101D] p-1.5 pl-3 rounded-2xl border border-[#1E293B]">
              <div className="text-right hidden sm:block">
                <span className="text-xs font-black text-white block">
                  {activeDriverProfile.fullName.split(' ')[0]} ({activeDriverProfile.plateNumber})
                </span>
                <span className={`text-[10px] font-bold block ${activeDriverProfile.isActive ? 'text-[#00E676]' : 'text-slate-400'}`}>
                  {activeDriverProfile.isActive ? '🟢 EN LÍNEA // ACTIVO' : '⚫ FUERA DE SERVICIO'}
                </span>
              </div>

              <button
                onClick={() => onToggleDriverStatus(!activeDriverProfile.isActive)}
                className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg border ${
                  activeDriverProfile.isActive
                    ? 'bg-[#FF5722] text-white border-[#FF3D00] hover:bg-[#e04818] shadow-[0_0_15px_rgba(255,87,34,0.4)]'
                    : 'bg-[#1E293B] text-slate-300 border-[#334155] hover:bg-[#334155]'
                }`}
              >
                {activeDriverProfile.isActive ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>ACTIVO</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-slate-400" />
                    <span>INACTIVO</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* User Auth Info */}
          {currentUserEmail ? (
            <div className="flex items-center gap-2">
              <div className="hidden lg:block text-right font-mono">
                <span className="text-xs font-bold text-slate-200 block truncate max-w-[140px]">
                  {currentUserEmail}
                </span>
                <span className="text-[10px] text-[#00E676] font-black block">
                  ● CONECTADO
                </span>
              </div>
              <button
                onClick={onLogout}
                title="Cerrar Sesión"
                className="p-2.5 rounded-xl bg-[#0B101D] hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-[#1E293B] hover:border-red-500/40 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="bg-[#0052FF] hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black transition shadow-[0_0_20px_rgba(0,82,255,0.4)] border border-[#00F0FF] flex items-center gap-1.5"
            >
              <UserCheck className="w-4 h-4 text-[#00F0FF]" />
              <span>INGRESAR</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};



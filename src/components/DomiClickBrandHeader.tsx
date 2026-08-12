import React from 'react';
import { BrandLogo } from './brand/BrandAssets';

interface DomiClickBrandHeaderProps {
  compact?: boolean;
  showSlogan?: boolean;
  className?: string;
  onClickBrand?: () => void;
}

export const DomiClickBrandHeader: React.FC<DomiClickBrandHeaderProps> = ({
  compact = false,
  showSlogan = true,
  className = '',
  onClickBrand,
}) => {
  return (
    <div
      onClick={onClickBrand}
      className={`relative flex flex-col items-start select-none ${onClickBrand ? 'cursor-pointer group' : ''} ${className}`}
    >
      <div className="flex items-center gap-3 relative">
        <div className="relative">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-transparent flex items-center justify-center relative overflow-visible transition-all duration-300 group-hover:scale-105 p-0.5">
            <BrandLogo variant="mark" className="w-full h-full" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-80" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#00E676] border border-black" />
          </span>
        </div>

        <div>
          <h1
            className={`font-black tracking-tight text-white italic font-display flex items-center gap-0.5 leading-none ${
              compact ? 'text-xl' : 'text-3xl sm:text-4xl'
            }`}
          >
            <span className="text-[#0052FF] drop-shadow-[0_0_10px_rgba(0,82,255,0.5)]">Domi</span>
            <span className="text-[#FF5722] drop-shadow-[0_0_12px_rgba(255,87,34,0.6)]">Click</span>
          </h1>
          {showSlogan && (
            <p className="text-[11px] sm:text-xs font-medium text-slate-400 tracking-tight mt-1">
              Excelencia a un click de ti.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

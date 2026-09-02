import React from 'react';
import { BrandIcon, BrandIconKey } from '../brand/BrandAssets';
import { GripVertical } from 'lucide-react';

export type WallKpiData = {
  activeDrivers: number;
  approvedDrivers: number;
  activePct: number;
  pendingOrders: number;
  transitOrders: number;
  deliveredToday: number;
};

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: BrandIconKey;
  accent: 'orange' | 'cyan' | 'amber' | 'red';
  large?: boolean;
  pulse?: boolean;
};

function KpiCard({ label, value, sub, icon, accent, large, pulse }: KpiCardProps) {
  const border =
    accent === 'orange'
      ? 'neon-border-orange'
      : accent === 'cyan'
        ? 'neon-border-cyan'
        : 'border-[#182B4D]';
  const valueColor =
    accent === 'cyan' ? 'text-[#00E5FF]' : accent === 'red' ? 'text-[#FF5722]' : 'text-white';

  return (
    <div
      className={`bg-[#0B1222]/95 border rounded-2xl p-3 sm:p-4 transition-all duration-500 ${border} ${
        pulse ? 'map-wall-kpi-pulse' : ''
      } ${large ? 'p-5 sm:p-6' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] text-slate-400 font-tech font-bold uppercase tracking-wider block">
            {label}
          </span>
          <div
            className={`font-black font-tech mt-1 flex items-baseline gap-1 ${
              large ? 'text-4xl sm:text-5xl' : 'text-2xl'
            } ${valueColor}`}
          >
            {value}
          </div>
          <span className="text-[10px] text-slate-400 font-tech font-bold block mt-1">{sub}</span>
        </div>
        <BrandIcon
          name={icon}
          className={large ? 'w-16 h-16 sm:w-20 sm:h-20 map-wall-icon-float' : 'w-11 h-11 sm:w-12 sm:h-12'}
        />
      </div>
    </div>
  );
}

interface MapWallKpiStripProps {
  data: WallKpiData;
  large?: boolean;
  className?: string;
}

export function MapWallKpiStrip({ data, large, className = '' }: MapWallKpiStripProps) {
  const {
    activeDrivers,
    approvedDrivers,
    activePct,
    pendingOrders,
    transitOrders,
    deliveredToday,
  } = data;

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 ${className}`}>
      <KpiCard
        label="Motorizados activos"
        value={
          <>
            <span>{activeDrivers}</span>
            <span className="text-xs text-slate-400 font-normal">/ {approvedDrivers}</span>
          </>
        }
        sub={approvedDrivers ? `${activePct}% en línea` : 'Sin flota'}
        icon="kpiMotorizados"
        accent="orange"
        large={large}
        pulse={activeDrivers > 0}
      />
      <KpiCard
        label="Solicitudes pendientes"
        value={pendingOrders}
        sub={pendingOrders ? 'En espera' : 'Sin pendientes'}
        icon="kpiSolicitudes"
        accent="cyan"
        large={large}
        pulse={pendingOrders > 0}
      />
      <KpiCard
        label="Envíos en tránsito"
        value={transitOrders}
        sub="En curso ahora"
        icon="kpiTransito"
        accent="cyan"
        large={large}
        pulse={transitOrders > 0}
      />
      <KpiCard
        label="Entregas hoy"
        value={deliveredToday}
        sub="Completadas"
        icon="kpiEntregas"
        accent="red"
        large={large}
        pulse={deliveredToday > 0}
      />
    </div>
  );
}

interface DraggableKpiPanelProps extends MapWallKpiStripProps {
  pos: { x: number; y: number };
  onDragStart: (e: React.PointerEvent) => void;
}

export function DraggableKpiPanel({ data, pos, onDragStart }: DraggableKpiPanelProps) {
  return (
    <div
      className="absolute z-[100] w-[min(920px,calc(100vw-2rem))] map-wall-float-panel"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-t-xl bg-[#0A1122]/90 border border-b-0 border-[#1A2D52] cursor-grab active:cursor-grabbing"
        onPointerDown={onDragStart}
      >
        <GripVertical className="w-4 h-4 text-slate-500" />
        <span className="text-[10px] font-tech text-slate-400 uppercase tracking-wider">
          Indicadores · arrastre para mover
        </span>
      </div>
      <div className="p-2 sm:p-3 rounded-b-xl bg-[#070B16]/92 backdrop-blur-md border border-[#1A2D52] shadow-2xl">
        <MapWallKpiStrip data={data} />
      </div>
    </div>
  );
}

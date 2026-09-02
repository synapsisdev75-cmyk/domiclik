import React, { useEffect, useRef } from 'react';
import { BrandLogo } from '../brand/BrandAssets';
import { MapWallKpiStrip, WallKpiData } from './MapWallKpiStrip';

interface MapWallPulseSceneProps {
  kpi: WallKpiData;
  clock: string;
  liveLabel: string;
  liveColor: string;
  videoUrl: string;
  active?: boolean;
  onEnded: () => void;
  onProgress?: (pct: number) => void;
}

export const MapWallPulseScene: React.FC<MapWallPulseSceneProps> = ({
  kpi,
  clock,
  liveLabel,
  liveColor,
  videoUrl,
  active = true,
  onEnded,
  onProgress,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);
  onEndedRef.current = onEnded;
  onProgressRef.current = onProgress;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !active) return;

    el.muted = true;
    el.defaultMuted = true;
    el.currentTime = 0;

    const tryPlay = () => {
      void el.play().catch(() => undefined);
    };

    const onTimeUpdate = () => {
      if (!el.duration || !Number.isFinite(el.duration)) return;
      onProgressRef.current?.(Math.min(100, (el.currentTime / el.duration) * 100));
    };

    const handleEnded = () => onEndedRef.current();

    el.load();
    tryPlay();
    el.addEventListener('loadeddata', tryPlay);
    el.addEventListener('canplay', tryPlay);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('ended', handleEnded);

    const onInteract = () => tryPlay();
    document.addEventListener('pointerdown', onInteract, { once: true });

    return () => {
      el.pause();
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('canplay', tryPlay);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('ended', handleEnded);
      document.removeEventListener('pointerdown', onInteract);
    };
  }, [active, videoUrl]);

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        key={`${active ? 'on' : 'off'}-${videoUrl}`}
        className="absolute inset-0 h-full w-full object-cover z-[1] map-wall-video-fade"
        src={videoUrl}
        autoPlay
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-label="Proyección pantalla secundaria"
      />

      <div
        className="absolute inset-0 z-[2] pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(5,8,15,0.45) 0%, transparent 35%, rgba(5,8,15,0.75) 100%)',
        }}
      />

      <div className="absolute inset-0 z-[3] flex flex-col min-h-0 pointer-events-none">
        <div className="shrink-0 p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <BrandLogo variant="neon" className="h-10 sm:h-12 map-wall-logo-glow" neon />
            <p className="text-[10px] font-tech text-slate-300 mt-2 uppercase tracking-wider">
              Radar operativo · pantalla secundaria
            </p>
          </div>
          <div className="text-right">
            <span className={`text-[10px] font-black font-tech tracking-wider ${liveColor} map-wall-live-dot`}>
              {liveLabel}
            </span>
            <p className="text-xl sm:text-2xl font-black font-tech text-white tabular-nums drop-shadow-lg">
              {clock}
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0" />

        <div className="shrink-0 px-3 sm:px-5 pb-4 pt-2 bg-[#05080f]/80 backdrop-blur-md border-t border-[#1A2D52]/60">
          <MapWallKpiStrip data={kpi} large />
        </div>
      </div>
    </div>
  );
};

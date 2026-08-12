import React, { useState, useEffect } from 'react';
import { Download, Check, Share } from 'lucide-react';
import { BrandLogo } from './brand/BrandAssets';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Instala / descarga DomiClick como App Web (PWA).
 */
export const InstallAppButton: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) setInstalled(true);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferred(null);
      return;
    }

    if (isIOS) {
      setHint('En Safari: Compartir → “Añadir a pantalla de inicio”');
      return;
    }

    try {
      const res = await fetch('/manifest.webmanifest');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'domiclick-app.webmanifest';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    setHint('Menú del navegador → “Instalar aplicación” o “Instalar DomiClick”');
  };

  if (installed) {
    return (
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00E676]/15 border border-[#00E676]/40 text-[#00E676] text-[11px] font-bold font-tech"
        title="App instalada"
      >
        <Check className="w-3.5 h-3.5" />
        {!compact && <span>App instalada</span>}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleInstall}
        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF5722]/15 hover:bg-[#FF5722]/25 border border-[#FF5722]/50 text-[#FF5722] text-[11px] font-bold font-tech transition shadow-[0_0_12px_rgba(255,87,34,0.2)] hover:shadow-[0_0_20px_rgba(255,87,34,0.45)]"
        title="Descargar / instalar app web DomiClick"
      >
        {isIOS ? <Share className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
        {!compact && <span>Descargar App Web</span>}
        <BrandLogo variant="mark" className="w-4 h-4 ml-0.5" />
      </button>
      {hint && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 p-3 rounded-xl bg-[#0a101c] border border-[#1a2744] text-[11px] text-slate-300 shadow-2xl">
          {hint}
          <button
            type="button"
            className="block mt-2 text-[#00E5FF] font-bold"
            onClick={() => setHint(null)}
          >
            Entendido
          </button>
        </div>
      )}
    </div>
  );
};

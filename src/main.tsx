import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { unlockAlertAudio } from './lib/alerts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Desbloquear Web Audio tras el primer gesto (requerido por el navegador)
const unlockOnce = () => {
  unlockAlertAudio();
  window.removeEventListener('pointerdown', unlockOnce);
  window.removeEventListener('keydown', unlockOnce);
};
window.addEventListener('pointerdown', unlockOnce);
window.addEventListener('keydown', unlockOnce);

// PWA: en desarrollo NO registrar SW. En prod: network-first + limpia caches viejos.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      if (import.meta.env.DEV) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      // Fuerza toma de control del SW nuevo (evita pantallas negras por JS/CSS cacheado)
      if (reg.waiting) reg.waiting.postMessage?.({ type: 'SKIP_WAITING' });
      reg.update().catch(() => undefined);
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('domiclick-') && k !== 'domiclick-v5-shell').map((k) => caches.delete(k))
      );
    } catch (err) {
      console.warn('Service worker setup failed', err);
    }
  });
}

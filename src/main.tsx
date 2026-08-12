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

// PWA: en desarrollo NO registrar SW (evita JS/datos fantasma). En prod: network-first.
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
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.warn('Service worker setup failed', err);
    }
  });
}

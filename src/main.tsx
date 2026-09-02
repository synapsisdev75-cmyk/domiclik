import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { unlockAlertAudio } from './lib/alerts';
import { BootErrorBoundary } from './components/BootErrorBoundary';
import { setupBootRecovery, registerServiceWorkerSafely } from './lib/bootRecovery';

setupBootRecovery();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No se encontró #root en la página');
}

createRoot(rootEl).render(
  <StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </StrictMode>
);

const unlockOnce = () => {
  unlockAlertAudio();
  window.removeEventListener('pointerdown', unlockOnce);
  window.removeEventListener('keydown', unlockOnce);
};
window.addEventListener('pointerdown', unlockOnce);
window.addEventListener('keydown', unlockOnce);

void registerServiceWorkerSafely();

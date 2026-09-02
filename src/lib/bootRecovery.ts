import { safeGetItem, safeRemoveItem, safeSetItem, safeSessionStorage } from './safeStorage';

const RECOVERY_KEY = 'domiclick_boot_recovery';

/** Recuperación automática si falla la carga del JS principal (caché viejo / SW). */
export function setupBootRecovery() {
  if (typeof window === 'undefined') return;

  const tryRecovery = async (reason: string) => {
    const ss = safeSessionStorage();
    const count = Number((ss ? safeGetItem(ss, RECOVERY_KEY) : null) || '0');
    if (count >= 2) return;
    if (ss) safeSetItem(ss, RECOVERY_KEY, String(count + 1));
    console.warn('[DomiClick] Boot recovery:', reason);

    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* ignore */
    }

    const url = new URL(window.location.href);
    if (!url.searchParams.has('fresh')) {
      url.searchParams.set('fresh', String(Date.now()));
      window.location.replace(url.toString());
    }
  };

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'SCRIPT') {
        void tryRecovery('script-load-error');
        return;
      }
      const msg = event.message || '';
      if (/Importing a module script failed|Failed to fetch dynamically imported module/i.test(msg)) {
        void tryRecovery('module-import-error');
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = String(event.reason?.message || event.reason || '');
    if (/Importing a module script failed|Failed to fetch dynamically imported module|ChunkLoadError/i.test(reason)) {
      void tryRecovery('chunk-rejection');
    }
  });

  // Carga OK → reset contador
  window.setTimeout(() => {
    const ss = safeSessionStorage();
    if (ss) safeRemoveItem(ss, RECOVERY_KEY);
    const boot = document.getElementById('domiclick-boot');
    if (boot) boot.remove();
  }, 8000);
}

export async function registerServiceWorkerSafely() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    if ('serviceWorker' in navigator && import.meta.env.DEV) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
    }
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    if (reg.waiting) reg.waiting.postMessage?.({ type: 'SKIP_WAITING' });
    reg.update().catch(() => undefined);
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('domiclick-') && k !== 'domiclick-v13-shell').map((k) =>
        caches.delete(k)
      )
    );
  } catch (err) {
    console.warn('Service worker setup failed', err);
  }
}

import { useEffect, useState } from 'react';

const COOKIE_KEY = 'domiclick_cookie_prefs';

type CookieChoice = 'all' | 'essential' | 'custom';

type CookiePrefs = {
  choice: CookieChoice;
  analytics: boolean;
  marketing: boolean;
  at: number;
};

function readPrefs(): CookiePrefs | null {
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CookiePrefs;
  } catch {
    return null;
  }
}

function savePrefs(prefs: CookiePrefs) {
  localStorage.setItem(COOKIE_KEY, JSON.stringify(prefs));
}

/**
 * Banner de cookies (web). Texto alineado a la Política de Cookies DomiClick.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!readPrefs()) setOpen(true);
  }, []);

  if (!open) return null;

  function acceptAll() {
    savePrefs({ choice: 'all', analytics: true, marketing: true, at: Date.now() });
    setOpen(false);
  }

  function rejectNonEssential() {
    savePrefs({ choice: 'essential', analytics: false, marketing: false, at: Date.now() });
    setOpen(false);
  }

  function saveCustom() {
    savePrefs({
      choice: 'custom',
      analytics,
      marketing,
      at: Date.now(),
    });
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
      role="dialog"
      aria-label="Preferencias de cookies"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-surface)] p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] sm:p-5">
        <p className="text-sm leading-relaxed text-[var(--domi-text)]">
          Utilizamos cookies necesarias para el funcionamiento de la página y, con su elección,
          cookies de preferencias, analítica y marketing. Puede aceptar todas, rechazar las no
          esenciales o configurar sus preferencias. Consulte nuestra{' '}
          <a
            href="/cookies.html"
            className="font-semibold text-[var(--domi-cyan)] underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Política de Cookies
          </a>{' '}
          para obtener más información.
        </p>

        {configOpen ? (
          <div className="mt-3 space-y-2 rounded-xl border border-[var(--domi-border)] bg-[var(--domi-panel)] px-3 py-3 text-sm text-[var(--domi-text)]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked disabled className="accent-[var(--domi-orange)]" />
              <span>Necesarias (siempre activas)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-[var(--domi-orange)]"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
              />
              <span>Analíticas / estadísticas</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-[var(--domi-orange)]"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
              />
              <span>Marketing / publicidad</span>
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="cta-primary text-sm" onClick={acceptAll}>
            Aceptar todas
          </button>
          {configOpen ? (
            <button
              type="button"
              className="cta-ghost text-sm"
              onClick={saveCustom}
            >
              Guardar preferencias
            </button>
          ) : (
            <button
              type="button"
              className="cta-ghost text-sm"
              onClick={() => setConfigOpen(true)}
            >
              Configurar cookies
            </button>
          )}
          <button
            type="button"
            className="rounded-full border border-[var(--domi-border)] px-4 py-2 text-sm font-semibold text-[var(--domi-muted)] transition hover:text-[var(--domi-text)]"
            onClick={rejectNonEssential}
          >
            Rechazar no esenciales
          </button>
        </div>
      </div>
    </div>
  );
}

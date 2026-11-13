import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { getCurrentTheme, THEME_CHANGE_EVENT, toggleTheme, type ThemeMode } from '../lib/theme';

const TRAVEL = 28;

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(() => getCurrentTheme());
  const [dragX, setDragX] = useState<number | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startKnob = useRef(0);
  const moved = useRef(0);
  const skipClick = useRef(false);

  useEffect(() => {
    const sync = () => setMode(getCurrentTheme());
    window.addEventListener('storage', sync);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);

  const previewLight = dragX != null ? dragX < TRAVEL / 2 : mode === 'light';
  const knobX = dragX != null ? dragX : mode === 'dark' ? TRAVEL : 0;

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    dragging.current = true;
    moved.current = 0;
    startX.current = event.clientX;
    startKnob.current = mode === 'dark' ? TRAVEL : 0;
    setDragX(startKnob.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    const dx = event.clientX - startX.current;
    moved.current = Math.max(moved.current, Math.abs(dx));
    setDragX(Math.min(TRAVEL, Math.max(0, startKnob.current + dx)));
  };

  const finishDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    skipClick.current = true;
    if (moved.current < 6) {
      setDragX(null);
      setMode(toggleTheme());
      return;
    }
    const next: ThemeMode = (dragX ?? 0) > TRAVEL / 2 ? 'dark' : 'light';
    setDragX(null);
    if (next !== getCurrentTheme()) setMode(toggleTheme());
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={mode === 'light'}
      className={`theme-switch ${previewLight ? 'theme-switch--light' : 'theme-switch--dark'} ${
        dragX != null ? 'is-dragging' : ''
      } ${className}`.trim()}
      aria-label={mode === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
      title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onClick={() => {
        if (skipClick.current) {
          skipClick.current = false;
          return;
        }
        setMode(toggleTheme());
      }}
    >
      <span className="theme-switch__icon theme-switch__icon--moon" aria-hidden>
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path fill="currentColor" d="M14.5 3.2a7.2 7.2 0 1 0 6.3 10.6 6 6 0 1 1-6.3-10.6z" />
          <circle cx="6.2" cy="7.2" r="0.7" fill="currentColor" />
          <circle cx="9.4" cy="5.1" r="0.55" fill="currentColor" />
          <path fill="currentColor" d="M8.1 9.2l.35 1 .95.15-.75.65.25 1-.8-.5-.8.5.25-1-.75-.65.95-.15z" />
        </svg>
      </span>
      <span className="theme-switch__icon theme-switch__icon--sun" aria-hidden>
        <svg viewBox="0 0 24 24" width="14" height="14">
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M12 4.5v2.1M12 17.4v2.1M4.5 12h2.1M17.4 12h2.1M6.7 6.7l1.5 1.5M15.8 15.8l1.5 1.5M17.3 6.7l-1.5 1.5M8.2 15.8l-1.5 1.5" />
          </g>
        </svg>
      </span>
      <span className="theme-switch__knob" style={{ transform: `translateX(${knobX}px)` }} />
    </button>
  );
}

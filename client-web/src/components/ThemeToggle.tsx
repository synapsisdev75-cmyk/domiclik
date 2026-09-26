import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getCurrentTheme, THEME_CHANGE_EVENT, toggleTheme, type ThemeMode } from '../lib/theme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(() => getCurrentTheme());

  useEffect(() => {
    const sync = () => setMode(getCurrentTheme());
    window.addEventListener('storage', sync);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      aria-label={mode === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
      title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      onClick={() => setMode(toggleTheme())}
    >
      {mode === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      <span className="theme-toggle__label">{mode === 'dark' ? 'Claro' : 'Oscuro'}</span>
    </button>
  );
}

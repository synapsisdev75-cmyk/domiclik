export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'domiclick_theme';
export const THEME_CHANGE_EVENT = 'domiclick-theme';

export function readStoredTheme(): ThemeMode | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function systemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveTheme(stored: ThemeMode | null = readStoredTheme()): ThemeMode {
  return stored ?? systemTheme();
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.style.colorScheme = mode;
}

export function persistTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  applyTheme(mode);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
  }
}

export function initTheme() {
  applyTheme(resolveTheme());
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = resolveTheme() === 'light' ? 'dark' : 'light';
  persistTheme(next);
  return next;
}

export function getCurrentTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return resolveTheme();
}

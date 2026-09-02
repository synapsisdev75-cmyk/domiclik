/** Acceso seguro a localStorage/sessionStorage (Safari privado, políticas corporativas). */

export function safeGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(storage: Storage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function safeLocalStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('__domiclick_probe__', '1');
    s.removeItem('__domiclick_probe__');
    return s;
  } catch {
    return null;
  }
}

export function safeSessionStorage(): Storage | null {
  try {
    const s = window.sessionStorage;
    s.setItem('__domiclick_probe__', '1');
    s.removeItem('__domiclick_probe__');
    return s;
  } catch {
    return null;
  }
}

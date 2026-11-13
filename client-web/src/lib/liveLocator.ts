import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type LiveFix = {
  lat: number;
  lng: number;
  accuracy: number;
  /** Metros por segundo. Negativo si el GPS aún no tiene velocidad. */
  speed: number;
  heading: number;
};

type LiveLocatorPlugin = {
  start(): Promise<void>;
  stop(): Promise<void>;
  requestUnrestricted(): Promise<void>;
  addListener(event: 'fix', cb: (fix: LiveFix) => void): Promise<PluginListenerHandle>;
};

const LiveLocator = registerPlugin<LiveLocatorPlugin>('LiveLocator');

export function nativeLocatorAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/** Pide FINE/COARSE antes de arrancar el FGS (evita SecurityException en Android 14+). */
async function ensureLocationPermission(): Promise<boolean> {
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === 'granted' || status.coarseLocation === 'granted') return true;
    const req = await Geolocation.requestPermissions();
    return req.location === 'granted' || req.coarseLocation === 'granted';
  } catch {
    return false;
  }
}

/** Arranca el GPS nativo. Sigue con la pantalla bloqueada. */
export async function startLiveLocator(onFix: (fix: LiveFix) => void): Promise<() => void> {
  const ok = await ensureLocationPermission();
  if (!ok) {
    throw new Error('LOCATION_PERMISSION_REQUIRED');
  }
  try {
    await LiveLocator.start();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (msg.includes('LOCATION_PERMISSION_REQUIRED')) {
      throw new Error('LOCATION_PERMISSION_REQUIRED');
    }
    throw err;
  }
  const handle = await LiveLocator.addListener('fix', onFix);
  void LiveLocator.requestUnrestricted().catch(() => undefined);
  return () => {
    void handle.remove();
  };
}

export async function stopLiveLocator(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LiveLocator.stop().catch(() => undefined);
}

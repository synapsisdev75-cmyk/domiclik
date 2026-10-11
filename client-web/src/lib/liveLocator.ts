import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

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

/** Arranca el GPS nativo. Sigue con la pantalla bloqueada. */
export async function startLiveLocator(onFix: (fix: LiveFix) => void): Promise<() => void> {
  await LiveLocator.start();
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

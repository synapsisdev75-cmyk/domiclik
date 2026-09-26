import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type PreciseLocation = {
  lat: number;
  lng: number;
  /** Metros de precisión reportados por el GPS (menor = mejor). */
  accuracyM: number;
};

function webGeolocation(
  options: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este dispositivo no soporta GPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Ubicación de alta precisión (GPS real).
 * Nativo: Capacitor Geolocation. Web: navigator con enableHighAccuracy.
 * maximumAge: 0 evita caché aproximada de red/IP.
 */
export async function getPreciseLocation(): Promise<PreciseLocation> {
  if (Capacitor.isNativePlatform()) {
    const status = await Geolocation.checkPermissions();
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      const req = await Geolocation.requestPermissions();
      if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
        throw new Error('Activa el permiso de ubicación precisa para DomiClick.');
      }
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 25000,
      maximumAge: 0,
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? 999,
    };
  }

  const pos = await webGeolocation({
    enableHighAccuracy: true,
    timeout: 25000,
    maximumAge: 0,
  });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracyM: pos.coords.accuracy ?? 999,
  };
}

export function preciseLocationErrorMessage(err: unknown): string {
  if (!err) return 'No se pudo obtener la ubicación precisa.';
  if (typeof err === 'object' && err && 'code' in err) {
    const code = Number((err as GeolocationPositionError).code);
    if (code === 1) return 'Permiso de ubicación denegado. Actívalo en Ajustes del teléfono o del navegador.';
    if (code === 2) return 'GPS no disponible. Sal a un lugar abierto e intenta de nuevo.';
    if (code === 3) return 'El GPS tardó demasiado. Intenta de nuevo con buena señal.';
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/permission|denied|permiso/i.test(msg)) {
    return 'Permiso de ubicación denegado. Actívalo en Ajustes.';
  }
  return msg.slice(0, 160) || 'No se pudo obtener la ubicación precisa.';
}

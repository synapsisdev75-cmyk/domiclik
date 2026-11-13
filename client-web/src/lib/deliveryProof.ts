import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header || '')?.[1] || 'image/jpeg';
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function pickFromInput(capture?: 'user' | 'environment'): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = capture;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No se tomó la foto.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer la foto.'));
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/** Abre la cámara del teléfono o, en web, el selector con cámara trasera. */
export async function captureDeliveryPhoto(): Promise<{ dataUrl: string; blob: Blob; file: File }> {
  let dataUrl = '';
  try {
    if (Capacitor.isNativePlatform()) {
      const photo = await Camera.getPhoto({
        quality: 72,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      });
      dataUrl = String(photo.dataUrl || '');
    } else {
      dataUrl = await pickFromInput('environment');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo abrir la cámara.';
    if (/cancel|cancelad/i.test(message)) throw new Error('Captura cancelada. Inténtalo de nuevo.');
    throw new Error('No se pudo abrir la cámara. Revisa el permiso e inténtalo otra vez.');
  }
  if (!dataUrl.startsWith('data:image')) {
    throw new Error('La cámara no devolvió una imagen. Inténtalo de nuevo.');
  }
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], `entrega_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
  return { dataUrl, blob, file };
}

/** Foto de perfil / prerregistro: cámara o galería. */
export async function captureProfilePhoto(
  source: 'camera' | 'photos' = 'photos',
): Promise<{ dataUrl: string; blob: Blob; file: File }> {
  let dataUrl = '';
  try {
    if (Capacitor.isNativePlatform()) {
      const photo = await Camera.getPhoto({
        quality: 78,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        correctOrientation: true,
      });
      dataUrl = String(photo.dataUrl || '');
    } else {
      dataUrl = await pickFromInput(source === 'camera' ? 'user' : undefined);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo abrir la foto.';
    if (/cancel|cancelad/i.test(message)) throw new Error('Captura cancelada. Inténtalo de nuevo.');
    throw new Error('No se pudo abrir la foto. Revisa el permiso e inténtalo otra vez.');
  }
  if (!dataUrl.startsWith('data:image')) {
    throw new Error('No se obtuvo una imagen. Inténtalo de nuevo.');
  }
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], `perfil_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
  return { dataUrl, blob, file };
}

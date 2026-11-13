/** Comprime fotos de tablet/celular antes de Storage (evita cuelgues por MB). */

const DEFAULT_MAX_EDGE = 1280;
const DEFAULT_QUALITY = 0.72;
const UPLOAD_TIMEOUT_MS = 45_000;

/** Mensaje legible para errores Firebase / cuota. */
export function firebaseFriendlyError(err: unknown, fallback = 'Operación fallida.'): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err || '');
  if (
    code.includes('resource-exhausted') ||
    /quota|resource-exhausted|exceeded/i.test(msg)
  ) {
    return (
      'Cuota diaria de Firestore agotada (plan gratis). Activa facturación Blaze en Firebase Console ' +
      'o espera el reinicio (~00:00 hora del Pacífico). Sin escrituras no se puede revelar el PIN.'
    );
  }
  if (code.includes('unauthorized') || code.includes('permission')) {
    return 'Sin permiso para guardar. Revisa Storage/Firestore o recarga la terminal.';
  }
  if (code.includes('unavailable') || /network|offline/i.test(msg)) {
    return 'Sin red o Firebase no responde. Revisa Wi‑Fi de la tablet e inténtalo otra vez.';
  }
  return msg || fallback;
}

export function withUploadTimeout<T>(
  promise: Promise<T>,
  label = 'Subida',
  ms = UPLOAD_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label} tardó demasiado (${Math.round(ms / 1000)}s). Revisa la red de la tablet e inténtalo otra vez.`,
        ),
      );
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen para comprimirla.'));
    img.src = src;
  });
}

/**
 * Reduce a JPEG ≤ maxEdge px. Si falla (p. ej. HEIC sin decode),
 * devuelve el archivo original con tipo image/jpeg forzado si venía vacío.
 */
export async function compressImageFile(
  file: File | Blob,
  opts?: { maxEdge?: number; quality?: number; name?: string },
): Promise<File> {
  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts?.quality ?? DEFAULT_QUALITY;
  const name =
    opts?.name ||
    (file instanceof File && file.name ? file.name.replace(/\.[^.]+$/, '.jpg') : `foto_${Date.now()}.jpg`);

  const type = String(file.type || '');
  if (type && !type.startsWith('image/')) {
    throw new Error('El archivo no es una imagen.');
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImage(objectUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('Imagen vacía');
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Sin canvas');
      ctx.drawImage(img, 0, 0, cw, ch);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
      );
      if (!blob || blob.size < 32) throw new Error('Compresión vacía');
      return new File([blob], name.replace(/[^a-zA-Z0-9._-]/g, '_'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    const bytes = file instanceof File ? file : new File([file], name, { type: type || 'image/jpeg' });
    if (bytes.type && bytes.type.startsWith('image/')) return bytes;
    return new File([bytes], name.replace(/[^a-zA-Z0-9._-]/g, '_'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  }
}

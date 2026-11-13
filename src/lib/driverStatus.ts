/** Normaliza y detecta solicitudes de transportista pendientes. */
export function normalizeDriverStatus(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

/** pending / vacío / aliases que la app o merges antiguos puedan dejar. */
export function isPendingDriverStatus(raw: unknown): boolean {
  const s = normalizeDriverStatus(raw);
  return (
    s === 'pending' ||
    s === 'pendiente' ||
    s === 'awaiting' ||
    s === 'awaiting_approval' ||
    s === 'por_aprobar' ||
    s === ''
  );
}

/**
 * Utilidades VTA → asistencia DomiClick.
 * CSV + resolución in/out.
 */

export type VtaCsvRow = {
  vtaUserId: string;
  at?: string;
  /** Si el export trae tipo explícito (I/O, In/Out, Entrada/Salida). */
  type?: 'in' | 'out';
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function parseType(raw: string | undefined): 'in' | 'out' | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase();
  if (['in', 'i', 'entrada', 'checkin', 'check-in', '1'].includes(t)) return 'in';
  if (['out', 'o', 'salida', 'checkout', 'check-out', '0', '2'].includes(t)) return 'out';
  return undefined;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((c === ',' || c === ';' || c === '\t') && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Parsea export típico del software VTA / attendance. */
export function parseVtaAttendanceCsv(text: string): VtaCsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const first = parseCsvLine(lines[0]);
  const headers = first.map(normalizeHeader);
  const looksLikeHeader = headers.some((h) =>
    ['vtauserid', 'userid', 'user', 'id', 'enrollnumber', 'at', 'datetime', 'time', 'date', 'status', 'type', 'checktype'].includes(
      h,
    ),
  );

  const rows: VtaCsvRow[] = [];
  const start = looksLikeHeader ? 1 : 0;
  const cols = looksLikeHeader
    ? headers
    : ['vtauserid', 'at', 'type'];

  for (let i = start; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (!cells.length) continue;

    const get = (...names: string[]) => {
      for (const n of names) {
        const idx = cols.indexOf(n);
        if (idx >= 0 && cells[idx] != null && String(cells[idx]).trim()) {
          return String(cells[idx]).trim();
        }
      }
      return '';
    };

    const vtaUserId =
      get('vtauserid', 'userid', 'enrollnumber', 'user', 'id') ||
      (!looksLikeHeader ? cells[0] : '');
    if (!vtaUserId) continue;

    const datePart = get('date', 'fecha');
    const timePart = get('time', 'hora');
    const atRaw =
      get('at', 'datetime', 'timestamp', 'checktime') ||
      (datePart && timePart ? `${datePart} ${timePart}` : datePart || timePart) ||
      (!looksLikeHeader ? cells[1] : '');

    let at: string | undefined;
    if (atRaw) {
      const d = new Date(atRaw);
      at = Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
    }

    const type =
      parseType(get('type', 'status', 'checktype', 'estado')) ||
      (!looksLikeHeader ? parseType(cells[2]) : undefined);

    rows.push({ vtaUserId, at, type });
  }

  return rows;
}

/**
 * Si el último punch del día es `in`, la siguiente marca es `out`; si no, `in`.
 */
export function resolveNextPunchType(
  todayPunches: Array<{ type: 'in' | 'out'; at: string }>,
): 'in' | 'out' {
  if (!todayPunches.length) return 'in';
  const sorted = [...todayPunches].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const last = sorted[sorted.length - 1];
  return last.type === 'in' ? 'out' : 'in';
}

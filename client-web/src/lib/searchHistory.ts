const HISTORY_KEY = 'domiclick.placeSearchHistory.v1';
const MAX_HISTORY = 12;

export type SearchHistoryEntry = {
  query: string;
  label: string;
  secondary?: string;
  kind?: string;
  lat?: number;
  lng?: number;
  at: number;
};

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadSearchHistory(): SearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.query === 'string' && e.query.trim().length >= 2)
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function pushSearchHistory(entry: Omit<SearchHistoryEntry, 'at'>): SearchHistoryEntry[] {
  const next: SearchHistoryEntry = {
    ...entry,
    query: entry.query.trim(),
    label: entry.label.trim() || entry.query.trim(),
    at: Date.now(),
  };
  if (next.query.length < 2) return loadSearchHistory();

  const prev = loadSearchHistory().filter(
    (e) => fold(e.label) !== fold(next.label) && fold(e.query) !== fold(next.query),
  );
  const list = [next, ...prev].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
  return list;
}

export function filterSearchHistory(query: string, limit = 6): SearchHistoryEntry[] {
  const q = fold(query);
  const all = loadSearchHistory();
  if (!q) return all.slice(0, limit);
  return all
    .filter((e) => fold(e.label).includes(q) || fold(e.query).includes(q) || fold(e.secondary || '').includes(q))
    .slice(0, limit);
}

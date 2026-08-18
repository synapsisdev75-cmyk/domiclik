import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, Search, Sparkles } from 'lucide-react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  geocodeAddress,
  searchPlaceSuggestions,
  resolvePlaceSuggestion,
  type LatLng,
  type PlaceSuggestion,
} from '../lib/geo';

type PlaceSearchFieldProps = {
  label: string;
  value: string;
  required?: boolean;
  accent: 'pickup' | 'delivery';
  placeholder: string;
  onQueryChange: (value: string) => void;
  onPlacePicked: (hit: LatLng & { label: string }) => void;
};

function highlightMatch(text: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-[#FF5722]/25 px-0.5 text-inherit">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function PlaceSearchField({
  label,
  value,
  required,
  accent,
  placeholder,
  onQueryChange,
  onPlacePicked,
}: PlaceSearchFieldProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const placesLib = useMapsLibrary('places');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [hint, setHint] = useState('');
  const skipSearch = useRef(false);
  const typing = value.trim().length >= 2;

  const accentColor = accent === 'pickup' ? '#2B6CFF' : '#FF5722';
  const ring =
    accent === 'pickup'
      ? 'focus-within:border-[#2B6CFF] focus-within:shadow-[0_0_0_3px_rgba(43,108,255,0.18)]'
      : 'focus-within:border-[#FF5722] focus-within:shadow-[0_0_0_3px_rgba(255,87,34,0.18)]';

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      setHint('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setHint('');
    setOpen(true);

    const t = window.setTimeout(() => {
      void searchPlaceSuggestions(q, placesLib || undefined).then((hits) => {
        if (cancelled) return;
        setItems(hits);
        setActive(0);
        setLoading(false);
        if (!hits.length) {
          setHint('Sigue escribiendo o toca Buscar para fijar el punto.');
        }
      });
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value, placesLib]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function pick(item: PlaceSuggestion) {
    setResolving(true);
    setOpen(false);
    setHint('');
    try {
      const hit = await resolvePlaceSuggestion(item, placesLib || undefined);
      if (!hit) {
        setHint('No se pudo marcar ese lugar. Prueba otra sugerencia.');
        return;
      }
      skipSearch.current = true;
      onQueryChange(hit.label);
      onPlacePicked(hit);
    } finally {
      setResolving(false);
    }
  }

  async function locateTyped() {
    const q = value.trim();
    if (q.length < 2) {
      setHint('Escribe al menos 2 letras para buscar.');
      return;
    }
    if (items[0]) {
      await pick(items[0]);
      return;
    }
    setResolving(true);
    setHint('');
    setOpen(false);
    try {
      const hit = await geocodeAddress(q, placesLib || undefined);
      if (!hit) {
        setHint('No encontramos esa dirección. Prueba universidad, Unicentro, hospital…');
        return;
      }
      skipSearch.current = true;
      onQueryChange(hit.label);
      onPlacePicked(hit);
    } finally {
      setResolving(false);
    }
  }

  const showDrop = open && typing;

  return (
    <div ref={wrapRef} className="relative z-40 block sm:col-span-2">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
        {label}
      </span>
      <div
        className={`flex items-center gap-2 rounded-2xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-1 ${ring}`}
      >
        <input
          className="field-input min-w-0 flex-1 !border-0 !bg-transparent !px-1 !py-2 !shadow-none"
          required={required}
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDrop}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (typing) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (!showDrop || !items.length)) {
              e.preventDefault();
              void locateTyped();
              return;
            }
            if (!showDrop || !items.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (i + 1) % items.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i - 1 + items.length) % items.length);
            } else if (e.key === 'Enter' && items[active]) {
              e.preventDefault();
              void pick(items[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {loading || resolving ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--domi-cyan)]" />
        ) : null}
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold text-white"
          style={{ background: accentColor }}
          onClick={() => void locateTyped()}
          disabled={resolving || value.trim().length < 2}
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          Buscar
        </button>
      </div>

      {showDrop ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--domi-border)] bg-[#0b1220]/97 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-2 text-[11px] text-[var(--domi-muted)]">
            <Sparkles className="h-3.5 w-3.5 text-[#FF5722]" aria-hidden />
            {loading ? 'Adivinando lugares en Villavicencio…' : '¿Es alguno de estos? Toca para marcar el pin.'}
          </div>

          {loading && !items.length ? (
            <div className="space-y-2 px-3 py-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : null}

          {items.length > 0 ? (
            <ul className="max-h-72 overflow-auto py-1">
              {items.map((item, i) => (
                <li key={item.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition ${
                      i === active ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => void pick(item)}
                  >
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${accentColor}22`, color: accentColor }}
                    >
                      <MapPin className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {highlightMatch(item.label, value)}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--domi-muted)]">
                        {item.kind} · {item.secondary}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : !loading ? (
            <p className="px-3 py-3 text-sm text-[var(--domi-muted)]">
              Sin coincidencias aún. Sigue escribiendo o toca <strong className="text-white">Buscar</strong>.
            </p>
          ) : null}
        </div>
      ) : null}

      {hint && !showDrop ? (
        <p className="mt-1 text-[11px] text-amber-200/90" role="status">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

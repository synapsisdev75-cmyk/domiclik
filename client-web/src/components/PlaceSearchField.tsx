import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import {
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const skipSearch = useRef(false);

  const ring =
    accent === 'pickup'
      ? 'focus-within:border-[#2B6CFF]'
      : 'focus-within:border-[#FF5722]';

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
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchPlaceSuggestions(q).then((hits) => {
        if (cancelled) return;
        setItems(hits);
        setActive(0);
        setOpen(hits.length > 0);
        setLoading(false);
      });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value]);

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
    try {
      const hit = await resolvePlaceSuggestion(item);
      if (!hit) return;
      skipSearch.current = true;
      onQueryChange(hit.label);
      onPlacePicked(hit);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative block sm:col-span-2">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
        {label}
      </span>
      <div
        className={`flex items-center gap-2 rounded-xl border border-[var(--domi-border)] bg-[#0a101c] px-3 ${ring}`}
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--domi-muted)]" aria-hidden />
        <input
          className="field-input !border-0 !bg-transparent !px-0 !shadow-none"
          required={required}
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (items.length) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
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
      </div>
      {open && items.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[var(--domi-border)] bg-[#0a101c] py-1 shadow-2xl"
        >
          {items.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
                  i === active ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => void pick(item)}
              >
                <MapPin
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    accent === 'pickup' ? 'text-[#2B6CFF]' : 'text-[#FF5722]'
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {item.label}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--domi-muted)]">
                    {item.kind} · {item.secondary}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

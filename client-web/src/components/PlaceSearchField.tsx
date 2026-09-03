import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, Search } from 'lucide-react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  geocodeAddress,
  searchPlaceSuggestions,
  resolvePlaceSuggestion,
  OUT_OF_AREA_MESSAGE,
  type LatLng,
  type PlaceSuggestion,
} from '../lib/geo';
import { searchLocalPlaces, dedupeStreetSuggestions } from '../lib/villavicencioPlaces';
import { parseColombianAddress } from '../../../shared/colombianAddress.ts';

function mergeInstantAndRemote(instant: PlaceSuggestion[], remote: PlaceSuggestion[]): PlaceSuggestion[] {
  return dedupeStreetSuggestions([...instant, ...remote]).slice(0, 20);
}

type PlaceSearchFieldProps = {
  label: string;
  value: string;
  required?: boolean;
  accent: 'pickup' | 'delivery';
  placeholder: string;
  inputName: string;
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
  inputName,
  onQueryChange,
  onPlacePicked,
}: PlaceSearchFieldProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const placesLib = useMapsLibrary('places');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [dropBox, setDropBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const skipSearch = useRef(false);
  const typing = value.trim().length >= 2;
  const showDrop = open && typing && (items.length > 0 || loading);

  const accentColor = accent === 'pickup' ? '#2B6CFF' : '#FF5722';
  const ring =
    accent === 'pickup'
      ? 'focus-within:border-[#2B6CFF] focus-within:shadow-[0_0_0_3px_rgba(43,108,255,0.18)]'
      : 'focus-within:border-[#FF5722] focus-within:shadow-[0_0_0_3px_rgba(255,87,34,0.18)]';

  function syncDropPosition() {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDropBox({ top: r.bottom + 8, left: r.left, width: r.width });
  }

  useLayoutEffect(() => {
    if (!showDrop) {
      setDropBox(null);
      return;
    }
    syncDropPosition();
    const onMove = () => syncDropPosition();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [showDrop, items.length, loading]);

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
    const instant = searchLocalPlaces(q);
    setItems(instant);
    setActive(0);
    setOpen(true);
    setLoading(true);

    const t = window.setTimeout(() => {
      void searchPlaceSuggestions(q, placesLib || undefined).then((hits) => {
        if (cancelled) return;
        setItems(mergeInstantAndRemote(instant, hits.length ? hits : instant));
        setActive(0);
        setLoading(false);
      });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value, placesLib]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('[data-domi-place-drop]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function pick(item: PlaceSuggestion) {
    setResolving(true);
    setOpen(false);
    setFieldError(null);
    try {
      const typed = value.trim();
      const parsed = parseColombianAddress(typed);
      // Si el usuario escribió nomenclatura (# 20-10) y eligió solo la vía, geocodifica la dirección completa.
      const preferFullAddress =
        parsed.hasComplement &&
        (item.kind === 'Calle / avenida' || item.kind === 'Dirección') &&
        !/#\s*\d/.test(item.label);
      const hit = preferFullAddress
        ? (await geocodeAddress(typed, placesLib || undefined)) ||
          (await resolvePlaceSuggestion(item, placesLib || undefined))
        : await resolvePlaceSuggestion(item, placesLib || undefined);
      if (!hit) {
        setFieldError(OUT_OF_AREA_MESSAGE);
        return;
      }
      skipSearch.current = true;
      onQueryChange(preferFullAddress && parsed.displayVia ? typed : hit.label);
      onPlacePicked(
        preferFullAddress
          ? { ...hit, label: typed.includes('#') ? typed : hit.label }
          : hit,
      );
    } finally {
      setResolving(false);
    }
  }

  async function locateTyped() {
    const q = value.trim();
    if (q.length < 2) return;
    setResolving(true);
    setOpen(false);
    setFieldError(null);
    try {
      const hit = await geocodeAddress(q, placesLib || undefined);
      if (!hit) {
        setFieldError(OUT_OF_AREA_MESSAGE);
        return;
      }
      skipSearch.current = true;
      onQueryChange(hit.label);
      onPlacePicked(hit);
    } finally {
      setResolving(false);
    }
  }

  const dropdown =
    showDrop && dropBox
      ? createPortal(
          <div
            data-domi-place-drop
            id={listId}
            role="listbox"
            className="overflow-hidden rounded-2xl border border-[#2a3b5c] bg-[#0b1220] shadow-[0_28px_70px_-16px_rgba(0,0,0,0.85)]"
            style={{
              position: 'fixed',
              top: dropBox.top,
              left: dropBox.left,
              width: dropBox.width,
              zIndex: 40000,
            }}
          >
            {loading && !items.length ? (
              <div className="space-y-2 px-3 py-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            ) : null}
            {items.length > 0 ? (
              <ul className="max-h-80 overflow-auto py-1">
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
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={`relative block sm:col-span-2 ${showDrop ? 'z-[80]' : 'z-[1]'}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
        {label}
      </span>
      <div
        ref={boxRef}
        className={`flex items-center gap-2 rounded-2xl border border-[var(--domi-border)] bg-[#0a101c] px-3 py-1 ${ring}`}
      >
        <input
          className="field-input min-w-0 flex-1 !border-0 !bg-transparent !px-1 !py-2 !shadow-none"
          required={required}
          name={inputName}
          value={value}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-lpignore="true"
          data-form-type="other"
          role="combobox"
          aria-expanded={showDrop}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          onChange={(e) => {
            setFieldError(null);
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
      {fieldError ? (
        <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {fieldError}
        </p>
      ) : null}
      {dropdown}
    </div>
  );
}

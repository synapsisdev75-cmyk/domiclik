import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, Search } from 'lucide-react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  geocodeAddress,
  reverseGeocode,
  searchPlaceSuggestions,
  resolvePlaceSuggestion,
  streetViewThumbUrl,
  formatMapsStyleAddress,
  OUT_OF_AREA_MESSAGE,
  type LatLng,
  type PlaceSuggestion,
} from '../lib/geo';
import {
  parseColombianCompoundAddress,
  hasUrbanizationIntent,
  normalizePastedAddress,
} from '../lib/addressParts';
import {
  filterSearchHistory,
  loadSearchHistory,
  pushSearchHistory,
  type SearchHistoryEntry,
} from '../lib/searchHistory';
import {
  resolvePlaceCategory,
  looksLikePlaceQuery,
} from '../lib/placeCategories';
import {
  searchLocalPlaces,
  dedupeStreetSuggestions,
  isStreetOnlyQuery,
  isIntersectionQuery,
  formatStreetSearchQuery,
} from '../lib/villavicencioPlaces';

function suggestionPhoto(item: PlaceSuggestion): string | null {
  if (item.photoUrl) return item.photoUrl;
  if (item.lat != null && item.lng != null) return streetViewThumbUrl(item.lat, item.lng);
  return null;
}

/** True si la query trae placa / # (no es solo el nombre de la vía). */
function hasHousePlate(q: string): boolean {
  return /#\s*[\dA-Za-z]/i.test(q) || /\b\d{1,4}[a-zA-Z]?\s*[-–]\s*\d{1,4}\b/.test(q);
}

/** Query real para Maps: limpia mz/cs/apto y prioriza urbanización / cruce. */
function mapsQueryFromDraft(
  draft: string,
  geocodeSuffix = '',
  mode: 'suggest' | 'geocode' = 'suggest',
): string {
  const typed = draft.trim();
  const compound = parseColombianCompoundAddress(typed);
  if (compound.isCompound) {
    if (mode === 'geocode' && compound.geocodeQuery) return compound.geocodeQuery;
    if (compound.searchQuery) return compound.searchQuery;
  }
  if (isIntersectionQuery(typed) && !hasHousePlate(typed)) {
    return formatStreetSearchQuery(typed);
  }
  // Con placa (#37l-9): conservar dirección completa; no reducir a “Calle 23”.
  if (hasHousePlate(typed) || mode === 'geocode') {
    const normalized = normalizePastedAddress(typed) || typed;
    const suffix = geocodeSuffix.trim();
    if (mode === 'geocode' && suffix && !/villavicencio/i.test(normalized)) {
      return `${normalized}, ${suffix}`;
    }
    return normalized;
  }
  if (/^\s*(calle|carrera|avenida|diagonal|transversal|cl\.?|cra\.?|cr\.?|av\.?)\b/i.test(typed)) {
    return formatStreetSearchQuery(typed);
  }
  const suffix = geocodeSuffix.trim();
  return suffix ? `${typed}, ${suffix}` : typed;
}

function mergeInstantAndRemote(
  instant: PlaceSuggestion[],
  remote: PlaceSuggestion[],
  query: string,
): PlaceSuggestion[] {
  const urb = hasUrbanizationIntent(query);
  const placeLike = looksLikePlaceQuery(query) || !!resolvePlaceCategory(query);
  // Lugares / urbanizaciones: Google + Places primero (como Maps). Vía sola: gazetteer local.
  const preferLocal = !urb && !placeLike && isStreetOnlyQuery(query);
  const merged = dedupeStreetSuggestions(
    preferLocal ? [...instant, ...remote] : [...remote, ...instant],
  );
  if (!urb && !placeLike) return merged.slice(0, 10);

  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const name = fold(parseColombianCompoundAddress(query).urbanization || '');
  const cat = resolvePlaceCategory(query);
  return [...merged]
    .sort((a, b) => {
      const rank = (h: PlaceSuggestion) => {
        const hay = fold(`${h.label} ${h.secondary} ${h.kind}`);
        if (name && hay.includes(name)) return 100;
        if (cat && fold(h.kind).includes(fold(cat.label))) return 90;
        if (h.kind === 'Urbanización' || h.kind === 'Barrio') return 70;
        if (
          /hospital|clínica|clinica|parque|negocio|centro comercial|colegio|universidad|iglesia|estadio|farmacia|hotel|lugar/i.test(
            h.kind,
          )
        ) {
          return 65;
        }
        if (h.kind === 'Calle / avenida') return 0;
        return 30;
      };
      return rank(b) - rank(a);
    })
    .slice(0, 12);
}

type PlaceSearchFieldProps = {
  label: string;
  value: string;
  required?: boolean;
  accent: 'pickup' | 'delivery';
  placeholder: string;
  inputName: string;
  /** Cierra sugerencias (p. ej. al arrastrar pin en el mapa). */
  forceClose?: boolean;
  onQueryChange: (value: string) => void;
  onPlacePicked: (hit: LatLng & { label: string }) => void;
  /** Al enfocar el campo (para activar modo A o B en el mapa). */
  onActivate?: () => void;
  /** Si false, no escribe el label largo en el input al resolver (el padre arma los campos). */
  writeBackLabel?: boolean;
  /** Sufijo fijo para Buscar: barrio, ciudad, Meta… */
  geocodeSuffix?: string;
  /**
   * Pin colocado a mano en el mapa. Si existe, Buscar no lo mueve:
   * solo reverse-geocodea y rellena campos.
   */
  mapAnchoredPin?: LatLng | null;
  /** Se llama al elegir una sugerencia de la lista (desbloquea el pin). */
  onUnlockMapPin?: () => void;
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
  forceClose = false,
  onQueryChange,
  onPlacePicked,
  onActivate,
  writeBackLabel = true,
  geocodeSuffix = '',
  mapAnchoredPin = null,
  onUnlockMapPin,
}: PlaceSearchFieldProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [dropBox, setDropBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<SearchHistoryEntry[]>([]);
  // Borrador local: mientras escribes, los espacios no dependen del padre (trim/re-render).
  const [draft, setDraft] = useState(value);
  /** iOS Safari ignora autocomplete=off; readOnly hasta el primer toque evita “Autorrellenar contacto”. */
  const [autofillLocked, setAutofillLocked] = useState(true);
  const focusedRef = useRef(false);
  const skipSearch = useRef(false);
  /** Solo true si el usuario movió ↑/↓ en la lista (Enter elige esa fila). */
  const listNavigated = useRef(false);
  const lastTypedRef = useRef('');
  const typing = draft.trim().length >= 2;
  const showHistory = open && focused && !forceClose && !typing && historyItems.length > 0;
  // Como Google Maps: lista abierta al escribir o historial al enfocar
  const showDrop = (open && focused && !forceClose && typing) || showHistory;

  useEffect(() => {
    // Solo sincroniza desde el padre si NO estás tipando (pin, reverse geocode, pick).
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  const accentColor = accent === 'pickup' ? '#2B6CFF' : '#FF5722';
  const ring =
    accent === 'pickup'
      ? 'focus-within:border-[#2B6CFF] focus-within:shadow-[0_0_0_3px_rgba(43,108,255,0.18)]'
      : 'focus-within:border-[#FF5722] focus-within:shadow-[0_0_0_3px_rgba(255,87,34,0.18)]';

  function unlockAutofill() {
    if (autofillLocked) setAutofillLocked(false);
  }

  function syncDropPosition() {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewHeight = vv?.height ?? window.innerHeight;
    const viewBottom = viewTop + viewHeight;
    const gap = 8;
    // En iPhone nunca abrir hacia arriba: tapa el mapa y el campo.
    // Dejamos el input visible y la lista debajo, con altura acotada al teclado.
    const spaceBelow = Math.max(96, viewBottom - (r.bottom + gap) - 10);
    const maxHeight = Math.min(220, spaceBelow);
    const top = Math.min(r.bottom + gap, viewBottom - maxHeight - 4);
    setDropBox({
      top: Math.max(viewTop + 4, top),
      left: r.left,
      width: r.width,
      maxHeight,
    });
  }

  function scrollFieldIntoViewForKeyboard() {
    const el = wrapRef.current;
    if (!el) return;
    // Sube el campo cerca del borde superior visible para que el drop quepa abajo.
    try {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch {
      el.scrollIntoView(true);
    }
    window.setTimeout(() => syncDropPosition(), 280);
    window.setTimeout(() => syncDropPosition(), 520);
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
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onMove);
    vv?.addEventListener('scroll', onMove);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      vv?.removeEventListener('resize', onMove);
      vv?.removeEventListener('scroll', onMove);
    };
  }, [showDrop, items.length, loading, historyItems.length]);

  useEffect(() => {
    if (forceClose) {
      setOpen(false);
      setLoading(false);
      inputRef.current?.blur();
    }
  }, [forceClose]);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    const typed = draft.trim();
    if (typed.length < 2) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    // Sugerencias estilo Maps: “urb charrascal” (no “mz b2 cs…” hacia Google).
    const q = mapsQueryFromDraft(typed);

    // Actualización desde el mapa / reverse geocode: no abrir drop
    if (!focused || forceClose) {
      setOpen(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const instant = searchLocalPlaces(typed);
    setItems(instant);
    setActive(0);
    setOpen(true);
    setLoading(true);

    const t = window.setTimeout(() => {
      void searchPlaceSuggestions(q, placesLib || undefined).then((hits) => {
        if (cancelled) return;
        setItems(mergeInstantAndRemote(instant, hits.length ? hits : instant, q));
        setActive(0);
        setLoading(false);
      });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [draft, placesLib, focused, forceClose]);

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
      const hit = await resolvePlaceSuggestion(item, placesLib || undefined);
      if (!hit) {
        setFieldError(OUT_OF_AREA_MESSAGE);
        return;
      }
      skipSearch.current = true;
      onUnlockMapPin?.();
      const clean = formatMapsStyleAddress(hit.label);
      setDraft(clean);
      if (writeBackLabel) onQueryChange(clean);
      onPlacePicked({ ...hit, label: clean });
      pushSearchHistory({
        query: draft.trim() || clean,
        label: clean,
        secondary: item.secondary,
        kind: item.kind,
        lat: hit.lat,
        lng: hit.lng,
      });
      setHistoryItems(loadSearchHistory());
    } finally {
      setResolving(false);
    }
  }

  async function locateTyped() {
    const typed = draft.trim();
    if (typed.length < 2 && !mapAnchoredPin) return;

    // Buscar / Enter: geocodificar EXACTAMENTE lo escrito.
    // No auto-elegir “Calle 23” de la lista cuando el usuario escribió “Cl. 23 #37l-9…”.
    // (Elegir sugerencia = click o ↑/↓ + Enter.)

    // El pin fijo solo aplica cuando el campo está vacío (relleno por reverse-geocode).
    if (mapAnchoredPin && typed.length < 2) {
      setResolving(true);
      setOpen(false);
      setFieldError(null);
      try {
        const label = await reverseGeocode(mapAnchoredPin.lat, mapAnchoredPin.lng);
        skipSearch.current = true;
        setDraft(label);
        if (writeBackLabel) onQueryChange(label);
        onPlacePicked({ ...mapAnchoredPin, label });
      } finally {
        setResolving(false);
      }
      return;
    }

    const suffix = geocodeSuffix.trim();
    const q = mapsQueryFromDraft(typed, suffix, 'geocode');
    setResolving(true);
    setOpen(false);
    setItems([]);
    setFieldError(null);
    listNavigated.current = false;
    try {
      onUnlockMapPin?.();
      const hit = await geocodeAddress(q, placesLib || undefined);
      if (!hit) {
        setFieldError(OUT_OF_AREA_MESSAGE);
        return;
      }
      skipSearch.current = true;
      const clean = formatMapsStyleAddress(hit.label);
      setDraft(clean);
      if (writeBackLabel) onQueryChange(clean);
      onPlacePicked({ ...hit, label: clean });
      const compound = parseColombianCompoundAddress(typed);
      pushSearchHistory({
        query: typed,
        label: clean,
        secondary: compound.complement || undefined,
        kind: 'Dirección',
        lat: hit.lat,
        lng: hit.lng,
      });
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
            className="place-suggest-drop overflow-hidden rounded-2xl border shadow-[0_28px_70px_-16px_rgba(0,0,0,0.55)]"
            style={{
              position: 'fixed',
              top: dropBox.top,
              left: dropBox.left,
              width: dropBox.width,
              maxHeight: dropBox.maxHeight,
              zIndex: 40000,
              background: 'var(--domi-drop)',
              borderColor: 'var(--domi-drop-border)',
            }}
          >
            {showHistory ? (
              <ul className="overflow-auto py-1" style={{ maxHeight: dropBox.maxHeight }}>
                <li className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--domi-muted)]">
                  Recientes
                </li>
                {historyItems.map((h) => (
                  <li key={`hist-${h.at}-${h.label}`} role="option">
                    <button
                      type="button"
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/5"
                      onClick={() => {
                        const asSuggestion: PlaceSuggestion = {
                          id: `hist-${h.at}`,
                          label: h.label,
                          secondary: h.secondary || 'Búsqueda reciente',
                          kind: h.kind || 'Reciente',
                          source: 'local',
                          lat: h.lat,
                          lng: h.lng,
                        };
                        if (h.lat != null && h.lng != null) {
                          void pick(asSuggestion);
                        } else {
                          setDraft(h.query || h.label);
                          onQueryChange(h.query || h.label);
                          setOpen(true);
                        }
                      }}
                    >
                      <span
                        className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: `${accentColor}22`, color: accentColor }}
                      >
                        <MapPin className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--domi-text)]">{h.label}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--domi-muted)]">
                          {h.secondary || h.query || 'Reciente'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!showHistory && loading && !items.length ? (
              <div className="space-y-2 px-3 py-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            ) : null}
            {!showHistory && items.length > 0 ? (
              <ul className="overflow-auto py-1" style={{ maxHeight: dropBox.maxHeight }}>
                {items.map((item, i) => {
                  const photo = suggestionPhoto(item);
                  return (
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
                        className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                        style={{ background: `${accentColor}22`, color: accentColor }}
                      >
                        {photo ? (
                          <img
                            src={photo}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span
                          className="flex h-full w-full items-center justify-center"
                          style={{ display: photo ? 'none' : 'flex' }}
                        >
                          <MapPin className="h-4 w-4" aria-hidden />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--domi-text)]">
                          {highlightMatch(item.label, draft)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--domi-muted)]">
                          {item.kind} · {item.secondary}
                        </span>
                      </span>
                    </button>
                  </li>
                  );
                })}
                {loading ? (
                  <li className="border-t border-white/5 px-3 py-2 text-[11px] text-[var(--domi-muted)]">
                    Buscando más lugares…
                  </li>
                ) : null}
              </ul>
            ) : !showHistory && !loading ? (
              <div className="px-3 py-3 text-sm text-[var(--domi-muted)]">
                Sin coincidencias. Prueba el barrio (ej. Remansos de Rosablanca) o pulsa Buscar.
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={wrapRef}
      data-domi-place-search
      className={`relative block sm:col-span-2 ${showDrop ? 'z-[80]' : 'z-[1]'}`}
    >
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
        {label}
      </span>
      <div
        ref={boxRef}
        className={`flex items-center gap-2 rounded-2xl border border-[var(--domi-border)] bg-[var(--domi-surface)] px-3 py-1 ${ring}`}
        onTouchStart={unlockAutofill}
        onMouseDown={unlockAutofill}
      >
        {/* Señuelo: iOS a veces pinta “Autorrellenar contacto” en el primer input del form */}
        <input
          type="text"
          tabIndex={-1}
          aria-hidden
          autoComplete="username"
          value=""
          readOnly
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
        <input
          ref={inputRef}
          className="field-input min-w-0 flex-1 !border-0 !bg-transparent !px-1 !py-2 !shadow-none"
          required={required}
          name={`domi_q_${inputName}`}
          value={draft}
          type="search"
          readOnly={autofillLocked}
          autoComplete="one-time-code"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="search"
          enterKeyHint="search"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          data-testid="place-search-input"
          role="combobox"
          aria-expanded={showDrop}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          onChange={(e) => {
            const next = e.target.value;
            // iOS a veces pega de golpe una dirección foránea del autorrelleno.
            const prev = lastTypedRef.current;
            const suddenPaste =
              next.length - prev.length >= 18 &&
              /alum rock|san jose|california|united states|,?\s*usa\b/i.test(next);
            if (suddenPaste) {
              setFieldError('Ignoramos el autorrelleno del teléfono. Escribe la dirección de Meta.');
              return;
            }
            lastTypedRef.current = next;
            setFieldError(null);
            setDraft(next);
            onQueryChange(next);
            listNavigated.current = false;
            setOpen(true);
          }}
          onFocus={() => {
            unlockAutofill();
            focusedRef.current = true;
            setFocused(true);
            onActivate?.();
            const hist = filterSearchHistory(draft, 8);
            setHistoryItems(hist.length ? hist : loadSearchHistory().slice(0, 8));
            setOpen(true);
            scrollFieldIntoViewForKeyboard();
          }}
          onBlur={() => {
            // Delay para permitir click en sugerencia del portal
            window.setTimeout(() => {
              focusedRef.current = false;
              setFocused(false);
            }, 180);
          }}
          onKeyDown={(e) => {
            // Nunca bloquear Space / escritura normal — solo atajos de lista.
            if (e.key === ' ' || e.key === 'Spacebar') return;
            if (e.key === 'Enter') {
              e.preventDefault();
              if (showDrop && items.length && listNavigated.current && items[active]) {
                void pick(items[active]);
              } else {
                void locateTyped();
              }
              return;
            }
            if (!showDrop || !items.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              listNavigated.current = true;
              setActive((i) => (i + 1) % items.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              listNavigated.current = true;
              setActive((i) => (i - 1 + items.length) % items.length);
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
          disabled={resolving || draft.trim().length < 2}
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          Buscar
        </button>
      </div>
      {fieldError ? (
        <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-[var(--domi-text)]">
          {fieldError}
        </p>
      ) : typing && !resolving ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--domi-muted)]">
          Busca como en Maps: dirección, barrio, urbanización, hospital, parque, negocio…
        </p>
      ) : null}
      {dropdown}
    </div>
  );
}

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, Search } from 'lucide-react';
import { VILLAVICENCIO_CENTER } from '../../data/villavicencio';
import {
  formatColombianGeocodeQueries,
  isStreetSearchQuery,
  parseColombianAddress,
} from '../../../shared/colombianAddress.ts';
import { isWithinServiceArea } from '../../../shared/serviceArea.ts';
import { searchLocalPlaces } from '../../../client-web/src/lib/villavicencioPlaces';

export type OpsPlaceHit = { label: string; lat: number; lng: number };

type Suggestion = {
  id: string;
  placeId?: string;
  label: string;
  secondary: string;
  kind: string;
  lat?: number;
  lng?: number;
};

type OpsPlaceSearchProps = {
  label: string;
  value: string;
  accent?: 'pickup' | 'delivery';
  placeholder?: string;
  required?: boolean;
  onQueryChange: (value: string) => void;
  onPlacePicked: (hit: OpsPlaceHit) => void;
};

function mapsKey() {
  return (
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    localStorage.getItem('domiclick_gmaps_key') ||
    ''
  );
}

function ensurePlacesScript() {
  const key = mapsKey();
  if (!key || typeof document === 'undefined') return;
  if (document.getElementById('google-maps-platform-script')) return;
  if ((window as unknown as { google?: typeof google }).google?.maps?.places) return;
  const script = document.createElement('script');
  script.id = 'google-maps-platform-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,geometry`;
  script.async = true;
  document.head.appendChild(script);
}

function placesApi(): typeof google.maps.places | null {
  return (window as unknown as { google?: typeof google }).google?.maps?.places || null;
}

async function predict(q: string): Promise<Suggestion[]> {
  const places = placesApi();
  if (!places?.AutocompleteService) return [];
  const service = new places.AutocompleteService();
  const input = q.toLowerCase().includes('villavicencio') ? q : `${q} Villavicencio`;
  const predictions = await new Promise<google.maps.places.AutocompletePrediction[]>((resolve) => {
    service.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: 'co' },
        locationBias: {
          center: { lat: VILLAVICENCIO_CENTER.lat, lng: VILLAVICENCIO_CENTER.lng },
          radius: 35000,
        },
      },
      (res, status) => {
        if (status !== places.PlacesServiceStatus.OK && status !== places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }
        resolve(res || []);
      },
    );
  });
  return predictions.map((p) => ({
    id: `ac-${p.place_id}`,
    placeId: p.place_id,
    label: p.structured_formatting?.main_text || p.description,
    secondary: p.structured_formatting?.secondary_text || 'Villavicencio',
    kind: p.types?.includes('restaurant') ? 'Restaurante' : 'Negocio',
  }));
}

async function textSearch(q: string): Promise<Suggestion[]> {
  const places = placesApi();
  if (!places?.PlacesService) return [];
  const host = document.createElement('div');
  const svc = new places.PlacesService(host);
  const query = q.toLowerCase().includes('villavicencio') ? q : `${q} Villavicencio Meta`;
  const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
    svc.textSearch(
      {
        query,
        location: { lat: VILLAVICENCIO_CENTER.lat, lng: VILLAVICENCIO_CENTER.lng },
        radius: 28000,
      },
      (res, status) => {
        if (status !== places.PlacesServiceStatus.OK && status !== places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }
        resolve(res || []);
      },
    );
  });
  return results.slice(0, 12).map((p) => {
    const loc = p.geometry?.location;
    return {
      id: `ts-${p.place_id || p.name}`,
      placeId: p.place_id,
      label: p.name || p.formatted_address || q,
      secondary: p.vicinity || p.formatted_address || 'Villavicencio',
      kind: p.types?.includes('restaurant') ? 'Restaurante' : 'Negocio',
      lat: loc?.lat(),
      lng: loc?.lng(),
    };
  });
}

async function geocodeStreets(q: string): Promise<Suggestion[]> {
  const g = (window as unknown as { google?: typeof google }).google?.maps;
  if (!g?.Geocoder) return [];
  const geo = new g.Geocoder();
  const queries = formatColombianGeocodeQueries(q).slice(0, 2);
  const batches = await Promise.all(
    queries.map(async (address) => {
      try {
        const res = await geo.geocode({
          address,
          componentRestrictions: { country: 'CO' },
        });
        return (res.results || [])
          .filter((r) => isWithinServiceArea(r.geometry.location.lat(), r.geometry.location.lng()))
          .slice(0, 6)
          .map((r) => {
          const loc = r.geometry.location;
          const types = r.types || [];
          const locType = String(r.geometry.location_type || '');
          const isPrecise =
            locType === 'ROOFTOP' ||
            locType === 'RANGE_INTERPOLATED' ||
            types.includes('street_address') ||
            types.includes('intersection') ||
            types.includes('premise');
          return {
            id: `gc-${r.place_id}`,
            placeId: r.place_id,
            label: r.formatted_address || q,
            secondary: 'Villavicencio, Meta',
            kind: types.includes('route') && !isPrecise ? 'Calle / avenida' : 'Dirección',
            lat: loc.lat(),
            lng: loc.lng(),
          } satisfies Suggestion;
        });
      } catch {
        return [] as Suggestion[];
      }
    }),
  );
  return batches.flat();
}

async function searchGoogle(q: string): Promise<Suggestion[]> {
  const street = isStreetSearchQuery(q);
  const [textHits, autoHits, geoHits] = await Promise.all([
    street ? Promise.resolve([] as Suggestion[]) : textSearch(q),
    predict(q),
    geocodeStreets(q),
  ]);
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  const localHits: Suggestion[] = searchLocalPlaces(q).map((h) => ({
    id: h.id,
    label: h.label,
    secondary: h.secondary,
    kind: h.kind,
    lat: h.lat,
    lng: h.lng,
  }));
  const parsed = parseColombianAddress(q);
  const ordered = parsed.hasComplement
    ? [...geoHits.filter((h) => h.kind === 'Dirección'), ...localHits, ...geoHits, ...autoHits]
    : street
      ? [...localHits, ...geoHits, ...autoHits, ...textHits]
      : [...textHits, ...autoHits, ...geoHits, ...localHits];
  for (const hit of ordered) {
    const key = hit.placeId || hit.label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= 10) break;
  }
  return out;
}

async function resolvePlace(placeId: string, fallback: string): Promise<OpsPlaceHit | null> {
  const places = placesApi();
  if (!places?.PlacesService) return null;
  const host = document.createElement('div');
  const svc = new places.PlacesService(host);
  const details = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
    svc.getDetails({ placeId, fields: ['geometry', 'formatted_address', 'name'] }, (place, status) => {
      if (status !== places.PlacesServiceStatus.OK || !place?.geometry?.location) {
        resolve(null);
        return;
      }
      resolve(place);
    });
  });
  const loc = details?.geometry?.location;
  if (!loc) return null;
  return {
    lat: loc.lat(),
    lng: loc.lng(),
    label: details.formatted_address || details.name || fallback,
  };
}

export function OpsPlaceSearch({
  label,
  value,
  accent = 'pickup',
  placeholder,
  required,
  onQueryChange,
  onPlacePicked,
}: OpsPlaceSearchProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [dropBox, setDropBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const skip = useRef(false);
  const typing = value.trim().length >= 2;
  const showDrop = open && typing;
  const color = accent === 'pickup' ? '#FF5722' : '#00E676';

  useEffect(() => {
    ensurePlacesScript();
  }, []);

  useLayoutEffect(() => {
    if (!showDrop) {
      setDropBox(null);
      return;
    }
    const sync = () => {
      const el = boxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropBox({ top: r.bottom + 8, left: r.left, width: r.width });
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [showDrop, items.length, loading]);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
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
    setOpen(true);
    const t = window.setTimeout(() => {
      void searchGoogle(q).then((hits) => {
        if (cancelled) return;
        setItems(hits);
        setLoading(false);
      });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value]);

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

  async function pick(item: Suggestion) {
    setOpen(false);
    const typed = value.trim();
    const parsed = parseColombianAddress(typed);
    const streetOnlyPick =
      parsed.hasComplement &&
      (item.kind === 'Calle / avenida' || item.kind === 'Dirección') &&
      !/#\s*\d/.test(item.label);

    if (streetOnlyPick) {
      const precise = (await geocodeStreets(typed)).find((h) => h.kind === 'Dirección' && h.lat != null) ||
        searchLocalPlaces(typed)[0];
      if (precise?.lat != null && precise.lng != null) {
        skip.current = true;
        onQueryChange(typed);
        onPlacePicked({ label: typed, lat: precise.lat, lng: precise.lng });
        return;
      }
    }

    if (item.lat != null && item.lng != null) {
      if (!isWithinServiceArea(item.lat, item.lng)) return;
      skip.current = true;
      onQueryChange(item.label);
      onPlacePicked({ label: item.secondary ? `${item.label}, ${item.secondary}` : item.label, lat: item.lat, lng: item.lng });
      return;
    }
    if (!item.placeId) return;
    const hit = await resolvePlace(item.placeId, item.label);
    if (!hit || !isWithinServiceArea(hit.lat, hit.lng)) return;
    skip.current = true;
    onQueryChange(hit.label);
    onPlacePicked(hit);
  }

  const dropdown =
    showDrop && dropBox
      ? createPortal(
          <div
            data-domi-place-drop
            id={listId}
            className="overflow-hidden rounded-2xl border border-[#1E2E50] bg-[#0A1020] shadow-2xl"
            style={{
              position: 'fixed',
              top: dropBox.top,
              left: dropBox.left,
              width: dropBox.width,
              zIndex: 40000,
            }}
          >
            <div className="border-b border-white/10 px-3 py-2 text-[10px] text-slate-400">
              {loading ? 'Buscando en Google Maps…' : 'Negocios y direcciones'}
            </div>
            <ul className="max-h-64 overflow-auto py-1">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/5"
                    onClick={() => void pick(item)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-white">{item.label}</span>
                      <span className="block truncate text-[10px] text-slate-400">
                        {item.kind} · {item.secondary}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={`relative ${showDrop ? 'z-[80]' : 'z-[1]'}`}>
      <label className="mb-1 block text-xs font-bold text-slate-300">{label}</label>
      <div
        ref={boxRef}
        className="flex items-center gap-2 rounded-xl border border-[#1E2E50] bg-[#111A2E] px-2"
      >
        <MapPin className="h-4 w-4 shrink-0" style={{ color }} />
        <input
          className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
          required={required}
          value={value}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => typing && setOpen(true)}
        />
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-[#00E5FF]" /> : null}
        <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black text-slate-400">
          <Search className="h-3 w-3" />
          Buscar
        </span>
      </div>
      {dropdown}
    </div>
  );
}

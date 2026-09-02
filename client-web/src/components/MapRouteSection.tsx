import { MapPinned } from 'lucide-react';
import { APIProvider } from '@vis.gl/react-google-maps';
import type { LatLng } from '../lib/geo';
import { GOOGLE_MAPS_API_KEY } from '../lib/config';
import { PlaceSearchField } from './PlaceSearchField';
import { RouteMapPickerInner, type MapPickMode } from './RouteMapPicker';

type MapRouteSectionProps = {
  pickMode: MapPickMode;
  onPickModeChange: (mode: MapPickMode) => void;
  pickupAddress: string;
  deliveryAddress: string;
  onPickupAddressChange: (value: string) => void;
  onDeliveryAddressChange: (value: string) => void;
  onPickupPicked: (hit: LatLng & { label: string }) => void;
  onDeliveryPicked: (hit: LatLng & { label: string }) => void;
  pickup: LatLng | null;
  delivery: LatLng | null;
  path: LatLng[];
  geoBusy: boolean;
  onMapPick: (point: LatLng) => void;
  onDragPickup: (point: LatLng) => void;
  onDragDelivery: (point: LatLng) => void;
  onLiveDragPickup?: (point: LatLng) => void;
  onLiveDragDelivery?: (point: LatLng) => void;
};

function MapRouteSectionInner(props: MapRouteSectionProps) {
  const {
    pickMode,
    onPickModeChange,
    pickupAddress,
    deliveryAddress,
    onPickupAddressChange,
    onDeliveryAddressChange,
    onPickupPicked,
    onDeliveryPicked,
    pickup,
    delivery,
    path,
    geoBusy,
    onMapPick,
    onDragPickup,
    onDragDelivery,
    onLiveDragPickup,
    onLiveDragDelivery,
  } = props;

  return (
    <div className="space-y-3 overflow-visible">
      <div className="flex flex-wrap items-center gap-2">
        <MapPinned className="h-4 w-4 text-[var(--domi-cyan)]" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
          Ruta en el mapa
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              pickMode === 'pickup'
                ? 'bg-[var(--domi-blue)] text-white'
                : 'bg-white/5 text-[var(--domi-muted)]'
            }`}
            onClick={() => onPickModeChange('pickup')}
          >
            A · Recolección
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              pickMode === 'delivery'
                ? 'bg-[var(--domi-orange)] text-white'
                : 'bg-white/5 text-[var(--domi-muted)]'
            }`}
            onClick={() => onPickModeChange('delivery')}
          >
            B · Entrega
          </button>
        </div>
      </div>

      <PlaceSearchField
        label="Dirección de recolección (A) *"
        required
        accent="pickup"
        inputName="domiclick-pickup-address"
        value={pickupAddress}
        placeholder="Ej. Calle 23, Carrera 40, Av. 40, Unicentro…"
        onQueryChange={onPickupAddressChange}
        onPlacePicked={onPickupPicked}
      />

      <PlaceSearchField
        label="Dirección de entrega (B) *"
        required
        accent="delivery"
        inputName="domiclick-delivery-address"
        value={deliveryAddress}
        placeholder="Ej. Calle 15 # 20-10, Carrera 30, barrio o negocio…"
        onQueryChange={onDeliveryAddressChange}
        onPlacePicked={onDeliveryPicked}
      />

      <RouteMapPickerInner
        pickup={pickup}
        delivery={delivery}
        path={path}
        pickMode={pickMode}
        routing={geoBusy}
        onPick={onMapPick}
        onDragPickup={onDragPickup}
        onDragDelivery={onDragDelivery}
        onLiveDragPickup={onLiveDragPickup}
        onLiveDragDelivery={onLiveDragDelivery}
      />

      {pickup && delivery ? (
        <div className="space-y-1 rounded-xl border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.06)] px-3 py-2 text-sm text-white">
          <p>
            <span className="font-semibold text-[var(--domi-cyan)]">A · Recolección:</span>{' '}
            {pickupAddress || 'Punto de salida'}
          </p>
          <p>
            <span className="font-semibold text-[var(--domi-orange)]">B · Entrega:</span>{' '}
            {deliveryAddress || 'Punto de llegada'}
          </p>
          {geoBusy ? (
            <p className="text-xs text-[var(--domi-muted)]">Recalculando ruta óptima…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MapRouteSection(props: MapRouteSectionProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="rounded-xl border border-[var(--domi-border)] bg-[#0a0e16] px-4 py-8 text-center text-sm text-[var(--domi-muted)]">
        Falta <code className="text-[var(--domi-cyan)]">VITE_GOOGLE_MAPS_PLATFORM_KEY</code> en
        client-web/.env para el buscador y el mapa.
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={['marker', 'routes', 'geometry', 'places']}
      language="es"
      region="CO"
    >
      <MapRouteSectionInner {...props} />
    </APIProvider>
  );
}

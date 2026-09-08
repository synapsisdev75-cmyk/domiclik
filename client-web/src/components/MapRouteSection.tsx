import { MapPinned } from 'lucide-react';
import { APIProvider } from '@vis.gl/react-google-maps';
import type { LatLng } from '../lib/geo';
import { GOOGLE_MAPS_API_KEY } from '../lib/config';
import { composeFullAddress, type AddressParts } from '../lib/addressParts';
import { PlaceSearchField } from './PlaceSearchField';
import { StructuredAddressFields } from './StructuredAddressFields';
import { RouteMapPickerInner, type MapPickMode } from './RouteMapPicker';

type MapRouteSectionProps = {
  pickMode: MapPickMode;
  onPickModeChange: (mode: MapPickMode) => void;
  onPickupPicked: (hit: LatLng & { label: string }) => void;
  onDeliveryPicked: (hit: LatLng & { label: string }) => void;
  pickup: LatLng | null;
  delivery: LatLng | null;
  path: LatLng[];
  geoBusy: boolean;
  pinDragging?: boolean;
  onMapPick: (point: LatLng) => void;
  onDragPickup: (point: LatLng) => void;
  onDragDelivery: (point: LatLng) => void;
  onDragStart?: (which: 'pickup' | 'delivery') => void;
  mapFirst?: boolean;
  mapHeightClass?: string;
  compactSummary?: boolean;
  /** App: campos divididos. Web PC: un solo campo por dirección. */
  structured?: boolean;
  pickupParts?: AddressParts;
  deliveryParts?: AddressParts;
  onPickupPartsChange?: (parts: AddressParts) => void;
  onDeliveryPartsChange?: (parts: AddressParts) => void;
  pickupAddress?: string;
  deliveryAddress?: string;
  onPickupAddressChange?: (value: string) => void;
  onDeliveryAddressChange?: (value: string) => void;
  /** Pins colocados a mano: Buscar no los mueve. */
  pickupMapAnchored?: boolean;
  deliveryMapAnchored?: boolean;
  onUnlockPickupMapPin?: () => void;
  onUnlockDeliveryMapPin?: () => void;
};

function MapRouteSectionInner(props: MapRouteSectionProps) {
  const {
    pickMode,
    onPickModeChange,
    pickupParts,
    deliveryParts,
    onPickupPartsChange,
    onDeliveryPartsChange,
    pickupAddress = '',
    deliveryAddress = '',
    onPickupAddressChange,
    onDeliveryAddressChange,
    onPickupPicked,
    onDeliveryPicked,
    pickup,
    delivery,
    path,
    geoBusy,
    pinDragging,
    onMapPick,
    onDragPickup,
    onDragDelivery,
    onDragStart,
    mapFirst = false,
    mapHeightClass,
    compactSummary = false,
    structured = false,
    pickupMapAnchored = false,
    deliveryMapAnchored = false,
    onUnlockPickupMapPin,
    onUnlockDeliveryMapPin,
  } = props;

  const pickupLabel = structured && pickupParts ? composeFullAddress(pickupParts) : pickupAddress;
  const deliveryLabel =
    structured && deliveryParts ? composeFullAddress(deliveryParts) : deliveryAddress;

  const modeBar = (
    <div className="flex flex-wrap items-center gap-2">
      <MapPinned className="h-4 w-4 text-[var(--domi-cyan)]" aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
        {mapFirst ? 'Arrastra A / B en el mapa' : 'Ruta en el mapa'}
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
  );

  const fields =
    structured && pickupParts && deliveryParts && onPickupPartsChange && onDeliveryPartsChange ? (
      <div className="map-route-fields-stack space-y-3">
        <div className={pickMode === 'pickup' ? 'block' : 'block lg:hidden'}>
          <StructuredAddressFields
            title="Recolección (A)"
            accent="pickup"
            inputPrefix="domiclick-pickup"
            parts={pickupParts}
            forceClose={Boolean(pinDragging)}
            onPartsChange={onPickupPartsChange}
            onPlacePicked={onPickupPicked}
            onActivate={() => onPickModeChange('pickup')}
            mapAnchoredPin={pickupMapAnchored ? pickup : null}
            onUnlockMapPin={onUnlockPickupMapPin}
          />
        </div>
        <div className={pickMode === 'delivery' ? 'block' : 'block lg:hidden'}>
          <StructuredAddressFields
            title="Entrega (B)"
            accent="delivery"
            inputPrefix="domiclick-delivery"
            parts={deliveryParts}
            forceClose={Boolean(pinDragging)}
            onPartsChange={onDeliveryPartsChange}
            onPlacePicked={onDeliveryPicked}
            onActivate={() => onPickModeChange('delivery')}
            mapAnchoredPin={deliveryMapAnchored ? delivery : null}
            onUnlockMapPin={onUnlockDeliveryMapPin}
          />
        </div>
      </div>
    ) : (
      <div className="map-route-fields-stack space-y-3">
        <PlaceSearchField
          label="Dirección de recolección (A) *"
          required
          accent="pickup"
          inputName="domiclick-pickup-address"
          value={pickupAddress}
          forceClose={Boolean(pinDragging)}
          placeholder="Ej. Calle 23, Carrera 40, Av. 40, Unicentro…"
          onQueryChange={(v) => onPickupAddressChange?.(v)}
          onPlacePicked={onPickupPicked}
          onActivate={() => onPickModeChange('pickup')}
        />
        <PlaceSearchField
          label="Dirección de entrega (B) *"
          required
          accent="delivery"
          inputName="domiclick-delivery-address"
          value={deliveryAddress}
          forceClose={Boolean(pinDragging)}
          placeholder="Ej. Calle 15, Carrera 30, Av. 40, barrio o negocio…"
          onQueryChange={(v) => onDeliveryAddressChange?.(v)}
          onPlacePicked={onDeliveryPicked}
          onActivate={() => onPickModeChange('delivery')}
        />
      </div>
    );

  const map = (
    <RouteMapPickerInner
      pickup={pickup}
      delivery={delivery}
      path={path}
      pickMode={pickMode}
      routing={geoBusy}
      pinDragging={pinDragging}
      heightClass={
        mapHeightClass ||
        (mapFirst ? 'h-[42vh] min-h-[240px]' : 'h-64 sm:h-80 map-route-map-frame')
      }
      onPick={onMapPick}
      onDragPickup={onDragPickup}
      onDragDelivery={onDragDelivery}
      onDragStart={onDragStart}
    />
  );

  const summary =
    pickup && delivery && !compactSummary ? (
      <div className="space-y-1 rounded-xl border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.06)] px-3 py-2 text-sm text-white">
        <p>
          <span className="font-semibold text-[var(--domi-cyan)]">A · Recolección:</span>{' '}
          {pickupLabel || 'Punto de salida'}
        </p>
        <p>
          <span className="font-semibold text-[var(--domi-orange)]">B · Entrega:</span>{' '}
          {deliveryLabel || 'Punto de llegada'}
        </p>
        {geoBusy ? (
          <p className="text-xs text-[var(--domi-muted)]">Recalculando ruta óptima…</p>
        ) : null}
      </div>
    ) : null;

  // Web PC: mapa protagonista + campos al lado. Móvil / app: apilado.
  return (
    <div className="map-route-section space-y-3 overflow-visible">
      {modeBar}
      <div className="map-route-body">
        <div className="map-route-map min-w-0">{map}</div>
        <div className="map-route-fields min-w-0">{fields}</div>
      </div>
      {summary}
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

import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID } from '../lib/config';
import {
  OFFICE_ADDRESS_LINE1,
  OFFICE_ADDRESS_LINE2,
  OFFICE_CITY,
  OFFICE_LAT,
  OFFICE_LNG,
} from '../lib/companyInfo';

function OfficePin() {
  return (
    <div className="office-map-pin" title={`DomiClick · ${OFFICE_ADDRESS_LINE1}`}>
      <span className="office-map-pin__dot" />
      <span className="office-map-pin__label">Oficina DomiClick</span>
    </div>
  );
}

export function OfficeMap({ className = '' }: { className?: string }) {
  const position = { lat: OFFICE_LAT, lng: OFFICE_LNG };
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${OFFICE_LAT},${OFFICE_LNG}`;

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <a
        className={`office-map office-map--fallback ${className}`.trim()}
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        <p className="office-map-fallback-title">Ver en Google Maps</p>
        <p className="office-map-fallback-addr">
          {OFFICE_ADDRESS_LINE1}
          <br />
          {OFFICE_ADDRESS_LINE2} · {OFFICE_CITY}
        </p>
      </a>
    );
  }

  return (
    <div className={`office-map ${className}`.trim()}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker']}>
        <Map
          defaultCenter={position}
          defaultZoom={16}
          minZoom={13}
          maxZoom={19}
          mapId={GOOGLE_MAPS_MAP_ID}
          colorScheme="DARK"
          gestureHandling="cooperative"
          disableDefaultUI
          zoomControl
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
          style={{ width: '100%', height: '100%' }}
          className="h-full w-full"
          reuseMaps
        >
          <AdvancedMarker position={position} title={`Oficina DomiClick · ${OFFICE_ADDRESS_LINE1}`}>
            <OfficePin />
          </AdvancedMarker>
        </Map>
      </APIProvider>
      <a
        className="office-map-open"
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir en Maps
      </a>
    </div>
  );
}

/**
 * Capas base Leaflet: CARTO (con API key) u OSM/Esri oscuro sin key.
 * https://docs.carto.com/faqs/carto-basemaps
 */
import L from 'leaflet';

export type CartoRasterStyle =
  | 'dark_all'
  | 'dark_nolabels'
  | 'dark_only_labels'
  | 'light_all'
  | 'voyager';

/** Esri dark — sin key, sin watermark. */
const ESRI_DARK_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

export function getCartoApiKey(): string {
  return String(import.meta.env.VITE_CARTO_API_KEY ?? '').trim();
}

export function hasCartoApiKey(): boolean {
  return getCartoApiKey().length > 0;
}

/** Plantilla raster oficial CARTO (rastertiles + ?key=). */
export function cartoRasterTileTemplate(style: CartoRasterStyle = 'dark_all'): string {
  return `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png`;
}

/** @deprecated Usar createLeafletBasemapLayer */
export function withCartoApiKey(tileUrl: string): string {
  const key = getCartoApiKey();
  if (!key) return tileUrl;
  const sep = tileUrl.includes('?') ? '&' : '?';
  return `${tileUrl}${sep}key=${encodeURIComponent(key)}`;
}

/** Plantilla Leaflet (sin key en la URL; se añade en getTileUrl). */
export function cartoRasterLeafletUrl(style: CartoRasterStyle = 'dark_all'): string {
  if (hasCartoApiKey()) {
    return cartoRasterTileTemplate(style);
  }
  if (style === 'light_all') {
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }
  return ESRI_DARK_TILE_URL;
}

export function mapBasemapAttribution(style: CartoRasterStyle = 'dark_all'): string {
  if (hasCartoApiKey()) {
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
  }
  if (style === 'light_all') {
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  }
  return '&copy; Esri &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
}

export function leafletBasemapOptions(style: CartoRasterStyle = 'dark_all') {
  const carto = hasCartoApiKey();
  const esri = !carto && style !== 'light_all';
  return {
    attribution: mapBasemapAttribution(style),
    ...(carto ? { subdomains: 'abcd' as const, maxZoom: 20 } : {}),
    ...(esri ? { maxZoom: 16 } : {}),
    ...(!carto && style === 'light_all' ? { maxZoom: 19 } : {}),
  };
}

/** Capa Leaflet que añade ?key= tras sustituir {z}/{x}/{y} (formato CARTO 2025+). */
export function createLeafletBasemapLayer(style: CartoRasterStyle = 'dark_all'): L.TileLayer {
  const key = getCartoApiKey();
  const url = cartoRasterLeafletUrl(style);
  const options = leafletBasemapOptions(style);
  const layer = L.tileLayer(url, options);

  if (!key) return layer;

  const baseGetTileUrl = layer.getTileUrl.bind(layer);
  layer.getTileUrl = (coords) => {
    const tileUrl = baseGetTileUrl(coords);
    if (tileUrl.includes('key=')) return tileUrl;
    const sep = tileUrl.includes('?') ? '&' : '?';
    return `${tileUrl}${sep}key=${encodeURIComponent(key)}`;
  };

  return layer;
}

/** @deprecated Usar mapBasemapAttribution */
export const CARTO_ATTRIBUTION = mapBasemapAttribution('dark_all');

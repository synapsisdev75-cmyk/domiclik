import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MotorizadoDriver, DeliveryOrder } from '../types';
import { isLiveOrderStatus } from '../lib/orderFlow';
import { VILLAVICENCIO_CENTER, VILLAVICENCIO_KEY_POINTS } from '../data/villavicencio';
import {
  calculateOptimalRoute,
  RouteResult,
  RouteStep,
  VILLAVICENCIO_TRAFFIC_ZONES,
} from '../utils/routing';
import {
  Layers,
  Zap,
  Navigation,
  Compass,
  MapPin,
  Play,
  Pause,
  RotateCcw,
  Gauge,
  Clock,
  Route as RouteIcon,
  ChevronRight,
  ShieldAlert,
  Sliders,
  X,
  Key,
  CheckCircle2,
  AlertTriangle,
  Crosshair,
  Loader2,
} from 'lucide-react';
import { BRAND } from './brand/BrandAssets';

// Google Maps React SDK
import { APIProvider, Map as GoogleMap, AdvancedMarker as GoogleAdvancedMarker, Pin } from '@vis.gl/react-google-maps';

export type MapStyleType = 'google_map' | 'google_traffic' | 'google_satellite' | 'dark' | 'cyber' | 'light' | 'retro';

export const DOMICLICK_GOOGLE_MAP_ID = '7959bb6afa37dd5e9db669a8';

interface MapComponentProps {
  drivers: MotorizadoDriver[];
  orders?: DeliveryOrder[];
  selectedDriverId?: string | null;
  onSelectDriver?: (driver: MotorizadoDriver) => void;
  selectedOrderId?: string | null;
  height?: string;
  showFilters?: boolean;
  /** Force map tile style from parent (e.g. radar night / satellite) */
  mapStyle?: MapStyleType;
  /** Hide internal chrome when embedded in Admin radar */
  compactChrome?: boolean;
  /** Centra el mapa en el conductor seleccionado cada vez que mueve el GPS. */
  followSelectedDriver?: boolean;
  /** Botón flotante «Mi ubicación» (GPS preciso + pin). */
  showMyLocationButton?: boolean;
  /** Callback al obtener fix preciso (p. ej. subir a Firebase). */
  onPreciseLocation?: (lat: number, lng: number, accuracyM: number) => void;
  /** Última ubicación conocida (fallback si getCurrentPosition falla). */
  fallbackLocation?: { lat: number; lng: number } | null;
}

const TILE_LAYERS: Record<MapStyleType, { url: string; attribution: string; name: string; icon: string; subdomains?: string }> = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    name: 'Noche Operativa',
    icon: '🌑',
  },
  google_map: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO Dark · DomiClick',
    name: 'Radar Oscuro',
    icon: '🗺️',
  },
  google_traffic: {
    url: 'https://mt{s}.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps Traffic',
    name: 'Tráfico Live',
    icon: '🚦',
    subdomains: '0123',
  },
  google_satellite: {
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Satélite',
    name: 'Satélite',
    icon: '🛰️',
    subdomains: '0123',
  },
  cyber: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    name: 'Neon Labels',
    icon: '⚡',
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    name: 'Día',
    icon: '☀️',
  },
  retro: {
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; OSM',
    name: 'OSM',
    icon: '📜',
  },
};

export const MapComponent: React.FC<MapComponentProps> = ({
  drivers,
  orders = [],
  selectedDriverId,
  onSelectDriver,
  selectedOrderId,
  height = 'h-[620px]',
  showFilters = true,
  mapStyle,
  compactChrome = false,
  followSelectedDriver = false,
  showMyLocationButton = false,
  onPreciseLocation,
  fallbackLocation = null,
}) => {
  // Map Container & Instance Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const orderMarkersRef = useRef<{ [key: string]: L.Marker }>({});
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const routeGlowRef = useRef<L.Polyline | null>(null);
  const routeStartMarkerRef = useRef<L.Marker | null>(null);
  const routeEndMarkerRef = useRef<L.Marker | null>(null);
  const trafficPolylinesRef = useRef<L.Polyline[]>([]);
  const simMarkerRef = useRef<L.Marker | null>(null);
  const myLocationMarkerRef = useRef<L.Marker | null>(null);
  const myAccuracyCircleRef = useRef<L.Circle | null>(null);

  // States — default night ops dark map (matches design)
  const [currentStyle, setCurrentStyle] = useState<MapStyleType>(mapStyle || 'dark');
  const [showTraffic, setShowTraffic] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isRoutePanelOpen, setIsRoutePanelOpen] = useState<boolean>(false);
  const [isStylePickerOpen, setIsStylePickerOpen] = useState<boolean>(false);
  const [locatingMe, setLocatingMe] = useState(false);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);

  // Sync style from parent (Vista Mapa / Satélite)
  useEffect(() => {
    if (mapStyle) setCurrentStyle(mapStyle);
  }, [mapStyle]);

  // Routing State
  const [selectedOrderForRoute, setSelectedOrderForRoute] = useState<string>('');
  const [originPoint, setOriginPoint] = useState<string>('Barzal Alto (Zona Médica)');
  const [destinationPoint, setDestinationPoint] = useState<string>('C.C. Viva Villavicencio');
  const [optimizationStrategy, setOptimizationStrategy] = useState<'fastest' | 'main_avenues' | 'shortest'>('fastest');
  
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simProgress, setSimProgress] = useState<number>(0);
  const [simSpeed, setSimSpeed] = useState<number>(36); // km/h
  const simAnimationRef = useRef<number | null>(null);

  // Google Maps API Key (Vite env + runtime fallback)
  const gmpKey =
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    localStorage.getItem('domiclick_gmaps_key') ||
    '';
  const [googleKeyInput, setGoogleKeyInput] = useState<string>(gmpKey);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(!gmpKey);

  // Auto-inject Google Maps JS SDK script if API key is present
  useEffect(() => {
    const keyToUse = googleKeyInput || gmpKey;
    if (!keyToUse || typeof window === 'undefined') return;
    if ((window as any).google?.maps) return;

    const scriptId = 'google-maps-platform-script';
    if (document.getElementById(scriptId)) return;

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${keyToUse}&libraries=places,geometry,routes`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [googleKeyInput, gmpKey]);

  // Filter approved drivers
  const filteredDrivers = drivers.filter((d) => {
    if (d.status !== 'approved') return false;
    if (activeFilter === 'active') return d.isActive;
    if (activeFilter === 'inactive') return !d.isActive;
    return true;
  });

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [VILLAVICENCIO_CENTER.lat, VILLAVICENCIO_CENTER.lng],
      zoom: VILLAVICENCIO_CENTER.zoom,
      zoomControl: false,
    });

    const activeConfig = TILE_LAYERS[currentStyle];
    const initialLayer = L.tileLayer(activeConfig.url, {
      attribution: activeConfig.attribution,
      maxZoom: 19,
      subdomains: activeConfig.subdomains || 'abcd',
    }).addTo(map);

    tileLayerRef.current = initialLayer;
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      myLocationMarkerRef.current = null;
      myAccuracyCircleRef.current = null;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Change Tile Style dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const activeConfig = TILE_LAYERS[currentStyle];
    const newLayer = L.tileLayer(activeConfig.url, {
      attribution: activeConfig.attribution,
      maxZoom: 19,
      subdomains: activeConfig.subdomains || 'abcd',
    }).addTo(map);

    tileLayerRef.current = newLayer;
  }, [currentStyle]);

  // 3. Render Real-Time Traffic Polylines Overlay
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing traffic lines
    trafficPolylinesRef.current.forEach((pl) => pl.remove());
    trafficPolylinesRef.current = [];

    if (!showTraffic) return;

    // Defined main traffic corridors in Villavicencio with real-time status color
    const trafficCorridors = [
      {
        path: [
          [4.1350, -73.6250],
          [4.1415, -73.6280],
          [4.1450, -73.6330],
        ] as [number, number][],
        color: '#ef4444', // Red - High traffic on Av 40
        dashArray: '4, 8',
        label: 'Av. 40 - Tráfico Alto (+4 min)',
      },
      {
        path: [
          [4.1480, -73.6220],
          [4.1502, -73.6372],
          [4.1610, -73.6410],
        ] as [number, number][],
        color: '#f59e0b', // Yellow - Moderate traffic on Av. del Llano
        dashArray: '6, 6',
        label: 'Av. del Llano - Moderado (+2 min)',
      },
      {
        path: [
          [4.1180, -73.6150],
          [4.1080, -73.5950],
        ] as [number, number][],
        color: '#10b981', // Green - Smooth on Anillo Vial
        dashArray: undefined,
        label: 'Anillo Vial - Fluido',
      },
    ];

    trafficCorridors.forEach((corr) => {
      const line = L.polyline(corr.path, {
        color: corr.color,
        weight: 6,
        opacity: 0.75,
        dashArray: corr.dashArray,
      }).addTo(map);

      line.bindTooltip(corr.label, { permanent: false, direction: 'top' });
      trafficPolylinesRef.current.push(line);
    });
  }, [showTraffic]);

  // 4. Update Driver Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove obsolete markers
    Object.keys(markersRef.current).forEach((id) => {
      if (!filteredDrivers.some((d) => d.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add / Update neon circular driver markers (design system)
    filteredDrivers.forEach((driver) => {
      const { lat, lng } = driver.location;
      if (!lat || !lng) return;

      const isSelected = selectedDriverId === driver.id;
      const glow = driver.isActive ? '#00E676' : '#2B6CFF';
      const label = driver.isActive ? 'ACTIVO' : 'EN RUTA';
      const pulse =
        isSelected || driver.isActive
          ? `<span style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${glow};opacity:.55;animation:domiGpsPulse 1.4s ease-out infinite"></span>`
          : '';

      const customIcon = L.divIcon({
        className: 'custom-driver-marker',
        html: `
          <div style="position:relative;width:22px;height:22px;transform:${isSelected ? 'scale(1.35)' : 'scale(1)'};transition:transform .15s">
            ${pulse}
            <div style="width:14px;height:14px;margin:4px;border-radius:50%;background:${glow};box-shadow:0 0 0 2px #fff,0 0 12px ${glow};border:0"></div>
            <div style="position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:4px;white-space:nowrap;background:rgba(8,12,22,.92);border:1px solid ${glow}55;color:#fff;font:700 8px JetBrains Mono,monospace;padding:1px 5px;border-radius:5px;pointer-events:none">
              ${driver.fullName.split(' ')[0]} · ${label}
            </div>
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      if (markersRef.current[driver.id]) {
        markersRef.current[driver.id].setLatLng([lat, lng]);
        markersRef.current[driver.id].setIcon(customIcon);
      } else {
        const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
        marker.on('click', () => {
          if (onSelectDriver) {
            onSelectDriver(driver);
          }
        });
        markersRef.current[driver.id] = marker;
      }
    });

    // Neon order markers (pending orange / transit blue / delivered)
    Object.keys(orderMarkersRef.current).forEach((id) => {
      if (!orders.some((o) => o.id === id)) {
        orderMarkersRef.current[id].remove();
        delete orderMarkersRef.current[id];
      }
    });

    orders.forEach((order) => {
      const coords = order.deliveryCoords || order.pickupCoords;
      if (!coords?.lat || !coords?.lng) return;

      const color =
        order.status === 'delivered'
          ? '#FF5722'
          : isLiveOrderStatus(order.status)
            ? '#2B6CFF'
            : '#FF8A00';

      const orderIcon = L.divIcon({
        className: 'order-map-marker',
        html: `
          <div style="width:14px;height:14px;margin:1px;border-radius:50%;background:${color};box-shadow:0 0 0 1.5px ${color},0 1px 4px rgba(0,0,0,.55);border:2px solid #fff"></div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      if (orderMarkersRef.current[order.id]) {
        orderMarkersRef.current[order.id].setLatLng([coords.lat, coords.lng]);
        orderMarkersRef.current[order.id].setIcon(orderIcon);
      } else {
        orderMarkersRef.current[order.id] = L.marker([coords.lat, coords.lng], {
          icon: orderIcon,
          opacity: 0.95,
        }).addTo(map);
      }
    });
  }, [filteredDrivers, selectedDriverId, onSelectDriver, orders]);

  // 5. Center map on selected driver
  // Seguir conductor seleccionado (GPS en vivo)
  useEffect(() => {
    if (!selectedDriverId || !mapInstanceRef.current) return;
    const targetDriver = drivers.find((d) => d.id === selectedDriverId);
    if (!targetDriver?.location?.lat || !targetDriver?.location?.lng) return;
    const map = mapInstanceRef.current;
    const { lat, lng } = targetDriver.location;
    if (followSelectedDriver) {
      map.panTo([lat, lng], { animate: true, duration: 0.4 });
    } else {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 1.0 });
    }
  }, [
    selectedDriverId,
    followSelectedDriver,
    drivers.find((d) => d.id === selectedDriverId)?.location?.lat,
    drivers.find((d) => d.id === selectedDriverId)?.location?.lng,
  ]);

  // 6. Handle Selected Order Auto-Route Calculation
  useEffect(() => {
    if (!selectedOrderId) return;
    const targetOrder = orders.find((o) => o.id === selectedOrderId);
    if (targetOrder && targetOrder.pickupCoords && targetOrder.deliveryCoords) {
      handleGenerateRoute(
        targetOrder.pickupCoords.lat,
        targetOrder.pickupCoords.lng,
        targetOrder.deliveryCoords.lat,
        targetOrder.deliveryCoords.lng
      );
    }
  }, [selectedOrderId, orders]);

  // Auto-draw neon route on compact radar (design reference look)
  useEffect(() => {
    if (!compactChrome || !mapInstanceRef.current) return;
    const routeOrder =
      orders.find((o) => isLiveOrderStatus(o.status) && o.pickupCoords && o.deliveryCoords) ||
      orders.find((o) => o.pickupCoords && o.deliveryCoords);
    if (!routeOrder?.pickupCoords || !routeOrder?.deliveryCoords) return;
    const t = setTimeout(() => {
      handleGenerateRoute(
        routeOrder.pickupCoords.lat,
        routeOrder.pickupCoords.lng,
        routeOrder.deliveryCoords.lat,
        routeOrder.deliveryCoords.lng
      );
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactChrome, orders.length]);

  // 7. Route Generation & Rendering Function
  const handleGenerateRoute = async (
    startLat?: number,
    startLng?: number,
    endLat?: number,
    endLng?: number
  ) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    setIsCalculatingRoute(true);
    setIsSimulating(false);

    // Resolve lat/lng coordinates
    let pStartLat = startLat;
    let pStartLng = startLng;
    let pEndLat = endLat;
    let pEndLng = endLng;

    if (!pStartLat || !pStartLng) {
      const p1 = VILLAVICENCIO_KEY_POINTS.find((pt) => pt.name === originPoint) || VILLAVICENCIO_KEY_POINTS[1];
      pStartLat = p1.lat;
      pStartLng = p1.lng;
    }

    if (!pEndLat || !pEndLng) {
      const p2 = VILLAVICENCIO_KEY_POINTS.find((pt) => pt.name === destinationPoint) || VILLAVICENCIO_KEY_POINTS[3];
      pEndLat = p2.lat;
      pEndLng = p2.lng;
    }

    const routeData = await calculateOptimalRoute(
      pStartLat,
      pStartLng,
      pEndLat,
      pEndLng,
      optimizationStrategy
    );

    setActiveRoute(routeData);
    setIsCalculatingRoute(false);
    setIsRoutePanelOpen(true);

    // Render polyline on map
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
    if (routeGlowRef.current) {
      routeGlowRef.current.remove();
      routeGlowRef.current = null;
    }
    if (routeStartMarkerRef.current) {
      routeStartMarkerRef.current.remove();
      routeStartMarkerRef.current = null;
    }
    if (routeEndMarkerRef.current) {
      routeEndMarkerRef.current.remove();
      routeEndMarkerRef.current = null;
    }

    // Glow underlay + neon cyan dashed route (design)
    const glow = L.polyline(routeData.coordinates, {
      color: '#00E5FF',
      weight: 12,
      opacity: 0.22,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    const polyline = L.polyline(routeData.coordinates, {
      color: '#00E5FF',
      weight: 4,
      opacity: 0.95,
      dashArray: '10 8',
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    routeGlowRef.current = glow;

    // Origin Pin
    const originIcon = L.divIcon({
      className: 'route-origin-pin',
      html: `
        <div style="width:28px;height:28px;border-radius:50%;background:#00E676;box-shadow:0 0 14px #00E676;border:2px solid #fff"></div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    // Destination Pin
    const destIcon = L.divIcon({
      className: 'route-dest-pin',
      html: `
        <div style="width:28px;height:28px;border-radius:50%;background:#FF5722;box-shadow:0 0 14px #FF5722;border:2px solid #fff;display:flex;align-items:center;justify-content:center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    if (routeData.coordinates.length > 0) {
      const startCoord = routeData.coordinates[0];
      const endCoord = routeData.coordinates[routeData.coordinates.length - 1];

      routeStartMarkerRef.current = L.marker(startCoord, { icon: originIcon }).addTo(map);
      routeEndMarkerRef.current = L.marker(endCoord, { icon: destIcon }).addTo(map);
    }

    routePolylineRef.current = polyline;
    map.fitBounds(polyline.getBounds(), { padding: [60, 60] });
  };

  // 8. Live Real-time Simulation Animation Loop
  const toggleSimulation = () => {
    if (!activeRoute || activeRoute.coordinates.length === 0) return;

    if (isSimulating) {
      setIsSimulating(false);
      if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current);
      return;
    }

    setIsSimulating(true);
    let step = simProgress;
    const totalSteps = activeRoute.coordinates.length - 1;

    const animate = () => {
      step += 0.003;
      if (step >= 1) {
        step = 0; // loop
      }

      setSimProgress(step);

      const idx = Math.floor(step * totalSteps);
      const nextIdx = Math.min(idx + 1, totalSteps);
      const subRatio = step * totalSteps - idx;

      const p1 = activeRoute.coordinates[idx];
      const p2 = activeRoute.coordinates[nextIdx];

      const currentLat = p1[0] + (p2[0] - p1[0]) * subRatio;
      const currentLng = p1[1] + (p2[1] - p1[1]) * subRatio;

      // Update simulation marker on Leaflet map
      const map = mapInstanceRef.current;
      if (map) {
        if (!simMarkerRef.current) {
          const bikeIcon = L.divIcon({
            className: 'simulated-driver-marker',
            html: `
              <div class="relative flex items-center justify-center w-10 h-10 rounded-full bg-[#f59e0b] text-black border-2 border-white shadow-2xl animate-pulse">
                <span class="text-lg font-bold">🏍️</span>
              </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          });
          simMarkerRef.current = L.marker([currentLat, currentLng], { icon: bikeIcon }).addTo(map);
        } else {
          simMarkerRef.current.setLatLng([currentLat, currentLng]);
        }
      }

      simAnimationRef.current = requestAnimationFrame(animate);
    };

    simAnimationRef.current = requestAnimationFrame(animate);
  };

  const handleRecenterVillavicencio = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(
        [VILLAVICENCIO_CENTER.lat, VILLAVICENCIO_CENTER.lng],
        VILLAVICENCIO_CENTER.zoom,
        { duration: 1 }
      );
    }
  };

  const placePrecisePin = (lat: number, lng: number, accuracyM: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const pinIcon = L.divIcon({
      className: 'my-gps-precise-pin',
      html: `
        <div style="position:relative;width:28px;height:36px;">
          <span style="position:absolute;left:50%;top:8px;width:28px;height:28px;margin-left:-14px;margin-top:-8px;border-radius:50%;border:2px solid #00E676;opacity:.45;animation:domiGpsPulse 1.3s ease-out infinite"></span>
          <svg width="28" height="36" viewBox="0 0 28 36" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,.55))">
            <path d="M14 0C7.4 0 2 5.4 2 12.1C2 20.3 14 36 14 36S26 20.3 26 12.1C26 5.4 20.6 0 14 0Z" fill="#FF5722"/>
            <circle cx="14" cy="12" r="5.5" fill="#fff"/>
            <circle cx="14" cy="12" r="2.8" fill="#00E676"/>
          </svg>
        </div>
      `,
      iconSize: [28, 36],
      iconAnchor: [14, 36],
    });

    if (myLocationMarkerRef.current) {
      myLocationMarkerRef.current.setLatLng([lat, lng]);
      myLocationMarkerRef.current.setIcon(pinIcon);
    } else {
      myLocationMarkerRef.current = L.marker([lat, lng], {
        icon: pinIcon,
        zIndexOffset: 2000,
      })
        .addTo(map)
        .bindTooltip('Tu ubicación GPS precisa', { direction: 'top', offset: [0, -28] });
    }

    const radius = Math.max(12, Math.min(accuracyM || 25, 120));
    if (myAccuracyCircleRef.current) {
      myAccuracyCircleRef.current.setLatLng([lat, lng]);
      myAccuracyCircleRef.current.setRadius(radius);
    } else {
      myAccuracyCircleRef.current = L.circle([lat, lng], {
        radius,
        color: '#00E676',
        weight: 1.5,
        fillColor: '#00E676',
        fillOpacity: 0.12,
      }).addTo(map);
    }

    map.flyTo([lat, lng], 18, { duration: 0.9 });
  };

  const handleLocateMe = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setLocateMsg('GPS solo en https:// o localhost. Cambia la URL.');
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocateMsg('Este dispositivo no tiene GPS.');
      return;
    }

    setLocatingMe(true);
    setLocateMsg('Pidiendo permiso / GPS preciso…');

    const apply = (lat: number, lng: number, accuracy: number, label: string) => {
      placePrecisePin(lat, lng, accuracy);
      onPreciseLocation?.(lat, lng, accuracy);
      setLocateMsg(label);
      setLocatingMe(false);
    };

    const tryLowAccuracy = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          apply(
            latitude,
            longitude,
            accuracy,
            `Ubicación ±${Math.round(accuracy)} m · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          );
        },
        (err2) => {
          // Fallback: última posición conocida del motorizado
          if (fallbackLocation?.lat && fallbackLocation?.lng) {
            apply(
              fallbackLocation.lat,
              fallbackLocation.lng,
              40,
              `Pin con última posición conocida · ${fallbackLocation.lat.toFixed(5)}, ${fallbackLocation.lng.toFixed(5)}`
            );
            return;
          }
          const selected = selectedDriverId
            ? drivers.find((d) => d.id === selectedDriverId)
            : null;
          if (selected?.location?.lat && selected?.location?.lng) {
            apply(
              selected.location.lat,
              selected.location.lng,
              40,
              `Pin con posición del perfil · ${selected.location.lat.toFixed(5)}, ${selected.location.lng.toFixed(5)}`
            );
            return;
          }
          setLocatingMe(false);
          if (err2.code === 1) {
            setLocateMsg(
              'Ubicación bloqueada. Candado en la barra → Ubicación → Permitir → Recargar → pulsa otra vez.'
            );
          } else if (err2.code === 3) {
            setLocateMsg('GPS tardó demasiado. Sal a zona abierta y pulsa de nuevo.');
          } else {
            setLocateMsg('Sin fix GPS. Activa ubicación del Windows/móvil y reintenta.');
          }
        },
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 12000 }
      );
    };

    // 1) Alta precisión  2) baja precisión  3) última conocida
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        apply(
          latitude,
          longitude,
          accuracy,
          `Ubicación precisa ±${Math.round(accuracy)} m · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
        );
      },
      () => tryLowAccuracy(),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
  };

  return (
    <div className={`relative ${height} w-full overflow-hidden bg-[#0a0e16] ${compactChrome ? '' : 'rounded-2xl border border-[#1a2744] shadow-2xl'}`}>
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {showMyLocationButton && (
        <div className="absolute bottom-20 right-3 z-[500] flex flex-col items-end gap-2 pointer-events-none">
          {locateMsg && (
            <div className="pointer-events-auto max-w-[220px] bg-[#0a101c]/95 border border-[#00E676]/40 text-[10px] text-slate-200 font-mono px-2.5 py-1.5 rounded-xl shadow-lg">
              {locateMsg}
            </div>
          )}
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locatingMe}
            title="Ubicarme con GPS preciso"
            className="pointer-events-auto flex items-center gap-2 bg-[#FF5722] hover:bg-[#E64A19] disabled:opacity-70 text-white font-black text-xs font-mono px-3.5 py-3 rounded-2xl border border-[#FF8A65] shadow-[0_0_22px_rgba(255,87,34,0.45)]"
          >
            {locatingMe ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Crosshair className="w-4 h-4" />
            )}
            {locatingMe ? 'Localizando…' : 'Mi ubicación'}
          </button>
        </div>
      )}

      {/* Top Left Header & Mode Badge */}
      {!compactChrome && (
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="bg-[#0a101c]/92 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-[#1a2744] shadow-xl pointer-events-auto flex items-center gap-3 shadow-glow-blue">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00E676]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white block font-tech">Radar Villavicencio</span>
              <span className="text-[10px] bg-[#FF5722]/15 text-[#FF5722] border border-[#FF5722]/35 px-1.5 py-0.5 rounded font-mono font-bold">
                {TILE_LAYERS[currentStyle].name}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              Zona Meta · {filteredDrivers.length} unidades
            </span>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-[#161920]/95 backdrop-blur-md p-1.5 rounded-xl border border-[#2d3139] shadow-md pointer-events-auto flex items-center gap-1 text-xs">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                activeFilter === 'all'
                  ? 'bg-[#f59e0b] text-black font-bold shadow'
                  : 'text-slate-300 hover:text-white hover:bg-[#2d3139]/50'
              }`}
            >
              Todos ({drivers.filter((d) => d.status === 'approved').length})
            </button>

            <button
              onClick={() => setActiveFilter('active')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                activeFilter === 'active'
                  ? 'bg-emerald-500 text-black font-bold shadow'
                  : 'text-slate-300 hover:text-white hover:bg-[#2d3139]/50'
              }`}
            >
              🟢 Activos ({drivers.filter((d) => d.status === 'approved' && d.isActive).length})
            </button>

            <button
              onClick={() => setActiveFilter('inactive')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                activeFilter === 'inactive'
                  ? 'bg-[#2d3139] text-white font-bold shadow'
                  : 'text-slate-400 hover:text-white hover:bg-[#2d3139]/50'
              }`}
            >
              ⚫ Inactivos ({drivers.filter((d) => d.status === 'approved' && !d.isActive).length})
            </button>
          </div>
        )}
      </div>
      )}

      {/* Top Right Action Tools — hide when embedded in radar */}
      {!compactChrome && (
      <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center gap-2">
        {/* Route Generator Button */}
        <button
          onClick={() => setIsRoutePanelOpen(!isRoutePanelOpen)}
          className={`px-3 py-2 rounded-xl text-xs font-bold transition shadow-xl flex items-center gap-1.5 backdrop-blur-md border ${
            isRoutePanelOpen
              ? 'bg-[#FF5722] text-white border-[#FF5722] shadow-glow-orange'
              : 'bg-[#0a101c]/90 hover:bg-[#0d1424] text-[#FF5722] border-[#1a2744]'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Optimizador de Ruta</span>
        </button>

        {/* Real-Time Traffic Toggle */}
        <button
          onClick={() => setShowTraffic(!showTraffic)}
          className={`px-3 py-2 rounded-xl text-xs font-bold transition shadow-xl flex items-center gap-1.5 backdrop-blur-md border ${
            showTraffic
              ? 'bg-emerald-500 text-black border-emerald-400'
              : 'bg-[#11141a]/90 hover:bg-[#161920] text-slate-300 border-[#2d3139]'
          }`}
        >
          <Gauge className="w-3.5 h-3.5" />
          <span>{showTraffic ? '🚦 Tráfico On' : '🚦 Tráfico Off'}</span>
        </button>

        {/* Map Design Style Picker */}
        <div className="relative">
          <button
            onClick={() => setIsStylePickerOpen(!isStylePickerOpen)}
            className="bg-[#11141a]/90 hover:bg-[#161920] text-slate-200 border border-[#2d3139] px-3 py-2 rounded-xl text-xs font-semibold shadow-xl transition flex items-center gap-1.5 backdrop-blur-md"
          >
            <Layers className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span>Diseño del Mapa</span>
          </button>

          {/* Style Dropdown */}
          {isStylePickerOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-[#11141a] border border-[#2d3139] rounded-2xl p-2 shadow-2xl z-50 space-y-1 text-xs">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-2 block py-1">
                Estilos Visuales
              </span>
              {(Object.keys(TILE_LAYERS) as MapStyleType[]).map((styleKey) => (
                <button
                  key={styleKey}
                  onClick={() => {
                    setCurrentStyle(styleKey);
                    setIsStylePickerOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium transition flex items-center justify-between ${
                    currentStyle === styleKey
                      ? 'bg-[#f59e0b] text-black font-bold'
                      : 'text-slate-300 hover:bg-[#2d3139]/60'
                  }`}
                >
                  <span>
                    {TILE_LAYERS[styleKey].icon} {TILE_LAYERS[styleKey].name}
                  </span>
                  {currentStyle === styleKey && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Google Key Modal Toggle */}
        <button
          onClick={() => setShowKeyModal(true)}
          className="bg-[#11141a]/90 hover:bg-[#161920] text-slate-300 border border-[#2d3139] p-2 rounded-xl shadow-xl transition backdrop-blur-md"
          title="Configurar Google Maps API Key"
        >
          <Key className="w-4 h-4 text-amber-400" />
        </button>
      </div>
      )}

      {/* Floating Bottom Left Toolbar */}
      {!compactChrome && (
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
        <button
          onClick={handleRecenterVillavicencio}
          className="bg-[#0a101c]/90 hover:bg-[#0d1424] text-slate-200 border border-[#1a2744] hover:border-[#FF5722]/50 px-3 py-2 rounded-xl text-xs font-semibold shadow-xl transition-all flex items-center gap-1.5 backdrop-blur-md"
        >
          <Compass className="w-3.5 h-3.5 text-[#FF5722]" />
          <span>Re-centrar Villavicencio</span>
        </button>

        {/* Active Traffic Warning Chip */}
        {showTraffic && (
          <div className="hidden sm:flex items-center gap-2 bg-[#0a101c]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#1a2744] text-[11px] text-slate-300">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-slate-200">Av. 40: Retención +4.5 min</span>
          </div>
        )}
      </div>
      )}

      {/* Key Zones Bar */}
      {!compactChrome && (
      <div className="absolute bottom-4 right-16 z-10 hidden md:flex items-center gap-1 bg-[#0a101c]/90 backdrop-blur-md px-2 py-1.5 rounded-xl border border-[#1a2744] text-[11px] text-slate-300">
        <span className="text-slate-500 font-semibold px-1">Zonas:</span>
        {VILLAVICENCIO_KEY_POINTS.slice(0, 4).map((pt) => (
          <button
            key={pt.name}
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.flyTo([pt.lat, pt.lng], 16, { duration: 0.8 });
              }
            }}
            className="px-2 py-0.5 rounded hover:bg-[#1a2744] hover:text-[#FF5722] transition"
          >
            {pt.neighborhood}
          </button>
        ))}
      </div>
      )}

      {/* ROUTE GENERATOR & TURN-BY-TURN NAVIGATION DRAWER */}
      {!compactChrome && isRoutePanelOpen && (
        <div className="absolute top-16 right-3 z-20 w-80 sm:w-96 max-h-[85%] bg-[#11141a]/95 backdrop-blur-md border border-[#2d3139] rounded-2xl shadow-2xl p-4 overflow-y-auto space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-[#2d3139] pb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#f59e0b]" />
              <span className="font-extrabold text-white text-sm">Generador de Ruta Óptima</span>
            </div>
            <button
              onClick={() => setIsRoutePanelOpen(false)}
              className="p-1 rounded-lg hover:bg-[#2d3139] text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Order Selection or Manual Point Picker */}
          <div className="space-y-3">
            {orders.length > 0 && (
              <div>
                <label className="block text-slate-400 font-semibold mb-1 text-[11px]">
                  Cargar Ruta desde Envío Asignado:
                </label>
                <select
                  value={selectedOrderForRoute}
                  onChange={(e) => {
                    const orderId = e.target.value;
                    setSelectedOrderForRoute(orderId);
                    const ord = orders.find((o) => o.id === orderId);
                    if (ord && ord.pickupCoords && ord.deliveryCoords) {
                      handleGenerateRoute(
                        ord.pickupCoords.lat,
                        ord.pickupCoords.lng,
                        ord.deliveryCoords.lat,
                        ord.deliveryCoords.lng
                      );
                    }
                  }}
                  className="w-full bg-[#161920] border border-[#2d3139] rounded-xl px-2.5 py-2 text-white font-medium focus:outline-none focus:border-[#f59e0b]"
                >
                  <option value="">-- Seleccionar Envío DMC --</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.trackingCode} - {o.description} (${o.shippingFee.toLocaleString('es-CO')})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom Origin & Destination */}
            <div className="grid grid-cols-1 gap-2 bg-[#161920] p-2.5 rounded-xl border border-[#2d3139]">
              <div>
                <label className="block text-slate-400 text-[10px] font-bold mb-1">
                  🏁 ORIGEN (Punto A):
                </label>
                <select
                  value={originPoint}
                  onChange={(e) => setOriginPoint(e.target.value)}
                  className="w-full bg-[#11141a] border border-[#2d3139] rounded-lg px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-[#f59e0b]"
                >
                  {VILLAVICENCIO_KEY_POINTS.map((pt) => (
                    <option key={pt.name} value={pt.name}>
                      {pt.name} ({pt.neighborhood})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] font-bold mb-1">
                  🎯 DESTINO (Punto B):
                </label>
                <select
                  value={destinationPoint}
                  onChange={(e) => setDestinationPoint(e.target.value)}
                  className="w-full bg-[#11141a] border border-[#2d3139] rounded-lg px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-[#f59e0b]"
                >
                  {VILLAVICENCIO_KEY_POINTS.map((pt) => (
                    <option key={pt.name} value={pt.name}>
                      {pt.name} ({pt.neighborhood})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optimization Strategy */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1 text-[10px]">
                Estrategia de Optimización:
              </label>
              <div className="grid grid-cols-3 gap-1 bg-[#161920] p-1 rounded-xl border border-[#2d3139]">
                <button
                  type="button"
                  onClick={() => setOptimizationStrategy('fastest')}
                  className={`py-1 rounded-lg text-[10px] font-bold transition ${
                    optimizationStrategy === 'fastest'
                      ? 'bg-[#f59e0b] text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🚀 Más Rápida
                </button>

                <button
                  type="button"
                  onClick={() => setOptimizationStrategy('main_avenues')}
                  className={`py-1 rounded-lg text-[10px] font-bold transition ${
                    optimizationStrategy === 'main_avenues'
                      ? 'bg-[#f59e0b] text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🛣️ Avenidas
                </button>

                <button
                  type="button"
                  onClick={() => setOptimizationStrategy('shortest')}
                  className={`py-1 rounded-lg text-[10px] font-bold transition ${
                    optimizationStrategy === 'shortest'
                      ? 'bg-[#f59e0b] text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📏 Más Corta
                </button>
              </div>
            </div>

            {/* Calculate Button */}
            <button
              onClick={() => handleGenerateRoute()}
              disabled={isCalculatingRoute}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold py-2.5 rounded-xl transition shadow-lg flex items-center justify-center gap-1.5"
            >
              <Zap className="w-4 h-4" />
              <span>{isCalculatingRoute ? 'Calculando Trazado...' : 'Calcular y Dibujar Ruta Óptima'}</span>
            </button>
          </div>

          {/* ACTIVE ROUTE SUMMARY & METRICS */}
          {activeRoute && (
            <div className="space-y-3 pt-2 border-t border-[#2d3139]">
              {/* Stat Badges */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#161920] border border-[#2d3139] p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold">Distancia</span>
                  <span className="text-sm font-extrabold text-amber-400 font-mono">
                    {activeRoute.distanceKm} km
                  </span>
                </div>

                <div className="bg-[#161920] border border-[#2d3139] p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold">Tiempo Est.</span>
                  <span className="text-sm font-extrabold text-emerald-400 font-mono">
                    {activeRoute.durationMinutes} min
                  </span>
                </div>

                <div className="bg-[#161920] border border-[#2d3139] p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold">Tráfico</span>
                  <span className="text-sm font-extrabold text-red-400 font-mono">
                    +{activeRoute.trafficDelayMinutes}m
                  </span>
                </div>
              </div>

              {/* Simulation Controller */}
              <div className="flex items-center gap-2 bg-[#161920] p-2 rounded-xl border border-[#2d3139]">
                <button
                  onClick={toggleSimulation}
                  className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                    isSimulating
                      ? 'bg-red-500 text-white'
                      : 'bg-[#f59e0b] hover:bg-amber-400 text-black shadow'
                  }`}
                >
                  {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isSimulating ? 'Pausar Simulación' : '▶️ Simular Recorrido en Vivo'}</span>
                </button>
              </div>

              {/* Turn-by-Turn Navigation Guide */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-300 block uppercase tracking-wider">
                  Guía Paso a Paso ({activeRoute.steps.length} Giros):
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {activeRoute.steps.map((st, i) => (
                    <div
                      key={i}
                      onClick={() => setActiveStepIndex(i)}
                      className={`p-2 rounded-xl border transition cursor-pointer flex items-start gap-2 ${
                        activeStepIndex === i
                          ? 'bg-amber-500/20 border-amber-500/50 text-white'
                          : 'bg-[#161920] border-[#2d3139] text-slate-300 hover:bg-[#2d3139]/50'
                      }`}
                    >
                      <span className="text-sm shrink-0">
                        {st.iconName === 'turn-right' ? '↗️' : st.iconName === 'turn-left' ? '↖️' : '⬆️'}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-[11px] leading-tight">{st.instruction}</p>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Distancia: {st.distanceMeters}m
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GOOGLE MAPS API KEY & MAP ID CONFIG MODAL */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-[#0d121d]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative space-y-5 text-[#f1f5f9]">
            <button
              onClick={() => setShowKeyModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-[#0f172a] hover:bg-[#334155] text-slate-300 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-[#334155] pb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#0052FF]/20 border border-[#0052FF]/40 text-[#0052FF] flex items-center justify-center text-xl shadow-inner">
                <Key className="w-6 h-6 text-[#0052FF]" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Google Maps Studio & Platform</h3>
                <p className="text-xs text-[#FF5722] font-bold">"DomiClick: Excelencia a un click de ti."</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* Linked Map ID Box */}
              <div className="bg-[#0f172a] border-2 border-[#0052FF] p-4 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#0052FF]">
                    Map ID Vinculado (Google Cloud Studio)
                  </span>
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                    VINCULADO
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[#1E293B] px-3 py-2 rounded-xl border border-[#334155]">
                  <code className="text-sm font-mono font-black text-amber-300">
                    {DOMICLICK_GOOGLE_MAP_ID}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(DOMICLICK_GOOGLE_MAP_ID)}
                    className="text-[10px] bg-[#0052FF] hover:bg-blue-600 text-white px-2.5 py-1 rounded-lg font-bold transition"
                  >
                    Copiar Map ID
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Proyecto: <span className="font-mono text-slate-200">gen-lang-client-0954482957</span>
                </p>
              </div>

              <p className="text-slate-300 leading-relaxed">
                El mapa vectorial interactivo de DomiClick utiliza el Map ID <code className="text-[#FF5722] font-mono">{DOMICLICK_GOOGLE_MAP_ID}</code> de Google Maps Studio con capas de tráfico y telemetría de motorizados en Villavicencio.
              </p>

              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 bg-[#0f172a] p-3.5 rounded-2xl border border-[#334155]">
                <li>Copia <code>.env.example</code> a <code>.env.local</code></li>
                <li>Agrega <code>VITE_GOOGLE_MAPS_PLATFORM_KEY</code> con tu clave de Google Maps Platform</li>
                <li>Reinicia <code>npm run dev</code> o pega la clave abajo</li>
              </ol>

              <div className="pt-1">
                <label className="block text-slate-300 font-bold mb-1">O prueba ingresar tu clave de API:</label>
                <input
                  type="text"
                  value={googleKeyInput}
                  onChange={(e) => setGoogleKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-[#0052FF]"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (googleKeyInput.trim()) {
                  localStorage.setItem('domiclick_gmaps_key', googleKeyInput.trim());
                }
                setShowKeyModal(false);
              }}
              className="w-full bg-[#FF5722] hover:bg-[#e04818] text-white font-black py-3 rounded-2xl text-xs transition shadow-lg shadow-[#FF5722]/30"
            >
              Guardar y Continuar
            </button>
          </div>
        </div>
      )}

      {/* Logo badge — replaces DomiClick Night Ops text attribution */}
      <a
        href="/"
        className="absolute bottom-2 right-14 z-20 map-brand-badge flex items-center gap-2 bg-[#0a101c]/92 border border-[#FF5722]/40 rounded-xl px-2.5 py-1.5 shadow-[0_0_16px_rgba(255,87,34,0.25)] pointer-events-auto"
        title="DomiClick"
      >
        <img src={BRAND.logoMark} alt="DomiClick" className="brand-neon w-7 h-7 object-contain" />
        <div className="leading-tight hidden sm:block">
          <div className="text-[10px] font-black text-white font-display italic">
            Domi<span className="text-[#FF5722]">Click</span>
          </div>
          <div className="text-[8px] text-slate-400 font-tech">Night Ops</div>
        </div>
      </a>

    </div>
  );
};

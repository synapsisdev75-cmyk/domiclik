import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OpsIncident } from '../../types';
import { VILLAVICENCIO_CENTER } from '../../data/villavicencio';
import {
  VILLAVICENCIO_RISK_ZONES,
  countIncidentsInZone,
  riskLevelColor,
  riskLevelLabel,
  type RiskZone,
} from '../../lib/riskZones';
import { createLeafletBasemapLayer } from '../../lib/cartoBasemaps';
import { ShieldAlert, MapPin } from 'lucide-react';

type RiskSectorMapPanelProps = {
  incidents: OpsIncident[];
};

export function RiskSectorMapPanel({ incidents }: RiskSectorMapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    const map = L.map(mapRef.current, {
      center: [VILLAVICENCIO_CENTER.lat, VILLAVICENCIO_CENTER.lng],
      zoom: 12,
      zoomControl: true,
    });

    createLeafletBasemapLayer('dark_all').addTo(map);

    for (const zone of VILLAVICENCIO_RISK_ZONES) {
      const color = riskLevelColor(zone.level);
      const latlngs = zone.polygon.map((p) => [p.lat, p.lng] as [number, number]);
      L.polygon(latlngs, {
        color,
        fillColor: color,
        fillOpacity: 0.22,
        weight: 2,
        dashArray: zone.level === 'moderado' ? '6 4' : undefined,
      })
        .bindPopup(
          `<strong>${zone.name}</strong><br/>${zone.comuna}<br/>Nivel: ${riskLevelLabel(zone.level)}<br/><span style="opacity:0.85;font-size:11px">${zone.reason}</span>`,
        )
        .addTo(map);
    }

    leafletRef.current = map;
    return () => {
      map.remove();
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = leafletRef.current;
    if (!map) return;

    const layerGroup = L.layerGroup().addTo(map);
    const withGps = incidents.filter((i) => i.lat != null && i.lng != null);
    for (const inc of withGps) {
      const isOpen = inc.status === 'open';
      const isPanic = inc.isPanic;
      const color = isPanic ? '#dc2626' : isOpen ? '#f59e0b' : '#64748b';
      L.circleMarker([inc.lat!, inc.lng!], {
        radius: isPanic ? 9 : 7,
        color: '#fff',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.95,
      })
        .bindPopup(
          `<strong>${inc.title}</strong>${inc.isPanic ? ' · PÁNICO' : ''}<br/>${inc.status === 'open' ? 'Abierto' : 'Resuelto'}<br/><span style="font-size:11px">${new Date(inc.createdAt).toLocaleString('es-CO')}</span>`,
        )
        .addTo(layerGroup);
    }

    return () => {
      layerGroup.clearLayers();
      map.removeLayer(layerGroup);
    };
  }, [incidents]);

  const openIncidents = incidents.filter((i) => i.status === 'open');
  const panicCount = openIncidents.filter((i) => i.isPanic).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip label="Sectores" value={String(VILLAVICENCIO_RISK_ZONES.length)} />
        <StatChip label="Incidentes abiertos" value={String(openIncidents.length)} accent="#f59e0b" />
        <StatChip label="Pánico activo" value={String(panicCount)} accent="#ef4444" />
        <StatChip
          label="Con GPS"
          value={String(incidents.filter((i) => i.lat != null).length)}
          accent="#00E5FF"
        />
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-[#182A4D] h-[520px] bg-[#070B16]">
        <div ref={mapRef} className="absolute inset-0 z-0" />
        <div className="absolute top-3 left-3 z-[500] rounded-xl border border-[#1a2744] bg-[#0A1020]/92 backdrop-blur px-3 py-2 text-[10px] text-slate-300 space-y-1">
          <div className="font-black text-white text-xs flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            Leyenda sectores 2026
          </div>
          <LegendRow color="#ef4444" label="Crítico — sin servicio cliente" />
          <LegendRow color="#f97316" label="Alto — sin servicio cliente" />
          <LegendRow color="#eab308" label="Moderado — sin servicio cliente" />
          <LegendRow color="#f59e0b" label="Incidente abierto" dot />
          <LegendRow color="#dc2626" label="Pánico" dot />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {VILLAVICENCIO_RISK_ZONES.map((zone) => (
          <ZoneCard key={zone.id} zone={zone} incidents={incidents} />
        ))}
      </div>

      <p className="text-[10px] text-slate-500 font-tech leading-relaxed">
        Mapa exclusivo de torre de control. El cliente no ve estos sectores — solo recibe aviso sutil si
        su dirección cae en zona sin cobertura. Datos basados en Observatorio de Seguridad Villavicencio,
        Secretaría de Gobierno Meta y programa Seguridad al Barrio (2026). Revisar trimestralmente.
      </p>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent = '#94a3b8',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-[#162748] bg-[#0A1020] px-3 py-2">
      <div className="text-[9px] uppercase tracking-wide text-slate-500 font-tech">{label}</div>
      <div className="text-lg font-black font-display" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  dot,
}: {
  color: string;
  label: string;
  dot?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="shrink-0"
        style={{
          width: dot ? 10 : 14,
          height: dot ? 10 : 8,
          borderRadius: dot ? '50%' : 2,
          background: color,
          opacity: dot ? 1 : 0.7,
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function ZoneCard({ zone, incidents }: { zone: RiskZone; incidents: OpsIncident[] }) {
  const count = countIncidentsInZone(zone, incidents);
  const openInZone = countIncidentsInZone(
    zone,
    incidents.filter((i) => i.status === 'open'),
  );
  return (
    <div className="rounded-xl border border-[#162748] bg-[#0A1020] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-white">{zone.name}</div>
          <div className="text-[10px] text-slate-500">{zone.comuna}</div>
        </div>
        <span
          className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0"
          style={{
            color: riskLevelColor(zone.level),
            borderColor: `${riskLevelColor(zone.level)}66`,
            background: `${riskLevelColor(zone.level)}18`,
          }}
        >
          {riskLevelLabel(zone.level)}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 mt-2 leading-snug">{zone.reason}</p>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500 font-tech">
        <span className="inline-flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {openInZone} abiertos / {count} total
        </span>
        {zone.serviceBlocked && (
          <span className="text-amber-400/90">Sin servicio cliente</span>
        )}
      </div>
    </div>
  );
}

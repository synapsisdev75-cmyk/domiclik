/** DomiClick brand assets — cropped + transparent PNGs */
export const BRAND = {
  logoMark: '/brand/logo-mark.png',
  logoWordmark: '/brand/logo-wordmark.png',
  logoNeon: '/brand/logo-neon.png',
  logo192: '/brand/logo-192.png',
  favicon: '/brand/favicon.png',
  iconSheet: '/brand/icon-sheet.png',
  brandSheet: '/brand/brand-sheet.png',
} as const;

export const BRAND_ICONS = {
  dashboard: '/brand/icons/dashboard.png',
  solicitudes: '/brand/icons/solicitudes.png',
  flota: '/brand/icons/flota.png',
  envios: '/brand/icons/envios.png',
  incidentes: '/brand/icons/incidentes.png',
  rutas: '/brand/icons/rutas.png',
  historial: '/brand/icons/historial-menu.png',
  control: '/brand/icons/control.png',
  nomina: '/brand/icons/nomina.png',
  usuarios: '/brand/icons/usuarios.png',
  ajuste: '/brand/icons/ajuste.png',
  kpiMotorizados: '/brand/icons/kpi-motorizados.png',
  kpiSolicitudes: '/brand/icons/kpi-solicitudes.png',
  kpiTransito: '/brand/icons/kpi-transito.png',
  kpiEntregas: '/brand/icons/kpi-entregas.png',
  operadores: '/brand/icons/operadores.png',
  misiones: '/brand/icons/misiones.png',
  operaciones: '/brand/icons/operaciones.png',
  eventos: '/brand/icons/eventos.png',
  rastreo: '/brand/icons/rastreo.png',
  cobertura: '/brand/icons/cobertura.png',
  gps: '/brand/icons/gps.png',
  servidor: '/brand/icons/servidor.png',
  estadisticas: '/brand/icons/estadisticas.png',
  alertas: '/brand/icons/alertas.png',
  metricas: '/brand/icons/metricas.png',
  enCurso: '/brand/icons/en-curso.png',
  nuevaMision: '/brand/icons/nueva-mision.png',
  configuracion: '/brand/icons/configuracion.png',
} as const;

/** Cache bust para íconos PNG recién subidos */
export const BRAND_ICON_VERSION = 'kpi4';

export type BrandIconKey = keyof typeof BRAND_ICONS;

interface BrandIconProps {
  name: BrandIconKey;
  className?: string;
  alt?: string;
  active?: boolean;
}

/** Transparent brand icon with neon hover glow */
export function BrandIcon({ name, className = 'w-6 h-6', alt, active }: BrandIconProps) {
  return (
    <span className="brand-icon-slot inline-flex">
      <img
        src={`${BRAND_ICONS[name]}?v=${BRAND_ICON_VERSION}`}
        alt={alt || name}
        className={`brand-neon object-contain select-none ${active ? 'brand-neon-active' : ''} ${className}`}
        draggable={false}
      />
    </span>
  );
}

interface BrandLogoProps {
  variant?: 'mark' | 'wordmark' | 'neon';
  className?: string;
  height?: number;
  neon?: boolean;
}

/** Transparent logo with optional neon hover */
export function BrandLogo({
  variant = 'mark',
  className = '',
  height,
  neon = true,
}: BrandLogoProps) {
  const src =
    variant === 'wordmark'
      ? BRAND.logoWordmark
      : variant === 'neon'
        ? BRAND.logoNeon
        : BRAND.logoMark;

  return (
    <img
      src={src}
      alt="DomiClick"
      className={`object-contain select-none ${neon ? 'brand-neon' : ''} ${className}`}
      style={height ? { height, width: 'auto' } : undefined}
      draggable={false}
    />
  );
}

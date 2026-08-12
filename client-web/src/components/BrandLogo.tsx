export const BRAND = {
  logoMark: '/brand/logo-mark.png',
  logoWordmark: '/brand/logo-wordmark.png',
  logoNeon: '/brand/logo-neon.png',
  logoOptimized: '/brand/logo-optimized-transparent.png',
  logo192: '/brand/logo-192.png',
  logoHeader: '/brand/logo-header.png',
  favicon: '/brand/favicon.png',
  heroVideo: '/brand/banner-hero.mp4',
} as const;

interface BrandLogoProps {
  variant?: 'mark' | 'wordmark' | 'neon' | 'header' | 'optimized';
  className?: string;
  height?: number;
}

export function BrandLogo({ variant = 'optimized', className = '', height }: BrandLogoProps) {
  const src =
    variant === 'mark'
      ? BRAND.logoMark
      : variant === 'neon'
        ? BRAND.logoNeon
        : variant === 'header'
          ? BRAND.logoHeader
          : variant === 'wordmark'
            ? BRAND.logoWordmark
            : BRAND.logoOptimized;

  return (
    <img
      src={src}
      alt="DomiClick"
      className={`brand-logo object-contain select-none ${className}`}
      style={height ? { height, width: 'auto' } : undefined}
      draggable={false}
    />
  );
}

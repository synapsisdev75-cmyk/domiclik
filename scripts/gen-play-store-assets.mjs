/**
 * Genera assets para Google Play Store:
 * - icon-512.png  (512×512 ícono de la app)
 * - feature-graphic.png (1024×500 banner)
 * - Íconos Android mipmap (mdpi → xxxhdpi)
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, '..', 'client-web', 'play-store-assets');
mkdirSync(OUT, { recursive: true });

// ── Colores DomiClick ────────────────────────────────
const BG = '#05080f';
const ORANGE = '#FF5722';
const BLUE = '#2B6CFF';

// ── 1. Ícono 512×512 ────────────────────────────────
async function generateIcon() {
  const size = 512;
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0a101c"/>
        <stop offset="100%" stop-color="${BG}"/>
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${size}" height="${size}" rx="108" fill="url(#bg)"/>
    <!-- Pin icon -->
    <g transform="translate(${size/2}, ${size/2 - 20})" filter="url(#glow)">
      <path d="M0,-120 C66,-120 120,-66 120,0 C120,66 0,160 0,160 C0,160 -120,66 -120,0 C-120,-66 -66,-120 0,-120Z"
            fill="${ORANGE}" opacity="0.95"/>
      <circle cx="0" cy="-10" r="42" fill="${BG}" opacity="0.85"/>
      <circle cx="0" cy="-10" r="22" fill="${ORANGE}"/>
    </g>
    <!-- Text -->
    <text x="${size/2}" y="${size - 60}" text-anchor="middle"
          font-family="system-ui, sans-serif" font-size="72" font-weight="900" fill="white">
      Domi<tspan fill="${ORANGE}">Click</tspan>
    </text>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(join(OUT, 'icon-512.png'));
  console.log('✓ icon-512.png');

  // Generar tamaños mipmap para Android
  const mipmapSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const androidRes = join(import.meta.dirname, '..', 'client-web', 'android', 'app', 'src', 'main', 'res');

  for (const [density, px] of Object.entries(mipmapSizes)) {
    const dir = join(androidRes, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    await sharp(Buffer.from(svg)).resize(px, px).png().toFile(join(dir, 'ic_launcher.png'));
    // Round icon (same for now)
    await sharp(Buffer.from(svg)).resize(px, px).png().toFile(join(dir, 'ic_launcher_round.png'));
    // Foreground for adaptive icon
    await sharp(Buffer.from(svg)).resize(px, px).png().toFile(join(dir, 'ic_launcher_foreground.png'));
  }
  console.log('✓ Android mipmap icons (mdpi → xxxhdpi)');
}

// ── 2. Feature Graphic 1024×500 ─────────────────────
async function generateFeatureGraphic() {
  const w = 1024, h = 500;
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0d1424"/>
        <stop offset="50%" stop-color="${BG}"/>
        <stop offset="100%" stop-color="#0a101c"/>
      </linearGradient>
      <filter id="glow2">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#fbg)"/>
    <!-- Decorative circles -->
    <circle cx="180" cy="250" r="300" fill="${BLUE}" opacity="0.06"/>
    <circle cx="850" cy="200" r="250" fill="${ORANGE}" opacity="0.08"/>
    <!-- Pin -->
    <g transform="translate(180, 220)" filter="url(#glow2)">
      <path d="M0,-80 C44,-80 80,-44 80,0 C80,44 0,108 0,108 C0,108 -80,44 -80,0 C-80,-44 -44,-80 0,-80Z"
            fill="${ORANGE}" opacity="0.9"/>
      <circle cx="0" cy="-6" r="28" fill="${BG}" opacity="0.8"/>
      <circle cx="0" cy="-6" r="14" fill="${ORANGE}"/>
    </g>
    <!-- Brand text -->
    <text x="520" y="210" text-anchor="middle"
          font-family="system-ui, sans-serif" font-size="88" font-weight="900" fill="white" letter-spacing="-2">
      Domi<tspan fill="${ORANGE}">Click</tspan>
    </text>
    <text x="520" y="270" text-anchor="middle"
          font-family="system-ui, sans-serif" font-size="28" font-weight="600" fill="#8b9bb8">
      Domicilios en Villavicencio · GPS en vivo
    </text>
    <!-- Tagline -->
    <text x="520" y="420" text-anchor="middle"
          font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="${ORANGE}" opacity="0.9">
      Excelencia a un click de ti
    </text>
    <!-- Bottom line accent -->
    <rect x="362" y="450" width="300" height="3" rx="2" fill="${ORANGE}" opacity="0.5"/>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(join(OUT, 'feature-graphic.png'));
  console.log('✓ feature-graphic.png (1024×500)');
}

// ── 3. Splash screen drawable ────────────────────────
async function generateSplash() {
  const size = 480;
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${BG}"/>
    <g transform="translate(${size/2}, ${size/2 - 30})">
      <path d="M0,-70 C38,-70 70,-38 70,0 C70,38 0,95 0,95 C0,95 -70,38 -70,0 C-70,-38 -38,-70 0,-70Z"
            fill="${ORANGE}" opacity="0.95"/>
      <circle cx="0" cy="-5" r="24" fill="${BG}" opacity="0.85"/>
      <circle cx="0" cy="-5" r="12" fill="${ORANGE}"/>
    </g>
    <text x="${size/2}" y="${size - 80}" text-anchor="middle"
          font-family="system-ui, sans-serif" font-size="52" font-weight="900" fill="white">
      Domi<tspan fill="${ORANGE}">Click</tspan>
    </text>
  </svg>`;

  const androidRes = join(import.meta.dirname, '..', 'client-web', 'android', 'app', 'src', 'main', 'res');
  const drawableDir = join(androidRes, 'drawable');
  mkdirSync(drawableDir, { recursive: true });
  await sharp(Buffer.from(svg)).resize(480, 480).png().toFile(join(drawableDir, 'splash.png'));
  console.log('✓ splash.png (Android drawable)');
}

await generateIcon();
await generateFeatureGraphic();
await generateSplash();
console.log(`\n✅ Assets generados en: ${OUT}`);

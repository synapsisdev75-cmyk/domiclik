/**
 * Regenera assets Play Store con espaciado limpio (sin textos montados).
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, '..', 'client-web', 'play-store-assets');
const DESKTOP = join(import.meta.dirname, '..', '..', 'domiclik-release');
mkdirSync(OUT, { recursive: true });
mkdirSync(DESKTOP, { recursive: true });

const BG = '#05080f';
const ORANGE = '#FF5722';
const BLUE = '#2B6CFF';

async function generateIcon() {
  const size = 512;
  // Pin más arriba + texto más abajo = sin solape
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0a101c"/>
        <stop offset="100%" stop-color="${BG}"/>
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="10" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${size}" height="${size}" rx="108" fill="url(#bg)"/>
    <g transform="translate(256, 200)" filter="url(#glow)">
      <path d="M0,-100 C55,-100 100,-55 100,0 C100,55 0,135 0,135 C0,135 -100,55 -100,0 C-100,-55 -55,-100 0,-100Z"
            fill="${ORANGE}"/>
      <circle cx="0" cy="-8" r="36" fill="${BG}"/>
      <circle cx="0" cy="-8" r="18" fill="${ORANGE}"/>
    </g>
    <text x="256" y="430" text-anchor="middle"
          font-family="Arial Black, Arial, sans-serif" font-size="64" font-weight="900" fill="white">
      Domi<tspan fill="${ORANGE}">Click</tspan>
    </text>
  </svg>`;

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(buf).toFile(join(OUT, 'icon-512.png'));
  await sharp(buf).toFile(join(DESKTOP, 'icon-512.png'));
  console.log('✓ icon-512.png');
}

async function generateFeatureGraphic() {
  const w = 1024;
  const h = 500;
  // Layout limpio: pin izquierda, textos a la derecha con buena separación vertical
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0d1424"/>
        <stop offset="55%" stop-color="${BG}"/>
        <stop offset="100%" stop-color="#0a101c"/>
      </linearGradient>
      <filter id="glow2">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#fbg)"/>
    <circle cx="160" cy="250" r="280" fill="${BLUE}" opacity="0.07"/>
    <circle cx="900" cy="120" r="220" fill="${ORANGE}" opacity="0.08"/>

    <!-- Pin (izquierda, centrado vertical) -->
    <g transform="translate(180, 250)" filter="url(#glow2)">
      <path d="M0,-90 C50,-90 90,-50 90,0 C90,50 0,120 0,120 C0,120 -90,50 -90,0 C-90,-50 -50,-90 0,-90Z"
            fill="${ORANGE}"/>
      <circle cx="0" cy="-8" r="32" fill="${BG}"/>
      <circle cx="0" cy="-8" r="16" fill="${ORANGE}"/>
    </g>

    <!-- Textos a la derecha, bien separados -->
    <text x="360" y="200" font-family="Arial Black, Arial, sans-serif"
          font-size="78" font-weight="900" fill="white" letter-spacing="-1">
      Domi<tspan fill="${ORANGE}">Click</tspan>
    </text>
    <text x="360" y="255" font-family="Arial, sans-serif"
          font-size="26" font-weight="600" fill="#94a3b8">
      Domicilios en Villavicencio · GPS en vivo
    </text>
    <text x="360" y="340" font-family="Arial, sans-serif"
          font-size="24" font-weight="700" fill="${ORANGE}">
      Excelencia a un click de ti
    </text>
    <rect x="360" y="360" width="220" height="3" rx="2" fill="${ORANGE}" opacity="0.55"/>
  </svg>`;

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(buf).toFile(join(OUT, 'feature-graphic.png'));
  await sharp(buf).toFile(join(DESKTOP, 'feature-graphic.png'));
  console.log('✓ feature-graphic.png (1024×500)');
}

await generateIcon();
await generateFeatureGraphic();
console.log(`\n✅ Listos en:\n  ${OUT}\n  ${DESKTOP}`);

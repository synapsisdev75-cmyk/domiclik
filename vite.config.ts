import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { googleOAuthTokenPlugin } from './vite-plugin-google-oauth';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mapsKey =
    env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    env.GOOGLE_MAPS_PLATFORM_KEY ||
    '';
  const mapsMapId =
    env.VITE_GOOGLE_MAPS_MAP_ID || '7959bb6afa37dd5e9db669a8';

  return {
    build: {
      target: 'es2020',
      modulePreload: { polyfill: true },
    },
    plugins: [react(), tailwindcss(), googleOAuthTokenPlugin(env.GOOGLE_OAUTH_CLIENT_SECRET || '')],
    define: {
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(mapsKey),
      'process.env.VITE_GOOGLE_MAPS_MAP_ID': JSON.stringify(mapsMapId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

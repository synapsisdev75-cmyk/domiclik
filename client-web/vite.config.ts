import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const parentEnv = loadEnv(mode, '..', '');

  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(
        env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
          parentEnv.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
          env.VITE_GOOGLE_MAPS_API_KEY ||
          parentEnv.VITE_GOOGLE_MAPS_API_KEY ||
          '',
      ),
    },
    server: {
      port: 5174,
      host: true,
    },
  };
});

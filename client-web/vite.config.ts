import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const parentEnv = loadEnv(mode, '..', '');

  return {
    // HTTPS local: el celular (IP LAN) puede pedir GPS preciso; en http://192.168.x.x el browser lo bloquea.
    plugins: [react(), tailwindcss(), basicSsl()],
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
      https: {},
    },
  };
});

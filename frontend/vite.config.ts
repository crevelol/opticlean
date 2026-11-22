import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://localhost:3001',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Librerías estables en chunks propios: cambian poco, así el
        // navegador las mantiene en caché entre despliegues.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
            return 'vendor-react';
          if (/[\\/]node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/.test(id))
            return 'vendor-motion';
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'vendor-icons';
          return undefined; // el resto (p. ej. leaflet) va con la pantalla que lo usa
        },
      },
    },
  },
});

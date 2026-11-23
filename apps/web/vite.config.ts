import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, las llamadas a /api se envían al backend local (en Docker lo hace nginx).
export default defineConfig({
  plugins: [react()],
  // 008: enlace a /api/docs en el pie; VITE_DOCS_API=false al compilar el portal de producción.
  define: {
    __DOCS_API__: JSON.stringify(process.env.VITE_DOCS_API !== 'false'),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});

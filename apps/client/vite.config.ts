import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  // @game/shared is a linked CommonJS workspace package, so Vite must pre-bundle it.
  optimizeDeps: {
    include: ['@game/shared'],
  },
  build: {
    commonjsOptions: {
      include: [/packages[\\/]shared/, /node_modules/],
    },
  },
});

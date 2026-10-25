import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const shared = (file: string) => fileURLToPath(new URL(`../../packages/shared/src/${file}`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  // Use @game/shared's TypeScript source directly (the server uses its CommonJS build). Edits to
  // shared code then hot-reload instead of needing a rebuild and a Vite cache flush.
  resolve: {
    alias: [
      { find: /^@game\/shared\/physics$/, replacement: shared('physics.ts') },
      { find: /^@game\/shared$/, replacement: shared('index.ts') },
    ],
  },
});

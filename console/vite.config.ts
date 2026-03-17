import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/mockcloud-api': 'http://localhost:4444',
    },
  },
  build: {
    outDir: 'dist',
  },
});

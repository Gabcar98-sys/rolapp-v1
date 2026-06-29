import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev (Node local), proxya API y socket al backend en :3001.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
});

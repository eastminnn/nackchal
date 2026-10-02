import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const { BACKEND_URL: backendUrl } = loadEnv(mode, process.cwd(), 'BACKEND_');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: backendUrl ?? 'http://127.0.0.1:18080' },
      },
    },
    preview: {
      proxy: {
        '/api': { target: backendUrl ?? 'http://127.0.0.1:18080' },
      },
    },
  };
});

import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 3000,
    open: '/index-web.html'
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index-web.html'
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});

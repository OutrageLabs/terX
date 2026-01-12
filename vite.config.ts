import { defineConfig } from 'vite';
import { resolve } from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    wasm(),
    topLevelAwait(),
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: false,
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress fs/promises externalization warning - expected for browser build
        if (warning.message?.includes('fs/promises') && warning.message?.includes('externalized')) {
          return;
        }
        warn(warning);
      },
    },
  },
  resolve: {
    alias: {
      'ghostty-web': resolve(__dirname, 'ghostty-web/lib'),
    },
  },
  optimizeDeps: {
    // Helps Vite handle the WASM module correctly
  },
  publicDir: 'public',
});

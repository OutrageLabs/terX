import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  server: {
    port: 8000,
    allowedHosts: ['.coder'],
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    dts({
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts'],
      rollupTypes: true, // Bundle all .d.ts into single file
      copyDtsFiles: false, // Don't copy individual .d.ts files
    }),
  ],
  build: {
    target: 'esnext',
    lib: {
      entry: 'lib/index.ts',
      name: 'GhosttyWeb',
      fileName: 'ghostty-web',
      formats: ['es'], // UMD nie wspiera top-level await (potrzebne dla WASM)
    },
    rollupOptions: {
      external: [], // No external dependencies
      output: {
        assetFileNames: 'assets/[name][extname]',
        globals: {},
      },
    },
  },
});

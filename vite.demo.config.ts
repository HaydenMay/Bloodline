import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'demo',
  base: './',
  publicDir: '../public',
  build: { target: 'es2022', outDir: '../dist-demo', emptyOutDir: true, sourcemap: false, rollupOptions: { input: resolve('demo/index.html') } },
});

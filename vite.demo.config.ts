import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [{
    name: 'demo-relative-stable-background',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/style.css')) {
        return code.replace('/src/assets/backgrounds/stable-yard.png', './assets/backgrounds/stable-yard.png');
      }
    },
  }],
  root: 'demo',
  base: './',
  publicDir: '../public',
  build: { target: 'es2022', outDir: '../dist-demo', emptyOutDir: true, sourcemap: false, rollupOptions: { input: resolve('demo/index.html') } },
});

import { defineConfig } from 'vite';

// GitHub Pages serves from a subpath: yourname.github.io/Bloodline/
//
// This MUST stay in sync with the repository name. If it drifts, the app works
// perfectly on localhost and silently 404s every asset in production — the
// classic Pages failure. See ROADMAP.md Phase 0.
const REPO_NAME = 'Bloodline';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    // `npm run dev:host` exposes this on the local network for phone testing.
    port: 5173,
  },
}));

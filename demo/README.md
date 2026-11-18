# Bloodline browser demo

A separate browser entry point reusing the production starter carousel, 2D race view, simulation, results screen and training rules. Its state is held in memory and is discarded on refresh or replay; it does not call the career save code.

- `npm run dev:demo` starts the demo locally.
- `npm run build:demo` creates `dist-demo/` with relative asset paths. Zip the **contents** of that folder, with `index.html` at the ZIP root, for an itch HTML5 upload.
- Purchase link points to the existing Bloodline itch page, configured in `src/demo/main.ts`.
- Do not upload or change the live listing until the demo has been played through in a browser and the existing page's HTML embed, paid download and existing buyer access have been verified privately.
- Run `npm run check` for the full-game lint, build and unit suite.

The scenario seeds, training choices and race distances are in `src/demo/scenario.ts`. Race duration varies with each horse's preferred distance. Browser presentation, iframe sizing, purchase navigation, end-to-end replay, load performance and actual play time still require hands-on verification.

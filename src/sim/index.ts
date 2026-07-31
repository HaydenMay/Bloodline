/**
 * sim/ — pure simulation logic. Zero DOM, zero rendering, zero persistence.
 *
 * This layer is deliberately isolated (enforced by eslint.config.js) so that:
 *   1. the headless balance harness in tools/ can run it thousands of times
 *   2. tuning the simulation can never break the visuals
 *
 * Never import from render/, ui/ or save/. Never touch window, document or
 * localStorage. Never call Math.random() — use createRng.
 *
 * See DESIGN.md §14.
 */

export { createRng, hashSeed } from './rng.js';
export type { Rng } from './rng.js';

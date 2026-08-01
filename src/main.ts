import './style.css';
import { createRng } from './sim/index.js';
import { createStable, exportToString, importFromString, CURRENT_VERSION } from './save/index.js';
import { WORLD_POPULATION, FIELD_SIZE } from './data/index.js';

/**
 * Build status screen.
 *
 * Stands in until Phase 2 replaces it with the real game. Two jobs:
 *
 *  1. Show which build phases are done, so the deployed site reflects the
 *     actual state of the project rather than going stale.
 *  2. Run live system checks on load, so opening it on a phone proves the
 *     pipeline works ON THAT DEVICE — not just that a page rendered.
 *
 * To update: flip `done` on a phase below. That's it.
 */

interface Phase {
  n: number;
  name: string;
  summary: string;
  done: boolean;
}

const PHASES: Phase[] = [
  { n: 0, name: 'Foundation', summary: 'Tooling & deploy', done: true },
  { n: 1, name: 'Race simulation', summary: 'Engine & balance', done: true },
  { n: 2, name: 'Playable race', summary: 'Renderer & controls', done: false },
  { n: 3, name: 'Full career', summary: 'Training & divisions', done: false },
  { n: 4, name: 'The stable', summary: 'Money & facilities', done: false },
  { n: 5, name: 'Breeding', summary: 'Genetics & pedigree', done: false },
  { n: 6, name: 'Polish', summary: 'Audio & mobile', done: false },
];

interface Check {
  name: string;
  detail: string;
  ok: boolean;
}

function runChecks(): Check[] {
  const checks: Check[] = [];

  // Determinism — the property the whole balance harness depends on.
  const a = createRng('bloodline');
  const b = createRng('bloodline');
  const seqA = Array.from({ length: 8 }, () => a.next());
  const seqB = Array.from({ length: 8 }, () => b.next());
  checks.push({
    name: 'Seeded RNG is deterministic',
    detail: seqA[0]!.toFixed(6),
    ok: seqA.every((v, i) => v === seqB[i]),
  });

  // Save round-trip through the versioned envelope.
  let saveOk: boolean;
  try {
    const stable = createStable('Test Stable', 'seed-0001');
    stable.cash = 1234;
    const restored = importFromString(exportToString(stable));
    saveOk = restored.stableName === 'Test Stable' && restored.cash === 1234;
  } catch {
    saveOk = false;
  }
  checks.push({ name: 'Save round-trip', detail: `schema v${CURRENT_VERSION}`, ok: saveOk });

  // localStorage availability (private browsing can disable it).
  let storageOk: boolean;
  try {
    localStorage.setItem('bloodline.probe', '1');
    localStorage.removeItem('bloodline.probe');
    storageOk = true;
  } catch {
    storageOk = false;
  }
  checks.push({ name: 'Local storage available', detail: storageOk ? 'yes' : 'blocked', ok: storageOk });

  // Canvas 2D — the entire renderer depends on it.
  const ctx = document.createElement('canvas').getContext('2d');
  checks.push({ name: 'Canvas 2D context', detail: ctx ? 'ready' : 'missing', ok: !!ctx });

  // Asset base path resolved correctly (the GitHub Pages subpath trap).
  checks.push({
    name: 'Asset base path',
    detail: import.meta.env.BASE_URL,
    ok: typeof import.meta.env.BASE_URL === 'string',
  });

  const worldTotal = Object.values(WORLD_POPULATION).reduce((s, n) => s + n, 0);
  checks.push({
    name: 'Game data loaded',
    detail: `${worldTotal} rivals · fields of ${FIELD_SIZE}`,
    ok: worldTotal > 0,
  });

  return checks;
}

function render(): void {
  const checks = runChecks();
  const allOk = checks.every((c) => c.ok);
  const doneCount = PHASES.filter((p) => p.done).length;

  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app not found');

  app.innerHTML = `
    <div class="boot">
      <h1 class="wordmark">Blood<span>line</span></h1>
      <p class="tagline">Horse racing, training &amp; breeding</p>

      <div class="card">
        <h2>Build progress <span class="count">${doneCount} of ${PHASES.length}</span></h2>
        ${PHASES.map(
          (p) => `
          <div class="phase ${p.done ? 'done' : ''}">
            <span class="box">${p.done ? '✓' : ''}</span>
            <span class="num">${p.n}</span>
            <span class="name">${p.name}</span>
            <span class="summary">${p.summary}</span>
          </div>`,
        ).join('')}
      </div>

      <div class="card">
        <h2>System checks</h2>
        ${checks
          .map(
            (c) => `
          <div class="check">
            <span class="mark">${c.ok ? '✓' : '✕'}</span>
            <span class="name">${c.name}</span>
            <span class="detail">${c.detail}</span>
          </div>`,
          )
          .join('')}
      </div>

      <div class="foot">
        <span>${allOk ? 'pipeline ok' : 'checks failed'}</span>
        <span>${window.innerWidth}×${window.innerHeight}</span>
      </div>
    </div>
  `;
}

render();
window.addEventListener('resize', render);

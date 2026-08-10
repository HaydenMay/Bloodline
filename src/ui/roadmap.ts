/**
 * Build-progress panel.
 *
 * Persistent chrome, deliberately out of the way: a small pill in the corner
 * that expands into the phase list. Lives here rather than in main.ts so it
 * survives Phase 2 replacing the whole screen with the actual game.
 *
 * To update: flip `done` on a phase below. That is the only edit needed.
 */

interface Phase {
  n: number;
  name: string;
  summary: string;
  done: boolean;
  inProgress?: boolean;
}

const PHASES: Phase[] = [
  { n: 0, name: 'Foundation', summary: 'Tooling & deploy', done: true },
  { n: 1, name: 'Race simulation', summary: 'Engine & balance', done: true },
  { n: 2, name: 'Playable race', summary: 'Renderer & controls', done: true },
  { n: 3, name: 'Full career', summary: 'Training & divisions', done: true },
  { n: 4, name: 'The stable', summary: 'Money & facilities', done: false },
  // 4.5, not 5, on purpose: it ships no new systems, and renumbering would
  // strand every `Phase 5` reference already written into the code.
  { n: 4.5, name: 'Re-balance', summary: 'Physics & margins', done: false },
  { n: 5, name: 'Breeding', summary: 'Genetics & pedigree', done: false },
  { n: 6, name: 'Polish', summary: 'Audio & mobile', done: false },
];

const STORAGE_KEY = 'bloodline.roadmapOpen';

export function mountRoadmap(): void {
  if (document.querySelector('#roadmap')) return;

  const done = PHASES.filter((p) => p.done).length;
  const host = document.createElement('div');
  host.id = 'roadmap';

  host.innerHTML = `
    <button class="rm-toggle" aria-expanded="false" aria-controls="rm-panel">
      <span class="rm-dot"></span>
      <span class="rm-count">${done}/${PHASES.length}</span>
    </button>
    <div class="rm-panel" id="rm-panel" hidden>
      <p class="rm-title">Build progress</p>
      ${PHASES.map(
        (p) => `
        <div class="rm-phase ${p.done ? 'is-done' : ''} ${p.inProgress ? 'is-in-progress' : ''}">
          <span class="rm-box">${p.done ? '✓' : p.inProgress ? '◐' : ''}</span>
          <span class="rm-name">${p.name}</span>
          <span class="rm-summary">${p.summary}</span>
        </div>`,
      ).join('')}
    </div>
  `;

  document.body.appendChild(host);

  const toggle = host.querySelector<HTMLButtonElement>('.rm-toggle')!;
  const panel = host.querySelector<HTMLDivElement>('.rm-panel')!;

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    host.classList.toggle('is-open', open);
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* private browsing — the panel just won't remember */
    }
  };

  let remembered = false;
  try {
    remembered = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    /* ignore */
  }
  setOpen(remembered);

  toggle.addEventListener('click', () => setOpen(panel.hidden));

  // Tapping away closes it, so it never sits over the game on a phone.
  document.addEventListener('click', (e) => {
    if (!host.contains(e.target as Node) && !panel.hidden) setOpen(false);
  });
}

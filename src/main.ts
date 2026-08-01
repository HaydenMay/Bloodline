import './style.css';
import { createRng } from './sim/index.js';
import { createNameGenerator } from './data/names.js';
import { generateHorse } from './sim/horse.js';
import { COAT_IDS } from './render/palette.js';
import { FIELD_SIZE, RUNNING_STYLES } from './data/index.js';
import { mountRaceScreen } from './ui/raceScreen.js';
import { mountRoadmap } from './ui/roadmap.js';
import type { Horse } from './sim/types.js';

/**
 * Phase 2 harness screen.
 *
 * Builds a field and drops you straight into a race, so the renderer and the
 * DRIVE control can be judged on their own before careers exist to wrap them.
 * Replaced by the real career flow in Phase 3.
 */

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) throw new Error('#app not found');
const app: HTMLDivElement = appEl;

let teardown: (() => void) | null = null;

function buildField(seed: string): { field: Horse[]; playerId: string } {
  const rng = createRng(seed);
  const names = createNameGenerator(rng);

  const field: Horse[] = Array.from({ length: FIELD_SIZE }, (_, i) => {
    const horse = generateHorse(rng, names, {
      division: 'open',
      style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
      age: 4,
    });
    horse.coat = COAT_IDS[Math.floor(rng.next() * COAT_IDS.length)]!;
    return horse;
  });

  return { field, playerId: field[0]!.id };
}

function startRace(seed: string): void {
  teardown?.();
  app.innerHTML = '';

  const { field, playerId } = buildField(seed);
  const player = field.find((h) => h.id === playerId)!;

  const stage = document.createElement('div');
  stage.className = 'stage';
  app.appendChild(stage);

  const bar = document.createElement('div');
  bar.className = 'racebar';
  bar.innerHTML = `
    <div class="rb-horse">
      <span class="rb-name">${player.name}</span>
      <span class="rb-style">${styleLabel(player.style)}</span>
    </div>
    <div class="rb-hint">Tap to <b>URGE</b> · hold to <b>TAKE A PULL</b></div>
    <button class="rb-again">New race</button>
  `;
  app.appendChild(bar);

  bar.querySelector('.rb-again')!.addEventListener('click', (e) => {
    e.stopPropagation();
    startRace(`race-${Math.floor(Math.random() * 1e9)}`);
  });

  teardown = mountRaceScreen({
    host: stage,
    field,
    playerHorseId: playerId,
    playerSilks: { primary: '#F2C14E', secondary: '#12222B' },
    config: { furlongs: 8, going: 'good', hype: 0.65, seed: `${seed}-run` },
    onFinish: (placings) => {
      const list = placings
        .slice(0, 4)
        .map(
          (r, i) =>
            `<li${r.id === playerId ? ' class="me"' : ''}><span>${i + 1}</span>${r.name}</li>`,
        )
        .join('');
      const results = document.createElement('ol');
      results.className = 'results';
      results.innerHTML = list;
      bar.prepend(results);
    },
  });
}

function styleLabel(style: string): string {
  switch (style) {
    case 'frontRunner':
      return 'Front-runner';
    case 'stalker':
      return 'Stalker';
    case 'midPack':
      return 'Mid-pack';
    default:
      return 'Closer';
  }
}

startRace('bloodline-demo');
mountRoadmap();

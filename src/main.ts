import './style.css';
import { createRng } from './sim/index.js';
import { createNameGenerator } from './data/names.js';
import { generateHorse } from './sim/horse.js';
import { COAT_IDS } from './render/palette.js';
import { FIELD_SIZE, RUNNING_STYLES } from './data/index.js';
import { STYLE_PROFILES } from './sim/race/constants.js';
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
  // Where this horse's window sits in the race, as a share of the distance.
  const win = STYLE_PROFILES[player.style];
  const lo = Math.round(Math.max(0, win.kickAt - 0.09) * 100);
  const hi = Math.round(Math.min(1, win.kickAt + 0.09) * 100);

  bar.innerHTML = `
    <div class="rb-horse">
      <span class="rb-name">${player.name}</span>
      <span class="rb-style">${styleLabel(player.style)} · ${seatLabel(player.style)}</span>
    </div>
    <div class="rb-moment">
      <span class="rb-moment-label">Your moment</span>
      <div class="rb-track"><div class="rb-window" style="left:${lo}%;width:${hi - lo}%"></div></div>
      <span class="rb-moment-when">${momentLabel(win.kickAt)}</span>
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

/** Where this style likes to sit, in plain words. */
function seatLabel(style: string): string {
  switch (style) {
    case 'frontRunner':
      return 'likes to lead';
    case 'stalker':
      return 'tracks the pace';
    case 'midPack':
      return 'sits mid-pack';
    default:
      return 'comes from behind';
  }
}

/** When its window falls, named after the part of the track. */
function momentLabel(kickAt: number): string {
  if (kickAt < 0.35) return 'from the gate';
  if (kickAt < 0.62) return 'down the back';
  if (kickAt < 0.81) return 'round the turn';
  return 'in the straight';
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

import './style.css';
import { createRng } from './sim/index.js';
import { createNameGenerator } from './data/names.js';
import { generateHorse } from './sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES, type Moment } from './data/index.js';
import { MOMENT_WINDOWS } from './sim/race/constants.js';
import { attachInfoBox } from './ui/infoBox.js';
import { mountRaceScreen } from './ui/raceScreen.js';
import { mountHorsePreview } from './ui/horsePreview.js';
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
    return horse;
  });

  // Draw the player at random, otherwise field[0] always lands on the first
  // style in the list and you are a front-runner in every single race.
  const playerIndex = Math.floor(rng.next() * field.length);
  return { field, playerId: field[playerIndex]!.id };
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
  // Moment is independent of style now (sim/race/constants.ts) — a horse's
  // own rolled Moment decides this, not its running style.
  const [winLo, winHi] = MOMENT_WINDOWS[player.moment];
  const lo = Math.round(winLo * 100);
  const hi = Math.round(winHi * 100);

  bar.innerHTML = `
    <div class="rb-horse">
      <span class="rb-name">${player.name}</span>
      <span class="rb-style">${styleLabel(player.style)} · ${seatLabel(player.style)}</span>
    </div>
    <div class="rb-moment">
      <span class="rb-moment-label">Your moment</span>
      <div class="rb-track"><div class="rb-window" style="left:${lo}%;width:${hi - lo}%"></div></div>
      <span class="rb-moment-when">${momentLabel(player.moment)}</span>
    </div>
    <div class="rb-hint">Tap to <b>KICK</b> · hold to <b>TAKE A PULL</b></div>
    <button class="rb-again">New race</button>
  `;
  app.appendChild(bar);

  attachInfoBox(bar.querySelector<HTMLElement>('.rb-horse')!, player);

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
  });
}

/**
 * Where this style prefers to sit in the field, in plain words. This is about
 * FIELD POSITION only — Moment (labeled separately) is what now controls WHEN
 * a horse's kick window falls, so this must never use timing language.
 */
function seatLabel(style: string): string {
  switch (style) {
    case 'frontRunner':
      return 'runs up front';
    case 'stalker':
      return 'sits just off the pace';
    case 'midPack':
      return 'settles mid-field';
    default:
      return 'settles at the back';
  }
}

/** Named after the part of the track where this Moment's window falls. */
function momentLabel(moment: Moment): string {
  switch (moment) {
    case 'early':
      return 'from the gate';
    case 'earlyMid':
      return 'down the back';
    case 'midLate':
      return 'round the turn';
    case 'late':
      return 'in the straight';
  }
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

// ?preview opens the horse preview instead of a race — a development view for
// judging the drawing at a size where problems are actually visible.
if (new URLSearchParams(location.search).has('preview')) {
  const stage = document.createElement('div');
  stage.className = 'stage stage-full';
  app.appendChild(stage);
  mountHorsePreview(stage);
} else {
  startRace('bloodline-demo');
}
mountRoadmap();

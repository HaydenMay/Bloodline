import './style.css';
import { createRng } from './sim/index.js';
import { createNameGenerator } from './data/names.js';
import { generateHorse } from './sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from './data/index.js';
import { attachInfoBox } from './ui/infoBox.js';
import { mountRaceScreen } from './ui/raceScreen.js';
import { mountHorsePreview } from './ui/horsePreview.js';
import { mountSilksDemo } from './ui/silksDemo.js';
import { mountRoadmap } from './ui/roadmap.js';
import { mountMainMenu } from './ui/mainMenu.js';
import { mountStarterSelection } from './ui/starterSelection.js';
import type { Horse } from './sim/types.js';

/**
 * Phase 2 harness screen.
 *
 * Builds a field and drops you straight into a race, so the renderer and the
 * DRIVE control can be judged on their own before careers exist to wrap them.
 * Replaced by the real career flow in Phase 3.
 */

/**
 * Demo distance. Most races in the game are 600-900 m; 1400 is a middle-
 * distance test that shows every style doing its job inside ~70 s.
 */
const RACE_METRES = 1400;

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) throw new Error('#app not found');
const app: HTMLDivElement = appEl;

let teardown: (() => void) | null = null;
let autopilot = false;

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

  // No moment WINDOW is drawn any more: Moment selects a pace-curve shape, not
  // a window (REBUILD.md §6), so there is nothing to mark on a timeline. What
  // the player needs instead is what trip the horse wants.
  bar.innerHTML = `
    <div class="rb-horse">
      <span class="rb-name">${player.name}</span>
      <span class="rb-style">${styleLabel(player.style)} · ${momentLabel(player.moment)}</span>
    </div>
    <div class="rb-moment">
      <span class="rb-moment-label">Preferred length</span>
      <span class="rb-pref">${player.preferredDistance.min}–${player.preferredDistance.max} m</span>
    </div>
    <div class="rb-controls">
      <label class="rb-autopilot">
        <input type="checkbox" id="autopilot-toggle" ${autopilot ? 'checked' : ''}>
        <span>Autopilot</span>
      </label>
    </div>
    <div class="rb-hint" id="rb-hint-text">Tap to <b>KICK</b> · hold to <b>TAKE A PULL</b></div>
    <button class="rb-again">New race</button>
  `;
  app.appendChild(bar);

  // Check for color overrides from demo mode
  let playerSilks = { primary: '#A8DADC', secondary: '#12222B' };

  const colorOverride = sessionStorage.getItem('color-override');
  if (colorOverride) {
    try {
      const colors = JSON.parse(colorOverride);
      // The demo's silks pair: primary is the jockey and the shield, secondary
      // is the breeches and collar. Mane and points travel with the coat, not
      // with the silks, so they are not carried here.
      playerSilks = {
        primary: colors.silksColor || '#A8DADC',
        secondary: colors.trimColor || colors.maneColor || '#12222B',
      };
      sessionStorage.removeItem('color-override');
    } catch {
      // Ignore invalid JSON
    }
  }

  attachInfoBox(bar.querySelector<HTMLElement>('.rb-horse')!, player, playerSilks);

  const autopilotToggle = bar.querySelector<HTMLInputElement>('#autopilot-toggle')!;
  const hintText = bar.querySelector<HTMLElement>('#rb-hint-text')!;

  autopilotToggle.addEventListener('change', (e) => {
    autopilot = (e.target as HTMLInputElement).checked;
    hintText.innerHTML = autopilot
      ? 'Watch the race · autopilot is on'
      : 'Tap to <b>KICK</b> · hold to <b>TAKE A PULL</b>';
  });

  bar.querySelector('.rb-again')!.addEventListener('click', (e) => {
    e.stopPropagation();
    startRace(`race-${Math.floor(Math.random() * 1e9)}`);
  });

  teardown = mountRaceScreen({
    host: stage,
    field,
    playerHorseId: playerId,
    playerSilks,
    config: { metres: RACE_METRES, going: 'good', hype: 0.65, seed: `${seed}-run` },
    autopilotToggle,
    onRaceStart: () => {
      // Lock autopilot once race starts — can't change during race
      autopilotToggle.disabled = true;
    },
  });
}

function momentLabel(moment: string): string {
  switch (moment) {
    case 'early':
      return 'goes early';
    case 'earlyMid':
      return 'goes before halfway';
    case 'midLate':
      return 'goes off the turn';
    default:
      return 'goes late';
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

// Development routes
const params = new URLSearchParams(location.search);
if (params.has('preview')) {
  // ?preview opens the horse preview
  const stage = document.createElement('div');
  stage.className = 'stage stage-full';
  app.appendChild(stage);
  mountHorsePreview(stage);
} else if (params.has('silks-demo')) {
  // ?silks-demo opens the silks color picker
  mountSilksDemo(app);
} else if (params.has('test-race')) {
  // ?test-race opens the test race (development harness)
  startRace('bloodline-demo');
} else if (params.has('roadmap')) {
  // ?roadmap opens the build-progress panel — kept off every real game
  // screen so it never collides with game chrome (the starter carousel's
  // header sat directly under its fixed top-right pill).
  mountRoadmap();
} else {
  // Default: main menu → starter selection → career
  showMainMenu();
}

function showMainMenu(): void {
  teardown?.();
  app.innerHTML = '';

  const teardownMenu = mountMainMenu(app, () => {
    teardownMenu();
    showStarterSelection();
  });
}

function showStarterSelection(): void {
  teardown?.();
  app.innerHTML = '';

  const teardownSelection = mountStarterSelection(app, (selectedHorse) => {
    teardownSelection();
    startCareer(selectedHorse);
  });
}

function startCareer(starterHorse: Horse): void {
  // TODO: Initialize career with selected horse
  // For now, just jump into the first race with the selected horse
  const rng = createRng('career-seed-' + Date.now());
  const names = createNameGenerator(rng);

  // Build a field around the starter
  const field: Horse[] = [starterHorse];
  for (let i = 1; i < FIELD_SIZE; i++) {
    const rival = generateHorse(rng, names, {
      division: 'maiden',
      style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
      age: 2,
    });
    field.push(rival);
  }

  // Shuffle so player isn't always in the same position
  const playerIndex = Math.floor(rng.next() * field.length);
  const playerSplicedArray = field.splice(playerIndex, 1);
  const player = playerSplicedArray[0];
  if (!player) throw new Error('No player horse found');
  field.unshift(player);

  teardown?.();
  app.innerHTML = '';

  const stage = document.createElement('div');
  stage.className = 'stage';
  app.appendChild(stage);

  const bar = document.createElement('div');
  bar.className = 'racebar';

  bar.innerHTML = `
    <div class="rb-horse">
      <span class="rb-name">${player.name}</span>
      <span class="rb-style">${styleLabel(player.style)} · ${momentLabel(player.moment)}</span>
    </div>
    <div class="rb-moment">
      <span class="rb-moment-label">Preferred length</span>
      <span class="rb-pref">${player.preferredDistance.min}–${player.preferredDistance.max} m</span>
    </div>
    <div class="rb-controls">
      <label class="rb-autopilot">
        <input type="checkbox" id="autopilot-toggle">
        Autopilot
      </label>
    </div>
    <div class="rb-callout" id="callout"></div>
  `;
  app.appendChild(bar);

  const autopilotToggle = bar.querySelector<HTMLInputElement>('#autopilot-toggle')!;
  const hintText = bar.querySelector<HTMLDivElement>('.rb-callout')!;

  hintText.innerHTML = 'Tap or hold spacebar to kick · hold tap to take a pull';

  autopilotToggle.addEventListener('change', (e) => {
    hintText.innerHTML = (e.target as HTMLInputElement).checked
      ? 'Watch the race · autopilot is on'
      : 'Tap or hold spacebar to kick · hold tap to take a pull';
  });

  const onFinish = (): void => {
    setTimeout(() => {
      showMainMenu();
    }, 3000);
  };

  teardown = mountRaceScreen({
    host: stage,
    field,
    playerHorseId: player.id,
    playerSilks: { primary: '#1a1a2e', secondary: '#e94560' },
    config: {
      seed: 'race-' + Date.now(),
      metres: 1400,
      going: 'good',
      hype: 0.5,
    },
    autopilotToggle,
    onRaceStart: () => {
      autopilotToggle.disabled = true;
    },
    onFinish,
  });
}
